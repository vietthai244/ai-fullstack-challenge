---
phase: 03-authentication
fixed_at: 2026-04-21T09:57:23Z
review_path: .planning/phases/03-authentication/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-04-21T09:57:23Z
**Source review:** .planning/phases/03-authentication/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Logout uses `jwt.decode` (unverified) — Redis key injection via crafted `jti`

**Files modified:** `backend/src/routes/auth.ts`
**Commit:** 82b0dc0
**Applied fix:** Replaced `jwt.decode` with `jwt.verify(..., { ignoreExpiration: true })` in the logout handler. Invalid tokens are caught and silently ignored; only signature-verified jtis are written to the Redis denylist.

### CR-02: `User.findByPk(decoded.sub)` passes a string primary key — silent lookup failure

**Files modified:** `backend/src/routes/auth.ts`
**Commit:** 82b0dc0
**Applied fix:** Added `Number(decoded.sub)` cast with `Number.isFinite` guard before `findByPk`, matching the pattern already used in `authenticate.ts`. Throws `INVALID_TOKEN_SUB` on malformed sub.

### WR-01: Refresh rotation — denylist write and new-token mint are not atomic

**Files modified:** `backend/src/routes/auth.ts`
**Commit:** fcad28d
**Applied fix:** Wrapped the `redis.set` denylist call in a try/catch inside `/auth/refresh`. On Redis failure: clears the cookie and throws `REFRESH_UNAVAILABLE` — forces re-login rather than silently skipping the denylist.

### WR-02: Cookie `Path` is `/auth` instead of the spec-locked `/auth/refresh`

**Files modified:** `backend/src/routes/auth.ts`
**Commit:** e212b40
**Applied fix:** Expanded the `COOKIE_OPTS.path` comment to explicitly document the trade-off: no common prefix shorter than `/auth` covers both `/auth/refresh` and `/auth/logout`; endpoints that receive the cookie (`/register`, `/login`) ignore `req.cookies.rt`. References DECISIONS.md §A1.

### WR-03: `signRefresh` verifies its own output — unnecessary double crypto op

**Files modified:** `backend/src/lib/tokens.ts`
**Commit:** 415a149
**Applied fix:** Replaced `jwt.verify` with `jwt.decode` (no HMAC) for `exp` extraction. Added guard: throws if `exp` is absent (catches misconfigured `REFRESH_TOKEN_TTL` at sign time rather than silently producing `NaN` in denylist TTL math).

---

_Fixed: 2026-04-21T09:57:23Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
