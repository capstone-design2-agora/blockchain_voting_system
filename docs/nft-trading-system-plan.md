# NFT Trading System – Delivery Plan

This plan derives directly from `nft-trading-system-spec.md` and splits the frontend build into incremental phases. Each phase is sized so it can be implemented, reviewed, and validated independently while still building toward the complete workflow described in the spec.

## Phase 1 – Access Control & Page Skeleton
**Goal:** Replace the hard-coded mock at `/nft-exchange` with a real route guard, shared layout, and tab framework that future phases can plug into.
- Implement route guard that checks wallet connection + SBT status; redirect to `/email-verification` with toast when missing (`Spec §3, §4, §11`).
- Build sticky header + tab bar scaffolding with lazy tab containers (`market`, `my listings`, `incoming proposals`) and placeholder empty states (`Spec §5`).
- Wire header buttons (`내 컬렉션 보기`, `투표하러 가기`, breadcrumb/back link) to existing routes (`Spec §4`).
- Establish `useNFTTradingStore` in Zustand with top-level state (active tab, loading flags, user summary placeholder) and wallet-change reset handler (`Spec §9`).
- Add Cypress/RTL smoke test covering redirects + tab switching baseline (`Spec §14`).

## Phase 2 – Data Contracts & API Client Layer
**Goal:** Normalize frontend types and shared fetch utilities so tabs can consume real data consistently.
- Define shared TypeScript models for `NftToken`, `Listing`, `SwapProposal`, `UserSummary` in `frontend/src/types/nftTrading.ts` (imported by both components and API layer) (`Spec §6, §17.1`).
- Create typed API hooks/services for `/api/nft-trading/*` endpoints with query parameter helpers (cursor pagination + filters) (`Spec §10, §17`).
- Centralize wallet-auth headers + signature helper reused across mutations (`Spec §17`).
- Implement loading/error state wiring in `useNFTTradingStore`, including per-tab caches and pagination cursors (`Spec §7, §9`).
- Add unit tests (jest) for serializers + query builders to guarantee payload shape matches spec (`Spec §14`).

## Phase 3 – Market Tab Integration
**Goal:** Turn the Market view into a functional listing browser with filters and proposal entry points.
- Render listing cards using normalized data (owner ENS/short address, rarity badge, voting event, minted date, lock indicator) (`Spec §7.1`).
- Implement filters: rarity multi-select, voting-event dropdown, search, owner address input, with debounced API calls and store persistence (`Spec §7.1`).
- Disable `교환 제안` button when viewing own listing or status != ACTIVE; surface tooltip explaining reason (`Spec §7.1, §11`).
- Show skeleton loaders, pagination “Load more”, and empty state CTA to listing composer (`Spec §5, §7.1`).
- Instrument analytics events for filter usage + proposal initiation (Segment/custom) (`Spec §12`).
- RTL tests covering filter state + disabled button logic (`Spec §14`).

## Phase 4 – Listing Management (My Listings Tab)
**Goal:** Enable users to inspect, cancel, or review their submitted listings.
- Fetch user listings via dedicated API call; show status chips + badge copy matching listing lifecycle (`Spec §7.2, §16.1`).
- Implement inline actions: `교환 취소` (DELETE endpoint + optimistic UI), `상세보기` modal for swapped/cancelled listings, locked indicator referencing awaiting proposal (`Spec §7.2, §8.3`).
- Provide CTA `NFT 등록하기` that opens listing composer entry point (placeholder until Phase 5) with contextual messaging for empty state (`Spec §7.2, §8.2`).
- Track cancellation analytics + contract tx link handling, including pending state spinner per card (`Spec §11, §12`).
- Add component tests around optimistic cancellation rollback + empty-state CTA.

## Phase 5 – Proposals Tab & Decision Workflow
**Goal:** Allow listing owners to review incoming proposals and approve/reject them via modal confirmation.
- Query proposals for listings owned by the current user (`Spec §7.3, §10`).
- Show dual-card layout (`받을 NFT` vs `줄 NFT`) with timestamps, requester ENS/address, and optional message (`Spec §7.3`).
- Provide filter chips for status + search by listing (`Spec §7.3`).
- Implement `승인`/`거절` buttons that open decision modal summarizing pair + gas estimate, then call `/proposals/{id}/decision` with loading/rollback states (`Spec §8.3`).
- Auto-refresh relevant tabs when decision completes (listing transitions to `LOCKED/SWAPPED`, proposals update) (`Spec §16`).
- Emit analytics for approvals/rejections and log failures per spec (`Spec §12`).
- RTL tests covering modal focus trap, status filtering, and decision happy-path.

## Phase 6 – Proposal Creation & Listing Composer
**Goal:** Let verified users list NFTs and submit swap proposals end-to-end.
- Create shared wallet NFT picker component reused by ExchangeModal + Listing Composer (`Spec §8.1, §8.2, §13`).
- ExchangeModal: fetch tradable NFTs, enforce disabled state for NFTs tied to pending proposals, support optional message, submit `POST /listings/{id}/proposals`, show success CTA (“View proposals”) (`Spec §8.1`).
- Listing Composer: allow selecting NFT, optional expiry/message, submit `/nft-trading/listings` with optimistic `DRAFT → ACTIVE` transition, integrate CTA entry points from Phase 3/4 empty states (`Spec §8.2, §16.1`).
- Handle errors (wallet mismatch, insufficient approvals) with inline messaging + link to `/my-nfts` when inventory empty (`Spec §8.1, §11`).
- Tie pending transaction states to card buttons + etherscan link surfaces (`Spec §11`).
- Add integration tests with MSW mocking listing creation + proposal submission flows (`Spec §14`).

## Phase 7 – Polish, Telemetry & Accessibility
**Goal:** Ensure production readiness across UX, observability, and accessibility.
- Finalize analytics taxonomy for all critical events (listing creation, proposal submission/decision, cancellation) and verify instrumentation (`Spec §12`).
- Add ARIA attributes, focus traps, and live-region error announcements to all modals + forms (`Spec §11`).
- Implement localization hooks for new Korean copy with translation keys ready for future i18n work (`Spec §11`).
- Harden error boundaries + retry mechanisms for fetch failures and pending tx polling; ensure wallet mismatch prompt flows are covered (`Spec §11, §18`).
- Document manual QA checklist (connect testnet wallet, run listing/proposal/decision flows) and bake into release notes (`Spec §14`).
- Conduct accessibility + UX regression tests (keyboard nav, screen reader spot-checks) before launch.

## Phase 8 – Future Enhancements (Post-MVP backlog)
These items are out of Phase 1–7 scope but tracked for future iterations once backend and contracts mature (`Spec §19`, `§20`).
- Notifications pipeline (email/webhook) for proposal lifecycle updates.
- Multi-token bundles or alternative swap models once contracts support them.
- Service fee & gas cost visualization modules.
- Edge cache tuning + realtime updates for listings/proposals via subscriptions.

---
Each phase should conclude with code review, analytics validation, and at least one automated/regression test pass before proceeding. Dependencies (API availability, contract ABI, wallet signature format) must be confirmed with backend counterparts at kickoff of each phase.
