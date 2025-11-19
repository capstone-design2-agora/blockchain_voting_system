# NFT Trading System – Deposit Escrow Delivery Plan

This revision replaces the previous “approve-then-transfer” workflow with a deposit-based escrow design. Each listing/proposal now maps to an on-chain deposit that physically holds the NFT, eliminating race conditions and simplifying concurrent swaps.

## 0. Architecture Overview
- **Smart contract** (`NFTEscrow.sol`): custodies NFTs via `depositForListing`, `depositForOffer`, and allows the relayer to `finalizeSwap` or `returnAsset`. Each deposit receives an incrementing `depositId`.
- **Supabase**: authoritative off-chain state. `listings` and `swap_proposals` rows reference on-chain deposits (1:1) and track UI-centric metadata/status.
- **Indexer / Worker**: listens to `Listed`, `OfferMade`, `Swapped`, `AssetReturned` events and mutates Supabase accordingly. Runs continuously (Node.js) with replay protection.
- **Vercel Functions**: expose read APIs plus `POST /proposals/{id}/decision`, which triggers relayer transactions and orchestrates DB updates.
- **Frontend**: interacts with both contract (for deposits) and backend (for queries/decisions), surfacing deposit statuses in tabs.

## 1. Workstreams & Dependencies
1. **Smart Contract** – Hardhat project adds `NFTEscrow` with deposit lifecycle + relayer-only admin calls.
2. **Supabase Schema & Data Flow** – migrations for deposit-aware tables, RLS policies, and indexes.
3. **Indexer/Relayer Worker** – long-running Node service (could live in `scripts/` or Supabase Edge Function) subscribing to RPC websockets.
4. **API Layer** – `/api/nft-trading/*` endpoints updated for deposit model.
5. **Frontend** – UI/UX changes to trigger contract deposits, show pending statuses, and call decision API.
6. **Ops & Tooling** – environment variables, monitoring, fallback flows (timelock withdrawal).

Each phase below highlights cross-team handoffs so the deposit escrow remains source-of-truth.

## Phase 0 – Foundations & Security (ALL)
- Finalize relayer key management (HSM or Vercel env secret) + RPC provider limits.
- Decide supported networks (e.g., Sepolia) and test wallet funding plan.
- Document failure-handling policy (what happens if relayer is down? manual withdrawal timelock).

## Phase 1 – Contract & Tests (Blockchain)
**Goal:** Deliver audited NFTEscrow contract + ABI.
- Implement `struct DepositItem { address owner; address nftContract; uint256 tokenId; bool isActive; }` and `mapping(uint256 => DepositItem) deposits`.
- Functions:
  - `depositForListing(address nft, uint256 tokenId)`
  - `depositForOffer(uint256 listingDepositId, address nft, uint256 tokenId)`
  - `finalizeSwap(uint256 listingDepositId, uint256 offerDepositId)` (`onlyRelayer`)
  - `returnAsset(uint256 depositId)` (`onlyRelayer` + optional owner timelock escape hatch)
- Events: `Listed`, `OfferMade`, `Swapped`, `AssetReturned`.
- Hardhat tests: reverts (double deposit, inactive listings), swap success, unauthorized access, withdrawal timelock.
- Deploy to dev/test networks, publish addresses + ABIs to shared package.

## Phase 2 – Supabase Schema & Seed Data (Backend)
**Goal:** Persist on-chain deposits in normalized tables.
- `listings` table columns:
  - `id UUID`, `owner_wallet`, `nft_contract`, `token_id`, `deposit_id INT UNIQUE`, `status ENUM(DEPOSITING, ACTIVE, SWAPPED, CANCELLED, WITHDRAWING)`, `tx_hash`, metadata JSON, timestamps.
- `swap_proposals` table columns:
  - `id UUID`, `listing_id`, `requester_wallet`, `offered_contract`, `offered_token_id`, `deposit_id INT UNIQUE`, `status ENUM(DEPOSITING, PENDING, ACCEPTED, REJECTED, WITHDRAWING)`, `tx_hash`, message, timestamps.
- `wallet_nonces` table for auth, plus indexes on `(status, created_at)` and `(listing_id, status)`.
- Write Supabase functions/triggers if needed to auto-expire proposals/listings (24h TTL).

## Phase 3 – Event Indexer & Relayer Worker (Backend/DevOps)
**Goal:** Populate DB from contract events and coordinate relayer txns.
- Build Node.js worker:
  - Subscribes to RPC websocket.
  - On `Listed`, upsert listing row (`status=ACTIVE`, `tx_hash`, deposit metadata). No client API call required.
  - On `OfferMade`, insert `swap_proposals` row (`status=PENDING`).
  - On `Swapped`, mark listing `SWAPPED`, winning proposal `ACCEPTED`, others `REJECTED`.
  - On `AssetReturned`, set status `WITHDRAWN` or revert to `ACTIVE` as needed.
- Include retry + persistence (e.g., Redis cursor) so missed events can be replayed.
- Relayer utilities: wrappers around ethers signer used both here and in API for `finalizeSwap`/`returnAsset`.

## Phase 4 – API Layer (Vercel)
**Goal:** Support read flows + decision endpoint aligned with deposit model.
- `GET /listings`, `GET /my-listings`, `GET /proposals`, `GET /me/nfts` – return Supabase rows, including `deposit_id`, `status`, metadata.
- `POST /proposals/{id}/decision`:
  - Wrap in DB transaction (`FOR UPDATE` on listing + proposal).
  - Validate statuses.
  - `APPROVE`: call relayer helper `finalizeSwap(listingDepositId, offerDepositId)`, update statuses, enqueue `returnAsset` for losing proposals.
  - `REJECT`: call `returnAsset(offerDepositId)` and mark proposal `REJECTED`.
  - Error handling: if contract call reverts, roll back transaction and respond with `ESCROW_FINALIZE_FAILED`.
- Authentication: reuse existing Supabase session + wallet signature for decision endpoint (owner-only action).
- Monitoring: structured logs include deposit IDs + tx hashes.

## Phase 5 – Frontend Integration (Web)
**Goal:** Reflect deposit lifecycle in UI and trigger contract deposits from users.
- Wallet flow:
  - Listing creation CTA opens modal instructing user to call `depositForListing` via ethers hook (Metamask). After tx success, user waits for backend to ingest event before listing appears as `ACTIVE`.
  - Proposal composer similarly calls `depositForOffer(listingDepositId, ...)`. Show pending state until event ingestion.
- Tabs:
  - Market: show only listings with `status=ACTIVE`.
  - My Listings: display `DEPOSITING`, `WITHDRAWING`, `SWAPPED`.
  - Incoming Proposals: show `PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWING`.
- Decision modals call backend `/proposals/{id}/decision`. UI polls listing/proposal after submission to capture swap completion.
- Empty states and tooltips updated to explain deposit requirements and timelock fallbacks.
- Testing: MSW mocks for API + mocked ethers provider for deposit TX flows.

## Phase 6 – Operations & Resilience
- **Withdrawal watchdog**: scheduled job identifies proposals/listings stuck in `DEPOSITING` or `WITHDRAWING` longer than N minutes and alerts team.
- **Timelock enforcement**: optional contract function enabling owner withdrawal if relayer fails for >7 days. Frontend surfaces countdown + manual instructions.
- **Analytics**: capture deposit attempts, decision outcomes, failure reasons to Datadog/Segment.
- **Runbooks**: document steps to restart indexer, rotate relayer keys, replay events, or manually return assets.

## Phase 7 – Post-MVP Enhancements
1. Batch deposit support (bundle trades).
2. Notification service for deposit confirmations and swap settlement.
3. Real-time updates via Supabase Realtime or on-chain event streaming.
4. Fee model (protocol fee deducted on finalize).

---
Each phase finishes with code review + automated tests (Hardhat, Jest/RTL, integration) before moving forward. Dependencies must be satisfied sequentially: contract → schema → indexer → API → frontend. Continuous monitoring ensures on-chain deposits and off-chain state never drift.
