---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 6 complete — tracking pixel endpoint live. Ready for Phase 7 (backend tests) or Phase 8 (frontend foundation).
last_updated: "2026-04-21T16:00:00Z"
last_activity: 2026-04-21 -- Phase 6 executed (track.ts + app.ts mount + smoke scripts; TRACK-01 closed)
progress:
  total_phases: 10
  completed_phases: 6
  total_plans: 19
  completed_plans: 19
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-21)

**Core value:** Server-side business-rule correctness and clean, testable architecture — proven by tests and narrated through transparent AI collaboration.
**Current focus:** Phase 6 CLOSED — ready for Phase 7 (backend tests) or Phase 8 (frontend foundation)

## Current Position

Phase: 6 (Open Tracking Pixel) — COMPLETE (1/1 plans executed)
Plan: 07-01 (backend tests) — NEXT
Status: Phase 6 verified (5/5 must-haves); TRACK-01 closed
Last activity: 2026-04-21 -- Phase 6 executed (track.ts public pixel route + app.ts mount + smoke scripts)

Progress: [██████░░░░] 60%  (28/51 v1 REQ-IDs done ≈ 55%; 19/19 plans committed [4+4+4+4+4+1])

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: ~4min
- Total execution time: ~1.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1     | 4     | 19.6min | 4.9min |
| 2     | 2     | 16min   | 8min    |
| 3     | 2/4   | 11.1min | 5.6min  |
| 5     | 4     | ~16min  | ~4min   |

**Recent Trend:**

- Phase 5 plans all completed in ~4min each (worktree-isolated, sequential waves)
- Trend: stable; code review catch rate improving (4 fixes applied post-wave)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent structural decisions affecting current work:

- Roadmap: 10-phase fine-granularity plan; strict critical path 1→2→3→4→5, with P6 (tracking pixel) and P7 (backend tests) parallelizable against P5/P8
- Infra: full docker-compose wiring deferred to Phase 10; early phases develop against a local Postgres + Redis
- Tests: backend Vitest+Supertest isolated in Phase 7 to keep the critical path linear but parallelizable with frontend foundation
- Plan 01-02: Used corepack-shim `/usr/local/bin/yarn` (4.14.1) via absolute path because homebrew's `/opt/homebrew/bin/yarn` (1.22.19 classic) shadows by default — README in Phase 10 should document `corepack enable` requirement
- Plan 01-02: Added `typescript ^5.8.3` to `shared/package.json` devDependencies (Rule 2) — without it, `yarn workspace @campaign/shared typecheck` errors with `command not found: tsc` because Yarn 4 workspace-scripts don't see root's hoisted .bin
- Plan 01-02: Added `.planning` + `.docs` to `.prettierignore` (Rule 3) — protects GSD planning state and reviewer's spec per CLAUDE.md guardrail + threat T-02-04
- Plan 01-04: Rephrased backend/src/index.ts file-header comment to avoid literal `app.listen` / `process.exit` strings — grep-based verify guards treat comment-text matches as failures (Plan 03 learned the same lesson with `app.use`); carry-forward documentation pattern: "describe forbidden behaviors in paraphrase, not verbatim"
- Plan 01-04: `yarn why zod` pipes-to-wc-l count mismatch (got 3 vs expected 1) — all three entries resolve to same zod@npm:3.25.76 (single hoisted version); M7 intact; imprecise tripwire is acknowledged, not a real drift
- Plan 01-04: Workspace-scoped `yarn workspace @campaign/backend lint` surfaces stale system-ESLint 8.57.0 shadow on this machine — root `yarn lint` works cleanly and is what the Phase-1 acceptance gate uses, so deferred as DX documentation follow-up for Phase 10 README
- Plan 02-03: pgcrypto migration uses 00000000000000- numeric prefix so it always sorts first lexically — defends C3/Pitfall 1 even if a later migration accidentally gets a pre-2026 timestamp; pgcrypto down() is a no-op (extension may be shared with other tooling; CREATE EXTENSION IF NOT EXISTS is idempotent on re-up)
- Plan 02-03: Every migration creating an ENUM column drops the auto-generated PG type via raw `DROP TYPE IF EXISTS "enum_<table>_<column>"` in down() — Sequelize's dropTable does NOT cascade to ENUM types; round-trip migrate would fail with "type already exists" without this. Verified by 4-command round-trip gate.
- Plan 02-03: tracking_token uses `Sequelize.literal('gen_random_uuid()')` — NOT `DataTypes.UUIDV4` — so the DB-side default fires for ANY INSERT path (seeder bulkInsert, raw psql, future admin tool) including those that bypass Sequelize. Research Assumption A4 verified: `\d campaign_recipients` shows unquoted `DEFAULT gen_random_uuid()` (not `'gen_random_uuid()'::text`).
- Plan 02-03: 2 explicit composite indexes only — `idx_campaigns_created_by_created_at_id` (cursor pagination) and `idx_campaign_recipients_campaign_id_status` (stats aggregation). NO duplicate indexes for inline `unique: true` columns (users.email, recipients.email, campaign_recipients.tracking_token) or composite PK; Postgres auto-creates btree unique indexes for UNIQUE constraints (Pitfall 9).
- Plan 02-03: Comment text containing literal `primaryKey: true` in 20260101000004-create-campaign-recipients.cjs tripped the strict grep count `=2` verify; rephrased the comment to describe behavior in paraphrase. Carry-forward of Plan 01-04's "describe forbidden behaviors in paraphrase, not verbatim" pattern — applies to BOTH grep-forbid and grep-count tripwires.
- Plan 02-03: zsh GVM_ROOT init breaks subshells — sequelize CLI must be invoked via `/bin/bash --noprofile --norc -c "..."` with absolute path to hoisted `node_modules/.bin/sequelize` for direct calls; `yarn workspace @campaign/backend db:*` works fine via the corepack yarn 4 shim at /usr/local/bin/yarn.
- Plan 02-03: backend/.env created from .env.example (gitignored — safe). Homebrew postgres 14 on host shadows the docker-compose postgres on localhost:5432; created `campaign` role + `campaigns` DB in homebrew postgres so DATABASE_URL works for local dev — docker container is preserved for Phase 10's `docker compose up` acceptance gate (clean volume).
- Phase 3 planning: Refresh cookie `Path=/auth` (NOT `/auth/refresh` as in ARCHITECTURE.md §8) — deliberate deviation so `/auth/logout` can read the cookie to denylist its jti and `res.clearCookie` can match the same Path. DECISIONS.md entry drafted in Plan 03-04 Task 4. HttpOnly + SameSite=Strict remain primary defenses. Flagged as researcher Assumption A1.
- Phase 3 planning: Redis added to docker-compose.yml as Wave 1 of Plan 03-01 (research flagged current compose is postgres-only). Separate IORedis client from Phase 5 BullMQ connection — auth Redis uses defaults, BullMQ connection gets `maxRetriesPerRequest: null` in Phase 5 (per C5).
- Phase 3 planning: `buildApp()` factory split in `backend/src/app.ts` + `backend/src/index.ts` calls `buildApp().listen(PORT)` — enables Phase 7 Supertest to import the app without binding a port. Doing this now (Plan 03-04) is cheaper than retrofitting in Phase 7.
- Phase 3 planning: Smoke harness `backend/test/smoke/*.sh` (curl-based per-REQ scripts + run-all.sh) — Phase 3 acceptance gate. Temporary; Phase 7 replaces with Vitest+Supertest (TEST-01..04). Structural grep + live curl chosen over Vitest in Phase 3 because Phase 7 formally owns the test harness.
- Phase 3 planning: AUTH-07 cross-user = 404 (not 403) enforced at service layer via `findOne({ where: { id, createdBy: req.user.id } })` → null → `NotFoundError`. Stub campaigns/recipients routers in Plan 03-04 always return 404. Formal cross-user Supertest test lands in Phase 7 TEST-04. Convention propagates to Phase 4's full CRUD.
- Plan 03-01: ioredis v5 named import `{ Redis as IORedis }` required — default import has no construct signatures under NodeNext moduleResolution; aliased to preserve `new IORedis(...)` call sites unchanged (Rule 1 auto-fix)
- Plan 03-02: LoginSchema uses password min=1 (not min=8) — login must not leak registration password policy; Register enforces the real constraint
- Plan 03-02: TIMING_DUMMY_HASH cost must match config.BCRYPT_COST (=10) — cost mismatch reintroduces timing oracle defeating P3-4 defense
- Plan 03-02: signRefresh decodes its own freshly-signed token to surface exp — avoids storing TTL as a magic constant and ensures jti/exp are always in sync
- Plan 03-02: Comment strings must avoid verbatim grep-assertion patterns — paraphrase descriptions per carry-forward from Plans 01-04/02-03
- Plan 03-03: Path=/auth (not /auth/refresh) cookie path — deliberate ARCHITECTURE.md §8 deviation so /logout can receive+clear cookie to denylist jti; DECISIONS.md note drafted in Plan 04
- Plan 03-03: Forward import { authenticate } unresolved until Plan 04 lands authenticate.ts — no typecheck run in Plan 03 by design (Plan 04 acceptance gate runs full typecheck)
- Plan 03-03: All 3 tasks implemented in single file Write + verified atomically; committed as e7eb378
- Plan 03-04: buildApp() split in Phase 3 (not Phase 7) so Supertest needs no rewrite — structural investment
- Plan 03-04: BIGINT PKs returned as string by Postgres/Sequelize — smoke jq checks accept string|number
- Plan 03-04: ESLint argsIgnorePattern '^_' added for backend files — honors _next convention in errorHandler
- Plan 03-04: Phase 3 acceptance gate (structural grep + live curl) all green; smoke suite passed all 7 AUTH-NN
- Plan 04-01: Migration adds user_id nullable first, backfills to MIN(users.id), then enforces NOT NULL — standard nullable-add-then-backfill-then-constraint pattern for adding FK to populated table
- Plan 04-01: inline unique:true removed from Recipient.email column definition — composite UNIQUE(user_id, email) enforced by DB constraint only; Sequelize inline unique would create a conflicting separate constraint
- Plan 04-01: shared/dist is gitignored — dist rebuild verified locally but not committed; consumers run build at install time
- Plan 04-02: campaignService listCampaigns uses findAndCountAll offset pagination (D-16..D-21) — NOT cursor; campaigns use page-number UI per user override of CLAUDE.md §5
- Plan 04-02: deleteCampaign wraps findOne + Campaign.update guard + Campaign.destroy in single sequelize.transaction() — prevents TOCTOU race between ownership check and destroy (C11)
- Plan 04-02: computeCampaignStats opts.transaction passed via spread `...(opts.transaction ? { transaction: opts.transaction } : {})` — Sequelize exactOptionalPropertyTypes requires Transaction | null, not Transaction | undefined
- Plan 04-02: cursor array access `data[data.length - 1]` extracted to `const lastItem` with null guard — exactOptionalPropertyTypes flags array index returns as T | undefined requiring explicit narrowing
- Plan 04-03: GET /:id/stats reuses getCampaignDetail (ownership + stats in one call) — no duplicate ownership check, T-04-03-03 mitigation
- Plan 04-03: DECISIONS.md appended with Per-User Recipients (composite constraint AUTH-07 alignment) + Campaign List Pagination offset-over-cursor rationale
- Phase 5: BullMQ installed (^5.75.2); bullmq hoisted to root node_modules via Yarn 4 — `yarn install` must use corepack shim, not homebrew classic yarn
- Phase 5: `shared/dist` rebuild required after adding ScheduleCampaignSchema before backend typecheck passes — `yarn workspace @campaign/shared build` must run before `typecheck`
- Phase 5: triggerSend + scheduleCampaign wrap sendQueue.add() in try/catch; Redis enqueue failure rolls campaign back to 'draft' then re-throws — no stranded campaigns (CR-01 fix)
- Phase 5: Worker stale-job guard moved inside transaction as atomic Campaign.update WHERE status='sending' — closes TOCTOU race (C11 variant) and re-verifies ownership in one step (WR-01+WR-02 fix)
- Phase 5: isNaN guard on parsed scheduledAt before delay arithmetic — invalid date string throws INVALID_SCHEDULED_AT instead of silently becoming immediate job (WR-03 fix)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| DX / Docs | Document `corepack enable` + PATH-shadow workaround for developers with homebrew-installed classic yarn 1.x | Open — target Phase 10 README | Plan 01-02 |
| DX / Tooling | Add `eslint` to `backend/package.json` + `frontend/package.json` devDependencies so `yarn workspace <name> lint` works without hitting system-ESLint PATH shadow; root `yarn lint` already works | Open — target Phase 10 quality pass (optional; not blocking any gate) | Plan 01-04 |

## Session Continuity

Last session: 2026-04-21
Stopped at: Phase 5 complete (4/4 plans). BullMQ queue + send worker + route handlers + smoke scripts committed. 4 code review fixes applied. Ready for Phase 6 (tracking pixel) or Phase 7 (backend tests).
Resume file: .planning/phases/06-tracking-pixel/ or .planning/phases/07-backend-tests/
