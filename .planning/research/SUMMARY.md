# Project Research Summary

**Project:** Mini Campaign Manager (Full-Stack Senior Interview Project)
**Domain:** MarTech / Email Campaign Management
**Researched:** 2026-04-20
**Updated:** 2026-04-20 (revised after user choices: Vitest, flat monorepo, JWT split, cursor pagination, pixel endpoint)
**Confidence:** HIGH

## Executive Summary

This is a simulated email campaign management system — canonical MarTech domain with a well-defined data model, strict status state machine, and async job processing layer. The key design challenge is not the CRUD layer but the correct implementation of `draft → scheduled → sending → sent` with atomic state transitions and a BullMQ worker that simulates delivery per recipient. Evaluators know this domain and will probe indexing, N+1 avoidance, status-guard correctness, and the Redux/React Query state boundary.

**Stack (revised — diverges from baseline research where the user picked the senior-flex variant):** Flat yarn-workspaces monorepo (Yarn 4 + node-modules linker) with three workspaces — `backend/` (Express + Sequelize + BullMQ + pino), `frontend/` (React 18 + Vite + React Query + RTK + shadcn), and `shared/` (Zod schemas + inferred TS types). Tests are Vitest on both sides + Supertest for HTTP + @testing-library/react for components.

**Auth (revised):** Access token in Redux memory (15 min, `JWT_ACCESS_SECRET`), refresh token in httpOnly cookie scoped to `Path=/auth/refresh` (7 days, `JWT_REFRESH_SECRET`, `jti`-rotated on every refresh). Logout denylists `jti` in Redis with TTL = remaining token life. App bootstrap calls `/auth/refresh` then `/auth/me` to rehydrate after page refresh. Frontend axios interceptor memoizes a single in-flight refresh promise to prevent 401-storm rotation collisions.

**Pagination (revised):** Cursor-based on `GET /campaigns` — base64url-encoded `(created_at, id)` cursor, row-value comparison via `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` (Sequelize 6 has no native row-value support), index `(created_by, created_at DESC, id DESC)`, response shape `{ data, nextCursor, hasMore }`. Frontend uses React Query v5 `useInfiniteQuery` (which now requires `initialPageParam`).

**Open tracking (revised — was anti-feature):** Public `GET /track/open/:trackingToken` returns the canonical 43-byte transparent GIF89a and runs an idempotent `UPDATE ... WHERE tracking_token = $1 AND opened_at IS NULL`. New `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` column on `campaign_recipients` defeats enumeration without HMAC tokens. Always-200 response prevents oracle attacks.

**Stats are always computed via a single aggregate SQL query** — never stored as counters. BullMQ worker returns `202 Accepted` immediately, the **HTTP handler** atomically transitions campaign `draft|scheduled → sending`, the worker processes recipients with random outcomes inside a transaction and transitions to `sent` after completion. React Query polls stats endpoint every 2s while `status === 'sending'`.

**Top risks:** (1) BullMQ IORedis missing `maxRetriesPerRequest: null` causing silent job hangs, (2) missing atomic UPDATE enabling race conditions on concurrent send, (3) Sequelize N+1 on campaign detail, (4) Redux caching server state, (5) refresh-token races without a memoized in-flight promise, (6) cursor-pagination tie-breaker omission, (7) tracking pixel returning 404 (oracle leak), (8) `shared/` workspace shipping raw `src/` instead of compiled `dist/`. All are senior-level red flags. Mitigation is baked into build order: scaffold + schema + infra first, business logic second, queue third, frontend last, tests throughout.

---

## Stack (Confirmed — Do Not Deviate)

### Backend
- `express@^4.19.2`, `sequelize@^6.37.3`, `pg@^8.12.0`, `pg-hstore@^2.4.3`
- `bullmq@^5.12.0`, `ioredis@^5.4.1`
- `jsonwebtoken@^9.0.2`, `bcryptjs@^2.4.3`, `zod@^3.23.8`
- `cookie-parser`, `pino` + `pino-http`, `tsx` (dev runner)
- **Vitest 2.1.9** + `@vitest/coverage-v8@2.1.9` + `supertest@7.2.2` + `@types/supertest@6.0.3`

### Frontend
- `react@^18.3.1`, `@tanstack/react-query@^5.51.1` (v5 — object-only `useQuery`, `useInfiniteQuery` requires `initialPageParam`)
- `@reduxjs/toolkit@^2.2.7`, `react-redux@^9.1.2`
- `tailwindcss@^3.4.7` — **PIN to 3.x** (v4 breaks shadcn config)
- `vite@^5.3.5`, `@vitejs/plugin-react@4.7.0` (last 4.x supporting Vite 5), shadcn/ui New York style, Slate color
- **Vitest 2.1.9** + `@testing-library/react@16.3.2` + `@testing-library/jest-dom@6.9.1` + `jsdom@29.0.2`

### Shared workspace
- `zod@^3.23.8` declared HERE only (version-drift mitigation)
- `typescript@^5.5` devDep; emits `dist/` via `tsc -w` in dev

### Tooling
- **Yarn 4** via `corepack use yarn@4.x`; `nodeLinker: node-modules` (NOT PnP)

### Critical Constraints
- `@` path alias must be in BOTH `vite.config.ts` AND `tsconfig.json`
- `cookie-parser` registered before JWT auth middleware
- Separate IORedis connection instances for Queue vs Worker
- Every IORedis connection used with BullMQ must set `maxRetriesPerRequest: null`
- Vitest pinned to 2.x for Vite 5 compatibility (Vitest 4.x requires Vite 6)
- `shared/` ships compiled `dist/`, not raw `src/` (Vite optimizer chokes on TS in node_modules)
- `axios.defaults.withCredentials = true` set globally (or refresh cookie silently dropped)
- `pgcrypto` extension for `gen_random_uuid()` (auto-on in PG 13+)

---

## Table Stakes Features (Build All)

| Feature | Notes |
|---------|-------|
| Campaign CRUD with server-side status gating | 409 on edit/delete of non-draft |
| 4-state lifecycle: `draft → scheduled → sending → sent` | `sending` intermediate state is the interview trap |
| BullMQ delayed job for scheduled send; immediate job for manual send | Both converge to same worker; worker re-checks status on fire |
| Per-recipient delivery simulation (random sent/failed) inside a transaction | `CampaignRecipient.status` + `sent_at` per row |
| Stats: total, sent, failed, opened, send_rate, open_rate | Single aggregate SQL; `opened` populated via tracking pixel |
| **Cursor pagination** on campaign list | `{ data, nextCursor, hasMore }` |
| **Open tracking pixel** at `GET /track/open/:trackingToken` | Always 200 + 43-byte GIF; idempotent UPDATE |
| Auth: register, login, refresh, logout, /me — split tokens + Redis denylist | Access in memory, refresh in httpOnly cookie scoped to `/auth/refresh` |
| React Query polling during `sending` | `refetchInterval: 2000` while `sending`, `false` otherwise |
| 4 frontend pages: login, list, detail, create | Conditional action buttons mirroring server state machine |
| Frontend axios interceptor — memoized refresh promise | Prevents 401-storm rotation collisions |
| Docker Compose — full stack (postgres + redis + api + web-as-nginx) + seed data | `condition: service_healthy` on api deps; nginx reverse-proxies `/api` + `/track`; single host port 8080; seed: 1 draft + 1 scheduled + 1 sent |

**Low-cost, high-signal polish:**
- Amber `sending` badge with spinner
- Progress bars (shadcn `Progress`) for `send_rate` and `open_rate`
- Per-recipient status rows in detail view
- `docs/DECISIONS.md` explaining 4-state machine, indexes, split-token auth, cursor pagination, pixel-tracking

## Anti-Features (Do Not Build)

| Anti-Feature | Why |
|---|---|
| Real SMTP delivery | Out of scope; simulate with BullMQ random outcomes |
| WYSIWYG editor | Rabbit hole; use `<textarea>` |
| Recipient CSV import or segments | Scope creep; single `POST /recipient` |
| WebSocket real-time push | React Query polling is sufficient |
| Send cancellation/retry | `failed` is terminal in simulation; document |
| HMAC-signed tracking tokens | UUIDv4 is sufficient; rate limiting + secrets out of scope |
| Dark mode | Not signaled by eval criteria |

---

## Architecture Highlights

**Monorepo structure (flat — diverges from baseline):**
```
backend/    → @campaign/backend  (Express + Sequelize + BullMQ + pino)
frontend/   → @campaign/frontend (React 18 + Vite + React Query + RTK)
shared/     → @campaign/shared   (Zod schemas + TS types — emits dist/)
```

**Key patterns:**
- **Stats:** `COUNT(*) FILTER (WHERE status = 'sent')` — single SQL, never computed in JS
- **BullMQ:** API atomically guards `draft|scheduled → sending` BEFORE enqueue; returns `202 Accepted`; worker does the rest inside a Sequelize transaction
- **Atomic send guard:** `UPDATE campaigns SET status='sending' WHERE id=$1 AND status IN ('draft','scheduled')` — check `rowCount` before enqueuing
- **Cursor pagination:** opaque base64url `(created_at, id)`; `Sequelize.literal()` with parameterized `replacements`; index `(created_by, created_at DESC, id DESC)`
- **Open pixel:** public, no-auth, 1×1 GIF, idempotent UPDATE on `tracking_token UUID`, always-200
- **Auth:** access in memory (15 min), refresh in httpOnly cookie (7 days, `Path=/auth/refresh`), `jti`-rotated, Redis denylist, memoized refresh promise on the client
- **React Query = server state; Redux = access token + UI flags ONLY**

**Indexes (in migrations, not as afterthought):**
- `(created_by, created_at DESC, id DESC)` on `campaigns` — covers cursor pagination
- `(campaign_id, status)` on `campaign_recipients` — covers stats aggregation
- `tracking_token UNIQUE` on `campaign_recipients` — covers pixel lookup
- Composite PK `(campaign_id, recipient_id)` covers worker update path
- UNIQUE on `users.email` and `recipients.email`

**Docker Compose (full stack):** postgres + redis + api + web (nginx:alpine serving the compiled Vite build). Only `web` binds a host port (`8080:80`) — reviewer opens `http://localhost:8080` and nginx reverse-proxies `/api/*` + `/track/*` to the api container (single origin → no CORS, no `VITE_API_URL` baked in at build time). `condition: service_healthy` on postgres + redis for api; api startup runs migrations before server boot; DB host inside Docker = service name `postgres`, not `localhost`. Dev iteration: optional `yarn workspace @campaign/frontend dev` runs Vite with HMR against the dockerized API.

---

## Top 8 Pitfalls (revised)

**P1 — BullMQ IORedis missing `maxRetriesPerRequest: null` (CRITICAL)**
Silent `ReplyError: Command timed out`. Required on every IORedis connection. Add `worker.on('failed')` and `worker.on('error')`.

**P2 — Race condition on concurrent send (CRITICAL)**
Two HTTP requests both pass status check → two jobs enqueued → campaign processed twice. Fix: atomic Postgres UPDATE as the lock, check `rowCount === 0` → 409.

**P3 — Refresh-token races on the frontend (HIGH)**
N concurrent 401s → N `/auth/refresh` calls → rotation collisions denylist each other → user logged out. Fix: memoized in-flight refresh promise so all 401s `await` the same promise.

**P4 — Status transitions enforced only in frontend (HIGH)**
HTTP client bypasses UI guards. All status-guard logic in API service layer. Use `409 Conflict` (not `400`) for state machine violations.

**P5 — Sequelize N+1 on campaign detail (HIGH)**
Lazy-loading each `CampaignRecipient`'s `Recipient` = 101 queries for 100 recipients. Use nested `include`. Stats must be a single aggregate.

**P6 — Cursor pagination missing tie-breaker / using string interpolation (HIGH)**
Without `id` tiebreaker, two campaigns with identical `created_at` cause page boundary skips/duplicates. Always use `Sequelize.literal()` + parameterized `replacements` — never interpolate.

**P7 — Tracking pixel returning 404 / using BIGINT IDs (HIGH)**
404 leaks token validity (oracle attack). BIGINT IDs are guessable for an unauthenticated endpoint. Always 200 + GIF; use `tracking_token UUID`.

**P8 — Redux caching server state (HIGH)**
`campaignsSlice` storing server data = two sources of truth. Redux holds access token + `bootstrapped` flag only. After mutations: `queryClient.invalidateQueries()`.

**Also:** `sequelize.sync()` in production, missing FK indexes, Docker without health checks, `datetime-local` timezone trap, missing `withCredentials: true`, Vitest 4.x silently auto-installed (must pin), `shared/` workspace shipping raw TS, missing `pgcrypto` extension migration.

---

## Recommended Build Order

| Phase | Delivers | Key Pitfalls to Avoid |
|-------|----------|----------------------|
| 1: Foundation & Infra | Yarn 4 monorepo (backend/frontend/shared), `@campaign/shared` Zod skeleton, Docker compose (postgres+redis+api), root scripts | M6 (PnP), M7-M9 (shared), C18 (Vitest pins), C14 (no health checks), C15 (env vars) |
| 2: Schema & Models | Sequelize models, migrations (4-state enum, FKs, cascades, indexes, `tracking_token` UUID, `pgcrypto`), seed | C8, M4, M1, C3 |
| 3: Auth | register, login, refresh, logout, /me, JWT middleware (split tokens + Redis denylist), CSRF header check | C6, C7, m2, m6 |
| 4: Campaigns + Recipients API | CRUD, cursor pagination, stats endpoint, status-guarded mutations | C10, M2, m5, C16, C1 |
| 5: Async Queue | BullMQ Queue + Worker, atomic send guard, transaction-wrapped simulation, delayed jobs for scheduling, worker status re-check on fire | C4, C5, C11, C9 |
| 6: Tracking Pixel | `GET /track/open/:trackingToken`, idempotent UPDATE, always-200 GIF | C17 |
| 7: Backend Tests | Vitest + Supertest — status-guard 409, send atomicity, stats aggregation, auth 401, cross-user 404 | C18 |
| 8: Frontend Foundation | Vite + Tailwind + shadcn + Redux + React Query + axios interceptor + bootstrap (refresh+/me) | C12, C6 (frontend half) |
| 9: Frontend Pages | Login, Campaigns list with infinite scroll, New, Detail with polling + actions | C13, m1 |
| 10: Integration & Docs | docker compose smoke test, seed demo, README ("How I Used Claude Code"), `docs/DECISIONS.md` | scope creep |

---

## Open Questions (resolved)

| # | Question | Resolution |
|---|----------|----------------|
| Q1 | `GET /auth/me` endpoint? | YES — required for token rehydration after page refresh (access token only lives in memory) |
| Q2 | Recipient deduplication: upsert or 409? | UPSERT: `INSERT ... ON CONFLICT (email) DO UPDATE RETURNING id` |
| Q3 | 4-state machine from day one? | YES — non-negotiable (PostgreSQL ENUM cannot be altered in a transaction) |
| Q4 | Token persistence across page refresh? | Access token in memory → bootstrap calls `/auth/refresh` + `/auth/me` to rehydrate; failed refresh is silent (unauthenticated) |
| Q5 | Open-tracking implementation? | Pixel endpoint with `tracking_token UUID` column on `campaign_recipients` |
| Q6 | Pagination strategy? | Cursor-based with base64url `(created_at, id)` and `useInfiniteQuery` on the frontend |
| Q7 | Test runner? | Vitest on both sides (pin 2.1.9), Supertest for HTTP, @testing-library/react for components |
| Q8 | Monorepo layout? | Flat: `backend/`, `frontend/`, `shared/` at repo root; Yarn 4 + node-modules linker |

---

*Research completed: 2026-04-20 | Updated for user choices: 2026-04-20 | Ready for roadmap: yes*
