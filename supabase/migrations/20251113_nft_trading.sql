-- NFT Trading minimal schema: deposits + swap_events with RLS

-- Tables --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deposits (
  id BIGINT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  nft_contract TEXT NOT NULL,
  token_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'WITHDRAWN')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW()),
  CONSTRAINT deposits_id_positive CHECK (id > 0)
);

CREATE TABLE IF NOT EXISTS public.swap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  my_deposit_id BIGINT NOT NULL,
  target_deposit_id BIGINT NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', NOW())
);

-- Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS deposits_status_created_at_idx
  ON public.deposits (status, created_at DESC);

CREATE INDEX IF NOT EXISTS deposits_owner_wallet_idx
  ON public.deposits (lower(owner_wallet));

CREATE INDEX IF NOT EXISTS swap_events_created_at_idx
  ON public.swap_events (created_at DESC);

CREATE INDEX IF NOT EXISTS swap_events_my_deposit_idx
  ON public.swap_events (my_deposit_id);

CREATE INDEX IF NOT EXISTS swap_events_target_deposit_idx
  ON public.swap_events (target_deposit_id);

-- Trigger to maintain updated_at --------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_on_deposits ON public.deposits;
CREATE TRIGGER set_updated_at_on_deposits
  BEFORE UPDATE ON public.deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Grants & RLS --------------------------------------------------------------
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.deposits FROM PUBLIC;
REVOKE ALL ON TABLE public.deposits FROM anon;
REVOKE ALL ON TABLE public.deposits FROM authenticated;
GRANT ALL ON TABLE public.deposits TO service_role;
GRANT SELECT, UPDATE ON TABLE public.deposits TO authenticated;
GRANT SELECT ON TABLE public.deposits TO anon;

REVOKE ALL ON TABLE public.swap_events FROM PUBLIC;
REVOKE ALL ON TABLE public.swap_events FROM anon;
REVOKE ALL ON TABLE public.swap_events FROM authenticated;
GRANT ALL ON TABLE public.swap_events TO service_role;
GRANT SELECT ON TABLE public.swap_events TO authenticated, anon;

-- Deposits policies ----------------------------------------------------------
DROP POLICY IF EXISTS deposits_service_role_full_access ON public.deposits;
CREATE POLICY deposits_service_role_full_access
  ON public.deposits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS deposits_active_public_select ON public.deposits;
CREATE POLICY deposits_active_public_select
  ON public.deposits
  FOR SELECT
  TO anon, authenticated
  USING (status = 'ACTIVE');

DROP POLICY IF EXISTS deposits_owner_select ON public.deposits;
CREATE POLICY deposits_owner_select
  ON public.deposits
  FOR SELECT
  TO authenticated
  USING (
    lower(owner_wallet) = lower(
      COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_address'),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'wallet')
      )
    )
  );

DROP POLICY IF EXISTS deposits_owner_update ON public.deposits;
CREATE POLICY deposits_owner_update
  ON public.deposits
  FOR UPDATE
  TO authenticated
  USING (
    lower(owner_wallet) = lower(
      COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_address'),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'wallet')
      )
    )
  )
  WITH CHECK (
    lower(owner_wallet) = lower(
      COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_address'),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'wallet')
      )
    )
  );

-- Swap events policies -------------------------------------------------------
DROP POLICY IF EXISTS swap_events_service_role_full_access ON public.swap_events;
CREATE POLICY swap_events_service_role_full_access
  ON public.swap_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS swap_events_public_select ON public.swap_events;
CREATE POLICY swap_events_public_select
  ON public.swap_events
  FOR SELECT
  TO anon, authenticated
  USING (true);
