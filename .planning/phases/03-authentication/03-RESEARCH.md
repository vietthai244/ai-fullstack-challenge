# Phase 3: Authentication — Research

**Researched:** 2026-04-21
**Domain:** Express 4 + JWT split-token (access in memory + refresh in httpOnly cookie) + bcryptjs + ioredis denylist + Zod boundary validation + router-level middleware
**Confidence:** HIGH (stack is locked by STACK.md/ARCHITECTURE.md/PROJECT.md; versions verified via `npm view`; one MEDIUM call-out on cookie `Path` / `clearCookie` trap)

## Summary

Phase 3 builds the full auth subsystem on top of Phase 2's `User` model and DB bootstrap. Everything downstream (Phase 4 CRUD, Phase 5 queue, Phase 6 tracking, Phase 7 tests, Phase 8-9 frontend) depends on the `authenticate` middleware, the `requireOwner`-via-`findOne({where:{id, createdBy}})` ownership convention, the `{ error: { code, message } }` error shape, and the `buildApp()` factory split. All of these are single-owner artifacts created in this phase and then locked — every other phase is "reuse, not redesign."

Phase 2 already shipped `backend/src/models/user.ts` with `id BIGINT + email (unique) + passwordHash + name` and the demo seeder hashes `demo1234` with `bcryptjs` cost=10 into that column. Phase 3 adds: Express + cookie-parser + jsonwebtoken + ioredis + zod runtime deps; a `buildApp()` factory in `app.ts` (`.listen()` stays in `index.ts`); `lib/tokens.ts` (sign+verify access/refresh with separate secrets); `lib/redis.ts` (ioredis connection for denylist — separate from Phase 5's BullMQ connection); `util/errors.ts` (HttpError subclasses); `middleware/authenticate.ts` (router-level bearer verify); `middleware/validate.ts` (Zod body/params/query validator factory); `middleware/errorHandler.ts` (tail handler that maps HttpError + ZodError + stock Sequelize errors to `{error:{code,message}}`); `services/authService.ts` (business logic — register/login/refresh/logout/me); `routes/auth.ts` (thin controllers). All requirements (AUTH-01..07) land inside this file set. Five new Zod schemas go in `shared/src/schemas/auth.ts`.

**Primary recommendation:** Build this phase in four waves — (1) scaffolding: install deps, add env vars, write `lib/redis.ts` + `util/errors.ts` + `middleware/errorHandler.ts` + `middleware/validate.ts` + startup env check + `buildApp()` factory split; (2) token + password primitives: `lib/tokens.ts` + bcryptjs helpers; (3) auth routes + service: register/login/refresh/logout/me; (4) middleware + route mounting: `authenticate` + wire a protected `/campaigns` + `/recipients` stub router (returns 404 shape, not 501) so AUTH-06/07 can be verified end-to-end. `/track/*` is NOT added in Phase 3 (Phase 6 owns it) — but `buildApp()` must already mount routers in a shape where Phase 6's public `/track` router will sit at the app level, not nested inside the protected router.

## User Constraints (from PROJECT.md + CLAUDE.md + context)

> No CONTEXT.md exists for this phase (mode: yolo — discuss-phase skipped). All constraints below are locked decisions from PROJECT.md §Key Decisions, REQUIREMENTS.md (AUTH-01..07), ROADMAP.md §Phase 3, ARCHITECTURE.md §8, STACK.md §JWT, PITFALLS.md C6/C7/m2/m6, and CLAUDE.md guardrails. Per CLAUDE.md: *"Do not re-open Key Decisions in PROJECT.md without explicit user instruction."*

### Locked Decisions

- **Split-token JWT**: short-lived access token in response body (kept in Redux memory on client) + long-lived refresh token in `HttpOnly; SameSite=Strict; Path=/auth/refresh` cookie. Separate `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` env vars (m6). Startup-time env check (m2).
- **Algorithm:** HS256 (symmetric). RS256 is overkill at this scope and adds key-management complexity. Every `jwt.verify(...)` call MUST pass `algorithms: ['HS256']` explicitly (STACK.md §JWT + PITFALLS 10th eval-flag).
- **Refresh rotation on every `/auth/refresh`** — old `jti` denylisted in Redis with TTL = remaining life; new refresh + access minted; new cookie set.
- **Logout denylists current `jti`** in Redis with TTL = remaining life; clears cookie (matching Path).
- **Redis denylist**, key format `jwt:denylist:{jti}`, value `'1'`, TTL = `token.exp - now()` seconds. Auto-expires (no cron).
- **Router-level `authenticate`** (C7): `router.use(authenticate)` at router construction — not per-route — so future routes added under the router are safe-by-default. `/track/*` (Phase 6) mounts on a separate public router at the app level.
- **AUTH-07 convention:** cross-user access returns **404** (not 403). Convention implemented by service-layer queries using `findOne({ where: { id, createdBy: userId } })` — null → `NotFoundError` → 404. No separate `requireOwner` middleware (adds a second query; the service already filters by owner).
- **Error shape:** `{ error: { code: string, message: string } }` — used across the whole API. Established in Phase 3; every later phase reuses.
- **Stack (locked from STACK.md):** express 4, sequelize 6 + pg, jsonwebtoken 9, bcryptjs 3, ioredis 5, zod 3, cookie-parser 1, pino 10 (already in deps from Phase 1).
- **bcryptjs, not native bcrypt** — Phase 2 seeder already used `bcryptjs@^3.0.3` for the demo user. Stay with it (no Alpine/musl compile headaches in Phase 10 docker; same `hash`/`compare` API).
- **`$2a$` / `$2b$` compatibility** — the demo user was hashed with bcryptjs 3.x which produces `$2b$` hashes; `bcryptjs.compare` accepts both `$2a$` and `$2b$` prefixes (verified Plan 02-04 SC-5).
- **`no sync() in prod`** — Phase 3 MUST NOT call `sequelize.sync()` anywhere outside test-only setup. Reuse the `sequelize` instance from `backend/src/db/index.ts` (already set up in Phase 2).
- **Shared Zod schemas**: register/login bodies go in `shared/src/schemas/auth.ts` (`RegisterSchema` already exists from Phase 1 — extend it; add `LoginSchema`, `AuthMeResponseSchema`, `LoginResponseSchema`, `RefreshResponseSchema`).
- **Access token payload shape:** `{ sub: string, email: string, type: 'access' }` (sub = user.id as string — BIGINT → string per JWT spec). NO `jti` on access tokens (short TTL makes revocation moot).
- **Refresh token payload shape:** `{ sub: string, jti: string, type: 'refresh' }` (jti = `crypto.randomUUID()` — Node 20 built-in, no `uuid` package needed).
- **`buildApp()` factory** — extract now (not deferred to Phase 7). Cost is trivial in Phase 3 and prevents a rewrite when Phase 7 wires Supertest.

### Claude's Discretion (recommend, but flag as discretionary)

- **Access token TTL**: **15 minutes** (ARCHITECTURE.md §8; matches OWASP ASVS V3/V7 guidance for in-memory tokens). 5 min is too aggressive for the 2-second polling in Phase 9 (forces refresh every ~2 min); 30+ min weakens the "short-lived" argument. Make it configurable via `ACCESS_TOKEN_TTL` env var (default `15m`).
- **Refresh token TTL**: **7 days** (STACK.md §JWT). 30 days is fine too but 7 is defensible and keeps the replay window short for this take-home. Configurable via `REFRESH_TOKEN_TTL` (default `7d`).
- **bcrypt cost**: **10** — Phase 2 seeder used 10; changing to 12 would force re-hashing the demo user and add ~100ms per login (not a correctness issue, but a latency flag during reviewer exercise). Configurable via `BCRYPT_COST` (default `10`).
- **Issuer / audience claims**: skip. At single-service scope they add noise with no security benefit; evaluators don't flag their absence at this scope.
- **Startup Redis health check**: **strict** — `await redis.ping()` at app start; if it fails, process exits with code 1. Rationale: denylist is a correctness primitive, not a cache; silent degradation would make AUTH-03/04 broken without any log signal. Better to fail the container and restart (docker-compose will retry on healthcheck).
- **Ownership primitive**: **service-layer `findOne({where:{id, createdBy:userId}})`, NOT a `requireOwner(model)` middleware** — the middleware approach needs a second lookup to "peek" at ownership before the handler does the real query. Service-layer filter merges both into one query and makes AUTH-07's "404 not 403" natural (null → NotFound; no "check ownership, then reload" two-step). Phase 4 inherits this pattern.
- **CSRF belt-and-suspenders on `/auth/refresh`**: require `X-Requested-With: fetch` header (ARCHITECTURE.md §8; single-line check). SameSite=Strict covers ~95%; this catches the edge case where a browser extension or a misconfigured CDN strips SameSite. Implementation cost: 3 lines in the refresh controller.
- **`authRouter`**: add a **rate-limit** on `/auth/login` and `/auth/register`? **RECOMMEND NO** in v1 — rate limiting is deferred per REQUIREMENTS.md v2. Document in DECISIONS.md if reviewer asks.

### Deferred Ideas (OUT OF SCOPE for Phase 3)

- Frontend axios interceptor + memoized refresh promise (Phase 8 — AUTH-06's frontend half)
- React `Bootstrap` component that calls `/auth/refresh` + `/auth/me` (Phase 8 — UI-03)
- Route guards + `/login` page (Phase 8/9)
- Rate limiting on `/auth/login` (v2)
- Password reset / email verification (v2)
- OAuth / social login (v2 — explicitly OOS per PROJECT.md)
- Multi-factor auth / TOTP (v2)
- RS256 or key rotation (v2; symmetric HS256 is sufficient at this scope)
- Cookie `Domain` attribute (single-origin deployment via nginx proxy — Path=`/auth/refresh` is all we need; no cross-subdomain concern)
- Audit log table / login history (v2)

## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support (this doc) |
|----|-------------------------------|------------------------------|
| AUTH-01 | `POST /auth/register` — email unique, bcrypt-hashed password | §Module Structure, §bcrypt Choice, §Shared Zod Schemas, §Error Shape (UniqueConstraintError → 409), §Validation Architecture |
| AUTH-02 | `POST /auth/login` — returns `{accessToken, user}`; sets refresh cookie (HttpOnly; SameSite=Strict; Path=/auth/refresh) | §Refresh Token Design, §Access Token Design, §Validation Architecture |
| AUTH-03 | `POST /auth/refresh` — rotates refresh `jti`, denylists old one in Redis | §Refresh Token Design, §Redis Wiring & Denylist, §Validation Architecture |
| AUTH-04 | `POST /auth/logout` — denylists current refresh `jti` with TTL = remaining life; clears cookie | §Refresh Token Design (clearCookie Path trap), §Redis Wiring & Denylist, §Validation Architecture |
| AUTH-05 | `GET /auth/me` — returns authed user (for frontend rehydration) | §`authenticate` Middleware, §Validation Architecture |
| AUTH-06 | `authenticate` middleware guards `/campaigns/*` and `/recipients/*` — 401 on missing/invalid | §`authenticate` Middleware Design, §Validation Architecture |
| AUTH-07 | Cross-user access returns 404 (not 403) | §AUTH-07 Ownership Convention, §Validation Architecture |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Password hashing | Backend (bcryptjs in `services/authService.ts`) | — | Hash must never leave the server; bcryptjs runs in-process |
| Password verification | Backend (`bcrypt.compare` in `services/authService.ts`) | — | Constant-time compare happens server-side before token issuance |
| JWT signing | Backend (`lib/tokens.ts`) | — | Private secrets live only on the server |
| JWT verification | Backend (`middleware/authenticate.ts` + `services/authService.ts` for refresh) | — | Client cannot be trusted to verify its own tokens |
| Refresh-token storage | Browser (`HttpOnly` cookie — JS cannot read) | — | `HttpOnly` defeats XSS; cookie attribute enforced server-side at Set-Cookie time |
| Access-token storage | Browser (Redux in-memory — Phase 8) | — | In-memory means XSS gets only the current session's token; lost on tab close |
| Denylist storage | Redis (`lib/redis.ts`) | — | Auto-TTL cleanup; shared across backend replicas if we ever scale out |
| Authorization (ownership) | Backend service layer (`findOne` with `where: {id, createdBy: userId}`) | Database (FK integrity on `createdBy`) | Single SQL round-trip; null → 404 (AUTH-07) |
| CSRF defense | Browser + Backend (`SameSite=Strict` attribute) | Backend (`X-Requested-With: fetch` header check) | SameSite is the primary; header check is the belt-and-suspenders |
| Error shape | Backend (`middleware/errorHandler.ts`) | — | Tail middleware maps every thrown error to `{error:{code,message}}` — never leaks stack traces |

## Module Structure & File List

### Files to CREATE (12)

```
backend/src/
├── app.ts                              # NEW — buildApp() factory (exports Express app, no .listen)
├── lib/
│   ├── redis.ts                        # NEW — ioredis client for denylist + health ping
│   └── tokens.ts                       # NEW — signAccess / signRefresh / verifyAccess / verifyRefresh
├── util/
│   └── errors.ts                       # NEW — HttpError base + ValidationError / UnauthorizedError / ForbiddenError / NotFoundError / ConflictError
├── middleware/
│   ├── authenticate.ts                 # NEW — Bearer extraction + verifyAccess + req.user = {id, email}
│   ├── validate.ts                     # NEW — validate(schema, 'body'|'params'|'query') factory using Zod
│   └── errorHandler.ts                 # NEW — tail handler: maps HttpError/ZodError/SequelizeUniqueConstraintError → {error:{code,message}}
├── services/
│   └── authService.ts                  # NEW — register / login / refresh / logout / getMe business logic
├── routes/
│   ├── auth.ts                         # NEW — mounts /auth/register, /login, /refresh, /logout, /me (PUBLIC router — no authenticate middleware on register/login/refresh; authenticate on /me)
│   ├── campaigns.ts                    # NEW (stub) — router.use(authenticate); router.get('/:id', () => throw new NotFoundError())  — minimal shape so Phase 4 can fill in; validates AUTH-06 + AUTH-07 end-to-end
│   └── recipients.ts                   # NEW (stub) — same pattern as campaigns; Phase 4 fills in
└── config/
    └── env.ts                          # NEW — load + validate required env vars at startup; export typed config
```

### Files to MODIFY (4)

```
backend/src/index.ts                    # MODIFY — replace Phase 1 scaffold with buildApp().listen(PORT); ping redis; exit(1) on missing secrets
backend/package.json                    # MODIFY — add deps: express, cookie-parser, jsonwebtoken, ioredis, zod (zod from shared so may or may not need direct dep); devDeps: @types/express, @types/cookie-parser, @types/jsonwebtoken
.env.example (repo root)                # MODIFY — add JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, BCRYPT_COST, REDIS_URL, PORT
backend/.env.example                    # MODIFY — same additions (mirror of root)
shared/src/schemas/auth.ts              # MODIFY — add LoginSchema, AuthMeResponseSchema, LoginResponseSchema, RefreshResponseSchema; keep existing RegisterSchema
```

### Files explicitly NOT touched (clarification)

- `backend/src/db/index.ts` — Phase 2's bootstrap is reused verbatim. Import `{ User }` from here.
- `backend/src/util/logger.ts`, `httpLogger.ts` — Phase 1's pino wiring is mounted by `buildApp()` as-is.
- `backend/src/models/*.ts` — all four Phase 2 models are reused untouched.
- `backend/src/migrations/*.cjs` — no schema changes in Phase 3.
- Phase 6's `routes/track.ts` — NOT created in Phase 3; `buildApp()` leaves a clear mount point at the app level for it.

## Standard Stack

### Core (added to `backend/package.json` dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `express` | `^4.22.1` | HTTP framework | [VERIFIED: `npm view express dist-tags` → `latest-4: 4.22.1`, `latest: 5.2.1` on 2026-04-21] STACK.md locks Express 4. Express 5 is out of v1 scope — changes error-propagation semantics (async handlers auto-catch) which would force a different error-handler design. Using `^4.22.1` pins to the current 4.x patch line. |
| `cookie-parser` | `^1.4.7` | Parses `req.cookies.rt` from the refresh cookie | [VERIFIED: `npm view cookie-parser version` → `1.4.7`] Mandatory for refresh flow — without it `req.cookies` is undefined. Must be registered BEFORE `authenticate` middleware (STACK.md §JWT). |
| `jsonwebtoken` | `^9.0.3` | Sign + verify access and refresh tokens | [VERIFIED: `npm view jsonwebtoken version` → `9.0.3`] Version 9 tightened defaults: `verify()` no longer accepts unsigned tokens; HMAC default algorithms are `['HS256','HS384','HS512']`. We still pass `algorithms: ['HS256']` explicitly (defense-in-depth per PITFALLS 3rd eval-flag). [CITED: https://github.com/auth0/node-jsonwebtoken/wiki/Migration-Notes:-v8-to-v9] |
| `ioredis` | `^5.10.1` | Redis client for denylist | [VERIFIED: `npm view ioredis version` → `5.10.1`] STACK.md pins `^5.4.1`; 5.10.1 is the latest 5.x, caret-compatible. Phase 5 (BullMQ) will use its own separate ioredis connection with `maxRetriesPerRequest: null` (C5). Phase 3's denylist connection uses DEFAULT retry settings — the denylist is a correctness primitive, not a long-running subscriber. |
| `zod` | `^3.23.8` via `@campaign/shared` | Request body/param validation | Already declared in `shared/package.json`. Backend does NOT add a direct `zod` dep — it consumes schemas through `@campaign/shared` (M7 — version-drift mitigation). Backend uses `z.SafeParseReturnType` / `ZodError` via re-export from `@campaign/shared` if needed, or the peer via the installed `zod` in `node_modules`. |

### Supporting (added to `backend/package.json` devDependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@types/express` | `^5.0.6` | TypeScript types for Express | [VERIFIED: `npm view @types/express version` → `5.0.6`] `@types/express` v5 types work fine with Express 4 runtime — the major jump is on the Express side; the types are a unified package. |
| `@types/jsonwebtoken` | `^9.0.10` | TypeScript types | [VERIFIED: `npm view @types/jsonwebtoken version` → `9.0.10`] Matches jsonwebtoken 9.x. |
| `@types/cookie-parser` | `^1.4.10` | TypeScript types | [VERIFIED: `npm view @types/cookie-parser version` → `1.4.10`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bcryptjs` | `bcrypt` (native) | `bcrypt` is ~3x faster in CPU-bound cases, but native compile breaks on Alpine/musl inside Docker; breaks cross-platform installs. Phase 2 already committed to `bcryptjs`; no reason to re-litigate. |
| `jsonwebtoken` | `jose` | `jose` is more modern (Web Crypto, no Node-specific deps) but adds complexity. `jsonwebtoken` 9.x is battle-tested and the senior-standard pick for Express + Node backends. |
| `express` | `fastify` / `hono` | Much faster, but STACK.md locks Express for familiarity with reviewers; no perf concern at this scale. |
| `ioredis` | `node-redis` v4+ | `node-redis` v4 has a completely different API; BullMQ officially targets `ioredis` (C5). Sticking with `ioredis` across both Phase 3 and Phase 5 keeps the codebase consistent. |

### Installation

```bash
yarn workspace @campaign/backend add express@^4.22.1 cookie-parser@^1.4.7 jsonwebtoken@^9.0.3 ioredis@^5.10.1
yarn workspace @campaign/backend add --dev @types/express@^5.0.6 @types/jsonwebtoken@^9.0.10 @types/cookie-parser@^1.4.10
```

**Version verification (VERIFIED 2026-04-21):** all versions above confirmed current via `npm view <pkg> version`.

## Access Token Design

**Shape:**

```ts
// lib/tokens.ts
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface AccessPayload {
  sub: string;      // user.id as string (BIGINT → string — JWT RFC 7519 §4.1.2)
  email: string;    // convenience — avoids a DB hit in authenticate middleware
  type: 'access';
}

export function signAccess(user: { id: number | string; email: string }): string {
  const payload: AccessPayload = { sub: String(user.id), email: user.email, type: 'access' };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.ACCESS_TOKEN_TTL,   // e.g., '15m'
  });
}

export function verifyAccess(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],              // EXPLICIT — PITFALLS 3rd eval-flag
  }) as AccessPayload & { iat: number; exp: number };
  if (decoded.type !== 'access') throw new UnauthorizedError('INVALID_TOKEN_TYPE');
  return decoded;
}
```

**Key properties:**
- **Algorithm:** HS256 (symmetric). Explicit in both `sign` and `verify` calls (STACK.md §JWT).
- **TTL:** `config.ACCESS_TOKEN_TTL` — default `'15m'`. Configurable via env.
- **No `jti`** — short TTL makes server-side revocation moot (denylist is only for refresh).
- **No `iss` / `aud`** — single-service scope; claims add noise without value.
- **`sub` is a string** — BIGINT in Postgres; JWT spec says `sub` is a StringOrURI. Stringify at sign, parse back to the service layer as a string (queries can compare `createdBy === Number(req.user.id)` once, at the authenticate boundary).
- **`email` embedded** — lets `GET /auth/me` respond without a DB hit; denormalized but refreshes on every login (15-min max staleness). If the user ever renames their email (not in v1 scope), re-login refreshes it.

**Verification in `authenticate` middleware:**

```ts
// middleware/authenticate.ts
import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/tokens.js';
import { UnauthorizedError } from '../util/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: number; email: string };
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('MISSING_TOKEN'));
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccess(token);
    req.user = { id: Number(payload.sub), email: payload.email };
    return next();
  } catch {
    return next(new UnauthorizedError('INVALID_TOKEN'));
  }
}
```

**Why both malformed + invalid → same `INVALID_TOKEN`:** leaking "your token expired vs your token was tampered with" gives an attacker free information. Both map to 401 + `INVALID_TOKEN`.

## Refresh Token Design (cookie flags + the Path trap)

**Shape:**

```ts
// lib/tokens.ts (continued)
import { randomUUID } from 'node:crypto';

export interface RefreshPayload {
  sub: string;
  jti: string;     // UUID v4 — denylist key
  type: 'refresh';
}

export function signRefresh(user: { id: number | string }): { token: string; jti: string; exp: number } {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: String(user.id), jti, type: 'refresh' } satisfies RefreshPayload,
    config.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: config.REFRESH_TOKEN_TTL },   // e.g., '7d'
  );
  // Decode to grab exp (we just signed it, so verify is safe)
  const { exp } = jwt.verify(token, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as RefreshPayload & { exp: number };
  return { token, jti, exp };
}

export function verifyRefresh(token: string): RefreshPayload & { iat: number; exp: number } {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as RefreshPayload & { iat: number; exp: number };
  if (decoded.type !== 'refresh') throw new UnauthorizedError('INVALID_TOKEN_TYPE');
  return decoded;
}
```

**Cookie Set-Cookie (on login + refresh):**

```ts
// routes/auth.ts
const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/auth/refresh',                     // cookie ONLY sent to this endpoint
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

res.cookie('rt', refreshToken, COOKIE_OPTS);
```

**THE CRITICAL TRAP — clearCookie Path matching:** [CITED: https://github.com/expressjs/express/issues/3941 — "res.clearCookie() doesn't work unless path/options match"]

Because the refresh cookie is set with `Path=/auth/refresh`, a call to `res.clearCookie('rt')` on `POST /auth/logout` **WILL NOT CLEAR THE COOKIE** — the browser only clears cookies when the Set-Cookie path matches. This is the #1 bug in split-token JWT implementations.

**Two options:**

**Option A (recommended): path-scope `/auth/logout` to the cookie's path** — mount a sub-router at `/auth/refresh` that handles both `/` (refresh) and sibling logout endpoints... but that conflicts with the REQUIREMENTS.md path `POST /auth/logout`. Don't do this.

**Option B (recommended — actually adopted): include matching `path` on `clearCookie`:**

```ts
// POST /auth/logout
res.clearCookie('rt', {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/auth/refresh',                     // MUST match Set-Cookie path
});
```

**But wait — will `POST /auth/logout` even receive the cookie?** Since the cookie is `Path=/auth/refresh`, the browser will NOT send it on `POST /auth/logout`. This means the logout handler **cannot read the refresh token from the cookie** — it has no token to decode, no `jti` to denylist.

**The resolution (locked):**
1. **Client must supply the refresh token as a body field on `/auth/logout`** — or
2. **The refresh cookie is set with `Path=/auth` (not `/auth/refresh`)** so it's sent on both `/auth/refresh` and `/auth/logout`.

**Recommendation: Path=`/auth`** — broader path is fine because (a) every path under `/auth` is a trusted endpoint we control, (b) SameSite=Strict + HttpOnly remain the hard defenses, (c) it's what most production refresh-cookie implementations use [CITED: Auth0 docs, dev.to "Part 3/3 Refresh Tokens Http-Only Cookie"]. The stated ARCHITECTURE.md pattern of `Path=/auth/refresh` is cleaner in theory but breaks the logout flow — **this is a real conflict between ARCHITECTURE.md and REQUIREMENTS.md** that the planner should resolve.

**Assumption [ASSUMED → needs user confirmation]:** Use `Path=/auth` on the refresh cookie so `/auth/logout` can read it and denylist the `jti`. Document this deviation from ARCHITECTURE.md §8 in DECISIONS.md. If user wants `Path=/auth/refresh` strictly, the logout handler must accept the refresh token in the request body (from the frontend reading it... but it can't — the cookie is HttpOnly). Conclusion: `Path=/auth` is the only design that actually works with `/auth/logout`.

**Sanity check table:**

| Cookie Path | Sent on /auth/refresh? | Sent on /auth/logout? | clearCookie works? | Notes |
|-------------|------------------------|-----------------------|--------------------|-------|
| `/auth/refresh` (strict) | YES | **NO** — logout can't denylist | — | Breaks AUTH-04 |
| `/auth` (recommended) | YES | YES | YES (with matching path) | AUTH-04 works; slightly broader surface but still single-origin |
| `/` (lax — NOT recommended) | YES | YES | YES (with matching path) | Sent on every request — unnecessary exposure |

**Refresh flow (`POST /auth/refresh`):**

```ts
// routes/auth.ts — POST /auth/refresh
router.post('/auth/refresh', async (req, res, next) => {
  try {
    // 1. CSRF belt-and-suspenders (ARCHITECTURE.md §8)
    if (req.headers['x-requested-with'] !== 'fetch') {
      throw new UnauthorizedError('CSRF_CHECK_FAILED');
    }
    const rt = req.cookies?.rt;
    if (!rt) throw new UnauthorizedError('MISSING_REFRESH_TOKEN');

    // 2. Verify signature + expiry
    const decoded = verifyRefresh(rt);    // throws → 401

    // 3. Check denylist
    const denied = await redis.exists(`jwt:denylist:${decoded.jti}`);
    if (denied) {
      // REPLAY SIGNAL — clear cookie and 401 (ARCHITECTURE.md §8)
      res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
      throw new UnauthorizedError('TOKEN_REVOKED');
    }

    // 4. Rotate: denylist old jti + mint new pair
    const secondsRemaining = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
    await redis.set(`jwt:denylist:${decoded.jti}`, '1', 'EX', secondsRemaining);

    const user = await User.findByPk(decoded.sub);
    if (!user) throw new UnauthorizedError('USER_NOT_FOUND');

    const access = signAccess(user);
    const { token: newRt } = signRefresh(user);

    res.cookie('rt', newRt, COOKIE_OPTS);
    res.json({ data: { accessToken: access } });
  } catch (err) { next(err); }
});
```

**Logout flow (`POST /auth/logout`):**

```ts
router.post('/auth/logout', async (req, res, next) => {
  try {
    const rt = req.cookies?.rt;
    if (rt) {
      // Even expired tokens go to denylist (no strict verify needed — decode is enough)
      const decoded = jwt.decode(rt) as RefreshPayload & { exp?: number } | null;
      if (decoded?.jti && decoded.exp) {
        const secondsRemaining = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
        if (secondsRemaining > 0) {
          await redis.set(`jwt:denylist:${decoded.jti}`, '1', 'EX', secondsRemaining);
        }
      }
    }
    res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
```

**Note on `jwt.decode` vs `jwt.verify` in logout:** decode-only is intentional — even a tampered or expired refresh token should still result in a "clear cookie + 204" response (we don't leak token validity on logout). We denylist based on the claimed `jti` regardless; worst case the attacker denylists a random UUID that was never issued — no harm.

## bcrypt Choice & Cost

**Decision: `bcryptjs@^3.0.3`, cost `10`.** Phase 2's seeder already set this — no re-litigation.

**Rationale:**
- **Native `bcrypt` rejected** for Docker/Alpine/musl compile pain (Phase 10 builds in `node:20-alpine`). `bcryptjs` is pure JS → no native bindings → works identically on every platform. [CITED: bcryptjs 3.0.0 release notes]
- **Cost = 10** matches Phase 2 seeder; `bcryptjs.compare` handles both `$2a$` and `$2b$` hash prefixes (verified in Plan 02-04 SC-5). Login adds ~65ms of hash work per request — acceptable.
- **API used:**
  - `bcryptjs.hash(password, 10)` on register (async)
  - `bcryptjs.compare(password, user.passwordHash)` on login (async, constant-time)

**Code skeleton (in `services/authService.ts`):**

```ts
import bcrypt from 'bcryptjs';
import { User } from '../db/index.js';
import { ConflictError, UnauthorizedError } from '../util/errors.js';

export async function registerUser(input: { email: string; password: string; name: string }) {
  try {
    const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_COST);
    const user = await User.create({ email: input.email, passwordHash, name: input.name });
    return user;
  } catch (err: any) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED');
    }
    throw err;
  }
}

export async function authenticateUser(email: string, password: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Use bcrypt.compare with a dummy hash to prevent timing attack
    await bcrypt.compare(password, '$2b$10$00000000000000000000000000000000000000000000000000000');
    throw new UnauthorizedError('INVALID_CREDENTIALS');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('INVALID_CREDENTIALS');
  return user;
}
```

**Timing-attack defense:** run `bcrypt.compare` against a dummy hash when the user doesn't exist — prevents "user exists but wrong password" vs "user doesn't exist" from being distinguishable by response time. Both return `INVALID_CREDENTIALS`.

## Redis Wiring & Denylist Schema

### Connection (`lib/redis.ts`)

```ts
// lib/redis.ts
import IORedis from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';

export const redis = new IORedis(config.REDIS_URL, {
  lazyConnect: false,
  // NOTE: NO maxRetriesPerRequest: null here — that's BullMQ's requirement (C5).
  // The denylist is a correctness primitive for auth; we WANT retries to surface errors.
});

redis.on('error', (err) => logger.error({ err }, 'redis client error'));
redis.on('connect', () => logger.debug('redis connected'));

export async function pingRedis(): Promise<void> {
  const result = await redis.ping();
  if (result !== 'PONG') throw new Error(`Unexpected redis ping response: ${result}`);
}
```

**Phase 5 coexistence:** Phase 5 (BullMQ) will create its OWN separate `new IORedis(REDIS_URL, { maxRetriesPerRequest: null, ... })` instance in `backend/src/queues/connection.ts`. The two instances do NOT share a connection object (C5 — "Use separate IORedis connection instances for Queue and Worker — never share the same object"). Phase 3's auth client stays out of BullMQ's way.

### Denylist Schema

| Key | Value | TTL | Semantics |
|-----|-------|-----|-----------|
| `jwt:denylist:<jti>` | `'1'` (string literal — value is not read) | `exp - now()` seconds | Presence = denied. Auto-cleans via Redis EXPIRE. |

**Operations:**

| Use case | Redis command |
|----------|---------------|
| Check on `/auth/refresh` | `await redis.exists('jwt:denylist:' + jti)` → 0 (ok) or 1 (deny) |
| Add on rotation | `await redis.set('jwt:denylist:' + oldJti, '1', 'EX', secondsRemaining)` |
| Add on logout | Same as rotation |

**Why `SET ... EX` not `SETEX`:** `SETEX` is legacy; `SET key value EX seconds` is the idiomatic modern form and supports `NX`/`XX` flags if we ever need them.

**Edge case — `secondsRemaining <= 0`:** skip the `SET` entirely. A 0-TTL set would either error (ioredis) or be a no-op (valid Redis). Guard explicitly:

```ts
if (secondsRemaining > 0) {
  await redis.set(`jwt:denylist:${jti}`, '1', 'EX', secondsRemaining);
}
```

### Startup health check (in `index.ts`)

```ts
// backend/src/index.ts
import { buildApp } from './app.js';
import { sequelize } from './db/index.js';
import { pingRedis } from './lib/redis.js';
import { config } from './config/env.js';
import { logger } from './util/logger.js';

async function main() {
  // Startup-time env check already ran inside config/env.ts (fail-fast at import)
  await sequelize.authenticate();
  await pingRedis();
  const app = buildApp();
  app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));
}

main().catch((err) => {
  logger.fatal({ err }, 'api startup failed');
  process.exit(1);
});
```

Strict failure mode: if DB or Redis is down, the API refuses to start. Phase 10's docker-compose healthchecks will retry; the container stays in an unhealthy state until deps come up.

## `authenticate` Middleware Design

**Design principle:** apply at router level (C7), never per-route.

**Router construction:**

```ts
// routes/campaigns.ts — STUB for Phase 3; Phase 4 fills in
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { NotFoundError } from '../util/errors.js';

export const campaignsRouter: Router = Router();
campaignsRouter.use(authenticate);                        // ← EVERY route below is protected

// Phase 4 will add real routes. Phase 3 adds one stub that proves AUTH-06 + AUTH-07:
campaignsRouter.get('/:id', async (_req, _res, next) => {
  next(new NotFoundError('CAMPAIGN_NOT_FOUND'));          // always 404 for now
});
```

**App-level mounting (in `app.ts` / `buildApp()`):**

```ts
// app.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import { httpLogger } from './util/httpLogger.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { recipientsRouter } from './routes/recipients.js';
// NOTE: trackRouter (Phase 6) goes here — intentionally absent in Phase 3

import { errorHandler } from './middleware/errorHandler.js';

export function buildApp(): express.Express {
  const app = express();
  app.use(httpLogger);                    // Phase 1 pino-http
  app.use(express.json({ limit: '100kb' })); // body parser BEFORE cookieParser per Express convention
  app.use(cookieParser());                // BEFORE any route that reads req.cookies

  // Public routes (no authenticate) — auth endpoints themselves + future /track/*
  app.use('/auth', authRouter);           // register/login/refresh/logout are public; /me has per-route authenticate
  // app.use('/track', trackRouter);      // Phase 6

  // Protected routes — authenticate at router level (C7)
  app.use('/campaigns', campaignsRouter);
  app.use('/recipients', recipientsRouter);

  app.use(errorHandler);                  // TAIL — must be last (Express convention)
  return app;
}
```

**Middleware order invariant (lock in plan-check verification):**
1. `httpLogger` — tags every request with req-id
2. `express.json()` — parses body
3. `cookieParser()` — parses cookies
4. `app.use('/auth', authRouter)` — PUBLIC (authRouter itself applies `authenticate` only to `/me`)
5. `app.use('/campaigns', campaignsRouter)` + `/recipients` — PROTECTED (router-level `authenticate`)
6. `errorHandler` — tail

**`GET /auth/me`:** apply `authenticate` as a per-route middleware (not router-wide), since the rest of the auth router is public:

```ts
// routes/auth.ts
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) throw new UnauthorizedError('USER_NOT_FOUND');
    res.json({ data: { id: user.id, email: user.email, name: user.name } });
  } catch (err) { next(err); }
});
```

## AUTH-07 Ownership Convention

**Decision: service-layer filter, NOT a `requireOwner(model)` middleware.**

**The pattern (reused by every Phase 4+ read/write endpoint):**

```ts
// services/campaignService.ts (Phase 4 will own this file — Phase 3 stub shows the pattern)
export async function getCampaignForUser(id: number, userId: number) {
  const campaign = await Campaign.findOne({ where: { id, createdBy: userId } });
  if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');
  return campaign;
}
```

**Why not middleware:**

| Middleware approach | Service-filter approach (chosen) |
|---------------------|----------------------------------|
| `requireOwner(Campaign)` does `findOne({id})` → check `createdBy === userId` → attach `req.campaign` → handler does `Campaign.findByPk(id)` **again** | Single query; null → 404 |
| Two DB round-trips per request | One DB round-trip |
| Middleware needs to know the model + param name + FK name | Service owns the knowledge |
| Returns 403 if "found but not owned"; we want 404 (AUTH-07) — requires extra logic | null → NotFound is natural |
| Tempting to forget the ownership check on new routes | Every service function must be written with the `createdBy` filter — harder to forget |

**Acceptance assertion for AUTH-07:** `GET /campaigns/:id` for user A on user B's campaign returns **404** with `{error:{code:'CAMPAIGN_NOT_FOUND', message:...}}` — indistinguishable from a non-existent ID. Verified in Phase 7 TEST-04.

**Phase 3 stub that proves AUTH-07 works:** the `campaigns.ts` stub above always throws `NotFoundError`. For Phase 3's acceptance gate, a smoke test can assert: `GET /campaigns/999` with a valid access token → 404 (proves `authenticate` passes, router-level guard works, error handler shape is right). The "cross-user returns 404" assertion is formally validated in Phase 7 TEST-04 with a real `campaigns` table.

## Error Shape & Handler

### `util/errors.ts`

```ts
// util/errors.ts
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(code = 'BAD_REQUEST', message?: string) { super(400, code, message); }
}
export class UnauthorizedError extends HttpError {
  constructor(code = 'UNAUTHORIZED', message?: string) { super(401, code, message); }
}
export class ForbiddenError extends HttpError {
  constructor(code = 'FORBIDDEN', message?: string) { super(403, code, message); }
}
export class NotFoundError extends HttpError {
  constructor(code = 'NOT_FOUND', message?: string) { super(404, code, message); }
}
export class ConflictError extends HttpError {
  constructor(code = 'CONFLICT', message?: string) { super(409, code, message); }
}
export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', public readonly details?: unknown) {
    super(400, 'VALIDATION_ERROR', message);
  }
}
```

### `middleware/errorHandler.ts`

```ts
// middleware/errorHandler.ts
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../util/errors.js';
import { logger } from '../util/logger.js';

// Sequelize errors we explicitly map — everything else → 500
const SEQUELIZE_UNIQUE = 'SequelizeUniqueConstraintError';
const SEQUELIZE_VALIDATION = 'SequelizeValidationError';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // 1. Our HttpError subclasses
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
  }

  // 2. Zod (from validate middleware — usually caught there, but belt-and-suspenders)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request' },
    });
  }

  // 3. Sequelize unique violation (register with duplicate email)
  if (err?.name === SEQUELIZE_UNIQUE) {
    return res.status(409).json({
      error: { code: 'UNIQUE_VIOLATION', message: 'Resource already exists' },
    });
  }

  if (err?.name === SEQUELIZE_VALIDATION) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: err.message },
    });
  }

  // 4. Unknown — log with req-id + 500
  logger.error({ err, reqId: req.id }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
};
```

**Invariant (enforced by plan-check):** `errorHandler` is the LAST `app.use(...)` call in `buildApp()`. Express's error-handler contract requires 4-arg signature and tail position.

**What we never leak:** stack traces, raw Sequelize error messages (could contain column names that hint at schema), JWT verify-failure reasons (malformed vs expired — both → `INVALID_TOKEN`).

## Shared Zod Schemas

### `shared/src/schemas/auth.ts` (after Phase 3 modifications)

```ts
// shared/src/schemas/auth.ts
import { z } from 'zod';

// AUTH-01 — Register body (EXISTING from Phase 1 — do not modify shape)
export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

// AUTH-02 — Login body (NEW in Phase 3)
export const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),    // min=1 for login (don't leak password policy)
});
export type LoginInput = z.infer<typeof LoginSchema>;

// AUTH-05 — /auth/me response (NEW)
export const AuthUserSchema = z.object({
  id: z.number().int().positive(),          // BIGINT serialized as JS number — safe for users table (< 2^53)
  email: z.string().email(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

// AUTH-02 — Login response body (NEW)
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// AUTH-03 — Refresh response body (NEW)
export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
```

**Validation middleware consumes them like:**

```ts
// middleware/validate.ts
import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../util/errors.js';

export function validate<T>(schema: ZodSchema<T>, source: 'body' | 'params' | 'query' = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(new ValidationError('Invalid request', result.error.flatten()));
    (req as any)[source] = result.data;    // replace with parsed (and coerced) values
    next();
  };
}
```

**Route usage:**

```ts
authRouter.post('/register', validate(RegisterSchema), async (req, res, next) => { /* ... */ });
authRouter.post('/login',    validate(LoginSchema),    async (req, res, next) => { /* ... */ });
```

**`shared/dist/` must be rebuilt** — Phase 1 set up `postinstall: yarn workspace @campaign/shared build`. Any plan that edits `shared/src/schemas/auth.ts` MUST also run `yarn workspace @campaign/shared build` (or `yarn install` to trigger `postinstall`) so backend sees the new exports.

## `app.ts` Factory Split (for Phase 7 testability)

**Decision: do the split NOW in Phase 3.** Cost is ~10 lines; retrofit in Phase 7 would require re-touching every route file.

### `backend/src/app.ts` (NEW — `buildApp()` factory)

```ts
// backend/src/app.ts
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { httpLogger } from './util/httpLogger.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { recipientsRouter } from './routes/recipients.js';
import { errorHandler } from './middleware/errorHandler.js';

export function buildApp(): Express {
  const app = express();
  app.use(httpLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ data: { ok: true } }));

  app.use('/auth', authRouter);
  app.use('/campaigns', campaignsRouter);
  app.use('/recipients', recipientsRouter);
  // Phase 6 adds: app.use('/track', trackRouter);  <-- PUBLIC, no authenticate

  app.use(errorHandler);
  return app;
}
```

### `backend/src/index.ts` (MODIFIED — was Phase 1 scaffold, now real bootstrap)

```ts
// backend/src/index.ts
import { buildApp } from './app.js';
import { sequelize } from './db/index.js';
import { pingRedis, redis } from './lib/redis.js';
import { config } from './config/env.js';
import { logger } from './util/logger.js';

async function main() {
  await sequelize.authenticate();
  await pingRedis();

  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
  });

  // Graceful shutdown (SIGTERM on docker stop)
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await Promise.allSettled([sequelize.close(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'api startup failed');
  process.exit(1);
});
```

**Phase 7 will consume it as:**

```ts
// backend/src/test/helpers.ts (Phase 7)
import request from 'supertest';
import { buildApp } from '../app.js';
export const testApp = buildApp();          // no .listen() — Supertest binds ephemeral port internally
```

## Env Vars & Startup Validation

### `config/env.ts` (NEW — fail-fast startup check)

```ts
// backend/src/config/env.ts
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),           // enforce minimum entropy (m2)
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),     // jsonwebtoken expiresIn string
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(10),
  LOG_LEVEL: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Print user-readable error and exit BEFORE any module depends on config
  console.error('Invalid environment:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
```

**`JWT_ACCESS_SECRET === JWT_REFRESH_SECRET` guard (m6):** add a `.refine()`:

```ts
const EnvSchema = z.object({ /* ... */ }).refine(
  (d) => d.JWT_ACCESS_SECRET !== d.JWT_REFRESH_SECRET,
  { message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different (m6)' },
);
```

### `.env.example` additions (root + `backend/.env.example`)

```bash
# --- Phase 3 additions ---

# JWT — MUST be at least 32 chars; MUST be different values. Generate with: openssl rand -base64 48
JWT_ACCESS_SECRET=replace-me-with-at-least-32-random-chars-aaaaaaaaaaa
JWT_REFRESH_SECRET=replace-me-with-a-DIFFERENT-32+-char-value-bbbbbbbb

# Token lifetimes (jsonwebtoken expiresIn syntax — seconds or '1d' / '15m' etc.)
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# bcryptjs cost factor (10 matches Phase 2 demo seed)
BCRYPT_COST=10

# Redis — Phase 3 denylist; Phase 5 BullMQ
REDIS_URL=redis://localhost:6379

# HTTP
PORT=3000
```

**Phase 10 note:** when docker-compose wires the API container, `REDIS_URL=redis://redis:6379` (service name — C15).

## Pitfall Mapping

### Explicitly guarded in Phase 3

| Pitfall | Source | How Phase 3 guards it |
|---------|--------|-----------------------|
| **C6 — refresh-token race, missing `withCredentials`, no rotation, no denylist** | PITFALLS.md | Backend handles half: **rotate on every refresh** (`/auth/refresh` denylists old jti, mints new pair); **denylist on logout**. Frontend half (`withCredentials: true`, memoized promise) is Phase 8 (AUTH-06 client). Phase 3 sets the contract the interceptor will consume. |
| **C7 — auth middleware missing from routes** | PITFALLS.md | **Router-level `.use(authenticate)`** on `campaignsRouter` and `recipientsRouter`. Never per-route. `/track/*` mounts on a separate public router (Phase 6) at the app level, NOT nested under a protected router. `buildApp()` structure makes this explicit. |
| **m2 — hardcoded JWT secrets** | PITFALLS.md | **Startup env check** (`config/env.ts`): `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` both required, minimum 32 chars, must differ. Process exits with code 1 if missing. |
| **m6 — same secret for access + refresh** | PITFALLS.md | **Separate secrets** (`JWT_ACCESS_SECRET` vs `JWT_REFRESH_SECRET`), `config/env.ts` `.refine` guards them from being equal. |
| **m3 — raw Sequelize errors forwarded to client** | PITFALLS.md | **Central error handler** maps `SequelizeUniqueConstraintError` → 409, `SequelizeValidationError` → 400, everything else → 500 with sanitized message. |
| **AUTH-07 — cross-user 403 would leak existence** | REQUIREMENTS.md | **Service-layer filter** `findOne({where:{id, createdBy:userId}})` returns null → `NotFoundError` → 404. Indistinguishable from a non-existent ID. |
| **JWT verify without `algorithms`** | PITFALLS.md §"What evaluators flag" #3 | **Every `jwt.verify` call** in `lib/tokens.ts` passes `algorithms: ['HS256']` explicitly. |
| **`res.clearCookie` no-op due to Path mismatch** | Web-verified [CITED: expressjs/express#3941] | **`clearCookie` passes matching path** (`/auth`); refresh cookie uses `Path=/auth` (not `/auth/refresh`) so logout can both receive AND clear it — see §Refresh Token Design for full analysis. |

### Deferred pitfalls (belong to other phases but Phase 3 sets the stage)

| Pitfall | Defer to | Reason |
|---------|----------|--------|
| C5 — `maxRetriesPerRequest: null` missing | Phase 5 | That's BullMQ's requirement; Phase 3's auth Redis connection uses default retry (we WANT retries to surface errors). |
| C12 — Redux caching server state | Phase 8 | Frontend concern. |
| C18 — Vitest / Yarn workspaces pins | Phase 7 | Test phase. |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (pinned in root `resolutions`) + Supertest 7.2.2 — planned for Phase 7 |
| Config file | `backend/vitest.config.ts` — **does not exist yet**; created in Phase 7 Wave 0 |
| Quick run command (Phase 7+) | `yarn workspace @campaign/backend test -- --run src/routes/auth.test.ts` |
| Full suite command (Phase 7+) | `yarn workspace @campaign/backend test` |
| **Phase 3 execution-time verification** | curl-based smoke tests against a running `yarn dev` + psql/redis — see §Wave 0 Gaps |

**Why no Vitest tests in Phase 3:** REQUIREMENTS.md + ROADMAP.md defer the Vitest harness to Phase 7 (TEST-01..04). Phase 3 proves AUTH-01..07 via structural verification (code grep + one live smoke test against the running API). Phase 7 will add formal Supertest tests that exercise the full matrix. This means Phase 3's "validation" is:
1. **Structural** — grep-based assertions that the right files exist with the right wiring (e.g., `authenticate` applied at router level; `algorithms: ['HS256']` present on every verify call).
2. **Smoke** — one end-to-end curl sequence through register → login → refresh → logout → me that exercises all 7 REQ-IDs live against a running Postgres + Redis.

### Phase Requirements → Test Map

| REQ ID | Behavior | Test Type | Automated Command (Phase 3) | Phase 7 Backing? |
|--------|----------|-----------|------------------------------|------------------|
| AUTH-01 | POST /auth/register creates user with bcrypt hash; duplicate email → 409 | smoke (curl) + structural (grep `bcrypt.hash` + `SequelizeUniqueConstraintError`) | `bash test/smoke/auth-register.sh` | yes — Phase 7 adds Vitest+Supertest |
| AUTH-01 (validation) | Empty email / short password / missing name → 400 VALIDATION_ERROR | structural (grep `validate(RegisterSchema)`) | grep check | yes |
| AUTH-02 | POST /auth/login returns `{accessToken, user}`; sets refresh cookie with `HttpOnly; SameSite=Strict; Path=/auth`; invalid creds → 401 | smoke (curl -v to see Set-Cookie) + structural (grep `res.cookie('rt',` + `httpOnly: true`) | `bash test/smoke/auth-login.sh` | yes |
| AUTH-03 | POST /auth/refresh returns new access; denylists old jti in Redis; `redis.exists('jwt:denylist:<oldjti>') === 1` | smoke (curl, then `redis-cli EXISTS`) | `bash test/smoke/auth-refresh.sh` | yes |
| AUTH-03 (replay defense) | Reusing a denylisted refresh token → 401 + clears cookie | smoke (second refresh with same cookie) | part of `auth-refresh.sh` | yes |
| AUTH-04 | POST /auth/logout denylists current jti with TTL = remaining life; clears cookie; subsequent /refresh → 401 | smoke + `redis-cli TTL jwt:denylist:<jti>` should be ≤ 604800 | `bash test/smoke/auth-logout.sh` | yes |
| AUTH-05 | GET /auth/me with Bearer returns `{id,email,name}`; missing Bearer → 401; invalid Bearer → 401 | smoke (3 curl variants) + structural (grep `authenticate` on `/me` route) | `bash test/smoke/auth-me.sh` | yes |
| AUTH-06 | GET /campaigns/1 without Bearer → 401; with invalid Bearer → 401; with tampered signature → 401 | smoke (3 curl variants) + structural (grep `campaignsRouter.use(authenticate)`) | `bash test/smoke/auth-guard.sh` | yes — Phase 7 TEST-04 |
| AUTH-07 | User A (Bearer_A) GET /campaigns/:id of user B → 404 (not 403) | structural for now (stub route always 404s); **formally verified in Phase 7 TEST-04** with real campaigns | grep check + smoke | yes — Phase 7 TEST-04 |

**Boundaries that MUST be validated:**

| Boundary | What to Check | Where |
|----------|--------------|-------|
| HTTP request body → Zod parse | RegisterSchema / LoginSchema reject malformed input; controller gets typed, trusted values | `validate(schema)` middleware before every POST |
| DB write (register) | Unique email constraint fires on duplicate | `SequelizeUniqueConstraintError` → 409 in `registerUser` service |
| DB read (login) | Constant-time compare regardless of user-exists | dummy `bcrypt.compare` on `findOne` → null |
| Redis denylist (refresh) | `EXISTS jwt:denylist:<jti>` returns 1 → 401 + clear cookie | `/auth/refresh` controller |
| Redis denylist write (rotate + logout) | TTL == `exp - now()` seconds | `redis.set(key, '1', 'EX', ttl)` |
| JWT access verify | Algorithm is explicitly HS256; type === 'access'; throws on tamper/expiry | `verifyAccess` in `lib/tokens.ts` |
| JWT refresh verify | Same pattern + `type === 'refresh'` | `verifyRefresh` in `lib/tokens.ts` |
| bcrypt compare | Called via `bcrypt.compare`, never raw `===` | `authenticateUser` service |
| Cookie attributes | `HttpOnly; SameSite=Strict; Path=/auth; Secure (prod only)` on every Set-Cookie | `COOKIE_OPTS` constant |
| Cookie clear | `res.clearCookie('rt', COOKIE_OPTS)` — matching Path | logout + replay-detected refresh |
| Router-level auth | `authenticate` applied via `router.use` — not per-route | grep assertion: `router.use(authenticate)` present in campaigns/recipients routers |

### Sampling Rate (Nyquist)

- **Per task commit:** one smoke script covering the REQ-ID(s) addressed by that commit (e.g., register + login smoke after the login route lands)
- **Per wave merge:** all smoke scripts pass end-to-end + `yarn typecheck` clean + `yarn lint` clean + grep assertions green
- **Phase gate:** all 7 REQ-IDs verified via smoke + structural; DECISIONS.md note about `Path=/auth` deviation drafted; ready for Phase 7 to add Vitest backing

### Wave 0 Gaps

- [ ] `backend/test/smoke/` directory — does not exist; Phase 3 creates it with 5-6 `.sh` scripts (register/login/refresh/logout/me/guard). These are temporary smoke scripts deleted when Phase 7 adds the real Vitest suite, OR kept as reviewer-runnable examples.
- [ ] `backend/vitest.config.ts` — Phase 7 creates; Phase 3 does NOT
- [ ] `backend/test/setup.ts` — Phase 7 creates; Phase 3 does NOT
- [ ] Framework install (`yarn workspace @campaign/backend add --dev vitest@2.1.9 @vitest/coverage-v8@2.1.9 supertest@^7.2.2 @types/supertest@^6.0.3`) — Phase 7

## Code Examples

### `routes/auth.ts` — full skeleton

```ts
// routes/auth.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { RegisterSchema, LoginSchema } from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as authService from '../services/authService.js';
import { signAccess, signRefresh, verifyRefresh } from '../lib/tokens.js';
import { redis } from '../lib/redis.js';
import { UnauthorizedError } from '../util/errors.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../db/index.js';

export const authRouter: Router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// AUTH-01
authRouter.post('/register', validate(RegisterSchema), async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body);
    res.status(201).json({ data: { id: user.id, email: user.email, name: user.name } });
  } catch (err) { next(err); }
});

// AUTH-02
authRouter.post('/login', validate(LoginSchema), async (req, res, next) => {
  try {
    const user = await authService.authenticateUser(req.body.email, req.body.password);
    const accessToken = signAccess(user);
    const { token: refreshToken } = signRefresh(user);
    res.cookie('rt', refreshToken, COOKIE_OPTS);
    res.json({ data: { accessToken, user: { id: user.id, email: user.email, name: user.name } } });
  } catch (err) { next(err); }
});

// AUTH-03
authRouter.post('/refresh', async (req, res, next) => {
  try {
    if (req.headers['x-requested-with'] !== 'fetch') {
      throw new UnauthorizedError('CSRF_CHECK_FAILED');
    }
    const rt = req.cookies?.rt;
    if (!rt) throw new UnauthorizedError('MISSING_REFRESH_TOKEN');

    const decoded = verifyRefresh(rt);
    const denied = await redis.exists(`jwt:denylist:${decoded.jti}`);
    if (denied) {
      res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
      throw new UnauthorizedError('TOKEN_REVOKED');
    }

    const secondsRemaining = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
    if (secondsRemaining > 0) {
      await redis.set(`jwt:denylist:${decoded.jti}`, '1', 'EX', secondsRemaining);
    }

    const user = await User.findByPk(decoded.sub);
    if (!user) throw new UnauthorizedError('USER_NOT_FOUND');

    const accessToken = signAccess(user);
    const { token: newRt } = signRefresh(user);
    res.cookie('rt', newRt, COOKIE_OPTS);
    res.json({ data: { accessToken } });
  } catch (err) { next(err); }
});

// AUTH-04
authRouter.post('/logout', async (req, res, next) => {
  try {
    const rt = req.cookies?.rt;
    if (rt) {
      const decoded = jwt.decode(rt) as { jti?: string; exp?: number } | null;
      if (decoded?.jti && decoded.exp) {
        const secondsRemaining = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
        if (secondsRemaining > 0) {
          await redis.set(`jwt:denylist:${decoded.jti}`, '1', 'EX', secondsRemaining);
        }
      }
    }
    res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// AUTH-05
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) throw new UnauthorizedError('USER_NOT_FOUND');
    res.json({ data: { id: user.id, email: user.email, name: user.name } });
  } catch (err) { next(err); }
});
```

### Smoke test flow (full cycle)

```bash
# test/smoke/auth-full-cycle.sh — runs against yarn dev on :3000 + redis on :6379
set -euo pipefail
BASE=http://localhost:3000

# 1. Register
curl -s -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123","name":"Test"}' | jq -e '.data.email == "test@example.com"'

# 2. Register again → 409
curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123","name":"Test"}' | grep -q 409

# 3. Login → access + cookie
COOKIE=$(mktemp)
ACCESS=$(curl -sc $COOKIE -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.data.accessToken')
[ -n "$ACCESS" ] && echo "login ok"
grep -q 'rt' $COOKIE && echo "refresh cookie set"

# 4. /auth/me with access
curl -s -H "Authorization: Bearer $ACCESS" $BASE/auth/me | jq -e '.data.email'

# 5. Refresh → new access + new cookie
NEW_ACCESS=$(curl -sb $COOKIE -c $COOKIE -X POST $BASE/auth/refresh \
  -H 'X-Requested-With: fetch' | jq -r '.data.accessToken')
[ "$NEW_ACCESS" != "$ACCESS" ] && echo "rotated"

# 6. Guard check — /campaigns/1 without Bearer → 401
curl -s -o /dev/null -w '%{http_code}' $BASE/campaigns/1 | grep -q 401

# 7. Guard check — /campaigns/1 with Bearer → 404 (stub returns NotFound)
curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $NEW_ACCESS" $BASE/campaigns/1 | grep -q 404

# 8. Logout → cookie cleared + jti denylisted
curl -sb $COOKIE -c $COOKIE -X POST $BASE/auth/logout | jq -e '.data.ok'

# 9. Refresh after logout → 401
curl -sb $COOKIE -o /dev/null -w '%{http_code}' -X POST $BASE/auth/refresh \
  -H 'X-Requested-With: fetch' | grep -q 401

echo "ALL SMOKE TESTS PASSED"
```

## Common Pitfalls (Phase 3 specific)

### Pitfall P3-1: `res.clearCookie` silently fails

**What goes wrong:** `res.cookie('rt', tok, {path:'/auth/refresh'})` then `res.clearCookie('rt')` (no options). Browser keeps the cookie. Next refresh succeeds with an already-used-then-rotated token → chain of failed refreshes → user logged out mysteriously.

**How to avoid:** `clearCookie` opts MUST include matching `path`, `httpOnly`, `sameSite`, `secure`. Centralize `COOKIE_OPTS` and pass `{...COOKIE_OPTS, maxAge: undefined}` to clear.

**Warning sign:** manual Devtools check — after logout, the `rt` cookie is still in Application → Cookies.

### Pitfall P3-2: Refresh cookie Path blocks logout receiving it

**What goes wrong:** Following ARCHITECTURE.md §8 literally (`Path=/auth/refresh`) means the cookie is never sent to `POST /auth/logout` → handler cannot extract `jti` → can't denylist.

**How to avoid:** Widen to `Path=/auth`. Documented as the deliberate deviation in §Refresh Token Design.

### Pitfall P3-3: BIGINT → JSON precision

**What goes wrong:** `user.id` is Postgres BIGINT; Sequelize 6 returns it as `string` by default for safety. JWT `sub` claim expects string. Frontend Redux stores it. `Number(req.user.id)` at the authenticate boundary is safe as long as ids stay < 2^53 (always true for users table).

**How to avoid:** Stringify at JWT sign, Number() at authenticate middleware boundary ONCE, and let service layers work in numbers from there. Don't mix.

### Pitfall P3-4: Email enumeration on login

**What goes wrong:** Different response times between "user not found" and "user found but wrong password" → attacker can enumerate emails.

**How to avoid:** Dummy `bcrypt.compare` on the "user not found" branch (see §bcrypt Choice). Both branches return `INVALID_CREDENTIALS` with ~equal latency.

### Pitfall P3-5: JWT `algorithms` option missing on verify

**What goes wrong:** `jwt.verify(token, secret)` without `algorithms: ['HS256']` — historical CVE-2015-9235 where attacker specifies `alg: none` or `alg: HS256` with an RS256 pubkey and passes verification.

**How to avoid:** Explicit `algorithms: ['HS256']` on EVERY verify call. jsonwebtoken 9 defaults are stricter but defense-in-depth is cheap. Grep assertion.

### Pitfall P3-6: `authenticate` swallows JsonWebTokenError stack trace

**What goes wrong:** `try { verify } catch(e) { throw new UnauthorizedError(e.message) }` — leaks JWT library internals (e.g., "jwt malformed", "invalid signature") into the client response. Small info leak.

**How to avoid:** Fixed-value error code `INVALID_TOKEN` regardless of the underlying cause. Log the original error server-side via pino for debugging.

### Pitfall P3-7: Missing `cookieParser()` before auth router

**What goes wrong:** `req.cookies` is undefined → refresh controller reads `req.cookies?.rt` → always undefined → always 401. Easy to miss because tests using Bearer-only endpoints pass.

**How to avoid:** `cookieParser()` mounted before `app.use('/auth', authRouter)` in `buildApp()`. Grep assertion: the order of `app.use` calls.

### Pitfall P3-8: Redis client crashes app on transient network blip

**What goes wrong:** Default `ioredis` options trigger `uncaughtException` on reconnect storms.

**How to avoid:** `redis.on('error', handler)` attached at connection creation — turns the error into a logged event rather than a process crash. Our `lib/redis.ts` does this.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Refresh cookie Path=`/auth` (not `/auth/refresh` as ARCHITECTURE.md says) so `/auth/logout` can read and clear it | §Refresh Token Design | [ASSUMED — needs user confirmation] If user insists on `Path=/auth/refresh`, the ONLY workable alternative is to have the frontend accept the refresh token in the body on logout, which can't happen because the cookie is HttpOnly. So the assumption is forced by the design — flagging anyway since it deviates from locked ARCHITECTURE.md. |
| A2 | Access token TTL = 15m, Refresh = 7d | §User Constraints / Claude's Discretion | [ASSUMED] Configurable; these are just defaults. |
| A3 | bcrypt cost = 10 (matches Phase 2 seeder) | §bcrypt Choice | Low — changing to 12 adds ~100ms per login but works identically. |
| A4 | Strict startup — fail fast if DB or Redis is down | §Redis Wiring | Low — alternative "warn and continue" is also defensible but makes AUTH-03/04 silently broken. |
| A5 | Service-layer ownership filter (not middleware) | §AUTH-07 Ownership Convention | Low — both work; the choice locks the Phase 4 pattern but is reversible. |
| A6 | No rate-limiting on /auth/login in v1 | §Claude's Discretion | Medium — a security-minded reviewer might flag its absence. Documented as deferred in DECISIONS.md. |
| A7 | X-Requested-With: fetch CSRF check on /auth/refresh | §Refresh Token Design | Low — belt-and-suspenders; SameSite=Strict is the primary defense. |
| A8 | 32-char minimum on both JWT secrets | §Env Vars | Low — standard recommendation; could loosen if the reviewer uses shorter env values, but 32+ bytes = 256 bits is the HS256 safe floor. |

## Open Questions

1. **Should Phase 3 add Phase 6's `/track/*` router as a stub now, or leave it to Phase 6?**
   - What we know: `/track/*` is explicitly Phase 6 per ROADMAP.md; it must mount PUBLIC (no `authenticate`) at the app level (C7).
   - What's unclear: whether `buildApp()` in Phase 3 should include a commented-out `app.use('/track', ...)` line to lock the mount order.
   - Recommendation: Leave out entirely. Phase 6 plan adds it. A comment would rot.

2. **Should `/auth/register` be disable-able in production via env var (feature flag)?**
   - What we know: take-home is open-reg; no requirement to restrict.
   - What's unclear: whether reviewer will question "what if you deploy this and don't want new signups?"
   - Recommendation: skip; mention in DECISIONS.md as v2 deferred.

3. **Should we return the refresh token's `exp` on login so the frontend can schedule proactive refresh?**
   - What we know: ARCHITECTURE.md's interceptor pattern refreshes reactively on 401.
   - What's unclear: whether UX smoothness benefits from proactive.
   - Recommendation: skip; reactive is the standard pattern and is what Phase 8 will implement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 | Phase 2 DB + Phase 3 auth | ✓ (verified Phase 2 — homebrew-pg on :5432 serves connections) | 16 | — |
| Redis 7+ | Phase 3 denylist (NEW requirement) | **✗ UNVERIFIED** — no redis server confirmed running locally. docker-compose.yml currently only defines `postgres`. | — | **BLOCKING** — Phase 3 Wave 0 MUST start `docker run -d --name campaign-redis -p 6379:6379 redis:7-alpine` OR extend docker-compose.yml with a redis service |
| Node 20+ | backend runtime | ✓ | (repo `engines` pins `>=20.11.0`) | — |
| yarn 4.14.1 (corepack) | installs | ✓ | 4.14.1 | — |

**Missing dependencies with no fallback:** Redis — Phase 3 plan MUST open with "add redis service to docker-compose.yml + `yarn dev` instructions require a running redis".

**Recommendation for Plan 03-01 (scaffolding wave):** extend `docker-compose.yml` with a `redis: image: redis:7-alpine, ports: ["6379:6379"], healthcheck: ...` service. This also lays groundwork for Phase 5 (BullMQ) and Phase 10 (full stack).

## State of the Art

| Old Approach | Current Approach (2026) | Impact |
|--------------|-------------------------|--------|
| Single JWT in localStorage | Access in memory + refresh in HttpOnly cookie | XSS-safe refresh; replay window is 15m access, not 7d |
| JWT with no jti + no denylist | Refresh with jti + Redis denylist on logout/rotate | Stolen refresh tokens can be revoked server-side |
| `res.clearCookie('rt')` with no options | `res.clearCookie('rt', {...COOKIE_OPTS, maxAge: undefined})` with matching path | Actually clears the cookie |
| `jwt.verify(t, s)` without algorithms | `jwt.verify(t, s, {algorithms:['HS256']})` | Defeats CVE-2015-9235-class attacks |
| 403 on cross-user access | 404 (enumeration defense) | Attackers can't distinguish non-existent vs unauthorized IDs |
| Route-level `authenticate` per endpoint | `router.use(authenticate)` at router level | New routes safe-by-default; less boilerplate |

**Deprecated / outdated:**
- `bcrypt` native on Alpine → replaced with `bcryptjs` for portability
- Auto-rotating every N days via cron → replaced with rotation on every `/auth/refresh`
- Double-submit CSRF tokens → replaced with SameSite=Strict + `X-Requested-With` header (minimum viable)

## Project Constraints (from CLAUDE.md)

The following project directives apply to Phase 3 and MUST be honored:

- **Stack is locked** — no re-litigation of Express 4, Sequelize 6, BullMQ 5, split-token JWT, bcryptjs. All in STACK.md / PROJECT.md.
- **No `sync()` in prod** — Phase 3 reuses Phase 2's migrations; zero schema changes; zero `sequelize.sync()` calls.
- **Error shape** — `{ error: { code, message } }` across the entire API. Phase 3 establishes this; every Phase 4+ route reuses.
- **Cursor pagination not offset** — not Phase 3's concern (Phase 4 owns), but Phase 3's shared schemas MUST NOT accidentally introduce `offset` / `page` shapes that Phase 4 would have to rip out.
- **Tracking pixel public** — Phase 3's `buildApp()` leaves the `/track/*` mount point at the app level so Phase 6 can attach without nesting under `campaignsRouter`.
- **Access in memory + refresh in cookie** — Phase 3 owns the backend half; frontend memoized in-flight refresh is Phase 8.
- **React Query owns server state; Redux owns client state** — frontend concern; Phase 3 return shapes (`{ data: {...} }`) are already designed to be React Query-friendly.
- **Don't modify `.docs/requirements.md`** — read-only.
- **"How I Used Claude Code" logging** — continue capturing real prompts, corrections, skipped delegations (applies at orchestrator level, not plan level).

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` §JWT (access+refresh split, HS256 explicit, Redis denylist)
- `.planning/research/ARCHITECTURE.md` §8 (full auth flows, CSRF, bootstrap, denylist schema)
- `.planning/research/PITFALLS.md` C6 / C7 / m2 / m6 / m3 + eval-flag list
- `.planning/REQUIREMENTS.md` AUTH-01..07 verbatim
- `.planning/ROADMAP.md` §Phase 3 (SC + context)
- `./CLAUDE.md` (stack lock + error shape + no sync + guardrails)
- `backend/src/models/user.ts` + `backend/src/seeders/20260101000000-demo-data.cjs` (Phase 2 — passwordHash column, bcryptjs cost=10)
- `backend/package.json` (bcryptjs 3.0.3 already installed; express + jwt + ioredis + cookie-parser + zod NOT yet installed)
- `backend/src/db/index.ts` (Phase 2 — sequelize instance + model barrel; reused as-is)
- `shared/src/schemas/auth.ts` (existing RegisterSchema; extended here)
- npm registry — `express`, `jsonwebtoken`, `ioredis`, `cookie-parser`, `bcryptjs`, `@types/*` versions verified 2026-04-21

### Secondary (MEDIUM confidence)
- [auth0/node-jsonwebtoken v8→v9 migration notes](https://github.com/auth0/node-jsonwebtoken/wiki/Migration-Notes:-v8-to-v9) — verified `verify()` stricter defaults, default `algorithms` list
- [expressjs/express#3941 — clearCookie path trap](https://github.com/expressjs/express/issues/3941) — confirms matching-options requirement
- [Auth0 JWT validation guide](https://auth0.com/docs/secure/tokens/json-web-tokens/validate-json-web-tokens) — general HS256 verification pattern

### Tertiary (LOW confidence — flagged)
- None. All claims are either directly verified (VERIFIED) or cited to specific sources (CITED) or explicitly marked `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified via `npm view` on 2026-04-21; STACK.md locked the choices
- Module structure: HIGH — maps 1-to-1 to ARCHITECTURE.md §11 file layout + 7 REQ-IDs
- Token design: HIGH — HS256 + separate secrets + jti denylist is verified against OWASP ASVS V3/V7 per ARCHITECTURE.md; jsonwebtoken 9 defaults verified
- Cookie Path trap: MEDIUM → becomes HIGH if user confirms A1 (Path=/auth deviation from ARCHITECTURE.md). The analysis is airtight; the call is "document the deviation explicitly in DECISIONS.md."
- AUTH-07 convention: HIGH — service-layer filter is the standard Sequelize+Express idiom; Phase 4 will reuse
- Redis wiring: HIGH — separate connection from BullMQ per C5; `SET EX` idiomatic
- Error handler: HIGH — pattern is textbook Express 4 + Zod + Sequelize integration
- Pitfall coverage: HIGH — all four called-out pitfalls (C6/C7/m2/m6) explicitly addressed plus 4 others (m3, JWT-algorithms, clearCookie, AUTH-07)
- Validation architecture: MEDIUM — no Vitest yet (Phase 7 owns); smoke + structural is the Nyquist-appropriate sampling for Phase 3. Phase 7 will add formal coverage.

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — auth stack is stable; re-verify if Express 4.23+ ships or jsonwebtoken 10 drops)
