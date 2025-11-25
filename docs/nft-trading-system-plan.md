# NFT Trading System – Ultra-Simple Escrow Swap Plan

Rule: a user escrows an NFT (no TTL), it shows up in the list, and anyone can swap by escrowing their own NFT. No seller approval step. Depositor can withdraw only while the escrow is still active.

## 1) Goals
- Deliver a minimal swap flow: deposit → visible listing → instant swap by another depositor → done.
- Keep a simple escape hatch: owner can withdraw an active deposit before someone swaps it.

## 2) End-to-end user flow
1. User A connects wallet → picks an NFT → calls `deposit` → listing appears.
2. User B browses listings → picks target → picks their NFT → calls `swap` (escrow + instant exchange) → ownerships flip.
3. If no one has swapped yet, User A may call `withdraw` to reclaim the NFT and close the deposit.

## 3) Components
- **Smart contract `SimpleNFTEscrow` (ERC-721 only)**
  - `deposit(address nft, uint256 tokenId)` → returns `depositId`, status ACTIVE.
  - `swap(uint256 targetDepositId, address nft, uint256 tokenId)` → taker escrows their NFT and immediately swaps with the target; both deposits become CLOSED.
  - `withdraw(uint256 depositId)` → owner-only; works only while ACTIVE; sets CLOSED.
  - Events: `Deposited(depositId, owner, nft, tokenId)`, `Swapped(listingId, takerDepositId)`, `Withdrawn(depositId)`.
- **Supabase (optional cache/search)**: table `deposits` with `depositId, owner, nft, tokenId, status, txHash, timestamps`; updated from chain events.
- **Indexer/worker (optional)**: subscribes to RPC events → upserts Supabase.
- **API (optional)**: read-only `/nft-trading/deposits` list/detail. All mutations are on-chain.
- **Frontend**: wallet connect, deposit button, listing grid, swap button, withdraw button. Reads on-chain state or cached list.

## 4) Work breakdown (ordered)

### Phase A — Contract & Tests
1. ✅ Scaffolded & added `SimpleNFTEscrow.sol`.
2. ✅ Storage implemented (`Deposit` struct, mapping, nextId).
3. ✅ `deposit` uses `safeTransferFrom` and `supportsInterface`; emits `Deposited`.
4. ✅ `withdraw` owner-only; emits `Withdrawn`.
5. ✅ `swap` atomic escrow + swap; emits `Swapped`.
6. ✅ Security: `nonReentrant`, zero-address/NFT check, short reverts.
7. ✅ Tests added for deposit/withdraw/swap and core reverts (run `npm run test:escrow`).
8. ✅ Deploy script added (`npm run deploy:escrow`).
Remaining: reentrancy attempt test, non-ERC721 address revert test, transfer failure ordering test (can extend test file if needed).

### Phase B — Minimal Frontend ( `/nft-exchange` )
1. ✅ Added config key for escrow contract address + basic form UI on `/nft-exchange`.
2. ✅ Ethers client helper for `deposit`, `swap`, `withdraw` (Metamask signer) + ABI bundled.
3. ✅ Quick panel (Deposit/Swap/Withdraw inputs) wired to on-chain calls with toast feedback; includes risk warning.
4. ✅ Added on-chain “Lookup Deposit” table + known deposits cards; can set swap target and withdraw if active.
5. ✅ Listing grid (known deposits cards) with swap-target selection and withdraw actions; refreshes status after tx.
6. ✅ Swap modal with manual wallet NFT picker + tokenURI fetch; disables when no target selected.
7. ✅ Basic token metadata fetch (tokenURI + image) in modal; address/token still primary display.
8. ✅ Added auto-refresh of known deposits (on-chain polling) and error surfacing; still optional to swap to API/indexer when ready.
9. ✅ Reattached on-chain actions to cards: market tab uses `swapOnEscrow` via SwapPicker; listed items use `withdrawFromEscrow`; refresh market feed after tx.

### Phase C — Optional Indexer + Supabase Cache
1. Supabase tables already exist:
   - `deposits` (bigint id PK, owner_wallet, nft_contract, token_id, status ENUM ['ACTIVE','WITHDRAWN'], tx_hash, timestamps, indexes + updated_at trigger).
   - `swap_events` (uuid PK, initiator, counterparty, my_deposit_id, target_deposit_id, tx_hash, created_at, indexes on deposits + created_at).
   Use them as the canonical cache; no new migration needed unless schema changes.
2. ✅ Lightweight Node worker added (`scripts/escrow_indexer.js`): polls `Deposited/Swapped/Withdrawn`, upserts `deposits`, inserts `swap_events`, tracks last processed block in `scripts/.escrow_indexer_state.json`. Env: `RPC_URL`, `SIMPLE_ESCROW_ADDRESS`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, optional `START_BLOCK`.
   - Mapping rules: `Deposited` → status ACTIVE; `Swapped` → set both deposits CLOSED, insert swap_events; `Withdrawn` → status WITHDRAWN.
   - Reorg handling minimal (single cursor); future: add block confirmations/replay table if needed.
3. ✅ Read-only API endpoints (Vercel functions):
   - `GET /api/nft-trading/deposits?status=&owner=&limit=&cursor=` (created_at cursor pagination).
   - `GET /api/nft-trading/swap-events?depositId=&limit=&cursor=` (filter by deposit involvement).
   Both public, CORS open; consider rate limit in future.
4. ✅ Frontend: market tab now pulls `getDeposits` for ACTIVE listings; mock wallet NFTs remain; listed items merged into feed. (Future: replace mock wallet fetch and add metadata.)

### Phase D — Ops
1. Add `.env` entries: `RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, optional `SUPABASE_URL/KEY`.
2. Document deployment steps (Hardhat deploy, frontend env, optional worker start).
3. Provide a replay script for events to rebuild cache if needed.
4. Monitoring: alert if indexer lags N blocks or RPC errors spike.

## Quick decisions for speed
- Contract: ERC-721 only, `safeTransferFrom` everywhere, single contract file, no pause/ownable to keep surface small.
- Status model: on-chain only has active flag; in Supabase, add `CLOSED` to reflect swaps. Migration SQL (already ready to run in Supabase SQL editor):
  ```sql
  begin;
  alter table public.deposits drop constraint if exists deposits_status_check;
  alter table public.deposits add constraint deposits_status_check check (status = any (array['ACTIVE','WITHDRAWN','CLOSED']::text[]));
  commit;
  ```
- API: read-only, unauthenticated, paginated; mutations are on-chain only.
- Data source preference: use API when present; otherwise poll chain every ~15s after tx until event seen or 1 minute timeout.
- Frontend warnings: always show “No approval step; deposited NFTs can be taken instantly via swap.”

## 5) Non-functional requirements
- Only 1:1 NFT-for-NFT swaps (ERC-721). No TTL, no approvals.
- Make the “can disappear anytime” warning prominent in UI.
- If a tx fails/cancels, surface error and allow retry. No background timers.

---
This plan keeps the architecture intentionally small: direct on-chain mutations, optional read cache, and a minimal UI that highlights the instant-swap risk.
