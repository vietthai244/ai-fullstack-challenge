---
phase: 07-backend-tests
plan: 01
subsystem: testing
tags: [vitest, supertest, postgres, sequelize, jest, integration-testing]

# Dependency graph
requires:
  - phase: 03-auth
    provides: signAccess() token signing, User model, buildApp() factory
  - phase: 04-campaigns-api
    provides: Campaign, Recipient, CampaignRecipient models, db/index.ts exports
  - phase: 02-database
    provides: Sequelize migrations, db schema
provides:
  - vitest@2.1.9 test runner configured with singleFork pool
  - globalSetup.ts: campaigns_test DB bootstrap + db:migrate
  - setup.ts: beforeEach TRUNCATE…RESTART IDENTITY CASCADE + afterAll sequelize.close()
  - helpers/auth.ts: createTestUser() + makeToken() via real signAccess()
  - helpers/seed.ts: seedDraftCampaign, seedSentCampaign, seedCampaignWithRecipients
  - backend/.env.test with all 10 required env vars
affects:
  - 07-02-backend-tests (test files depend on this infrastructure)

# Tech tracking
tech-stack:
  added:
    - vitest@2.1.9 (pinned — C18 guard against 4.x Vite5 break)
    - supertest@7.2.2
    - "@types/supertest@7.2.0"
    - "@types/pg@8.20.0"
  patterns:
    - singleFork pool: all test files share one forked process, one Sequelize pool
    - globalSetup runs once outside workers; setupFiles runs inside each worker
    - dotenv .env.test loaded in globalSetup BEFORE any src/ import (env.ts guard)
    - Direct User.create() with dummy hash — bypasses bcrypt in test helpers

key-files:
  created:
    - backend/vitest.config.ts
    - backend/tsconfig.test.json
    - backend/.env.test
    - backend/test/globalSetup.ts
    - backend/test/setup.ts
    - backend/test/helpers/auth.ts
    - backend/test/helpers/seed.ts
  modified:
    - backend/package.json (test script, devDependencies)
    - yarn.lock

key-decisions:
  - "vitest.config.ts uses pool=forks + singleFork=true (NOT maxWorkers=1 which is v4 syntax)"
  - "tsconfig.test.json overrides rootDir='.' to include test/** alongside src/**"
  - "@types/pg added as devDependency — needed for pg.Client usage in globalSetup.ts"
  - "BCRYPT_COST=4 in .env.test for minimum-allowed cost; speeds up any bcrypt path"
  - "teardown() is no-op — campaigns_test DB preserved for post-failure debug inspection"

patterns-established:
  - "Pattern: globalSetup loads .env.test via dotenv before src/ imports to avoid env.ts process.exit(1)"
  - "Pattern: TRUNCATE…RESTART IDENTITY CASCADE in beforeEach resets sequences per-test"
  - "Pattern: seed helpers bypass service layer — tests exercise service via HTTP (Supertest)"

requirements-completed: [TEST-01, TEST-02, TEST-03, TEST-04]

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 7 Plan 01: Backend Test Infrastructure Summary

**Vitest 2.1.9 singleFork harness with Postgres TRUNCATE isolation, real JWT minting, and seed helpers — zero mocks, ready for Plan 02 test files**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T14:51:51Z
- **Completed:** 2026-04-21T14:54:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Installed vitest@2.1.9 + supertest@7.2.2 + @types/supertest + @types/pg in backend devDependencies
- Wired complete test runner: vitest.config.ts (pool=forks, singleFork, globalSetup, setupFiles, 30s timeouts)
- Created globalSetup.ts that loads .env.test, creates campaigns_test DB idempotently, runs db:migrate
- Created setup.ts with beforeEach TRUNCATE…RESTART IDENTITY CASCADE and afterAll sequelize.close()
- Created helpers/auth.ts (createTestUser via User.create, makeToken via real signAccess)
- Created helpers/seed.ts (seedDraftCampaign, seedSentCampaign, seedCampaignWithRecipients)
- Full typecheck passing: tsc -p tsconfig.test.json --noEmit clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install test deps + create vitest.config.ts + tsconfig.test.json + .env.test** - `fb9a382` (chore)
2. **Task 2: Create globalSetup.ts, setup.ts, helpers/auth.ts, helpers/seed.ts** - `4fc61fb` (feat)

**Plan metadata:** (committed below)

## Files Created/Modified
- `backend/vitest.config.ts` - Vitest 2.x config: forks pool, singleFork, globalSetup, setupFiles
- `backend/tsconfig.test.json` - Extends tsconfig.json, adds test/** to include, rootDir='.'
- `backend/.env.test` - 10 env vars for test process (JWT secrets, DB URL, BCRYPT_COST=4)
- `backend/test/globalSetup.ts` - One-time DB bootstrap: dotenv load, CREATE DATABASE, db:migrate
- `backend/test/setup.ts` - Per-test TRUNCATE isolation + afterAll pool close
- `backend/test/helpers/auth.ts` - createTestUser() + makeToken() using real signAccess()
- `backend/test/helpers/seed.ts` - seedDraftCampaign, seedSentCampaign, seedCampaignWithRecipients
- `backend/package.json` - test script = "vitest run"; added vitest, supertest, @types/* devDeps
- `yarn.lock` - Updated with new dependencies

## Decisions Made
- `tsconfig.test.json` overrides `rootDir: "."` to allow `test/**` alongside `src/**` without TS6059 errors — base tsconfig sets `rootDir: "src"` which conflicts with test file inclusion
- `@types/pg` added as devDependency (Rule 3 auto-fix) — `pg.Client` usage in globalSetup.ts requires it for clean typecheck
- `teardown()` is intentionally a no-op: leaving campaigns_test DB intact aids post-failure debugging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tsconfig.test.json rootDir conflict**
- **Found during:** Task 2 (typecheck after creating test files)
- **Issue:** tsconfig.test.json inherits `rootDir: "src"` from backend/tsconfig.json; adding `test/**/*.ts` to include triggers TS6059 "not under rootDir" for all test files
- **Fix:** Added `"rootDir": "."` override to tsconfig.test.json compilerOptions
- **Files modified:** backend/tsconfig.test.json
- **Verification:** `tsc -p tsconfig.test.json --noEmit` exits clean
- **Committed in:** 4fc61fb (Task 2 commit)

**2. [Rule 3 - Blocking] Installed @types/pg missing for globalSetup.ts**
- **Found during:** Task 2 (typecheck after creating test files)
- **Issue:** `import pg from 'pg'` in globalSetup.ts triggers TS7016 implicit any — `@types/pg` not in devDependencies
- **Fix:** `yarn workspace @campaign/backend add --dev @types/pg`
- **Files modified:** backend/package.json, yarn.lock
- **Verification:** No TS7016 error after install; typecheck clean
- **Committed in:** 4fc61fb (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking dependency)
**Impact on plan:** Both fixes required for correct TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None — no external service configuration required beyond what is documented in .env.test (Postgres + Redis must be running locally for tests to execute).

## Next Phase Readiness
- Test infrastructure complete; Plan 02 can import all helpers and write the four test files
- Redis must be running at localhost:6379 before `yarn workspace @campaign/backend test` (queue module imports at load time)
- PostgreSQL campaigns_test DB will be created automatically by globalSetup.ts on first run

---
*Phase: 07-backend-tests*
*Completed: 2026-04-21*
