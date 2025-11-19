# Admin Deployment Page Implementation Plan

## Objectives
- Provide an internal-only admin page that captures ballot-specific variables (titles, schedule, proposals, mascot CID) while keeping long-lived secrets only in host env vars.
- Trigger the existing `blockchain_contracts/scripts/setup_and_deploy.sh` script programmatically, stream logs back to the UI, and store the final deployment result for later reference.
- Keep the attack surface tiny: no public authentication workflow, only a static token header plus network-level restrictions.

## Assumptions & Constraints
- The deployment server already has the sensitive keys (Verifier private key, RPC credentials, storage tokens) injected via the process environment; they are **not** editable from the UI.
- Votes happen sequentially, so running one deployment at a time is acceptable. Concurrency limits can therefore be enforced in-process.
- Admin UI runs inside the existing frontend codebase (`frontend/`) and can reuse its tooling (React + Vite/CRA).

## Phase 0 – Foundations
1. **Config inventory**: enumerate which keys remain in host env vars vs. which become "ballot config" inputs. Update `docs/ARCHITECTURE.md` accordingly.
2. **Schema stub**: define a TypeScript interface (e.g., `BallotConfig`) describing UI-managed fields. Keep it shared between frontend & backend via a small `@/types` module.
3. **Server skeleton**: add a lightweight Express (or existing API layer) endpoint namespace `/internal/deploy`. Guard it with a static token read from env (`ADMIN_DEPLOY_TOKEN`).
4. **Storage decision**: choose between flat-file history (`deploy-configs/<timestamp>.json`) or Supabase table. For now, plan uses JSON files committed to `artifacts/admin-history/` with `.gitignore` entries.

## Phase 1 – Environment & File Management
1. Create `blockchain_contracts/deploy.templates.env` containing placeholders for dynamic values (use `{{BALLOT_TITLE}}` style markers).
2. Implement a backend helper that renders the template using the submitted config, writes it to `blockchain_contracts/tmp/deploy-<uuid>.env`, and ensures the file is removed after use.
3. Update `setup_and_deploy.sh` to accept `DEPLOY_ENV_FILE` override via env var or CLI flag; no functional change, just read the provided path if set.
4. Write utilities to persist the last successful config JSON in `artifacts/admin-history/latest-success.json` for UI prefill.

## Phase 2 – Backend API & Runner
1. **Validation layer**: use `zod` (or similar) to validate incoming JSON (date formats, proposal counts matching pledges, etc.). Return structured errors for the UI.
2. **Queue/lock**: implement an in-memory mutex (e.g., `p-limit(1)`) so only one deployment runs at a time; API returns 409 if busy.
3. **Process runner**: spawn `setup_and_deploy.sh` with the generated env file using `child_process.spawn`. Pipe stdout/stderr line-by-line thru Server-Sent Events or WebSocket channel identified by `runId`.
4. **Result capture**: on process exit, parse `blockchain_contracts/artifacts/sbt_deployment.json` and persist `{runId, status, contracts, logsPath}` in the history folder/table.
5. **Log retention**: stream logs to disk `artifacts/admin-history/<runId>.log` while simultaneously pushing them to connected clients.

## Phase 3 – Frontend Admin Page
1. Create route `/admin/deploy` guarded at the router level (require `REACT_APP_ADMIN_TOKEN` stored locally). A simple prompt for the token is acceptable since the app is internal.
2. Build a multi-section form:
   - Basic info: ballot ID/title/description/expected voters.
   - Schedule: start/close/announce with datetime pickers and nanosecond preview.
   - Candidates: dynamic list for names + pledges (pipe-separated input with validation helper).
   - Assets: mascot IPFS CID, optional reward metadata.
3. Show live JSON preview of the config and allow exporting it.
4. On submit, POST to `/internal/deploy` and open a log drawer that subscribes to the SSE stream.
5. Provide a "Prefill last successful config" button that fetches the stored JSON.
6. Add status badges for `Running`, `Success`, `Failed`, plus rerun/stop controls (stop sends SIGINT to the runner).

## Phase 4 – Monitoring & UX Polish
1. Add toasts for validation errors vs. runner errors; include quick links to raw logs.
2. Display resulting contract addresses + abi sync check (read `frontend/src/abi` timestamp).
3. Optional: timeline visualization (received → started → script steps) using log markers.
4. Implement download buttons for the env file & logs for auditing.

## Phase 5 – QA & Hardening
1. Unit tests for the validator + template renderer.
2. Integration test that mocks the spawn call and verifies SSE flow.
3. Manual runbook: document how to rotate the admin token and where artifacts are stored.
4. Add `.gitignore` entries for `artifacts/admin-history/` and `blockchain_contracts/tmp/` to avoid committing sensitive data.

## Deliverables
- `docs/admin-page-implementation-plan.md` (this file) describing scope & tasks.
- Updated backend with `/internal/deploy` endpoint, validator, runner, and history storage utilities.
- React admin page with multi-step form, log viewer, and prefill controls.
- Documentation updates covering env separation and operator runbook.
