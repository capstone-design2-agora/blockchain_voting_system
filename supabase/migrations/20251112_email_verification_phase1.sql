-- Phase 1: Data Layer & Security Hardening (Supabase)
-- This migration sets up the core tables, constraints, RLS policies, and maintenance helpers
-- for the email verification + CitizenSBT workflow.

-- Required extensions -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA extensions;

-- Custom types --------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type typ
    JOIN pg_namespace nsp ON nsp.oid = typ.typnamespace
    WHERE typ.typname = 'verified_user_status'
      AND nsp.nspname = 'public'
  ) THEN
    CREATE TYPE public.verified_user_status AS ENUM ('PENDING', 'COMPLETED');
  END IF;
END
$$;

-- Table: email_verification_codes ------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_lookup_hmac BYTEA NOT NULL,
  code_hash BYTEA NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_ip_hash BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_codes_email_lookup_hmac_idx
  ON public.email_verification_codes (email_lookup_hmac);

CREATE INDEX IF NOT EXISTS email_verification_codes_code_expires_at_idx
  ON public.email_verification_codes (code_expires_at);

-- Table: verified_users -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verified_users (
  email_lookup_hmac BYTEA PRIMARY KEY,
  email_hash_slow BYTEA NOT NULL,
  email_hash_slow_salt BYTEA NOT NULL,
  wallet_lookup_hmac BYTEA UNIQUE NOT NULL,
  wallet_hash_slow BYTEA NOT NULL,
  wallet_hash_slow_salt BYTEA NOT NULL,
  pepper_key_id TEXT NOT NULL DEFAULT 'v1',
  status public.verified_user_status NOT NULL DEFAULT 'PENDING',
  signature BYTEA,
  identity_hash BYTEA,
  retry_payload_enc BYTEA,
  tx_hash BYTEA,
  nonce UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW()),
  completed_at TIMESTAMPTZ
);

-- Row Level Security & grants ----------------------------------------------
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_verification_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.email_verification_codes FROM anon;
REVOKE ALL ON TABLE public.email_verification_codes FROM authenticated;
GRANT ALL ON TABLE public.email_verification_codes TO service_role;

REVOKE ALL ON TABLE public.verified_users FROM PUBLIC;
REVOKE ALL ON TABLE public.verified_users FROM anon;
REVOKE ALL ON TABLE public.verified_users FROM authenticated;
GRANT ALL ON TABLE public.verified_users TO service_role;

DROP POLICY IF EXISTS email_verification_codes_service_role_full_access
  ON public.email_verification_codes;
CREATE POLICY email_verification_codes_service_role_full_access
  ON public.email_verification_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS email_verification_codes_no_public_access
  ON public.email_verification_codes;
CREATE POLICY email_verification_codes_no_public_access
  ON public.email_verification_codes
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS verified_users_service_role_full_access
  ON public.verified_users;
CREATE POLICY verified_users_service_role_full_access
  ON public.verified_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS verified_users_no_public_access
  ON public.verified_users;
CREATE POLICY verified_users_no_public_access
  ON public.verified_users
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Maintenance helper: purge expired verification codes ---------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_email_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.email_verification_codes
  WHERE code_expires_at < timezone('utc', NOW());

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_email_codes()
  IS 'Deletes expired email verification codes and returns the number of rows removed.';

-- Schedule hourly cleanup if pg_cron is available --------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_cron'
  ) THEN
    PERFORM 1
    FROM cron.job
    WHERE jobname = 'cleanup_email_verification_codes_hourly';

    IF NOT FOUND THEN
      PERFORM cron.schedule(
        'cleanup_email_verification_codes_hourly',
        '0 * * * *',
        $cron$SELECT public.cleanup_expired_email_codes();$cron$
      );
    END IF;
  END IF;
END;
$$;

-- Notes --------------------------------------------------------------------
COMMENT ON COLUMN public.email_verification_codes.email_lookup_hmac IS 'HMAC-SHA256 of normalized email using pepper key.';
COMMENT ON COLUMN public.email_verification_codes.code_hash IS 'Argon2id hash of the emailed verification code mixed with email lookup HMAC.';
COMMENT ON COLUMN public.email_verification_codes.created_ip_hash IS 'HMAC or hash of the requester IP for anti-abuse heuristics.';
COMMENT ON COLUMN public.verified_users.email_hash_slow IS 'Argon2id hash of normalized email plus per-row salt.';
COMMENT ON COLUMN public.verified_users.email_hash_slow_salt IS 'Random 16-byte salt stored alongside the slow hash.';
COMMENT ON COLUMN public.verified_users.wallet_hash_slow IS 'Argon2id hash of normalized wallet plus per-row salt.';
COMMENT ON COLUMN public.verified_users.wallet_hash_slow_salt IS 'Random 16-byte salt stored alongside the slow hash.';
COMMENT ON COLUMN public.verified_users.pepper_key_id IS 'Identifier indicating which pepper material was used for HMAC lookups.';
COMMENT ON COLUMN public.verified_users.retry_payload_enc IS 'AES-GCM encrypted payload that allows the user to retry signing without revealing raw data.';
