---
phase: "03-authentication"
plan: "02"
subsystem: "backend-auth-primitives"
tags: [auth, jwt, bcrypt, zod, shared-schemas, tokens, timing-attack-defense]
dependency_graph:
  requires: [phase-03-plan-01]
  provides: [shared/src/schemas/auth.ts, backend/src/lib/tokens.ts, backend/src/services/authService.ts]
  affects: [03-03, 03-04]
tech_stack:
  added: []
  patterns: [jwt-hs256-explicit-algorithms, separate-jwt-secrets, jwt-type-claim, bcrypt-timing-defense, sequelize-barrel-import]
key_files:
  created:
    - backend/src/lib/tokens.ts
    - backend/src/services/authService.ts
  modified:
    - shared/src/schemas/auth.ts
decisions:
  - "LoginSchema uses password min=1 (not min=8) — login must not leak registration password policy"
  - "TIMING_DUMMY_HASH is a well-formed bcrypt cost=10 hash — dummy compare must match registered-user cost or timing oracle reappears"
  - "signRefresh decodes own token immediately to surface exp claim — avoids storing exp as a magic constant"
  - "SequelizeUniqueConstraintError mapped at service boundary — stable EMAIL_ALREADY_REGISTERED code vs generic handler fallback"
metrics:
  duration: "~8min"
  completed_date: "2026-04-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 3 Plan 02: JWT Primitives + Auth Service Summary

JWT sign/verify helpers with explicit HS256 + separate secrets + type-claim cross-replay defense, plus bcrypt-hashed register and timing-attack-safe login — all pure primitives for the auth HTTP routes in Plan 03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 03-02-01 | Extend shared auth schemas + rebuild dist | 2a7c705 | shared/src/schemas/auth.ts |
| 03-02-02 | Create backend/src/lib/tokens.ts | e2fc46f | backend/src/lib/tokens.ts |
| 03-02-03 | Create backend/src/services/authService.ts | 5ca08b5 | backend/src/services/authService.ts |

## Shared Schemas (all 5 present in shared/src/schemas/auth.ts)

| Schema | Purpose | Notes |
|--------|---------|-------|
| RegisterSchema (existing) | POST /auth/register body | password min=8 enforces registration policy |
| LoginSchema (new) | POST /auth/login body | password min=1 — intentional, avoids policy leak |
| AuthUserSchema (new) | /auth/me + login response user shape | id as number (BIGINT safe below 2^53) |
| LoginResponseSchema (new) | POST /auth/login response | { accessToken, user: AuthUserSchema } |
| RefreshResponseSchema (new) | POST /auth/refresh response | { accessToken } only |

shared/dist/ rebuilt locally (gitignored); backend runtime resolves all 5 schemas via @campaign/shared.

## Invariant Grep Counts

| Pattern | Count | File | Purpose |
|---------|-------|------|---------|
| `algorithm: 'HS256'` (singular) | 2 | tokens.ts | One per sign function (signAccess + signRefresh) |
| `algorithms: ['HS256']` (plural) | 3 | tokens.ts | verifyAccess + verifyRefresh + internal verify inside signRefresh |
| `UnauthorizedError('INVALID_CREDENTIALS')` | 2 | authService.ts | null-user path + wrong-password path |

## Carry-forwards

Plan 03 (auth routes) directly consumes:
- `signAccess`, `signRefresh` from `lib/tokens.ts` — issue tokens on login + refresh rotation
- `verifyRefresh` from `lib/tokens.ts` — validate inbound refresh cookie
- `registerUser`, `authenticateUser` from `services/authService.ts` — POST /auth/register + POST /auth/login handlers

Plan 04 (authenticate middleware + smoke) consumes:
- `verifyAccess` from `lib/tokens.ts` — via `middleware/authenticate.ts` protect all guarded routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment strings matched grep count assertions**
- **Found during:** Task 2 (tokens.ts) + Task 3 (authService.ts)
- **Issue:** File-header comments used verbatim strings identical to the acceptance-gate grep patterns (`algorithm: 'HS256'` and `UnauthorizedError('INVALID_CREDENTIALS')`), causing grep counts to be 1 higher than expected (3 vs 2)
- **Fix:** Rephrased comments to describe behavior without using the exact string literals — consistent with the "describe forbidden behaviors in paraphrase, not verbatim" carry-forward from Plan 01-04 / Plan 02-03
- **Files modified:** backend/src/lib/tokens.ts, backend/src/services/authService.ts
- **Commit:** Inline fix before commit (no separate commit needed)

**2. [Rule 3 - Blocking] shared/dist/ is gitignored**
- **Found during:** Task 1 commit staging
- **Issue:** `.gitignore` has `dist/` — `git add shared/dist/` failed with "path ignored"
- **Fix:** Committed only `shared/src/schemas/auth.ts`; dist/ is a build artifact — correct behavior. Rebuilt dist/ is present on disk for local dev; Plan 10 docker build will rebuild via `yarn workspace @campaign/shared build`
- **No deviation from plan intent** — plan said "rebuild dist/", not "commit dist/"

## Known Stubs

None — this plan creates pure-function primitives only. No HTTP routes, no data flows.

## Threat Flags

None — all mitigations from threat register applied:
- T-03-03: `algorithms: ['HS256']` explicit on all verify calls (CVE-2015-9235 defense)
- T-03-04: TIMING_DUMMY_HASH bcrypt.compare on null-user path (email enumeration defense)
- T-03-05: Both null-user and wrong-password paths throw identical INVALID_CREDENTIALS
- T-03-06: type claim checked in both verifyAccess + verifyRefresh (cross-replay defense)
- T-03-07: Separate secrets (JWT_ACCESS_SECRET vs JWT_REFRESH_SECRET) enforced at boot by env.ts

## Self-Check: PASSED

- [x] shared/src/schemas/auth.ts contains all 5 schemas
- [x] shared/dist/schemas/auth.js contains LoginSchema
- [x] shared/dist/schemas/auth.d.ts contains all 4 new types
- [x] backend/src/lib/tokens.ts exists with all 4 exported functions
- [x] backend/src/services/authService.ts exists with 2 exported functions
- [x] Commits 2a7c705, e2fc46f, 5ca08b5 exist in git log
- [x] All 18 acceptance gate assertions pass
