# Vote Transparency Enhancement Plan

## Goals
- Provide users with direct evidence that their vote transaction reached the blockchain even before official tally announcements.
- Offer an intuitive way to re-open vote details (“Check My Vote”) without relying on an external block explorer.
- Visualize blockchain data lineage (recent blocks + parent links) so immutability concepts are obvious.

## Workstreams

### 1. Transaction Receipt Capture
1. Update `castVote` helper to return the `TransactionReceipt` so call sites can access `status`, `transactionHash`, and `blockNumber`.
2. Extend the voting state slice with `lastReceipt`, `lastCandidateId`, `lastCandidateName`, and persist this payload to `sessionStorage` under a versioned key (e.g., `agora:lastVote:v1`) to survive reloads.
3. For consistency, normalize receipt payload into `{ statusLabel, displayHash, blockNumber, gasUsed, effectiveGasPrice, confirmations: 0 }`.
4. When a vote succeeds, set `userHasVoted=true`, store the candidate metadata, trigger a status banner, and optimistically refresh proposal tallies after a short delay (2–3 seconds) to reflect the new vote count.
5. Add a guard so repeated `castVote` clicks reuse the in-flight promise and avoid double submissions in case of slow RPC responses.

### 2. “Check My Vote” Modal
1. Replace the single “지금 투표하기” button with a two-state CTA:
   - Before voting: `지금 투표하기` triggers `castVote`.
   - After vote receipt is available: `내 투표 확인하기` opens the modal.
2. Modal contents:
   - Transaction hash with copy button.
   - Block number, timestamp, included transaction count (fetched via `web3.eth.getBlock(blockNumber)` upon opening).
   - Gas usage summary, `effectiveGasPrice`, total cost (converted to ETH or native token), and status description.
   - RPC self-verification instructions: provide both curl and minimal JavaScript snippets showing `eth_getTransactionReceipt` and `eth_getBlockByNumber`.
   - Optional QR code containing the transaction hash URL if an explorer URL template is configured via env.
3. Allow the modal to reopen anytime until data is cleared. If RPC fetch fails, show fallback text so users can still copy the hash/block number and include retry button.
4. Add accessibility details: trap focus within modal, ensure copy buttons announce success, and close on `Escape`.

### 3. Status + Candidate Feedback
1. Inject a status banner after voting: “블록 #12345에 포함됨 – ‘내 투표 확인하기’ 버튼에서 세부 정보 확인 가능”.
2. Highlight the candidate card that the user selected (badge or subtle glow) so they can see which choice was recorded, and add secondary text like “내 표가 이 후보에게 기록됨”.
3. Disable other candidate buttons once a vote is cast, but keep tooltips explaining “이미 투표 완료 – 내 투표 확인하기 버튼을 사용하세요”.
4. Update the side panel (“내 정보”) to include a “최근 투표 블록” row referencing the receipt data when available.

### 4. Recent Block Chain Visualization
1. Add a lightweight component that:
   - Calls `web3.eth.getBlockNumber()` and fetches the last 3–5 blocks via `getBlock(n, false)`.
   - Shows cards for each block with `hash`, `parentHash` (truncated), timestamp, and tx count.
   - Draws arrow connectors or fallback separators (e.g., `Block 1026 → Block 1027`).
2. When a user vote exists, emphasize the block containing their transaction.
3. Refresh block data on an interval (e.g., every 15–20 seconds) to illustrate continuity without overwhelming RPC, and pause polling if the tab is hidden (use `document.visibilityState`).
4. Provide fallback dummy blocks if RPC is unreachable so the UI still explains the concept (“실제 데이터 연결 실패 시 샘플 체인 표시”).
5. Include a short caption under the chain (“각 블록은 이전 블록의 해시를 포함하여 조작 시 전체 체인을 수정해야 합니다”) to reinforce the immutability message.

### 5. Persistence & Edge Cases
1. Use `sessionStorage` keys like `lastVoteReceipt` and `lastVotedCandidate` to keep context between reloads.
2. If no wallet is connected or RPC is unavailable, hide the “Check My Vote” CTA and chain visualization while showing explanatory text.
3. In demo mode, simulate receipt data so UX can be previewed without an on-chain transaction.
4. Add migration logic for future schema changes (e.g., check stored `version` field); if parsing fails, clear stale data gracefully.
5. Surface specific error states (`RPC_TIMEOUT`, `UNEXPECTED_CHAIN`, `TX_REJECTED`) with user-facing copy so support can distinguish issues quickly.

## Verification
- Manual test: cast a vote on the target network, confirm modal displays accurate receipt/block data, reload page to ensure modal can reopen via stored data.
- Demo test: enable demo mode, ensure placeholder receipt shows and “Check My Vote” button remains functional.
- Visual test: confirm block chain component updates and highlights the vote block when relevant.
- Accessibility test: run keyboard-only navigation and screen reader checks on the modal and block visualization components.

## Progress Log
### 2025-11-18
- ✅ Workstream 1: Voting state now persists `lastReceipt`, `lastCandidateId`, and related metadata in `sessionStorage`, and the normalized payload matches the expected `{ statusLabel, displayHash, blockNumber, gasUsed, effectiveGasPrice, confirmations }` shape. Successful votes trigger user banners and optimistic tally refreshes.
- ✅ Workstream 2: “내 투표 확인하기” 모달이 구현되어 트랜잭션 해시 복사, 블록 상세, 가스 요약, RPC 검증 스니펫, QR 코드까지 제공하며 접근성 가드(포커스 트랩, ESC 닫기, 복사 피드백)도 갖췄습니다.
- ✅ Workstream 3 (partial): 실제로 투표한 후보 카드만 CTA가 “내 투표 확인하기”로 전환되고 하이라이트/설명 문구가 적용됩니다. 다른 후보들은 “이미 투표 완료”로 비활성화되며 추가 상태 배너 업데이트는 추후 진행 예정입니다.
- ✅ Workstream 4: 최근 블록 체인 뷰어를 추가해 15초 간격 폴링, 가시성 기반 일시중지, 샘플 체인/에러 메시지, 내 투표 블록 강조, 수동 새로고침까지 지원합니다.
- ✅ Workstream 5: 세션 상태/버전 관리를 유지하면서 데모 모드 영수증 시뮬레이션, RPC/체인 에러 코드 표시, RPC 장애 시 CTA/체인 안내, 지갑 미연결 시 정보 배너 등을 적용했습니다.
