---
phase: 3
slug: authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` §Validation Architecture (line 955).
> Phase 3 does NOT introduce Vitest (Phase 7 owns TEST-01..04). Validation is **structural (grep) + live smoke (curl)**.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Structural grep + live curl smoke scripts (Vitest deferred to Phase 7) |
| **Config file** | None — `backend/test/smoke/*.sh` is a temporary harness (deleted or kept as reviewer samples when Phase 7 installs Vitest) |
| **Quick run command** | `bash backend/test/smoke/auth-full-cycle.sh` (single REQ-ID subset) |
| **Full suite command** | `bash backend/test/smoke/run-all.sh` (all 7 REQ-IDs end-to-end) |
| **Estimated runtime** | ~5s (register → login → me → refresh → logout → guard checks) |

---

## Sampling Rate

- **After every task commit:** Run the smoke script that covers the REQ-ID(s) touched (e.g., `auth-register.sh` after AUTH-01 lands, `auth-login.sh` after AUTH-02).
- **After every plan wave:** Run `bash backend/test/smoke/run-all.sh` + `yarn typecheck` + `yarn lint` + all structural grep assertions.
- **Before `/gsd-verify-work`:** Full smoke suite green end-to-end; all structural grep assertions pass.
- **Max feedback latency:** ~5s per smoke script; ~15s for the full cycle.

---

## Per-Task Verification Map

> Tasks are indicative — final IDs emerge from the planner. Pattern: Wave 0 scaffolds (redis + env + error handler + buildApp factory), Wave 1 adds primitives (tokens + bcrypt + shared zod), Wave 2 adds auth routes, Wave 3 adds authenticate middleware + stub protected routers + smoke harness.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 scaffolding | 0 | FOUND-05 (reuses) | T-03-01 Redis misconfig | `maxRetriesPerRequest: null` only on BullMQ conns (Phase 5); auth Redis uses defaults | structural | `grep -q "new Redis(" backend/src/lib/redis.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 scaffolding | 0 | AUTH-01..07 infra | — | `config/env.ts` fail-fast if JWT_ACCESS_SECRET / JWT_REFRESH_SECRET missing | structural | `grep -q "JWT_ACCESS_SECRET" backend/src/config/env.ts && node -e "delete process.env.JWT_ACCESS_SECRET; require('./backend/dist/config/env.js')" 2>&1 \| grep -q "JWT_ACCESS_SECRET"` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 scaffolding | 0 | AUTH-06/07 | T-03-02 Error shape drift | `errorHandler` maps HttpError → `{ error: { code, message } }`; last-mounted | structural | `grep -qE "\\{ error: \\{ code" backend/src/middleware/errorHandler.ts` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 scaffolding | 0 | TEST-01..04 infra | — | `buildApp()` factory returns Express app without `.listen()`; `index.ts` calls `buildApp().listen(PORT)` | structural | `grep -q "export function buildApp" backend/src/app.ts && grep -q "buildApp().listen" backend/src/index.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 primitives | 1 | AUTH-02/03 | T-03-03 Algorithm confusion | `signAccess`/`signRefresh`/`verifyAccess`/`verifyRefresh` all pass `algorithms: ['HS256']` explicitly on verify | structural | `grep -c "algorithms: \\['HS256'\\]" backend/src/lib/tokens.ts` equals 2 | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 primitives | 1 | AUTH-01/02 | T-03-04 Plaintext passwords | `bcryptjs.hash(pw, 10)` on register; `bcryptjs.compare` on login; dummy-compare branch when user not found (constant-time) | structural | `grep -q "bcryptjs.hash" backend/src/services/authService.ts && grep -q "bcryptjs.compare" backend/src/services/authService.ts` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 primitives | 1 | AUTH-01/02/03 | — | `RegisterSchema`, `LoginSchema` exported from `@campaign/shared`; re-built into `shared/dist/` | structural | `grep -q "RegisterSchema" shared/dist/schemas/auth.d.ts && grep -q "LoginSchema" shared/dist/schemas/auth.d.ts` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 auth routes | 2 | AUTH-01 | T-03-05 Email enumeration | POST /auth/register returns 201 on new email, 409 on duplicate, 400 on malformed body | smoke + structural | `bash backend/test/smoke/auth-register.sh` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 auth routes | 2 | AUTH-02 | T-03-06 Cookie XSS | POST /auth/login returns `{accessToken, user}`; Set-Cookie has `HttpOnly`, `SameSite=Strict`, `Path=/auth` | smoke | `bash backend/test/smoke/auth-login.sh` (curl -v grep for `HttpOnly` + `SameSite=Strict` + `Path=/auth`) | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 auth routes | 2 | AUTH-03 | T-03-07 Refresh replay | POST /auth/refresh rotates jti, denylists old jti in Redis; second refresh with same cookie → 401 + clearCookie | smoke | `bash backend/test/smoke/auth-refresh.sh` (curl + `redis-cli EXISTS jwt:denylist:<jti>` returns 1) | ❌ W0 | ⬜ pending |
| 03-03-04 | 03 auth routes | 2 | AUTH-04 | T-03-08 Logout not revoking | POST /auth/logout denylists current jti with TTL = exp - now; clears cookie; subsequent refresh → 401 | smoke | `bash backend/test/smoke/auth-logout.sh` (curl + `redis-cli TTL jwt:denylist:<jti>` ≤ 604800) | ❌ W0 | ⬜ pending |
| 03-03-05 | 03 auth routes | 2 | AUTH-05 | — | GET /auth/me with Bearer → `{id,email,name}`; missing/invalid Bearer → 401 | smoke | `bash backend/test/smoke/auth-me.sh` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 guards | 3 | AUTH-06 | T-03-09 Leaky protected routes | `authenticate` mounted via `campaignsRouter.use(authenticate)` and `recipientsRouter.use(authenticate)` — NOT per-route | structural | `grep -E "^\\s*(campaignsRouter\|recipientsRouter)\\.use\\(authenticate\\)" backend/src/routes/*.ts` count ≥ 2 | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 guards | 3 | AUTH-06 | — | GET /campaigns without Bearer → 401; with invalid Bearer → 401; with tampered signature → 401 | smoke | `bash backend/test/smoke/auth-guard.sh` | ❌ W0 | ⬜ pending |
| 03-04-03 | 04 guards | 3 | AUTH-07 | T-03-10 Cross-user enumeration | Stub protected route returns 404 (not 403) on any lookup in Phase 3; formal cross-user test lands in Phase 7 TEST-04 | structural | `grep -qE "throw new NotFoundError" backend/src/routes/campaigns.ts` | ❌ W0 | ⬜ pending |
| 03-04-04 | 04 guards | 3 | AUTH-01..07 | — | Full smoke cycle (register→login→me→refresh→logout→guard) runs green against `yarn dev` + Postgres + Redis | smoke | `bash backend/test/smoke/run-all.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docker-compose.yml` — extend with `redis:7-alpine` service (volume + healthcheck). **BLOCKING** per RESEARCH.md — Redis is not yet in compose.
- [ ] `backend/.env.example` — add `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `BCRYPT_COST`, `REDIS_URL`, `NODE_ENV`.
- [ ] `backend/src/config/env.ts` — fail-fast loader (asserts both JWT secrets present + differ; parses TTLs; exports typed `config`).
- [ ] `backend/src/lib/redis.ts` — ioredis client (separate from Phase 5 BullMQ connection); ping on boot.
- [ ] `backend/src/util/errors.ts` — `HttpError` + `UnauthorizedError(401)`, `ConflictError(409)`, `NotFoundError(404)`, `ValidationError(400)`.
- [ ] `backend/src/middleware/errorHandler.ts` — last-middleware error mapper → `{ error: { code, message } }`.
- [ ] `backend/src/middleware/validate.ts` — Zod schema-to-400 wrapper.
- [ ] `backend/src/app.ts` — `buildApp()` factory (mounts routers, error handler last); no `.listen()`.
- [ ] `backend/src/index.ts` — imports `buildApp()`; calls `.listen(PORT)`.
- [ ] `backend/test/smoke/` — directory + per-REQ-ID scripts (`auth-register.sh`, `auth-login.sh`, `auth-refresh.sh`, `auth-logout.sh`, `auth-me.sh`, `auth-guard.sh`, `run-all.sh`). These may be deleted once Phase 7 lands Vitest, or kept as reviewer demos.
- [ ] `shared/src/schemas/auth.ts` + rebuild — `RegisterSchema`, `LoginSchema`, `AuthMeResponseSchema`.
- [ ] Dependencies: `jsonwebtoken`, `bcryptjs` (already present per Phase 2 seeder), `ioredis`, `cookie-parser`, `zod` (already on backend), `@types/jsonwebtoken`, `@types/bcryptjs`, `@types/cookie-parser` — add if missing.

*Phase 7 (TEST-01..04) installs Vitest + Supertest and converts the smoke scripts into formal tests — that's a Phase 7 Wave 0 concern, not a Phase 3 blocker.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cookie `Path=/auth` deviation from ARCHITECTURE.md §8 | AUTH-02/04 | Architectural decision needs DECISIONS.md note — user nod, not a test | After Wave 2: (1) confirm `COOKIE_OPTS.path === '/auth'` in `routes/auth.ts`; (2) draft DECISIONS.md entry explaining why broader Path is required for logout to clear cookie; (3) confirm SameSite=Strict + HttpOnly remain primary CSRF/XSS defenses |
| Startup fail-fast on missing JWT secrets | m2 / AUTH-01..07 | Startup behavior — runs once at boot | `unset JWT_ACCESS_SECRET && yarn workspace @campaign/backend dev` must exit non-zero with readable message |
| Secure cookie flag in production | AUTH-02 | `Secure` only fires when `NODE_ENV=production` — curl can't check this locally with `http://` | `NODE_ENV=production yarn dev` + trust `COOKIE_OPTS.secure` is config-derived via grep; defer live TLS verify to Phase 10 |

*All core behaviors (register, login, refresh, logout, me, guard) have automated structural + smoke verification above.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (Wave 0 scaffolding tasks are structural; Wave 2/3 tasks are smoke)
- [ ] Wave 0 covers all MISSING references (docker-compose redis + env.ts + redis.ts + errors.ts + errorHandler.ts + validate.ts + buildApp + shared zod)
- [ ] No watch-mode flags (smoke scripts run in one-shot against `yarn dev`)
- [ ] Feedback latency < 15s per full smoke cycle
- [ ] `nyquist_compliant: true` set in frontmatter (flip after Wave 0 complete + all tasks mapped)

**Approval:** pending — set to `approved 2026-04-21` once planner PLAN.md files confirm the task IDs above align.
