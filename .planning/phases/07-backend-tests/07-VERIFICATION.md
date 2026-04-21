---
phase: 07-backend-tests
verified: 2026-04-21T15:09:12Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run `yarn workspace @campaign/backend test --run` with Postgres (campaigns_test DB) and Redis reachable"
    expected: "4 test files, 11 tests, all green; exit code 0"
    why_human: "Cannot execute vitest suite in this environment — requires live Postgres + Redis services; test runner exits 0 only when all 11 tests pass against a real DB"
---

# Phase 7: Backend Tests Verification Report

**Phase Goal:** Vitest + Supertest suite exercises the four highest-signal business rules (status guards, send atomicity, stats aggregation, auth boundaries) against a real Postgres + Redis in a serialized test pool, proving backend correctness without depending on the frontend.
**Verified:** 2026-04-21T15:09:12Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `yarn workspace @campaign/backend test` runs with `pool: 'forks', singleFork: true`, `beforeEach` TRUNCATE…RESTART IDENTITY CASCADE | VERIFIED | `vitest.config.ts` has `pool: 'forks'`, `singleFork: true`; `test/setup.ts` has `beforeEach` TRUNCATE with RESTART IDENTITY CASCADE; `test` script in `package.json` is `"vitest run"` |
| 2  | Status-guard test asserts PATCH/DELETE/POST-send on a sent campaign each return 409 with documented error shape | VERIFIED | `status-guard.test.ts` has 3 `it()` blocks; each issues the correct HTTP verb; asserts `res.status === 409` + `res.body.error.code === 'CAMPAIGN_NOT_EDITABLE'` or `'CAMPAIGN_NOT_SENDABLE'` + `typeof res.body.error.message === 'string'` |
| 3  | Concurrent-send test fires two parallel POST /send via Promise.all on a draft campaign; asserts exactly [202, 409] | VERIFIED | `send-atomicity.test.ts` uses `Promise.all([...])`, sorts statuses, asserts `[202, 409]`, and asserts `error.code === 'CAMPAIGN_NOT_SENDABLE'` on the 409 |
| 4  | Stats aggregation test seeds known distribution; asserts correct total/sent/failed/opened/open_rate/send_rate with two-decimal rounding and NULLIF zero-recipient guard | VERIFIED | `stats.test.ts` has 3 tests: known distribution (total=10, open_rate=0.2, send_rate=0.8), empty distribution (null rates), and single opened (rates=1); all use `toMatchObject` on `res.body.data` |
| 5  | Auth middleware test asserts 401 missing token, 401 tampered token, 404 (not 403) cross-user access | VERIFIED | `auth.test.ts` has 4 tests: no header MISSING_TOKEN, malformed INVALID_TOKEN, wrong-secret INVALID_TOKEN, cross-user 404 (status only, no code coupling per AUTH-07) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/vitest.config.ts` | Vitest 2.x singleFork config | VERIFIED | `pool: 'forks'`, `singleFork: true`, `globalSetup`, `setupFiles`, 30s timeouts, `include: ['test/**/*.test.ts']` |
| `backend/test/globalSetup.ts` | DB bootstrap — dotenv load, campaigns_test create, db:migrate | VERIFIED | Exports `setup()` and `teardown()`; loads `.env.test` via dotenv before any src/ import; creates campaigns_test DB (swallows 42P04); runs `db:migrate` via execSync |
| `backend/test/setup.ts` | TRUNCATE beforeEach + sequelize.close() afterAll | VERIFIED | `beforeEach` TRUNCATE…RESTART IDENTITY CASCADE on all 4 tables; `afterAll` sequelize.close() |
| `backend/test/helpers/auth.ts` | `createTestUser()`, `makeToken()` | VERIFIED | Exports both; `User.create` with dummy hash (no bcrypt); `makeToken` calls real `signAccess()` from `src/lib/tokens.js` |
| `backend/test/helpers/seed.ts` | `seedDraftCampaign`, `seedSentCampaign`, `seedCampaignWithRecipients` | VERIFIED | All three exported; direct model operations (no service layer); BIGINT coercion via `Number()` throughout |
| `backend/.env.test` | 10 env vars (DATABASE_URL_TEST, JWT secrets, REDIS_URL, etc.) | VERIFIED | Exactly 10 keys; JWT secrets are distinct and ≥32 chars; BCRYPT_COST=4; PORT=3001 |
| `backend/test/status-guard.test.ts` | TEST-01 coverage | VERIFIED | 3 tests; beforeEach seeds user+sent-campaign; uses supertest against `buildApp()` |
| `backend/test/send-atomicity.test.ts` | TEST-02 coverage | VERIFIED | 1 test; Promise.all concurrent requests; seeds draft campaign in test body after TRUNCATE |
| `backend/test/stats.test.ts` | TEST-03 coverage | VERIFIED | 3 tests; uses `seedCampaignWithRecipients` with known distributions; asserts numeric rates |
| `backend/test/auth.test.ts` | TEST-04 coverage | VERIFIED | 4 tests; no lifecycle hooks — 401 tests need no data; cross-user test creates users inline in it() body |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/test/globalSetup.ts` | `backend/.env.test` | `dotenv.config({ path: resolve(__dirname, '../.env.test') })` | WIRED | Line 16: exact pattern present |
| `backend/test/setup.ts` | `backend/src/db/index.ts` | `import { sequelize } from '../src/db/index.js'` | WIRED | Line 8: import present; sequelize used in beforeEach and afterAll |
| `backend/vitest.config.ts` | `backend/test/globalSetup.ts` | `globalSetup: ['./test/globalSetup.ts']` | WIRED | Line 14 in config |
| `backend/vitest.config.ts` | `backend/test/setup.ts` | `setupFiles: ['./test/setup.ts']` | WIRED | Line 15 in config |
| `backend/test/status-guard.test.ts` | campaignService via HTTP | `CAMPAIGN_NOT_EDITABLE`, `CAMPAIGN_NOT_SENDABLE` error codes asserted | WIRED | Tests fire real HTTP via supertest → Express → campaignService |
| `backend/test/send-atomicity.test.ts` | campaignService.triggerSend | `Promise.all` concurrent POST /send | WIRED | Exercises Postgres row-level lock in triggerSend |
| `backend/test/stats.test.ts` | computeCampaignStats via HTTP | `open_rate`, `send_rate` asserted | WIRED | GET /campaigns/:id/stats → real SQL aggregate |
| `backend/test/auth.test.ts` | authenticate middleware | `MISSING_TOKEN`, `INVALID_TOKEN` asserted | WIRED | GET /campaigns with no/bad header → authenticate → UnauthorizedError |

### Data-Flow Trace (Level 4)

Not applicable — test files are not components rendering dynamic data. They issue HTTP requests and assert response shapes. The data flows being exercised are in the backend services under test, not in test infrastructure itself.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vitest 2.1.9 binary callable | `/Users/thalos/Work/ai-fullstack-challenge/node_modules/.bin/vitest --version` | `vitest/2.1.9 darwin-arm64 node-v22.14.0` | PASS |
| `test` script wired to `vitest run` | `grep '"test"' backend/package.json` | `"test": "vitest run"` | PASS |
| vitest@2.1.9 in devDependencies | `grep vitest backend/package.json` | `"vitest": "2.1.9"` | PASS |
| singleFork config present | `grep singleFork backend/vitest.config.ts` | `singleFork: true` (2 matches — comment + value) | PASS |
| .env.test has 10 keys | `grep -c "=" backend/.env.test` | `10` | PASS |
| All 4 commits exist in git log | `git log --oneline | grep fb9a382\|4fc61fb\|76d1a7d\|a1fc6ab` | All 4 found | PASS |
| Full suite execution | Requires live Postgres + Redis | Not runnable in static analysis | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TEST-01 | 07-01-PLAN, 07-02-PLAN | PATCH/DELETE/send on non-draft → 409 | SATISFIED | `status-guard.test.ts`: 3 tests assert 409 CAMPAIGN_NOT_EDITABLE / CAMPAIGN_NOT_SENDABLE |
| TEST-02 | 07-01-PLAN, 07-02-PLAN | Two parallel POST /send → exactly [202, 409] | SATISFIED | `send-atomicity.test.ts`: Promise.all + sorted status assertion |
| TEST-03 | 07-01-PLAN, 07-02-PLAN | Stats aggregation: seeded data → correct counts + rates | SATISFIED | `stats.test.ts`: 3 tests covering known distribution, zero-recipient NULLIF, single-opened edge case |
| TEST-04 | 07-01-PLAN, 07-02-PLAN | Auth middleware: 401 missing, 401 invalid, 404 cross-user | SATISFIED | `auth.test.ts`: 4 tests covering all three scenarios |

No orphaned requirements — REQUIREMENTS.md maps exactly TEST-01..04 to Phase 7.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODO/FIXME, no placeholder returns, no mocks of sequelize or tokens, no `sync()` calls. The only `return null` in test teardown (`globalSetup.ts` `teardown()` is intentionally empty — preserves DB for debugging) is not a stub; it is documented behavior.

One note: `auth.test.ts` imports `beforeAll` from vitest (line 10) but never calls it. This is harmless dead import — the unused import was probably carried over from an early draft. It does not affect test behavior.

### Human Verification Required

1. **Full test suite execution**

   **Test:** With Postgres accessible at `postgres://campaign:campaign@localhost:5432/campaigns_test` and Redis at `redis://localhost:6379`, run:
   ```
   yarn workspace @campaign/backend test --run
   ```
   **Expected:** Output shows 4 test suites, 11 tests, 0 failures; process exits 0. Specifically:
   - `status-guard.test.ts`: 3 passing (PATCH 409, DELETE 409, send 409)
   - `send-atomicity.test.ts`: 1 passing (concurrent send → [202, 409])
   - `stats.test.ts`: 3 passing (known distribution, zero-recipient, single-opened)
   - `auth.test.ts`: 4 passing (MISSING_TOKEN, INVALID_TOKEN x2, cross-user 404)

   **Why human:** Cannot invoke vitest in static analysis environment. Requires live Postgres (globalSetup creates campaigns_test DB + runs migrations) and Redis (triggerSend calls sendQueue.add() in TEST-02 — if Redis unreachable both concurrent requests return 500, not [202, 409]).

### Gaps Summary

No gaps found. All five ROADMAP success criteria are satisfied by the codebase:

1. Vitest singleFork config + beforeEach TRUNCATE — fully wired in vitest.config.ts and test/setup.ts.
2. TEST-01 status-guard — status-guard.test.ts has all three mutation paths asserting 409 with correct error codes.
3. TEST-02 atomicity — send-atomicity.test.ts uses Promise.all and asserts [202, 409] sorted.
4. TEST-03 stats — stats.test.ts covers known distribution with exact numeric assertions plus NULLIF zero-recipient guard.
5. TEST-04 auth — auth.test.ts covers all three scenarios including AUTH-07 enumeration-defense (404 not 403).

One human verification item blocks `passed` status: the test suite has never been executed in this session against live services. All static evidence is sound; execution confirmation is required.

---

_Verified: 2026-04-21T15:09:12Z_
_Verifier: Claude (gsd-verifier)_
