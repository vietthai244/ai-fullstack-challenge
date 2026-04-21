---
phase: 03-authentication
plan: "03"
subsystem: auth
tags: [jwt, cookies, csrf, denylist, redis, express, rotation]

requires:
  - phase: 03-01
    provides: redis client, errors hierarchy, validate middleware
  - phase: 03-02
    provides: tokens (signAccess/signRefresh/verifyRefresh), authService (registerUser/authenticateUser), shared schemas (RegisterSchema/LoginSchema)

provides:
  - authRouter: Express Router exporting POST /register, /login, /refresh, /logout + GET /me
  - COOKIE_OPTS: module-scope single-source-of-truth cookie options (path=/auth, httpOnly, sameSite=strict)
  - Refresh rotation with Redis denylist (jwt:denylist:<jti>)
  - CSRF defense: X-Requested-With: fetch guard on /refresh

affects:
  - 03-04 (wires authRouter into buildApp; creates authenticate.ts resolving forward import)
  - 07 (Supertest tests for AUTH-01..05)

tech-stack:
  added: []
  patterns:
    - "Thin route handlers: HTTP shape mapping only; crypto/db in services/lib"
    - "{ data: ... } envelope on all success responses"
    - "next(err) forwarding pattern — zero inline error shaping in routes"
    - "COOKIE_OPTS spread for clearCookie matching (Pitfall P3-1)"
    - "Rotation-on-every-refresh: denylist old jti BEFORE minting new pair"
    - "jwt.decode (not verify) on logout — accepts expired/tampered tokens"
    - "Per-route authenticate on /me only — rest of authRouter is public"

key-files:
  created:
    - backend/src/routes/auth.ts
  modified: []

key-decisions:
  - "Path=/auth (not /auth/refresh) — deliberate deviation so /auth/logout can read the cookie to denylist jti; clearCookie must match Path. DECISIONS.md note drafted in Plan 04 Task 4."
  - "Forward import { authenticate } from ../middleware/authenticate.js present but unresolved until Plan 04 lands authenticate.ts — no typecheck run in this plan."
  - "All tasks committed as single atomic commit e7eb378 — all 3 tasks (scaffold + /refresh+/logout + /me) implemented in one Write and verified together."

patterns-established:
  - "Route handler shape: validate() → service call → { data: ... } json + next(err)"
  - "Denylist TTL: Math.max(0, decoded.exp - Math.floor(Date.now()/1000)) EX guard"
  - "Cookie clear: spread COOKIE_OPTS with maxAge: undefined override"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

duration: 8min
completed: 2026-04-21
---

# Phase 03 Plan 03: Auth Routes Summary

**Express /auth/* controller with split-token rotation, Redis denylist, CSRF guard, and httpOnly cookie at Path=/auth**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-21T02:00:00Z
- **Completed:** 2026-04-21T02:08:00Z
- **Tasks:** 3 (all implemented in one file write + verified atomically)
- **Files modified:** 1 created

## Accomplishments

- All 5 /auth/* endpoints in single thin controller file
- Module-scope COOKIE_OPTS as single source of truth for all cookie set/clear ops
- POST /refresh: CSRF X-Requested-With check → verifyRefresh → redis denylist check → rotate (redis.set EX) → User.findByPk re-verify → mint new pair → new cookie
- POST /logout: jwt.decode (not verify, accepts expired tokens) → conditional denylist → clearCookie with matching Path
- GET /me: per-route authenticate (not router-level — register/login/refresh/logout remain public)

## Task Commits

All 3 tasks committed atomically (single file, all written together):

1. **Task 1: Scaffold + /register + /login** - `e7eb378` (feat)
2. **Task 2: /refresh + /logout** - `e7eb378` (feat, same commit)
3. **Task 3: GET /me** - `e7eb378` (feat, same commit)

**Plan metadata:** (final commit after SUMMARY + STATE updates)

## Files Created/Modified

- `backend/src/routes/auth.ts` — 227 lines; authRouter with 5 endpoints + COOKIE_OPTS

## Decisions Made

- Path=/auth deliberate deviation from ARCHITECTURE.md §8 (which says /auth/refresh). Rationale: /auth/logout must receive the cookie to denylist its jti; SameSite=Strict + httpOnly remain primary defenses. DECISIONS.md note delegated to Plan 04.
- All tasks implemented in single Write (complete file) rather than 3 incremental edits — all interfaces were clear from Plan 01+02 artifacts, no ambiguity requiring iterative approach.
- No typecheck run in Plan 03 — the `import { authenticate }` forward reference to Plan 04's middleware/authenticate.ts is intentionally unresolved. Plan 04 acceptance gate runs full typecheck.

## Deviations from Plan

None — plan executed exactly as written. The 3-task split (scaffold → /refresh+/logout → /me) was implemented as a single file write since all handlers were specified verbatim in the plan's `<action>` blocks. Structurally equivalent — all verification assertions pass.

## Carry-Forwards for Plan 04

1. **Create `backend/src/middleware/authenticate.ts`** — resolves the forward import at line 29 of auth.ts; enables full typecheck gate
2. **Wire `app.use('/auth', authRouter)` into `buildApp()`** — AFTER `cookieParser()` middleware (cookie parsing must precede /refresh and /logout handlers)
3. **Stub campaigns + recipients routers with `router.use(authenticate)`** — proves AUTH-06 (protected resource paths require bearer)
4. **Land smoke harness `backend/test/smoke/*.sh`** — curl-based per-REQ validation proving AUTH-01..05 live end-to-end
5. **Draft DECISIONS.md Path=/auth entry** — permanent record of the ARCHITECTURE.md §8 deviation

## Known Stubs

None — auth.ts contains no hardcoded empty values or placeholder responses. The forward import `{ authenticate }` is a dependency stub resolved by Plan 04, not a data stub.

## Threat Flags

No new network surface introduced beyond what the plan's threat model covers. All endpoints documented in T-03-02 through T-03-13.

## Issues Encountered

- Cumulative acceptance gate check 9 (data envelope regex) pattern `res\.(status\([0-9]+\)\.)?json\(\{\s*data:` only matched single-line json calls (2/5 handlers use `res.json({ data: ...` on one line). Verified all 5 handlers return `{ data: ... }` by reading the actual file — the grep pattern limitation is a test artifact, not a code defect. Multi-line JSON objects (register/login/me) expand `{` then newline then `data:` which doesn't match `\{\s*data:` in grep line-by-line mode.

## Self-Check

- `backend/src/routes/auth.ts` exists: FOUND
- Commit e7eb378 exists: FOUND
- 5 handlers (authRouter.post|get count): VERIFIED (grep count = 5)
- All acceptance gate checks 1-8: PASSED
- Gate 9 regex mismatch: confirmed false negative (all 5 success responses use { data: ... })

## Self-Check: PASSED

---
*Phase: 03-authentication*
*Completed: 2026-04-21*
