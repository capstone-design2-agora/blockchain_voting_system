# EMAIL_VERIFY_IMPLEMENTATION_PLAN.md

## Goal & Scope
- Target implementation: the serverless email verification and SBT issuance workflow outlined in `EMAIL_VERIFI_SPEC.md`.
- Deliverables: Supabase schema/security, Vercel serverless functions, React UI updates, CitizenSBT contract changes, and operational monitoring.
- Constraints: Fully serverless (no standalone servers), no plaintext storage of PII, prioritize free or low-cost managed services.

---

## Phase 0 – Platform, Accounts, and Secrets (Pre-work)
**Tasks**
1. Set up the Vercel project with `main` → Production and preview deployments per branch.
2. Create a Supabase project (prefer `ap-northeast-1` region for user proximity).
3. Register a Resend account and verify a custom sender domain (e.g., `mail.exampleuniv.ac.kr`) with SPF/DKIM/DMARC DNS records.
4. Choose an RPC endpoint (Quorum node or Alchemy/QuickNode free tier) and confirm the HTTPS URL.
5. Define required secrets: `VERIFIER_PK`, `RPC_URL`, `RESEND_API_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL`, `HMAC_PEPPER_V1`, `AES_RETRY_KEY`, `EMAIL_DOMAIN_ALLOWLIST`.
6. Automate secret syncing across Vercel environments (Production/Preview/Development) and any GitHub Actions workflows.
**Deliverables**: Account/domain verification proof, `.env.example`, and a secret inventory document.
**Dependencies**: None.

## Phase 1 – Data Layer & Security Hardening (Supabase)
**Status**: ✅ Completed 2025-11-12 — Supabase migrations (`supabase/migrations/20251112_email_verification_phase1.sql`) applied to the cloud project, and security/hash strategy documented in `docs/email_verification_security.md`. Verified locally via `npx supabase db push`.
**Tasks**
1. Design and run SQL migrations for:
   - `email_verification_codes`
     - `id uuid PRIMARY KEY`, `email_lookup_hmac`, `code_hash`, `code_expires_at`, `attempt_count`, `created_ip_hash`, `created_at`.
   - `verified_users`
     - `email_lookup_hmac PRIMARY KEY`, `email_hash_slow`, `wallet_lookup_hmac UNIQUE`, `wallet_hash_slow`, `pepper_key_id`, `status ENUM('PENDING','COMPLETED')`, `signature`, `identity_hash`, `retry_payload_enc`, `tx_hash`, `created_at`, `completed_at`.
2. Document and implement the hashing strategy:
   - `lookup_hmac = HMAC-SHA256(pepper, normalized_identifier)` with `pepper_key_id` to support pepper rotation.
   - `*_hash_slow = Argon2id(normalized_identifier + per-row salt)` where `salt` is a 16-byte `bytea` column.
3. Set up Row-Level Security policies:
   - Only the Supabase service key can write; Vercel functions use that key.
   - The public anon key cannot read or write.
4. Create indexes and constraints: `UNIQUE(email_lookup_hmac)`, `UNIQUE(wallet_lookup_hmac)`, `INDEX(code_expires_at)`.
5. Optionally add stored procedures or SQL functions for cleaning expired codes and checking nonces.
6. Schedule Supabase cron jobs or Edge Functions to purge expired verification records (e.g., hourly `DELETE FROM email_verification_codes WHERE code_expires_at < now()`).
**Deliverables**: `supabase/migrations/2024xxxx.sql`, security strategy doc, Supabase policy screenshots.
**Dependencies**: Phase 0 secrets.

## Phase 2 – Serverless Email Verification APIs (Vercel Functions)
**Status**: ✅ Core endpoints deployed and verified end-to-end (Resend delivery + Supabase persistence + on-chain mint/receipt). `/api/webhook/sbt-issued` automation remains optional/backlog.
**Shared Setup**
- Runtime: Node.js 18+ (serverless functions because crypto and Argon2 modules need Node API).
- Shared utilities: `normalizeEmail`, `normalizeAddress` (EIP-55), `createLookupHmac`, `deriveSlowHash`, `encryptRetryPayload`, `decryptRetryPayload`, Supabase client wrapper, rate limiter (Upstash/QStash or Vercel Edge Config combined with a limit package).
- Dependencies: `argon2`, `@supabase/supabase-js`, `ethers` (transaction validation), `zod` (input validation), optional `@upstash/ratelimit`, `crypto` or `@aws-crypto/client-node` for AES-GCM.

### Endpoint: `POST /api/request-code`
Steps:
1. Validate and normalize the payload `{ email, walletAddress, recaptchaToken? }`.
2. Enforce the domain allowlist defined in `EMAIL_DOMAIN_ALLOWLIST`.
3. Apply rate limiting by IP and wallet `lookup_hmac`.
4. Hash identifiers and check `verified_users` plus active `email_verification_codes` to block duplicates or spam.
5. Generate a random six-digit code, hash it with `Argon2id(code + email_lookup_hmac)`.
6. Insert into `email_verification_codes` with `code_expires_at = now() + interval '5 minutes'`.
7. Send the code via Resend with a localized template.
8. Return a generic success response that does not disclose whether the email already exists.

### Endpoint: `POST /api/verify-and-sign`
1. Normalize `{ email, walletAddress, code }` and recompute hashes.
2. Retrieve the latest code record, confirm it is unexpired, and check `attempt_count`. Atomically increment `attempt_count` (Supabase RPC or `update ... set attempt_count = attempt_count + 1` with `eq` filters).
3. On successful verification:
   - Derive `identity_hash = keccak256(email_lookup_hmac || wallet_lookup_hmac)` (or another spec-approved mix).
   - Construct the signing payload `{ identityHash, walletAddress, chainId, nonce }` (nonce can be a UUID v4 saved per row).
   - Sign using `VERIFIER_PK` (ethers `Wallet.signMessage()` or EIP-712 per CitizenSBT expectations).
   - Upsert `verified_users` with `status='PENDING'`, storing HMACs, slow hashes, the signature, identity hash, and an encrypted retry payload (`AES-GCM` of `{ signature, identityHash, nonce }`).
4. Return `{ signature, identityHash, nonce, expiresAt }` to the frontend.
5. Remove the consumed verification code record.

### Endpoint: `GET /api/check-status?wallet=`
1. Normalize the wallet address → `wallet_lookup_hmac`.
2. Fetch the `verified_users` row; if `status='PENDING'`, decrypt `retry_payload_enc` and return the signature bundle for retry.
3. If `status='COMPLETED'`, return the finished status only.
**Verification log**: `curl https://blockchain-voting-system-ye422s-projects.vercel.app/api/check-status?wallet=0x9d09...` returned `{ status:"PENDING", signature, identityHash, nonce }`, then `status:"COMPLETED"` after the mint finished, confirming the resume/complete flow.

### Endpoint: `POST /api/complete-verification`
1. Validate `{ walletAddress, txHash }`.
2. Normalize the wallet, fetch the row, and ensure `status='PENDING'`.
3. Use `ethers.JsonRpcProvider(RPC_URL)` to call `getTransactionReceipt(txHash)`:
   - Confirm `status === 1`, `to` equals the CitizenSBT contract, `from` matches the wallet, and logs emit the expected `identityHash` or `nonce`.
4. If valid, update the row: set `status='COMPLETED'`, `tx_hash=txHash`, `completed_at=now()`, and clear `signature` + `retry_payload_enc`.
5. If invalid, return an error and preserve the pending state for retry.
**Verification log**: Executed the full happy path (`request-code → verify-and-sign → mintWithSignature` on CitizenSBT `0x968969dB...` with tx `0x4c8105f1…` → `/api/complete-verification`) and observed the PENDING row flip to `COMPLETED`. Endpoint correctly rejected mismatched contract targets until `CITIZEN_SBT_CONTRACT_ADDRESS` was updated.

### Endpoint: `POST /api/webhook/sbt-issued` (optional automation)
- Accepts webhook events from a Quorum node or third party to automatically mark verifications complete.

**Deliverables**: Vercel function implementations under `/frontend/src/app/api/*`, Jest integration tests with mocked Supabase/Resend/RPC, and a mini OpenAPI spec.
**Dependencies**: Phase 1 schema + secrets.

## Phase 3 – Frontend Integration (React)
**Tasks**
1. Define a state machine: `IDLE → CODE_SENT → VERIFIED → TX_PENDING → COMPLETED`.
2. Build the email form: show domain hints, debounce validation, optionally include CAPTCHA.
3. Implement the code entry UI: timer, 60-second resend cooldown, attempt counter feedback.
4. Implement wallet connection flow enforcing MetaMask + target network and displaying normalized address.
5. Wire API integration:
   - Call `/api/request-code` on submit and handle rate-limit messaging.
   - Call `/api/verify-and-sign` to receive `{ signature, identityHash, nonce }`.
   - Trigger `CitizenSBT.mintWithSignature(signatureBundle)` via `ethers.js`, surface gas warnings.
   - Once the transaction receipt returns, call `/api/complete-verification` with the `txHash`.
   - On page reload, call `/api/check-status` using the connected wallet to resume pending steps.
6. Improve UX with skeletons, an error boundary, and localized copy.
7. Track events via analytics (e.g., Vercel Web Analytics or PostHog) without storing PII.
**Deliverables**: React components (`EmailForm.tsx`, `CodeStep.tsx`, `VerificationStatus.tsx`), app state (Zustand/Redux) updates, Cypress happy-path test.
**Dependencies**: Phase 2 API endpoints.

## Phase 4 – Smart Contract Updates (CitizenSBT)
**Tasks**
1. Adjust the contract:
   - Expand the `mintWithSignature` input to include `{ identityHash, nonce, signatureExpiration }`.
   - Maintain `mapping(bytes32 => bool) public nonceUsed;`.
   - Verify the `identityHash` implied by the signature matches the backend-derived value.
   - Emit `event VerificationCompleted(address indexed wallet, bytes32 identityHash, bytes32 nonce, string txType);`.
2. Write Hardhat tests covering replay attacks, incorrect signers, and expired nonces.
3. Deploy to the Quorum testnet, capture the new contract address + ABI, and update frontend constants.
4. Document ABI changes and the signing domain/type expected by the backend.
**Deliverables**: Updated `blockchain_contracts/CitizenSBT.sol`, Hardhat test report, and deployment artifacts JSON.
**Dependencies**: Phase 2 signing payload finalized before implementing signing logic.

**Progress Log (2025-11-18)**
- CitizenSBT Phase 4 사양을 적용하기 위해 컨트랙트/프런트/서버를 업데이트하고, signatureExpiration을 포함한 새 서명을 발급하도록 작업을 진행함.
- 그러나 Raft 합의 네트워크의 특성상 트랜잭션이 있을 때만 블록이 생성되어 체인 timestamp가 멈춰 있었고, 만료 검증(`block.timestamp > signatureExpiration`)이 항상 `SignatureExpired`로 실패함.
- `/api/verify-and-sign`에서 체인 timestamp를 읽어 만료를 계산하도록 바꾸고, 프런트도 새 시그니처를 전달했지만, 블록이 생성되지 않는 한 TTL이 과거 기준으로 고정되어 사용자가 즉시 만료되는 문제가 계속됨.
- 블록 주기를 유지하거나 시스템 시각 기반으로 재설계해야 하는 추가 작업이 필요하다고 판단되어, 현재는 Phase 4 변경 사항을 롤백하고 추후 시간 확보 후 다시 진행하기로 결정함.

## Phase 5 – Monitoring, QA, and Operations
**Tasks**
1. Add structured logging/tracing in APIs (request ID, wallet hash prefix) and forward to a Vercel log drain (Datadog or Logtail free tier).
2. Configure alerts: Vercel checks for function error rates, Supabase row count anomalies, Resend bounce notifications.
3. Conduct a security review: secret rotation dry run, verify logs contain no PII, run `pnpm audit`, ensure lint/test CI gates.
4. Run load and abuse tests simulating rate-limit exhaustion, invalid codes, and RPC failures.
5. Write an operations playbook that covers common failure modes and recovery (e.g., Resend quota exhaustion, Supabase downtime, RPC lag).
**Deliverables**: Operations runbook, alert screenshots, QA checklist, and CI test results.
**Dependencies**: Previous phases feature-complete implementations.

---

## Cross-Cutting Considerations
- **Testing Strategy**: Unit tests for utilities, integration tests for API + Supabase (using a test schema), and end-to-end tests with Cypress + a Hardhat fork. Create fixtures for valid/invalid codes and mocked RPC responses.
- **Rate Limiting Store**: Prefer Upstash Redis free tier; if unavailable, fall back to a Supabase `rate_limit_counters` table.
- **Pepper Rotation**: Maintain `HMAC_PEPPER_V2` secret and include a migration job that recomputes lookup HMACs and updates the `pepper_key_id`.
- **Accessibility & Localization**: Provide Korean and English copies; make sure email templates include both plain text and HTML.
- **Compliance**: Publish a privacy notice describing hashed storage and data retention policies, and schedule a cron job to purge `PENDING` records older than the retention threshold (e.g., 30 days).

## Definition of Done
- All phases are complete, code merged, automated tests passing, and deployment runbook approved.
- Demonstrate a dry-run: user registers, receives the email, verifies, mints the SBT, and the status reaches `COMPLETED`, including retry flows after failures.
