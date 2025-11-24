# NFT Trading System – Simplified Escrow (Current Track)

This document supersedes the older proposal/decision/relayer-heavy plan. We are shipping a minimal “deposit pool + instant swap” MVP: users deposit NFTs into `NFTEscrow`, can swap two active deposits atomically, and withdraw their own deposit.

## Architecture (MVP)
- **Smart contract**: `NFTEscrow` (deposit, swap, withdraw) using OZ 5.0, ReentrancyGuard, IERC721Receiver.
- **Supabase**: minimal tables `deposits` and `swap_events` to mirror on-chain state; RLS allows public read of ACTIVE deposits and owner read/update.
- **Indexer**: `scripts/nft-escrow-indexer.js` (WS + catch-up) mirrors events into Supabase and stores a block cursor.
- **API**: `/api/nft-trading/deposits` (GET/POST), `/swap`, `/withdraw` with validation + rate limiting; assumes tx already mined (no relayer yet).
- **Frontend**: `/nft-exchange` includes a test panel (`NFTEscrowPanel`) to call the API and view ACTIVE deposits. Full UX for trading is pending.

## Current Status
- Contract + tests: Implemented and passing (`npm run hardhat:test`).
- Supabase migration: Added `20251113_nft_trading.sql` (deposits, swap_events, indexes, updated_at trigger, RLS). Needs application to the DB and JWT claim alignment (`wallet_address`/`wallet`).
- API: Basic handlers added; no on-chain signing/relayer; best-effort DB updates.
- Indexer: Implemented, not yet validated against live RPC + Supabase.
- Frontend: Test panel only; no wallet-driven on-chain calls or polished UX.
- Ops: Env wiring for ESCROW_ADDRESS/ABI syncing in scripts; config includes optional `ESCROW_ADDRESS`.

## Remaining Work (MVP scope)
1) ✅ **Apply DB migration** and verify RLS with real JWT claims; seed minimal data if needed. Helper: `supabase/tests/nft_trading_rls_checks.sql` (SQL Editor/psql) to assert anon/auth/owner behaviors.
2) **Indexer validation** on target RPC + Supabase; confirm cursor replay and event upserts. Run `npm run indexer:escrow` (adds cursor under `.cache/escrow_cursor.json`); verify `deposits/swap_events` updating alongside on-chain actions.
3) ✅ **API ↔ on-chain flow**: client-signed tx + `txHash` required; server validates on-chain against `ESCROW_ADDRESS` (to, from, mined, status).
4) **Frontend UX**: replace test panel with user flow (connect wallet → deposit tx → POST metadata → list/swap/withdraw with polling + toasts).
5) **Ops**: capture deployed ESCROW address in config/env, document runbooks (indexer start/restart, cursor path).

## Out-of-Scope Items (from legacy plan)
- Proposal/offer listings, decision endpoints, relayer-only finalize/return paths.
- Timelock withdrawal watchdogs, analytics, notifications, fee model.

If we need those later, restore them as a separate “enhanced trading” roadmap; for now, stay within the simplified escrow MVP above.
