# NFT Trading – Simplified Escrow & Instant Swap Plan

This document defines a minimal “deposit pool + instant swap” workflow. It replaces the prior multi-step proposal/approval plan for MVP scope. Use this as the primary plan unless we explicitly revert to the proposal-based model. Legacy docs (`nft-trading-system-plan/spec`) are superseded for MVP; revisit only if we re-enable proposals.

## Current Status (as of writing)
- Contract: `NFTEscrow` implemented with deposit/swap/withdraw, OZ 5.0.0, reentrancy guard, custom errors; Hardhat tests added (`npm run hardhat:test` passing).
- Contract tooling: `blockchain_contracts/scripts/deploy_escrow.js` deploys NFTEscrow and writes ABI/deployment JSON; `setup_and_deploy.sh` and `redeploy_contract.sh` now sync NFTEscrow ABI to `frontend/src/abi/NFTEscrow.json` and populate `REACT_APP_ESCROW_ADDRESS`/`ESCROW_ADDRESS` in frontend config/env if `artifacts/NFTEscrow.deployment.json` exists (or `ESCROW_ADDRESS` env set).
- Backend: `/api/nft-trading/deposits` (GET/POST), `/api/nft-trading/swap`, `/api/nft-trading/withdraw` scaffolded with basic validation, rate limiting, and Supabase writes. No on-chain relayer yet; assumes tx already mined. No indexer/worker exists.
- Supabase: `20251113_nft_trading.sql` added with `deposits`/`swap_events` tables, indexes, updated_at trigger, and RLS (service role full access; public reads ACTIVE deposits; owners read/update via wallet claim). Not yet applied to DB in this repo state.
- Frontend: `/nft-exchange` remains placeholder; no deposit/swap/withdraw UI or API wiring.
- Ops: No envs/keys set for escrow; no ABI synced to frontend.

## 1) Smart Contract (`NFTEscrow`)
- **Data**
  - `struct Deposit { address owner; address nft; uint256 tokenId; bool active; }`
  - `mapping(uint256 => Deposit) public deposits;`
  - `uint256 public nextDepositId;`
- **Functions**
  - `deposit(address nft, uint256 tokenId) returns (uint256 depositId)`
    - `safeTransferFrom(msg.sender, address(this), tokenId)`
    - `deposits[depositId] = Deposit(msg.sender, nft, tokenId, true)`
    - emit `Deposited(depositId, owner, nft, tokenId)`
  - `swap(uint256 myDepositId, uint256 targetDepositId)`
    - require caller owns `myDepositId`; both deposits must be active
    - transfer both NFTs out of escrow to the opposite owners (atomic swap)
    - update owners in mapping (keep `active = true`)
    - emit `Swapped(myDepositId, targetDepositId, initiator, counterparty)`
  - `withdraw(uint256 depositId)`
    - require caller owns and deposit is active
    - transfer NFT back to owner; mark `active = false`
    - emit `Withdrawn(depositId, owner)`
- **Considerations**
  - Solidity `^0.8.20`, OZ `^5.0.0`, `ReentrancyGuard`, `IERC721Receiver`.
  - ERC721 only (no ERC1155). Reject zero address NFT, reject non-existent deposit IDs, reject self-swap.
  - Checks-Effects-Interactions: mark state before external calls; avoid reentrancy on malicious NFT `onERC721Received`.
  - No fees/allowlist (open pool). Owner = msg.sender only; no admin pause in MVP.
  - Tests: deposit, withdraw, double-withdraw revert, swap happy path, inactive swap revert, not-owner swap revert, self-swap revert, ERC721Receiver acceptance.
- **Build/Artifacts**
  - Add Hardhat compile/test/deploy scripts.
  - Sync ABI/address to `blockchain_contracts/artifacts` and `frontend/src/abi/NFTEscrow.json`.

## 2) Supabase Schema (minimal)
- `deposits`
  - `id bigint primary key` (on-chain depositId)
  - `owner_wallet text`
  - `nft_contract text`
  - `token_id text`
  - `status text check (status in ('ACTIVE','WITHDRAWN'))`
  - `tx_hash text`
  - `created_at timestamptz default now()`
  - `updated_at timestamptz default now()`
  - indexes: `(status, created_at)`, `(owner_wallet)`
- `swap_events` (optional)
  - `id uuid pk`, `initiator text`, `counterparty text`, `my_deposit_id bigint`, `target_deposit_id bigint`, `tx_hash text`, `created_at timestamptz`
- **Auth/RLS (outline)**
  - RLS on `deposits`: owner can select/update their rows; public can select ACTIVE rows; only service role can insert/upsert from indexer.
  - Constraints: unique `(id)`; check `id > 0`; `token_id` as text to avoid bigint overflow from on-chain.

## 3) API (Vercel `/api/nft-trading/*`)
- Common: Supabase session + `x-wallet-address`; verify wallet matches session; rate-limit per wallet/IP.
- `GET /deposits?status=ACTIVE&owner=0x...` — list/filter/paginate, default status ACTIVE.
- `POST /deposits` — body `{ depositId, txHash, nftContract, tokenId }`; tx sent by wallet, API stores metadata.
- `POST /swap` — body `{ myDepositId, targetDepositId }`; server calls contract `swap` via relayer (preferred) or accepts user-signed raw tx; record swap.
- `POST /withdraw` — body `{ depositId }`; call contract `withdraw`, mark WITHDRAWN.
- Error codes & HTTP: `NOT_OWNER`(403), `INACTIVE_DEPOSIT`(409), `ONCHAIN_REVERT`(502), `BAD_PAYLOAD`(400), `UNAUTHENTICATED`(401).
- Env: `ESCROW_ADDRESS`, `RPC_URL`, `RELAYER_PRIVATE_KEY` (if server signs), `SUPABASE_SERVICE_ROLE_KEY`.

## 4) Indexer / Worker
- Subscribe to `Deposited`, `Swapped`, `Withdrawn` via RPC WebSocket → upsert into Supabase.
- Config: `ESCROW_ADDRESS`, `RPC_WS_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `START_BLOCK` (fallback).
- Persist last processed block (e.g., `.cache/escrow_cursor.json`); retry with backoff; on restart, replay from cursor.

## 5) Frontend Minimal Flow
- “Deposit” → wallet calls `deposit` → get `depositId` from tx receipt/event → POST metadata to API → show in list (poll until indexed).
- “Swap” → user picks “my deposit” (list from API filtered by owner) then target deposit → POST `/swap` → refresh list after tx mined.
- “My Deposits” → show WITHDRAW button to recover NFT; disable if status WITHDRAWN; optimistic UI optional.
- Polling/refresh: on write, poll `/deposits` for my wallet for ~15s or until status changes.

## 6) Implementation Steps (small chunks)
1. **Contract**: add `contracts/NFTEscrow.sol`, Hardhat tests, `scripts/deploy_escrow.ts`.
2. **Build/Deploy wiring**: add npm scripts (`hardhat test`, `hardhat run scripts/deploy_escrow.ts --network local`); extend `blockchain_contracts/scripts/setup_and_deploy.sh` to copy `NFTEscrow` ABI/address to `frontend/src/abi/NFTEscrow.json`.
3. **Supabase migration**: add `supabase/migrations/XXXX_nft_trading.sql` with tables/indexes and RLS policies. ✅ Added as `20251113_nft_trading.sql`; apply to Supabase and confirm wallet claim keys (`wallet_address`/`wallet`) in JWT match RLS.
4. **API skeleton**: add `/api/nft-trading/deposits/index.ts` (GET/POST), `/api/nft-trading/swap.ts`, `/api/nft-trading/withdraw.ts`; shared auth/validation helpers; wire env vars. ✅ Added JS handlers with CORS, zod validation, wallet header checks, rate limit, and Supabase writes. Still missing contract calls/relayer.
5. **Indexer worker**: add `scripts/nft-indexer.ts` (WS subscribe, Supabase upsert, cursor persistence).
6. **Frontend integration**: extend `frontend/src/lib/nftTradingApi.ts`; implement minimal deposit/swap/withdraw UI on `/nft-exchange`; add polling after writes.
7. **Validation**: run `npm run hardhat:test` + manual E2E on local network (deposit → list → swap → withdraw); capture addresses in README snippet.

### Notes for next contributors
- Escrow 배포: `cd blockchain_contracts && npm run hardhat:test`로 확인 후 `node scripts/deploy_escrow.js` 실행 → `artifacts/NFTEscrow.deployment.json`과 ABI 생성. 이후 `setup_and_deploy.sh`/`redeploy_contract.sh`가 자동으로 ABI를 `frontend/src/abi/NFTEscrow.json`에 복사하고 `REACT_APP_ESCROW_ADDRESS`/`ESCROW_ADDRESS`를 `.env.local`과 `public/config.json`에 채워줍니다.
- 이미 배포된 Escrow 주소가 있으면 스크립트 실행 전에 `ESCROW_ADDRESS=<addr>`를 export 하면 재배포 없이 프런트 설정이 채워집니다.
- 프런트는 `frontend/src/abi/NFTEscrow.json`과 주소(.env.local 또는 public/config.json)를 사용하므로, 위 스크립트 실행 후 프런트를 재시작하세요.
