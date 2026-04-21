---
phase: 07-backend-tests
plan: 02
subsystem: testing
tags: [vitest, supertest, postgres, integration-testing, state-machine, atomicity, stats, auth]

# Dependency graph
requires:
  - phase: 07-01
    provides: vitest config, globalSetup, setup.ts TRUNCATE isolation, helpers/auth.ts, helpers/seed.ts
  - phase: 04-campaigns-api
    provides: campaignService (updateCampaign, deleteCampaign, triggerSend, computeCampaignStats)
  - phase: 03-auth
    provides: authenticate middleware, signAccess/verifyAccess tokens
provides:
  - TEST-01: PATCH/DELETE/send 409 status-guard coverage (status-guard.test.ts)
  - TEST-02: concurrent send atomic guard coverage (send-atomicity.test.ts)
  - TEST-03: aggregate SQL stats correctness + NULLIF guard (stats.test.ts)
  - TEST-04: authenticate middleware 401/404 boundary coverage (auth.test.ts)
affects:
  - Phase 7 gate: all TEST-XX requirements closed

# Tech tracking
tech-stack:
  added: []
  patterns:
    - beforeEach (not beforeAll) for test data seeding — ensures data is created after global TRUNCATE
    - BIGINT coercion: Number(campaign.id) before URL construction
    - Promise.all concurrent requests to exercise Postgres row-level lock atomicity
    - seedCampaignWithRecipients with empty distribution for zero-recipient NULLIF guard test

key-files:
  created:
    - backend/test/status-guard.test.ts
    - backend/test/send-atomicity.test.ts
    - backend/test/stats.test.ts
    - backend/test/auth.test.ts
  modified: []

key-decisions:
  - "beforeEach (not beforeAll) for data seeding: global setup.ts beforeEach TRUNCATES before each test; beforeAll data gets wiped before the first test body runs — must use beforeEach to recreate after truncate"
  - "auth.test.ts cross-user test asserts status 404 only — no error.code assertion to avoid coupling to internal code name that may change; 404 is the public AUTH-07 contract"
  - "send-atomicity.test.ts seeds draft campaign inside the test body (not beforeEach) so each test run gets an isolated fresh campaign after TRUNCATE"

# Metrics
duration: 3min
completed: 2026-04-21
---

# Phase 7 Plan 02: Backend Integration Tests Summary

**Four Vitest+Supertest integration test suites covering state-machine guards (TEST-01), concurrent send atomicity (TEST-02), aggregate SQL stats (TEST-03), and auth middleware boundaries (TEST-04) — 11/11 tests green**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-21T22:00:00Z
- **Completed:** 2026-04-21T22:02:00Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Created status-guard.test.ts: 3 tests proving PATCH/DELETE/POST-send all return 409 CAMPAIGN_NOT_EDITABLE or CAMPAIGN_NOT_SENDABLE on a 'sent' campaign
- Created send-atomicity.test.ts: 1 test using Promise.all to fire two concurrent POST /send requests; asserts sorted statuses [202, 409] and error code CAMPAIGN_NOT_SENDABLE (C11 guard)
- Created stats.test.ts: 3 tests covering known distribution (10 recipients: 5 sent/2 opened/3 failed/2 pending → open_rate=0.2, send_rate=0.8), zero-recipient NULLIF guard (null rates), and single-opened edge case
- Created auth.test.ts: 4 tests — no Authorization header (401 MISSING_TOKEN), malformed token (401 INVALID_TOKEN), wrong-secret JWT (401 INVALID_TOKEN), cross-user campaign access (404 not 403 per AUTH-07)
- Full suite: `yarn workspace @campaign/backend test --run` exits 0 — 4 files, 11 tests, all green

## Task Commits

1. **Task 1: status-guard.test.ts + send-atomicity.test.ts** — `76d1a7d` (test)
2. **Task 2: stats.test.ts + auth.test.ts** — `a1fc6ab` (test)

## Files Created

- `backend/test/status-guard.test.ts` — TEST-01: PATCH/DELETE/send 409 guards on sent campaign
- `backend/test/send-atomicity.test.ts` — TEST-02: Promise.all concurrent send → exactly [202, 409]
- `backend/test/stats.test.ts` — TEST-03: SQL aggregate stats + NULLIF divide-by-zero + ROUND(2)
- `backend/test/auth.test.ts` — TEST-04: authenticate middleware 401/404 boundaries

## Decisions Made

- `beforeEach` (not `beforeAll`) for data seeding: Vitest's execution order is global `beforeEach` (TRUNCATE) → describe `beforeAll` → first test. Using `beforeAll` means the seeded user/campaign are truncated before the first test runs. Switched to `beforeEach` so seeding happens AFTER each TRUNCATE.
- `auth.test.ts` cross-user case asserts `res.status === 404` only — not `res.body.error.code` — to avoid coupling to the internal `CAMPAIGN_NOT_FOUND` string. The 404 status is the AUTH-07 public contract.
- `send-atomicity.test.ts` seeds the draft campaign inside the test body (after the `beforeEach` user creation) so each run of the test gets a fresh campaign that hasn't been transitioned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Switched from beforeAll to beforeEach for test data seeding**
- **Found during:** Task 1 (first test run — DELETE test returned 404 instead of 409)
- **Issue:** Vitest executes: describe `beforeAll` (seed user+campaign) → global `beforeEach` (TRUNCATE) → test body. By the time the first test runs, the seeded data has been wiped. Campaign not found → 404 instead of 409.
- **Fix:** Changed `beforeAll` to `beforeEach` in status-guard.test.ts, send-atomicity.test.ts, and stats.test.ts so data is seeded AFTER each global TRUNCATE.
- **Files modified:** backend/test/status-guard.test.ts, backend/test/send-atomicity.test.ts, backend/test/stats.test.ts
- **Verification:** All 11 tests pass after fix
- **Committed in:** 76d1a7d and a1fc6ab (updated files in same task commits)

---

**Total deviations:** 1 auto-fixed (execution order bug in test data lifecycle)
**Impact on plan:** No scope change. All tests still exercise the same business rules. Only seeding pattern changed.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All new files are test-only.

## Known Stubs

None — all four test files exercise real HTTP routes against real test DB with real JWT auth.

## Self-Check: PASSED

- FOUND: backend/test/status-guard.test.ts
- FOUND: backend/test/send-atomicity.test.ts
- FOUND: backend/test/stats.test.ts
- FOUND: backend/test/auth.test.ts
- FOUND commit: 76d1a7d (TEST-01 + TEST-02)
- FOUND commit: a1fc6ab (TEST-03 + TEST-04)
- yarn workspace @campaign/backend test --run: 4 files, 11 tests, all green
