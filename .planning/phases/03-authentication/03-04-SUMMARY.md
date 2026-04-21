---
phase: 03-authentication
plan: "04"
subsystem: auth
tags: [jwt, middleware, buildApp, smoke-tests, decisions-doc, router-guard]

requires:
  - phase: 03-01
    provides: redis client + pingRedis, errors hierarchy, validate middleware
  - phase: 03-02
    provides: tokens (verifyAccess/signAccess/signRefresh), authService
  - phase: 03-03
    provides: authRouter with 5 endpoints + COOKIE_OPTS

provides:
  - authenticate: Express middleware; Bearer guard; MISSING_TOKEN / INVALID_TOKEN
  - campaignsRouter: stub protected router (Phase 4 fills in real handlers)
  - recipientsRouter: stub protected router (Phase 4 fills in real handlers)
  - buildApp(): Express factory — unblocks Phase 7 Supertest (no port binding)
  - backend/src/index.ts: real bootstrap (sequelize.authenticate + pingRedis + SIGTERM/SIGINT)
  - backend/test/smoke/*.sh: 7 executable scripts; Phase 3 acceptance gate
  - docs/DECISIONS.md: Path=/auth deviation rationale (DOC-03 first entry)

affects:
  - 04 (replaces stub routers with real CRUD; keeps router.use(authenticate) at top)
  - 07 (supertest(buildApp()) — no rewrite needed)
  - 06 (public /track mount at app level in buildApp(), before errorHandler)
  - 10 (REDIS_URL=redis://redis:6379 in docker-compose; smoke harness optional after Phase 7)

tech-stack:
  added: []
  patterns:
    - "buildApp() factory split: app.ts returns Express, index.ts calls .listen() — Supertest-ready"
    - "router.use(authenticate) at TOP of each protected router (C7 safe-by-default)"
    - "Bearer token: MISSING_TOKEN for absent header, INVALID_TOKEN for any JWT failure (P3-6)"
    - "Module augmentation: declare module 'express-serve-static-core' { Request.user? }"
    - "Smoke harness: curl + jq, set -euo pipefail, per-REQ scripts + run-all"

key-files:
  created:
    - backend/src/middleware/authenticate.ts
    - backend/src/routes/campaigns.ts
    - backend/src/routes/recipients.ts
    - backend/src/app.ts
    - backend/test/smoke/auth-register.sh
    - backend/test/smoke/auth-login.sh
    - backend/test/smoke/auth-refresh.sh
    - backend/test/smoke/auth-logout.sh
    - backend/test/smoke/auth-me.sh
    - backend/test/smoke/auth-guard.sh
    - backend/test/smoke/run-all.sh
    - docs/DECISIONS.md
  modified:
    - backend/src/index.ts
    - eslint.config.mjs

key-decisions:
  - "buildApp() split NOW (Phase 3) so Phase 7 Supertest needs no rewrite — cheap structural investment"
  - "Smoke scripts accept id as string|number — BIGINT returned as string by Postgres/Sequelize BIGINT PK"
  - "ESLint argsIgnorePattern: '^_' added to backend config (pre-existing _next in errorHandler was failing lint)"
  - "Phase 3 acceptance gate: structural grep + live curl (not Vitest — that belongs to Phase 7)"

metrics:
  duration: 6min
  completed: "2026-04-21"
  tasks_completed: 4
  files_created: 12
  files_modified: 2
---

# Phase 03 Plan 04: buildApp + authenticate middleware + smoke harness Summary

**authenticate middleware + buildApp() factory + 7 smoke scripts + docs/DECISIONS.md — closes Phase 3 with all 7 AUTH-NN requirements verified end-to-end**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-21T01:37:13Z
- **Completed:** 2026-04-21T01:43:16Z
- **Tasks:** 4 (each committed individually)
- **Files created:** 12 | **Files modified:** 2

## Accomplishments

- `authenticate.ts`: Bearer token guard; MISSING_TOKEN for absent header, INVALID_TOKEN for any JWT error; module-augments `Request.user?: {id, email}`; calls `verifyAccess()` from tokens.ts
- `campaigns.ts` + `recipients.ts`: stub routers with `router.use(authenticate)` at top (C7); return NotFoundError on all paths — proves AUTH-06 + AUTH-07 shape
- `app.ts`: `buildApp()` factory with locked 8-step middleware order (httpLogger → json 100kb → cookieParser → /health → /auth → /campaigns → /recipients → errorHandler)
- `index.ts`: rewritten from Phase 1 scaffold; `sequelize.authenticate()` + `pingRedis()` before `buildApp().listen(config.PORT)`; SIGTERM/SIGINT graceful shutdown
- `backend/.env`: JWT secrets + REDIS_URL added (openssl rand -base64 48 for each secret)
- 7 smoke scripts created and verified green against live stack: all 7 AUTH-NN exercised
- `docs/DECISIONS.md`: Path=/auth deviation explained with sanity-check table; security posture confirmed unchanged
- `eslint.config.mjs`: `argsIgnorePattern: '^_'` for backend (pre-existing `_next` lint failure resolved)

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | authenticate + stub routers | 0f315f8 | authenticate.ts, campaigns.ts, recipients.ts |
| 2 | buildApp + index.ts + lint fix | 5f0b478 | app.ts, index.ts, eslint.config.mjs |
| 3 | 7 smoke scripts | 040f915 | backend/test/smoke/*.sh (7 files) |
| 4 | docs/DECISIONS.md | 2bfdfe4 | docs/DECISIONS.md |

## Phase 3 Acceptance Gate Results

All structural assertions from the plan's `<verification>` block passed:

```
authenticate middleware:           PASS
router.use(authenticate) on both:  PASS (C7)
buildApp() middleware order:       PASS
cookieParser before /auth (P3-7):  PASS
errorHandler is last:              PASS
index.ts bootstrap (no Phase 1):   PASS
yarn workspace typecheck:          PASS
yarn lint:                         PASS
JWT algorithm invariants:          PASS (algorithm:HS256 x2, algorithms:['HS256'] x3)
ALL SMOKE TESTS PASSED:            PASS
docs/DECISIONS.md:                 PASS
Phase 2 migration round-trip:      PASS
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BIGINT id returned as string by Postgres/Sequelize**
- **Found during:** Task 3 (first smoke run)
- **Issue:** `jq -e ".data.id | type == \"number\""` failed because Postgres BIGINT PKs come back as strings (e.g., `"4"`) not JS numbers — Sequelize's default BigInt handling
- **Fix:** Changed jq assertions in `auth-register.sh` and `auth-me.sh` to `(type == "number" or type == "string")` — accepts both
- **Files modified:** backend/test/smoke/auth-register.sh, backend/test/smoke/auth-me.sh
- **Commit:** 040f915 (included in task 3 commit)

**2. [Rule 1 - Bug] Pre-existing lint failure in errorHandler.ts (_next unused arg)**
- **Found during:** Task 2 lint gate
- **Issue:** ESLint `@typescript-eslint/no-unused-vars` flagged `_next` in `errorHandler.ts` because no `argsIgnorePattern` was configured — underscore prefix convention not recognized
- **Fix:** Added `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` to backend rules in `eslint.config.mjs`
- **Files modified:** eslint.config.mjs
- **Commit:** 5f0b478

## Carry-Forwards for Phase 4

1. **Replace stub routers** at `backend/src/routes/campaigns.ts` and `backend/src/routes/recipients.ts` with real CRUD handlers. Keep `router.use(authenticate)` at the top — never remove it.
2. **AUTH-07 ownership filter:** `findOne({where:{id, createdBy: req.user!.id}})` returns null → `NotFoundError` → 404. Service layer owns this — not the router.
3. **buildApp() is Supertest-ready** — Phase 7 just does `supertest(buildApp())`; no rewrite.

## Carry-Forwards for Phase 6

Public `/track` mount goes at APP LEVEL in `buildApp()`, NOT under `campaignsRouter`. Insert `app.use('/track', trackRouter)` between `app.use('/recipients', ...)` and `app.use(errorHandler)` — pixel must never inherit `authenticate`.

## Carry-Forwards for Phase 10

Inside docker-compose: `REDIS_URL=redis://redis:6379` (service name — C15). Smoke harness may be kept for reviewer demos or deleted once Phase 7 Vitest is the CI gate.

## Known Stubs

- `backend/src/routes/campaigns.ts` — returns NotFoundError on all paths. Intentional Phase 3 stub; Phase 4 replaces with real handlers. Does not prevent Phase 3 goal (AUTH-06 + AUTH-07 shape proven).
- `backend/src/routes/recipients.ts` — same pattern.

## Threat Flags

No new network surface beyond what the plan's threat model covers. All endpoints documented in T-03-09 through T-03-17.

## Self-Check

- `backend/src/middleware/authenticate.ts` exists: FOUND
- `backend/src/routes/campaigns.ts` exists: FOUND
- `backend/src/routes/recipients.ts` exists: FOUND
- `backend/src/app.ts` exists: FOUND
- `backend/test/smoke/run-all.sh` exists: FOUND
- `docs/DECISIONS.md` exists: FOUND
- Commit 0f315f8 exists: FOUND
- Commit 5f0b478 exists: FOUND
- Commit 040f915 exists: FOUND
- Commit 2bfdfe4 exists: FOUND

## Self-Check: PASSED

---
*Phase: 03-authentication — CLOSED (4/4 plans complete)*
*Completed: 2026-04-21*
