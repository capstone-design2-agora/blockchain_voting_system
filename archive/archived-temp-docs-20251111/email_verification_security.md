# Email Verification Data Layer & Security Strategy

This document captures the implementation details delivered in Phase 1 of the Email Verification plan. It explains the hashing strategy, storage layout, access policies, and the operational hooks that keep Supabase hardened.

---

## 1. Hashing & Encryption Strategy
- **Normalization**
  - Email → lower-case, trimmed, Unicode NFC.
  - Wallet → EIP-55 normalized address.
- **Lookup HMACs (`*_lookup_hmac`)**
  - Algorithm: `HMAC-SHA256`.
  - Pepper: `HMAC_PEPPER_V{N}` (managed through Vercel/Supabase secrets).
  - Stored as `BYTEA`; `pepper_key_id` records which pepper was used per row.
- **Slow Hashes (`*_hash_slow`)**
  - Algorithm: `Argon2id`.
  - Input: `normalized_identifier || salt`.
  - Parameters: `memory=64MB`, `iterations=3`, `parallelism=2`, `hashLength=32` (safe defaults for Node.js `argon2` library).
  - Salts: 16 random bytes stored in `<field>_salt`.
- **Verification Codes**
  - Generate a random 6-digit string.
  - Persist `code_hash = Argon2id(code || email_lookup_hmac)` so compromise of the DB still hides the plaintext.
- **IP Hashing**
  - `created_ip_hash` stores `HMAC-SHA256(ip, HMAC_PEPPER_V1)` to correlate abuse without retaining the IP itself.
- **Retry Payload Encryption**
  - AES-256-GCM with key from `AES_RETRY_KEY`.
  - Payload structure `{ signature, identityHash, nonce }` in JSON; nonce reused from the row.

Pepper rotation is handled by introducing `HMAC_PEPPER_V{N}` secrets and updating `pepper_key_id`. New inserts use the latest pepper; background jobs can re-HMAC old rows when rotating.

---

## 2. Tables, Constraints, and Indexes

### `email_verification_codes`
| Column | Notes |
| --- | --- |
| `email_lookup_hmac` | Enforced unique to keep only one active code per normalized email. |
| `code_hash` | Argon2id hash, prevents replay. |
| `code_expires_at` | Indexed for efficient cleanup. |
| `attempt_count` | Incremented atomically; bounded via app logic. |
| `created_ip_hash` | Optional anti-abuse signal. |
| `created_at` | UTC timestamp. |

**Indexes & Constraints**
- `UNIQUE(email_lookup_hmac)`
- `INDEX(code_expires_at)`
- `attempt_count >= 0`

### `verified_users`
| Column | Notes |
| --- | --- |
| `email_lookup_hmac` | Primary key; ties to verification requests. |
| `wallet_lookup_hmac` | Unique to prevent duplicate wallets. |
| Slow hashes + salts | Persisted in `BYTEA` for compliance evidence. |
| `pepper_key_id` | Tracks which pepper to use when re-HMACing. |
| `status` | Enum `PENDING` → `COMPLETED`. |
| `signature`, `identity_hash`, `retry_payload_enc` | Added once verification succeeds; retry payload stays encrypted. |
| `nonce` | UUID used both for signing payloads and replay protection. |
| `tx_hash` | Optional when SBT mint transaction lands. |
| `completed_at` | Set when status transitions to `COMPLETED`. |

---

## 3. Row-Level Security & Grants
- RLS enabled on both tables.
- Explicit `REVOKE ALL` from `anon` / `authenticated`.
- Whitelist policy grants `service_role` full access while public roles get a hard deny.
- Vercel serverless functions must use the Supabase service key; the browser never interacts with these tables directly.

---

## 4. Maintenance & Cron
- Function `public.cleanup_expired_email_codes()` deletes expired rows and returns the count removed.
- `pg_cron` (installed into the `extensions` schema) schedules an hourly job named `cleanup_email_verification_codes_hourly`.
  - Adjust the schedule via `SELECT cron.schedule(...)` if tighter SLAs are needed.
- Additional housekeeping (pepper rotation, status purges) can hook into the same pattern and reuse the service role.

---

## 5. Operational Checklist
1. **Secrets**: Keep `HMAC_PEPPER_*`, `AES_RETRY_KEY`, and Supabase credentials synced via Vercel project settings.
2. **Monitoring**: Track cron success via Supabase logs; alert if row counts remain high beyond the expiration window.
3. **Backups**: Supabase PITR should be enabled; verify retention captures both tables.
4. **Testing**: Integration tests should seed the tables through Supabase migrations and assert RLS is enforced by attempting anon inserts.
5. **Compliance**: Document the hashed storage and cron-based retention in the privacy notice before going live.
