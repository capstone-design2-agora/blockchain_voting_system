# NFT Trading System – Frontend Requirements

## 1. Objective
Design and implement a production-ready version of the NFT exchange mock UI currently hard-coded at `/nft-exchange`. The page must evolve into a real trading workflow that lets Soul-Bound Token (SBT) verified users list their vote-constrained NFTs for P2P swaps, browse other listings, submit swap proposals, and manage inbound/outbound proposals without leaving the dApp ecosystem.

## 2. Scope
- **In scope**
  - All UI/UX, state management, and client-side validations necessary for listing NFTs, proposing swaps, approving/rejecting incoming proposals, cancelling listings, and navigating between the voting and collection pages.
  - Integrations with backend APIs and smart contracts responsible for NFT discovery, listing lifecycle, and swap execution (APIs defined in later phases).
  - Multi-tab interface (`market`, `my listings`, `incoming proposals`) plus modal workflows already introduced in the mock.
  - Wallet connectivity, SBT verification checks, and navigation entry points.
- **Out of scope (frontend)**
  - On-chain logic, backend persistence, or notification services (refer to backend/contract specs).
  - Secondary markets (fiat pricing, auctions) or non-P2P swap models.

## 3. User Roles & Preconditions
| Role | Capabilities | Preconditions |
|------|--------------|---------------|
| Verified voter (SBT holder) | List owned NFTs, browse market, submit swap proposals, approve/reject inbound offers. | Successfully passed email verification + wallet binding, holds the NFTs in MetaMask, connected wallet matches SBT owner. |
| Viewer (not verified) | View marketing copy only. Must be redirected to verification before interacting. | No wallet/SBT. |

## 4. Navigation & Entry Points
- `/nft-exchange` remains the canonical route (React Router). Access requires wallet connection + SBT check; otherwise redirect to `/email-verification` with a toast.
- Header buttons:
  - `내 컬렉션 보기` → `/my-nfts` (current behavior).
  - `투표하러 가기` → `/voting`.
  - Add breadcrumb/`Back to Dashboard` if accessed from other flows.

## 5. Layout Overview
1. **Sticky header** – shows marketplace title and quick links.
2. **Tab bar** – three logical states (market, my listings, incoming proposals). Each tab lazily loads and caches its data slice.
3. **Content grid/list** – card layouts reused from the mock but backed by real data (owner, rarity, voting event, minted date, listing status, escrow status).
4. **Modal(s)** – exchange proposal composer + read-only detail modal for proposals.
5. **Empty states** – descriptive CTA w/ button wiring to listing composer or refresh actions.

## 6. Data Model Expectations
Front end should normalize the following entities; they map 1:1 to backend DTOs:
- `NftToken` `{ tokenId, contractAddress, metadataURI, title, votingEvent, mintedAt, rarity, ownerAddress, media {url, blurHash}, traits[] }`
- `Listing` `{ listingId, token: NftToken, listerAddress, status (ACTIVE|LOCKED|CANCELLED|SWAPPED), createdAt, expiresAt?, minimumRarity?, notes }` ( `expiresAt` optional; listings without it remain published until the owner cancels or a swap settles )
- `SwapProposal` `{ proposalId, listingId, offeredToken: NftToken, requesterAddress, status (PENDING|APPROVED|REJECTED|WITHDRAWN|EXPIRED), createdAt, message }`
- `UserSummary` `{ address, verified (bool), sbtTokenId?, totalListings, totalTrades }`

## 7. Tab Behaviors
### 7.1 Market (교환 가능한 NFT)
- Fetch paginated `Listing` items sorted by newest.
- Filters: rarity multi-select, voting-event dropdown, search by token name, owner address.
- Card actions:
  - `교환 제안` opens `ExchangeModal` seeded with listing info.
  - Disabled button if listing belongs to current user or listing status != ACTIVE.
- Each card displays owner ENS/short address, rarity badge, voting event metadata, minted date, and optional lock indicator if already has pending proposal by user.

### 7.2 My Listings (내가 올린 NFT)
- Fetch listings created by current user.
- Show status chip. Provide inline actions per status:
  - `ACTIVE`: `교환 취소` (triggers cancellation confirmation -> backend call -> optimistic UI).
  - `LOCKED`: show badge referencing proposal awaiting response.
  - `SWAPPED`/`CANCELLED`: button replaced with `상세보기` linking to trade history modal.
- Include CTA `NFT 등록하기` to start listing wizard (modal or redirect) when empty.

### 7.3 Incoming Proposals (받은 교환 제안)
- List proposals where current user is listing owner.
- Provide `승인`/`거절` primary/secondary buttons.
- Cards contain `받을 NFT` (requester offers) vs `줄 NFT` (listed item) metadata, timestamps, additional message.
- Provide filter chips for status.

## 8. Modal Workflows
### 8.1 ExchangeModal (Create Proposal)
- Triggered from Market cards.
- Steps:
  1. Fetch user wallet NFTs eligible for trading (`GET /me/nfts?tradable=true`).
  2. Display grid (same as mock) with selection highlighting; disable NFTs already tied to pending proposals.
  3. Optional textarea for message to owner.
  4. Submit button -> call backend `POST /listings/{id}/proposals` -> wait for contract transaction (or background job) -> show success state w/ CTA "View proposals".
- Error cases: insufficient approvals, wallet mismatch, backend validation; show inline error + link to `/my-nfts` if user owns nothing.

### 8.2 Listing Composer (future modal or page)
- Accessed via `NFT 등록하기` CTA.
- Minimal MVP: choose NFT from wallet + set optional expiry + confirm. Should reuse wallet NFT picker from ExchangeModal.

### 8.3 Proposal Decision Modal (if needed)
- When approving/rejecting from proposals tab, show confirmation modal summarizing pair + gas estimate.

## 9. State Management
- Use existing Zustand store pattern (e.g., `emailVerificationStore`). Introduce `useNFTTradingStore` for:
  - Authenticated user summary.
  - Tab-specific caches and pagination cursors.
  - Selection state for modals.
  - Loading/error flags per API call.
- Ensure store resets on wallet/account change (subscribe to `onAccountsChanged`).

## 10. API Contracts Required (frontend view)
| Endpoint | Method | Description | Response highlights |
|----------|--------|-------------|--------------------|
| `/nft-trading/listings` | GET | Public listings feed with filters & pagination cursor. | `{ listings: Listing[], nextCursor }` |
| `/nft-trading/listings` | POST | Create listing from owned NFT. | `{ listingId, txHash }` |
| `/nft-trading/listings/{id}` | DELETE | Cancel listing. | `{ success }` |
| `/nft-trading/listings/{id}/proposals` | GET | Retrieve proposals for listing owner. | `{ proposals: SwapProposal[] }` |
| `/nft-trading/listings/{id}/proposals` | POST | Submit new proposal referencing offered token + signed payload. | `{ proposalId, txHash }` |
| `/nft-trading/proposals/{id}/decision` | POST | Approve/reject. | `{ status, txHash }` |
| `/me/nfts` | GET | List NFTs owned by connected wallet + trading eligibility. | `{ tokens: NftToken[] }` |

> Exact payloads, auth headers, and contract call flows to be finalized with backend spec.

## 11. Interactions & Edge Cases
- **Wallet mismatch**: If MetaMask account differs from SBT ownership record, block actions and show `재인증 필요` prompt.
- **Pending tx**: Show spinner on card-level button and disable further interactions until transaction resolves; surface etherscan link.
- **Image fallback**: Already implemented; ensure consistent skeleton loaders.
- **Localization**: Text currently Korean; keep translation keys ready for i18n.
- **Accessibility**: Modals must trap focus, provide keyboard navigation, and announce errors via ARIA live regions.

## 12. Telemetry & Logging
- Add analytics events (Segment or custom) for listing creation, proposal submission, approval, rejection, cancellation.
- Capture failure reasons to help debug backend/contract issues.

## 13. Dependencies & Reuse
- Continue using `lucide-react` icons, CSS modules per page.
- Consider extracting shared NFT card component for reuse between `/my-nfts` and `/nft-exchange`.
- Align color variables with existing theme tokens (App.css / MyNFTsPage.css) to maintain branding.

## 14. Testing Strategy
- Component tests (React Testing Library) covering tab switching, modals, and state resets.
- Integration tests mocking API responses (MSW) for listing/proposal flows.
- Manual QA plan: connect to testnet with sample NFTs, verify listing/proposal/decision flows end-to-end.

## 15. Open Questions
1. Should proposals lock the listing immediately or only after owner approval?
2. Do we support multi-token bundles or 1:1 swaps only?
3. How are service fees displayed (gas, protocol fee, royalty)?
4. What notifications are sent when proposals arrive or get approved?

Document to be iterated once backend + contract designs are available.

## 16. Listing & Proposal State Machines

### 16.1 Listing Lifecycle
| State | Description | Entered By | Exits To |
|-------|-------------|------------|----------|
| `DRAFT` | Client is composing a listing but has not confirmed on-chain/DB. | Frontend (local only). | `ACTIVE` after `POST /listings` succeeds. |
| `ACTIVE` | Listing is visible in market; token remains in owner wallet but flagged as “reserved”. | Backend after verifying ownership + recording listing. | `LOCKED`, `CANCELLED`, `EXPIRED` (only if owner set `expiresAt`). |
| `LOCKED` | Owner approved a proposal; backend/contract now escrows both NFTs. Listing hidden from market. | Backend when `/proposals/{id}/decision` approves and escrow tx mined. | `SWAPPED` after swap finalizes, or `ACTIVE` if escrow fails/rolls back. |
| `SWAPPED` | Settlement succeeded; ownership transferred. Listing immutable. | Backend/contract event watcher. | — |
| `CANCELLED` | Owner explicitly cancels before settlement. Backend ensures no pending proposals remain. | Backend responding to DELETE. | — |
| `EXPIRED` | `expiresAt` passed without approval. Cleanup job marks expired and notifies interested parties. | Scheduled job. | — |

Operational rule: while `ACTIVE`, multiple proposals may exist, but only one can be approved. Once approval is initiated the listing transitions to `LOCKED`; all other proposals auto-mark `REJECTED` and cannot be resubmitted. Listings stay live indefinitely (unless owner configured an explicit expiry) so the owner can edit/cancel anytime prior to approval.

### 16.2 Proposal Lifecycle
| State | Description | Entered By | Exits To |
|-------|-------------|------------|----------|
| `PENDING` | Requester submitted proposal + signature. Listing owner must respond. | Backend after verifying payload & recording. | `APPROVED`, `REJECTED`, `WITHDRAWN`, `EXPIRED`. |
| `APPROVED` | Owner accepted; proposal token + listing token move into escrow. | Backend/contract once `decision=APPROVE` tx confirmed. | `SETTLED` when swap mined. |
| `REJECTED` | Owner declined or listing auto-rejected due to other approval. | Backend. | — |
| `WITHDRAWN` | Requester cancels before an owner decision. | Backend `DELETE /proposals/{id}` (future). | — |
| `EXPIRED` | 24h TTL elapsed without decision (fixed server-side policy). | Scheduled job or request-time check. | — |
| `SETTLED` | Swap finished; references final tx hash. | Contract event watcher. | — |

Escrow/settlement path: approval triggers backend to orchestrate contract calls (lock tokens, swap, release). Failures revert proposal to `PENDING` and listing to `ACTIVE` with error details.

## 17. API + Auth Specification (Vercel `/api` Functions)

All endpoints are implemented as Vercel serverless functions under `/api/nft-trading/*`, sharing common middleware:
1. **Session check** – reuse existing email verification session cookie/token (`sb-access-token`) to fetch user record from Supabase.
2. **Wallet binding** – expect `x-wallet-address` header and `x-wallet-signature` (EIP-191) over canonical payload string. Backend verifies signature matches session wallet and SBT ownership.
3. **Rate limiting** – use existing `api/_lib/rate-limit.js` helper (Redis) to enforce per-IP + per-wallet quotas.

### 17.1 Request/Response Schemas

```http
GET /api/nft-trading/listings?cursor=abc&rarity=epic,legendary&votingEvent=2024-chair
Headers: x-wallet-address (optional)
Response 200:
{
  "listings": [
    {
      "listingId": "lst_123",
      "status": "ACTIVE",
      "token": { "tokenId": "42", "contractAddress": "0x...", "title": "학생회장", ... },
      "listerAddress": "0xaBc...",
      "createdAt": "2024-11-18T00:00:00Z",
      "expiresAt": "2024-11-25T00:00:00Z",
      "activeProposalCount": 2
    }
  ],
  "nextCursor": "def"
}
```

```http
POST /api/nft-trading/listings
Body: {
  "tokenId": "42",
  "contractAddress": "0xNFT",
  "message": "Looking for rare badges",
  "expiresAt": "2024-11-25T00:00:00Z"
}
Response 201: { "listingId": "lst_123", "txHash": "0xabc" }
```

```http
POST /api/nft-trading/listings/{listingId}/proposals
Body: {
  "offeredToken": { "tokenId": "7", "contractAddress": "0xNFT" },
  "message": "Swap?",
  "signature": "0xEip712Signature"
}
Response 201: { "proposalId": "prp_456", "txHash": "0xswap" }
```

```http
POST /api/nft-trading/proposals/{proposalId}/decision
Body: { "decision": "APPROVE" | "REJECT" }
Response 200: { "status": "APPROVED", "listingId": "lst_123", "txHash": "0xescrow" }
```

```http
GET /api/nft-trading/me/nfts?tradable=true
Response 200: { "tokens": [NftToken], "blockedReason": null }
```

Error shape: `{ "error": { "code": "WALLET_MISMATCH", "message": "..." } }` with HTTP 4xx/5xx.

### 17.2 Maintainability Notes
- Group shared logic (auth, Supabase access, contract client) inside `/api/_lib/nftTrading.ts` to avoid duplication.
- JSON schemas documented in TypeScript types so frontend and backend import from a common package (e.g., `/frontend/src/types/nftTrading.ts`).
- Functions should stay stateless; Supabase tables hold authoritative state. For MVP, contract interactions run inline within the Vercel function handling the user action (approve/cancel). If throughput increases later, migrate long-running work to Supabase Edge Functions or an external worker queue.

## 18. Operational Rules & Security
- **Locking semantics**: Listing stays `ACTIVE` while proposals accumulate. On approval, backend issues contract call to lock both assets; until the tx is confirmed, frontend shows `LOCKED (Confirming...)`. If tx fails, backend emits `LOCK_ROLLBACK` event to revert status.
- **Expiry enforcement**: Listings only expire if the owner sets `expiresAt`. Proposals always receive a fixed 24h TTL (`expiresAt = createdAt + 24h`). Backend marks proposals as `EXPIRED` either via lightweight cron (hourly) or during read operations if TTL passed.
- **Retries**: Contract interactions execute within the approving API call. Simple retries (e.g., 2 attempts) happen inline; persistent failures mark proposal `FAILED` and instruct the user to retry manually. Long-term, these flows can move to Edge Functions if needed.
- **Security**:
  - Verify NFT ownership on-chain before allowing listing/proposal (read contract via Infura/Alchemy).
  - Prevent replay/spam by storing nonce per wallet in Supabase; require clients to sign `{ action, listingId, nonce }`.
  - Sanitize all user-provided text (messages) to avoid XSS when rendered.
  - Log sensitive operations with structured metadata (wallet, listingId, txHash) but avoid storing raw signatures beyond nonce validation window.
- **Observability**: Use existing logging middleware to push key events to Logflare/Datadog. Include correlation IDs so frontend bug reports can be traced.
- **Scalability**: Read-heavy endpoints (`GET listings`) should be cached in Vercel Edge cache for 30s for anonymous viewers, while authenticated responses bypass cache to respect personalized data.

## 19. MVP Simplifications & Future Enhancements
1. **Functional scope**: MVP supports 1:1 swaps only, with a single NFT per listing and per proposal. Listing composer exposes NFT picker + optional message; additional filters/analytics deferred.
2. **Processing model**: `/api` functions immediately perform validation and, on approval, execute the contract call before responding. Frontend polls listing/proposal endpoints for status updates instead of relying on background workers. Supabase Edge Functions / cron jobs remain optional cleanup tools for future scale.
3. **Auth strategy**: Use existing Supabase session (email-verified) combined with wallet signature + nonce for critical actions. SBT verification happens server-side during each call but does not add extra auth steps for the client.
4. **State management**: Split Zustand stores or hooks per tab (`useMarketListings`, `useMyListings`, `useIncomingProposals`) to keep MVP manageable. Optimistic updates are optional; start with refetch-after-mutation.

These simplifications keep the architecture achievable now while leaving clear upgrade paths (Edge workers, richer filters, notifications) once usage grows.
## 20. Next Steps
1. Update Supabase schema with `listings`, `swap_proposals`, `wallet_nonces`, and indexes that support filters described above.
2. Define smart-contract interface supporting escrow + swap (Solidity spec TBD) and how serverless functions invoke it (via ethers + managed key). Document fallback plan (Edge Function) if synchronous calls prove too slow.
3. Flesh out notification strategy (email/webhook/push) once backend skeleton exists.
