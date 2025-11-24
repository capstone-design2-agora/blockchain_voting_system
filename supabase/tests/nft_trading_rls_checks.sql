-- RLS verification helper for nft_trading schema
-- Usage (psql):
--   psql "$SUPABASE_DB_URL" -f supabase/tests/nft_trading_rls_checks.sql
-- Assumptions:
--   - Migration 20251113_nft_trading.sql has been applied.
--   - Roles anon, authenticated, service_role exist (Supabase default).
--   - jwt.claims are passed via request.jwt.claims.

-- cleanup prior runs
SET ROLE service_role;
DELETE FROM public.deposits WHERE id IN (990001, 990002);

-- seed two ACTIVE deposits as service_role
INSERT INTO public.deposits (id, owner_wallet, nft_contract, token_id, status, tx_hash)
VALUES
  (990001, '0xaaa0000000000000000000000000000000000aaa', '0x1110000000000000000000000000000000000111', '1', 'ACTIVE', '0xtxhash1'),
  (990002, '0xbbb0000000000000000000000000000000000bbb', '0x2220000000000000000000000000000000000222', '2', 'WITHDRAWN', '0xtxhash2');

-- 1) anon can read only ACTIVE
SET LOCAL ROLE anon;
RESET SESSION AUTHORIZATION;
SET LOCAL "request.jwt.claims" = '{}'::jsonb;
SELECT 'anon_active' AS test, count(*) AS rows FROM public.deposits WHERE status = 'ACTIVE';

-- 2) authenticated without wallet claim should not see owner rows beyond ACTIVE rule
SET LOCAL ROLE authenticated;
RESET SESSION AUTHORIZATION;
SET LOCAL "request.jwt.claims" = '{}'::jsonb;
SELECT 'auth_no_claim_active' AS test, count(*) AS rows FROM public.deposits WHERE status = 'ACTIVE';

-- 3) authenticated with wallet claim should read own WITHDRAWN row
SET LOCAL ROLE authenticated;
RESET SESSION AUTHORIZATION;
SET LOCAL "request.jwt.claims" = '{"wallet_address":"0xbbb0000000000000000000000000000000000bbb"}';
SELECT 'auth_owner_withdrawn' AS test, count(*) AS rows FROM public.deposits WHERE status = 'WITHDRAWN';

-- 4) authenticated non-owner should not update others
SET LOCAL ROLE authenticated;
RESET SESSION AUTHORIZATION;
SET LOCAL "request.jwt.claims" = '{"wallet_address":"0xaaa0000000000000000000000000000000000aaa"}';
DO $$
BEGIN
  BEGIN
    UPDATE public.deposits SET status = 'WITHDRAWN' WHERE id = 990002;
    RAISE EXCEPTION 'update should have failed but succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    -- expected
    NULL;
  END;
END$$;

-- 5) owner can update own row
SET LOCAL ROLE authenticated;
RESET SESSION AUTHORIZATION;
SET LOCAL "request.jwt.claims" = '{"wallet_address":"0xaaa0000000000000000000000000000000000aaa"}';
UPDATE public.deposits SET status = 'WITHDRAWN' WHERE id = 990001;

-- cleanup
SET ROLE service_role;
DELETE FROM public.deposits WHERE id IN (990001, 990002);
