---
phase: 03-authentication
reviewed: 2026-04-21T01:47:21Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - backend/src/app.ts
  - backend/src/index.ts
  - backend/src/config/env.ts
  - backend/src/lib/redis.ts
  - backend/src/lib/tokens.ts
  - backend/src/middleware/authenticate.ts
  - backend/src/middleware/errorHandler.ts
  - backend/src/middleware/validate.ts
  - backend/src/routes/auth.ts
  - backend/src/routes/campaigns.ts
  - backend/src/routes/recipients.ts
  - backend/src/services/authService.ts
  - backend/src/util/errors.ts
  - shared/src/schemas/auth.ts
  - docker-compose.yml
  - .env.example
  - backend/.env.example
  - backend/package.json
  - eslint.config.mjs
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-21T01:47:21Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Phase 3 delivers the full auth subsystem: split-token JWT (access in-memory + httpOnly refresh cookie), bcrypt password hashing, Redis jti denylist, Zod input validation, and router-level `authenticate` guard. The architecture is structurally sound and intentional security defenses are in place (timing-safe dummy compare, explicit `algorithms: ['HS256']` on every verify call, type-claim guard against token-type confusion, CSRF `X-Requested-With` check, `SameSite=Strict`, P3-6 error normalization in authenticate).

Two critical issues found: (1) logout is vulnerable to an unverified-decode attack where a crafted payload can inject an arbitrary Redis key; (2) the cookie `Path` deviates from the ARCHITECTURE.md spec (`/auth` instead of `/auth/refresh`) and is not fully documented in the right place. Three warnings around token rotation safety, `User.findByPk` using a string sub without cast, and missing redis `depends_on` in docker-compose. Two info items on a redundant decode in `signRefresh` and missing `dotenv/config` in `backend/.env.example`.

---

## Critical Issues

### CR-01: Logout uses `jwt.decode` (unverified) — Redis key injection via crafted `jti`

**File:** `backend/src/routes/auth.ts:177-192`

**Issue:** `POST /auth/logout` reads the `jti` from `jwt.decode(rt)` without signature verification. Any caller can craft a raw JSON JWT (no valid signature required — `decode` skips the signature entirely) with an arbitrary `jti` such as `../../../some-key` or a very long string, and the code writes that value directly into Redis as `jwt:denylist:<jti>`. This is a key-injection / DoS vector: an attacker can pollute the Redis denylist namespace with arbitrary keys, potentially exhausting memory or shadowing legitimate denylist entries.

The comment says "Decode WITHOUT verify — we want to denylist the claimed jti even if the token is expired or malformed (worst case: we write an entry for a jti that was never issued — harmless)." The "harmless" assumption is incorrect when the jti is attacker-controlled.

**Fix:** Either (a) verify the signature even on logout (preferred — ensures the jti was actually issued by this server) and silently succeed for invalid/expired tokens, or (b) validate the decoded `jti` against a safe format before writing to Redis. Option (a) is cleaner:

```typescript
// auth.ts /auth/logout handler
const rt = req.cookies?.rt as string | undefined;
if (rt) {
  try {
    // verifyRefresh accepts expired tokens if you pass { ignoreExpiration: true }
    const decoded = jwt.verify(rt, config.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      ignoreExpiration: true,       // still validates signature + structure
    }) as { jti?: string; exp?: number };
    if (decoded?.jti && decoded.exp) {
      const secondsRemaining = Math.max(
        0,
        decoded.exp - Math.floor(Date.now() / 1000),
      );
      if (secondsRemaining > 0) {
        await redis.set(`jwt:denylist:${decoded.jti}`, '1', 'EX', secondsRemaining);
      }
    }
  } catch {
    // Invalid token — nothing to denylist; clear cookie and succeed silently.
  }
}
```

Option (b) (minimal change): add a UUID format guard before the Redis write:

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (decoded?.jti && UUID_RE.test(decoded.jti) && decoded.exp) { ... }
```

---

### CR-02: `User.findByPk(decoded.sub)` passes a string primary key — silent lookup failure

**File:** `backend/src/routes/auth.ts:146`

**Issue:** `decoded.sub` is typed as `string` (JWT spec — `sub` is always a string). `User.findByPk(decoded.sub)` passes that string directly to Sequelize's `findByPk`. If the `users.id` column is `BIGINT`, Sequelize with PostgreSQL will coerce `'123'` correctly — but this relies on an implicit database coercion that is not guaranteed across all Sequelize dialects and is not documented. More critically, if `decoded.sub` is ever `undefined` or `''` (malformed token that passes verifyRefresh's type guard), `findByPk(undefined)` returns `null` in Sequelize 6, silently failing with `USER_NOT_FOUND` rather than surfacing a clear error. The symmetric path in `authenticate.ts:47` correctly does `Number(payload.sub)` before use.

**Fix:** Cast to number at the boundary (matching the pattern in `authenticate.ts`):

```typescript
// auth.ts:146
const userId = Number(decoded.sub);
if (!Number.isFinite(userId) || userId <= 0) {
  throw new UnauthorizedError('INVALID_TOKEN_SUB');
}
const user = await User.findByPk(userId);
```

---

## Warnings

### WR-01: Refresh rotation — denylist write and new-token mint are not atomic

**File:** `backend/src/routes/auth.ts:130-155`

**Issue:** The `/auth/refresh` handler: (1) writes old jti to Redis denylist, then (2) mints new tokens and sets cookie. If the process crashes or the response is lost between steps 1 and 2 (e.g., network timeout), the old token is denylisted but the client never receives the new one. The client is logged out with no recovery path except re-login. This is a known trade-off in single-server refresh rotation, but the current code does not attempt any mitigation.

Additionally, the denylist write and the new-token cookie are two separate I/O operations. A Redis write failure after `redis.set(...)` returns but before `res.cookie(...)` executes would emit a new token without denylisting the old one — effectively a silent rotation gap.

**Fix:** Wrap both operations in a try/catch that clears the cookie on Redis failure, forcing re-login rather than a silent security gap:

```typescript
try {
  await redis.set(`jwt:denylist:${decoded.jti}`, '1', 'EX', secondsRemaining);
} catch (redisErr) {
  // Redis unavailable — cannot safely denylist old token.
  // Clear cookie and force re-login rather than silently skip denylist.
  res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
  throw new UnauthorizedError('REFRESH_UNAVAILABLE');
}
```

For the crash-between-steps scenario: consider issuing the new refresh token BEFORE denylisting the old one, so the client always has a usable token. The overlap window is bounded by the denylist write TTL.

---

### WR-02: Cookie `Path` is `/auth` instead of the spec-locked `/auth/refresh`

**File:** `backend/src/routes/auth.ts:49`

**Issue:** `COOKIE_OPTS.path` is `'/auth'` — the comment says "Deliberate deviation from ARCHITECTURE.md §8 — the cookie MUST reach /auth/logout so the server can denylist its jti." The RESEARCH.md §Locked Decisions also says `Path=/auth/refresh`. This is a functional security trade-off: using `/auth` makes the cookie visible to ALL `/auth/*` endpoints (including `POST /auth/register` and `POST /auth/login`), not just `/auth/refresh` and `/auth/logout`.

The result: every auth endpoint (including register, login, and future `/auth/*` additions) receives the refresh cookie in its request, expanding the attack surface. If any future `/auth/*` endpoint mishandles `req.cookies.rt`, the cookie is present and exploitable.

This deviation is acknowledged in the comment but is not documented in DECISIONS.md (which is a Phase 4 deliverable) and goes beyond the minimum scope needed — `/auth` could be replaced with a path that covers both `/auth/refresh` and `/auth/logout` only if a common prefix existed, but since they differ, `/auth` is the only cookie-browser option. The trade-off should be explicitly documented.

**Fix:** Document the decision in DECISIONS.md (Phase 4) with the exact security reasoning. Alternatively, consider sending two separate cookies (one per endpoint scope) — but that's a bigger refactor. As a minimum, add a comment in COOKIE_OPTS explaining WHY `/auth/refresh` is insufficient:

```typescript
const COOKIE_OPTS = {
  // ...
  // Path='/auth' not '/auth/refresh': the cookie must reach both /auth/refresh
  // (rotation) and /auth/logout (denylist). There is no common prefix shorter
  // than '/auth' that covers both. Trade-off: cookie is also sent to
  // /auth/register and /auth/login, which ignore it. Documented in DECISIONS.md §A1.
  path: '/auth',
};
```

---

### WR-03: `signRefresh` verifies its own output — unnecessary double crypto op and misuse of `verifyRefresh`

**File:** `backend/src/lib/tokens.ts:74-77`

**Issue:** `signRefresh` calls `jwt.sign(...)` to produce a token, then immediately calls `jwt.verify(...)` on that same token to extract the `exp` claim. This is wasteful (two HMAC operations on the same data) but the deeper concern is that it inverts the trust model: `jwt.verify` is for validating untrusted input; verifying your own freshly-signed token is a no-op from a security standpoint and could mislead future readers into thinking the verify call serves a security purpose.

More importantly, if `config.REFRESH_TOKEN_TTL` is set to an invalid value (e.g., `'0d'` or a non-JWT-parseable string) that `jwt.sign` silently accepts but produces a token with no `exp`, the verify call will succeed but `exp` will be `undefined` — the function returns `{ token, jti, exp: undefined }`, and callers that do `decoded.exp - now()` will silently get `NaN`, bypassing denylist TTL math.

**Fix:** Extract `exp` via `jwt.decode` (no HMAC) or compute it deterministically from the TTL string:

```typescript
// Option A: use jwt.decode (no verification needed — token was just signed)
import { decode } from 'jsonwebtoken';
const { exp } = decode(token) as { exp: number };
if (!exp) throw new Error('signRefresh: token missing exp claim — check REFRESH_TOKEN_TTL');
return { token, jti, exp };

// Option B: compute exp directly
const ttlSeconds = parseTTL(config.REFRESH_TOKEN_TTL); // e.g. '7d' → 604800
const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
```

---

## Info

### IN-01: `dotenv/config` loaded in `env.ts` but missing from `backend/.env.example` instructions

**File:** `backend/.env.example:1`

**Issue:** `backend/src/config/env.ts` loads `dotenv/config` at line 17, which reads `backend/.env`. The `backend/.env.example` file exists and documents all required variables — but it does not include a `PORT` variable, while the root `.env.example` does. Developers copying `backend/.env.example` to `backend/.env` will get `PORT=undefined`, which `env.ts` safely defaults to `3000`, but the discrepancy between the two `.env.example` files will cause confusion.

**Fix:** Add `PORT=3000` to `backend/.env.example` to mirror the root file.

---

### IN-02: `eslint.config.mjs` ignores `**/*.config.ts` — excludes `backend/src/config/env.ts`

**File:** `eslint.config.mjs:15`

**Issue:** The ignore pattern `**/*.config.ts` will match `backend/src/config/env.ts` (the file is literally named `env.ts`, not `env.config.ts`), so this is not actually a problem as written. However, the intent of the pattern is to exclude `vite.config.ts`, `jest.config.ts`, etc. — typical build-tool config files. The pattern should be more specific to avoid accidentally excluding future files named `something.config.ts` inside `src/`:

```js
// Too broad — excludes any *.config.ts anywhere including src/
'**/*.config.ts',
// Better — only excludes config files at project root level
'*.config.ts',
```

This is low-risk now but could hide lint errors in future `*.config.ts` source files placed inside `src/`.

---

_Reviewed: 2026-04-21T01:47:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
