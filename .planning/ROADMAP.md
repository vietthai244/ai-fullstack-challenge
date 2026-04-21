# Roadmap: Mini Campaign Manager

**Created:** 2026-04-20
**Granularity:** fine (8-12 phases)
**Mode:** yolo
**Parallelization:** enabled

## Overview

Ten phases deliver a working, reviewer-runnable Mini Campaign Manager from empty repo to `docker compose up` at `http://localhost:8080`. The arc goes **foundation-first** (monorepo scaffold, schema, auth middleware) → **business logic** (campaigns/recipients CRUD, async queue, tracking pixel) → **test harness for backend correctness** → **frontend foundation then pages** → **full-stack Docker wiring and submission polish**. The backbone of the build is the 4-state campaign machine (`draft → scheduled → sending → sent`) enforced atomically in the API, verified by tests, and surfaced in the UI — every phase is a verifiable slice the reviewer could exercise on its own.

Critical path: Phases 1 → 2 → 3 → 4 → 5 are strictly sequential (each unlocks the next). Phase 6 (tracking pixel) only depends on Phase 2 (tracking_token column). Phase 7 (backend tests) depends on Phases 3-5 but can run in parallel with Phase 8 (frontend foundation). Phase 9 depends on 8. Phase 10 closes the loop by wrapping everything into the nginx-proxied full stack plus docs.

## Phases

- [ ] **Phase 1: Monorepo Foundation & Shared Schemas** - Yarn 4 flat workspaces (backend/frontend/shared), TS+ESLint+Prettier, pino logger, `@campaign/shared` Zod skeleton emitting `dist/`
- [x] **Phase 2: Schema, Migrations & Seed** - Sequelize models + migrations (4-state enum, FKs, indexes, `tracking_token UUID`, `pgcrypto`) + demo seed (completed 2026-04-20)
- [x] **Phase 3: Authentication** - Split-token JWT auth (access in memory + refresh in httpOnly cookie), Redis denylist, `/auth/*` endpoints, `authenticate` middleware (completed 2026-04-21)
- [x] **Phase 4: Campaigns & Recipients CRUD** - `/campaigns` + `/recipients` REST with offset pagination (campaigns) + cursor pagination (recipients), server-side status guards, single-SQL stats aggregate (completed 2026-04-21)
- [x] **Phase 5: Async Send Queue (Schedule + Send)** - BullMQ queue+worker, atomic send guard, transaction-wrapped simulation, delayed schedule jobs with re-check on fire (completed 2026-04-21)
- [x] **Phase 6: Open Tracking Pixel** - Public `GET /track/open/:trackingToken` returns 43-byte GIF + idempotent `opened_at` UPDATE, always-200 (oracle defense) (completed 2026-04-21)
- [x] **Phase 7: Backend Tests** - Vitest + Supertest covering status-guard 409s, concurrent-send atomicity, stats aggregation, auth 401/cross-user 404 (completed 2026-04-21)
- [ ] **Phase 8: Frontend Foundation** - Vite + React 18 + Tailwind + shadcn + Redux + React Query + axios refresh interceptor + bootstrap + route guard
- [ ] **Phase 9: Frontend Pages & Actions** - Login, campaigns list (infinite scroll), new-campaign form, detail page with polling + Schedule/Send/Delete/Logout actions + CampaignBadge test
- [ ] **Phase 10: Full Docker Stack, Integration & Docs** - Full `docker compose up` (postgres+redis+api+nginx-served web), README with demo login + "How I Used Claude Code", `docs/DECISIONS.md`

## Phase Details

### Phase 1: Monorepo Foundation & Shared Schemas
**Goal**: A Yarn 4 flat monorepo with `backend/`, `frontend/`, `shared/` workspaces where `@campaign/shared` emits compiled `dist/` and all workspaces share TypeScript, ESLint, Prettier, and pino configuration.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-04, FOUND-05
**Success Criteria** (what must be TRUE):
  1. `yarn install` from a fresh clone completes cleanly on Yarn 4 with `nodeLinker: node-modules` (no PnP), `packageManager` field pinned in root `package.json`
  2. `yarn workspaces foreach -t --all run build` topologically builds `@campaign/shared` first, producing `shared/dist/index.{js,d.ts}` that backend and frontend can import
  3. `yarn lint` and `yarn typecheck` run across all workspaces and pass on an empty scaffold
  4. Importing a Zod schema from `@campaign/shared` in both `backend/src/` and `frontend/src/` works via `workspace:*` protocol (no version-drift — `zod` declared only in `shared/package.json`)
  5. Pino + pino-http module exists in backend with request-logger and error-logger wiring (not yet mounted on a route — just the logger instance exported)
**Plans**: 4 plans

Plans:
- [x] 01-01-yarn4-workspaces-shared-scaffold-PLAN.md — Yarn 4 + .yarnrc.yml + root/shared/backend/frontend package.json skeletons + Zod schema seed (Wave 1, FOUND-01)
- [x] 01-02-root-ts-eslint-prettier-PLAN.md — tsconfig.base + per-workspace tsconfigs + ESLint flat config + Prettier + first `yarn install` (Wave 2, FOUND-04)
- [x] 01-03-pino-logger-module-PLAN.md — backend/src/util/logger.ts + httpLogger.ts (env-aware pino + pino-http middleware, not yet mounted) (Wave 2, FOUND-05)
- [x] 01-04-cross-workspace-import-proof-PLAN.md — backend + frontend index.ts import @campaign/shared; full fresh-clone acceptance gate (Wave 3, FOUND-01/04/05)

Context: Guards M6 (Yarn PnP breaks Vite/sequelize-cli), M7/M8/M9 (shared workspace drift, circular deps, non-topological build), and C18 (Vitest 2.1.9 / @vitejs/plugin-react 4.7.0 pins via root `resolutions`). `shared/` must ship `dist/` not raw `src/` — Vite optimizer chokes on TS from `node_modules`. Sets the shape that every downstream phase depends on.

---

### Phase 2: Schema, Migrations & Seed
**Goal**: PostgreSQL schema deployed via Sequelize migrations with correct FK ordering, indexes, tracking tokens, and a seeder that creates a demo user plus one campaign in each of `draft`, `scheduled`, `sent` states.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. `yarn sequelize db:migrate:undo:all && yarn sequelize db:migrate` runs cleanly in both directions against a fresh Postgres, with `CREATE EXTENSION pgcrypto` executing first
  2. `\d campaign_recipients` in `psql` shows `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()`, composite PK `(campaign_id, recipient_id)`, and FK `campaign_id ON DELETE CASCADE`
  3. Campaign status ENUM accepts exactly `draft | scheduled | sending | sent`; recipient status ENUM accepts exactly `pending | sent | failed` (both enforced at DB level)
  4. All four documented indexes exist: `campaigns(created_by, created_at DESC, id DESC)`, `campaign_recipients(campaign_id, status)`, UNIQUE on `campaign_recipients(tracking_token)`, UNIQUE on `users.email` and `recipients.email`
  5. `yarn db:seed` creates 1 demo user (password bcrypt-hashed), 10 recipients, and 3 campaigns (1 draft + 1 scheduled + 1 sent with recipient rows in `pending`/`sent`/`failed` states)
**Plans**: TBD

Context: Guards C3 (migration FK ordering — Users → Recipients → Campaigns → CampaignRecipients, with `pgcrypto` extension as the first migration), C8 (no auto FK indexes — add explicitly), M1 (cascade delete), M4 (4-state enum locked day one — Postgres ENUM cannot be altered inside a transaction), and C17's schema half (`tracking_token UUID` column for pixel unguessability). Schema is the contract every other phase reads from.

---

### Phase 3: Authentication
**Goal**: A user can register, log in, refresh tokens, call `/auth/me`, and log out, with an `authenticate` middleware that guards all protected routers and returns 404 (not 403) on cross-user access.
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. `POST /auth/register` with a new email creates a user with a bcrypt-hashed password; a duplicate email returns 409
  2. `POST /auth/login` returns `{ accessToken, user }` in the body and sets a refresh cookie with `HttpOnly; SameSite=Strict; Path=/auth/refresh`; `POST /auth/refresh` with that cookie returns a new access token and rotates the refresh `jti`, denylisting the old one in Redis
  3. `POST /auth/logout` denylists the current refresh `jti` in Redis with TTL = remaining token life and clears the cookie; a subsequent refresh with the denylisted token returns 401 and clears the cookie
  4. `GET /auth/me` with a valid `Authorization: Bearer` returns the authed user; missing or invalid token returns 401
  5. A request to any `/campaigns/*` or `/recipients/*` route without a bearer token returns 401; with a bearer token for user A accessing user B's campaign returns **404** (not 403)
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Scaffolding: docker-compose redis + Phase 3 env vars + config/env.ts + lib/redis.ts + util/errors.ts + middleware/{validate,errorHandler}.ts (Wave 1, AUTH-01..07 infra)
- [x] 03-02-PLAN.md — Primitives: lib/tokens.ts (HS256 + separate secrets + jti) + services/authService.ts (bcrypt + timing defense) + extended shared/src/schemas/auth.ts (Wave 2, AUTH-01..04)
- [x] 03-03-PLAN.md — /auth routes: register/login/refresh/logout/me with COOKIE_OPTS path=/auth + CSRF + rotation + denylist (Wave 3, AUTH-01..05)
- [x] 03-04-PLAN.md — authenticate middleware + campaigns/recipients stub routers + buildApp factory + index.ts rewrite + smoke harness + DECISIONS.md note (Wave 4, AUTH-06/07 + phase acceptance gate)

Context: Guards C6 (refresh-race + missing `withCredentials` + no-rotation + no-denylist variants — all handled by rotation + Redis denylist; frontend interceptor is Phase 8), C7 (router-level `authenticate` usage so later-added routes cannot be accidentally unprotected; `/track/*` mounts on a separate public router), m2 (startup-time `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` env check), m6 (separate secrets for access vs refresh), and the AUTH-07 "cross-user = 404 not 403" enumeration-defense convention.

---

### Phase 4: Campaigns & Recipients CRUD
**Goal**: Authenticated users can list (with offset pagination for campaigns, cursor pagination for recipients), create, read, update, and delete campaigns with server-enforced status guards; list recipients; and pull per-campaign stats computed in a single SQL aggregate.
**Depends on**: Phase 3
**Requirements**: CAMP-01, CAMP-02, CAMP-03, CAMP-04, CAMP-05, CAMP-08, RECIP-01, RECIP-02
**Success Criteria** (what must be TRUE):
  1. `GET /campaigns?page=1&limit=20` returns `{ data, pagination: { page, limit, total, totalPages } }` shape; `GET /recipients?limit=20&cursor=...` returns `{ data, nextCursor, hasMore }` with opaque base64url cursor encoding `(created_at, id)` — cursor pagination applies to recipients only
  2. `POST /campaigns` with `{ name, subject, body, recipientEmails[] }` creates a campaign in `draft`, upserts recipients via `INSERT … ON CONFLICT (user_id, email) DO UPDATE RETURNING id` inside a transaction, and creates `CampaignRecipient` rows in `pending` state — all Zod-validated at the boundary
  3. `PATCH /campaigns/:id` and `DELETE /campaigns/:id` on a non-draft campaign return **409** with `{ error: { code, message } }`; delete on a draft cascades cleanly to `CampaignRecipient` rows
  4. `GET /campaigns/:id` returns the campaign with eager-loaded recipients (single Sequelize query — no N+1) and inline `stats` sub-object
  5. `GET /campaigns/:id/stats` returns `{ total, sent, failed, opened, open_rate, send_rate }` computed by a single `COUNT(*) FILTER (WHERE …)` aggregate with `NULLIF` divide-by-zero guards; `POST /recipient` upserts by email; `GET /recipients` returns a cursor-paginated list
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Migration (add user_id FK to recipients + backfill + constraint swap) + Recipient model update + shared Zod schemas (D-26) + db:migrate [BLOCKING] (Wave 1, CAMP-01..05, CAMP-08, RECIP-01, RECIP-02 foundation)
- [x] 04-02-PLAN.md — campaignService.ts (offset list, create, detail, update, delete, computeCampaignStats) + recipientService.ts (upsert, cursor list) (Wave 2, all 8 requirements)
- [x] 04-03-PLAN.md — routes/campaigns.ts (replace stub, 6 handlers) + routes/recipients.ts (replace stub, 2 handlers) + docs/DECISIONS.md append (Wave 3, all 8 requirements)
- [x] 04-04-PLAN.md — 8 smoke scripts + run-all-phase4.sh + update run-all.sh (Wave 4, phase acceptance gate)

Context: Guards C1 (N+1 — use nested `include` for recipient detail, single aggregate for stats), C10 (status guard at service layer, not controllers — use 409 not 400), C16 (cursor bugs — applies to `GET /recipients` only; `GET /campaigns` uses offset — `(created_at, id)` tiebreaker, `Sequelize.literal` with `replacements` not string interpolation, `isNaN` validation on decoded cursor, ownership via `req.user.id` not cursor payload), M3 (stats division-by-zero — `NULLIF` + `ROUND(…, 2)`), m5 (`nextCursor: null` + `hasMore: false` explicitly on last page — recipients only). Note: `GET /campaigns` uses offset pagination (page-number UI, user override of CLAUDE.md §5) — see docs/DECISIONS.md for rationale.

---

### Phase 5: Async Send Queue (Schedule + Send)
**Goal**: A campaign can be scheduled for future auto-send or sent immediately via BullMQ; both paths transition `draft|scheduled → sending` atomically in the HTTP handler and converge on one worker that randomly marks recipients sent/failed inside a transaction before flipping the campaign to `sent`.
**Depends on**: Phase 4
**Requirements**: CAMP-06, CAMP-07, QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04
**Success Criteria** (what must be TRUE):
  1. `POST /campaigns/:id/send` on a draft returns **202** and transitions the campaign to `sending` via atomic `UPDATE … WHERE status IN ('draft','scheduled')`; two concurrent `POST /send` calls on the same campaign result in exactly one 202 and one 409 (verified via `rowCount` from the atomic guard)
  2. `POST /campaigns/:id/schedule` with a future `scheduled_at` returns 202 and enqueues a **delayed** BullMQ job (`delay = scheduled_at - now()`); past `scheduled_at` returns 400; non-draft status returns 409
  3. The BullMQ worker processes a job inside a single Sequelize transaction: fetches pending recipients, randomly marks each `sent` (with `sent_at = NOW()`) or `failed`, then transitions the campaign to `sent` — all or nothing
  4. BullMQ Queue and Worker use **separate IORedis instances**, both with `maxRetriesPerRequest: null`; `worker.on('failed')` and `worker.on('error')` handlers log via pino
  5. A delayed scheduled job that fires after the campaign was edited or deleted (worker re-checks status and bails if no longer `sending`) does not mutate recipient rows or re-transition status
**Plans**: 4 plans

Plans:
- [x] 05-01-PLAN.md — Install bullmq + create lib/queue.ts (Queue+Worker+2 IORedis instances) + services/sendWorker.ts (processSendJob processor) (Wave 1, QUEUE-01/02/03/04)
- [x] 05-02-PLAN.md — Add triggerSend()+scheduleCampaign() to campaignService.ts + ScheduleCampaignSchema to shared (Wave 2, CAMP-06/07)
- [x] 05-03-PLAN.md — Add POST /:id/send + POST /:id/schedule handlers to campaigns router + extend index.ts shutdown (Wave 3, CAMP-06/07)
- [x] 05-04-PLAN.md — Smoke scripts: camp-06-schedule.sh, camp-07-send.sh, camp-07-concurrent-send.sh, camp-worker-wait.sh + run-all-phase5.sh + update run-all.sh (Wave 4, phase acceptance gate)

Context: Guards C4 (stuck-active — never swallow processor errors; let BullMQ mark `failed`), C5 (`maxRetriesPerRequest: null` on every IORedis connection — without it, jobs silently hang under load), C9 (transaction-wrapped simulation — partial state on crash is unrecoverable otherwise), C11 (atomic guard race — `UPDATE … WHERE status IN (...)` returns `rowCount` which is the lock; double-click yields 202 + 409 deterministically).

---

### Phase 6: Open Tracking Pixel
**Goal**: A public no-auth `GET /track/open/:trackingToken` endpoint serves a 43-byte transparent GIF89a in ~1ms and idempotently records the first open per recipient in Postgres without leaking token validity to the caller.
**Depends on**: Phase 2
**Requirements**: TRACK-01
**Success Criteria** (what must be TRUE):
  1. `curl -i http://localhost:3000/track/open/<valid-uuid>` returns 200 with `Content-Type: image/gif`, `Content-Length: 43`, `Cache-Control: no-store, no-cache`, `Referrer-Policy: no-referrer`, and a 43-byte GIF89a body
  2. `curl -i http://localhost:3000/track/open/<invalid-uuid-or-garbage>` also returns 200 with the same GIF + headers — no 404, no body difference (oracle-attack defense)
  3. The route is mounted on a router that does **not** inherit `authenticate` middleware; calling it without any auth header succeeds
  4. First call with a valid token sets `opened_at = NOW()`; subsequent calls with the same token do not overwrite `opened_at` (verified by SQL `UPDATE … WHERE tracking_token = $1 AND opened_at IS NULL` matching zero rows on the second call)
  5. The pixel buffer is allocated at module scope (verified by grep — buffer is declared outside the request handler), not re-created per request
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md — track.ts route (module-scoped PIXEL buffer, idempotent UPDATE, oracle-safe handler) + app.ts mount + smoke scripts (Wave 1, TRACK-01)

Context: Guards C17 (BIGINT enumeration → use `tracking_token UUID` with 122 bits of entropy; 404 oracle leak → always 200 + GIF; idempotency race → `WHERE opened_at IS NULL` so second Gmail-proxy fetch does not overwrite; module-scoped buffer, not disk read per request). Public router must be mounted at the Express app level separately from protected routers so C7's middleware inheritance doesn't accidentally gate it.

---

### Phase 7: Backend Tests
**Goal**: Vitest + Supertest suite exercises the four highest-signal business rules (status guards, send atomicity, stats aggregation, auth boundaries) against a real Postgres + Redis in a serialized test pool, proving backend correctness without depending on the frontend.
**Depends on**: Phase 5
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `yarn workspace @campaign/backend test` runs against a real Postgres + Redis using `pool: 'forks', singleFork: true`, with `beforeEach` truncating all tables via `TRUNCATE ... RESTART IDENTITY CASCADE`
  2. Status-guard test asserts `PATCH`, `DELETE`, and `POST /send` on a `sent` or `sending` campaign each return **409** with the documented error shape (covers TEST-01)
  3. Concurrent-send atomicity test fires two parallel `POST /campaigns/:id/send` via `Promise.all` on a `draft` campaign and asserts exactly one 202 and one 409 (covers TEST-02 — guards C11)
  4. Stats aggregation test seeds a campaign with known recipient status distribution and asserts `GET /campaigns/:id/stats` returns correct `{ total, sent, failed, opened, open_rate, send_rate }` with two-decimal rounding and no divide-by-zero (covers TEST-03)
  5. Auth middleware test asserts 401 on missing token, 401 on tampered token, and 404 (not 403) on a valid token for user A accessing user B's campaign (covers TEST-04)
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Test infrastructure: install Vitest 2.1.9 + Supertest, vitest.config.ts (singleFork), globalSetup.ts, setup.ts, helpers/auth.ts, helpers/seed.ts, .env.test (Wave 1, TEST-01..04 infra)
- [x] 07-02-PLAN.md — Four test files: status-guard.test.ts (TEST-01), send-atomicity.test.ts (TEST-02), stats.test.ts (TEST-03), auth.test.ts (TEST-04) (Wave 2, TEST-01/02/03/04)

Context: Guards C18 (Vitest 2.1.9 pin via root resolutions, `singleFork` pool serialization against one shared DB, `shared/` dist already built from Phase 1 `postinstall`). App split is important — `app.ts` exports `buildApp()` factory and `index.ts` calls `buildApp().listen(PORT)` so Supertest can import without binding a port. This phase is the first deliverable that proves backend correctness and runs independently of the frontend — safe to parallelize with Phase 8.

---

### Phase 8: Frontend Foundation
**Goal**: A Vite + React 18 + Tailwind + shadcn shell boots into the app, calls `/auth/refresh` then `/auth/me` on mount to rehydrate session, wires a Redux store for the access token, a React Query provider for server state, and an axios interceptor that transparently refreshes on 401 via a memoized in-flight promise.
**Depends on**: Phase 3
**Requirements**: UI-01, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. `yarn workspace @campaign/frontend dev` starts Vite on `:5173`, renders an app shell using shadcn New York / Slate components, and the `@` path alias resolves both in Vite runtime and `tsc --noEmit`
  2. On app mount, a single `/auth/refresh` → `/auth/me` chain runs; a logged-in user lands on their destination page with `authSlice.bootstrapped = true`; a logged-out user silently falls through to unauthenticated state (no user-visible error)
  3. A protected route visited while unauthenticated redirects to `/login` and preserves the return-to URL; after successful login the user lands back on the original route
  4. `axios.defaults.withCredentials = true` is set globally; the response interceptor injects `Authorization: Bearer`, catches 401, awaits a **memoized** in-flight refresh promise (N concurrent 401s = exactly 1 network call to `/auth/refresh`), then retries the original request; persistent auth failure clears Redux and redirects to `/login`
  5. React Query `QueryClientProvider` is mounted at the root and Redux `Provider` wraps it; no server data (campaigns, recipients, stats) is stored in any Redux slice (verified by code review — only `accessToken`, `user`, `bootstrapped`, and UI flags in Redux)
**Plans**: TBD
**UI hint**: yes

Context: Guards C6's frontend half (refresh-race memoization + global `withCredentials`), C12 (Redux only holds auth token + UI flags — React Query owns server state), and locks in the boundary that downstream mutation/polling hooks in Phase 9 will rely on. jsdom polyfill stubs (`TextEncoder`, `structuredClone`, `ResizeObserver`, `matchMedia`) go in the test setup file here so component tests in Phase 9 don't break.

---

### Phase 9: Frontend Pages & Actions
**Goal**: Four pages (login, campaigns list, new campaign, detail) with status badges, infinite scroll, conditional Schedule/Send/Delete/Logout actions, live polling during `sending`, global error handling + toast + skeleton loaders, and one CampaignBadge component test.
**Depends on**: Phase 8, Phase 4, Phase 5
**Requirements**: UI-02, UI-06, UI-07, UI-08, UI-09, UI-10, UI-11, UI-12, UI-13, TEST-05
**Success Criteria** (what must be TRUE):
  1. `/login` submits to `/auth/login`, stores the access token in Redux memory (never localStorage), and redirects to `/campaigns`; `/campaigns` list uses `useInfiniteQuery` with `initialPageParam: undefined` and `getNextPageParam` reading `nextCursor`, renders status badges (draft=grey, scheduled=blue, sending=amber-with-spinner, sent=green), skeleton loaders while fetching, and an empty state when zero campaigns
  2. `/campaigns/new` is a Zod-validated form (reusing `@campaign/shared` schemas) with a comma/enter-tokenizer email input; successful submit POSTs and redirects to `/campaigns/:id`
  3. `/campaigns/:id` shows `send_rate` and `open_rate` shadcn Progress bars, per-recipient status list, and conditional action buttons: Schedule (date-time-local with `new Date(value).toISOString()` timezone conversion) + Send (confirm dialog) + Delete (confirm dialog) rendered only when server status permits
  4. While `campaign.status === 'sending'`, the detail + stats queries auto-refetch every 2s (`refetchInterval: (q) => q.state.data?.status === 'sending' ? 2000 : false`) and stop on transition to `sent`; mutations call `queryClient.invalidateQueries` on success; Logout hits `/auth/logout`, clears Redux auth, and redirects to `/login`
  5. Global React Query error handler surfaces API `error.message` via toast; every fetching state renders a shadcn Skeleton; the `CampaignBadge` Vitest + @testing-library/react test asserts all 4 status variants render the correct color class and label (covers TEST-05)
**Plans**: TBD
**UI hint**: yes

Context: Guards C13 (invalidate after every mutation; correct `refetchInterval` signature for React Query v5), m1 (exhaustive TS switch covering all 4 states — `sending` badge must not be forgotten), and the `datetime-local` timezone trap from FEATURES.md. The Schedule action must convert local time to ISO UTC before POST. This is the single largest phase — plan-phase step should split it into plans along the four pages + shared components.

---

### Phase 10: Full Docker Stack, Integration & Docs
**Goal**: `docker compose up` from a fresh clone spins up postgres + redis + api (migrations auto-run) + nginx-served web on a single host port (`8080:80`), the reviewer opens `http://localhost:8080` and exercises the full app with no CORS and no baked-in `VITE_API_URL`, and the README + `docs/DECISIONS.md` + "How I Used Claude Code" deliverables are complete.
**Depends on**: Phase 6, Phase 7, Phase 9
**Requirements**: FOUND-02, FOUND-03, DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):
  1. `docker compose up` on a fresh clone starts all four services; postgres + redis use healthchecks and the api waits for `condition: service_healthy` on both; the api container runs `yarn sequelize db:migrate && node dist/index.js` on boot; the web container uses `depends_on: api` with `condition: service_started`; only `web` binds a host port (`8080:80`) — no port collision possible
  2. Browser GET `http://localhost:8080/` serves the compiled SPA; requests to `/api/auth/login` and `/track/open/<uuid>` are reverse-proxied by nginx to `api:3000` with `try_files $uri /index.html` SPA fallback intact — no CORS headers needed because everything is single-origin; `VITE_API_URL` is **not** referenced anywhere in the built bundle
  3. `docker compose up` followed by `docker compose exec api yarn db:seed` produces the demo user documented in README; logging in as that user in the browser shows the 3 seeded campaigns (draft/scheduled/sent) and all happy-path flows work end-to-end (create → schedule → send → watch polling → open pixel via curl)
  4. Root README documents: one-command setup, demo login creds, env vars (`.env.example`), how to run tests, and the optional `yarn workspace @campaign/frontend dev` HMR flow (Vite dev server with `server.proxy` forwarding `/api` to dockerized backend on `:8080`) — covers DOC-01
  5. `docs/DECISIONS.md` covers 4-state-machine rationale, index choices, async queue rationale, open-tracking design, JWT split rationale (5 short sections); README includes a "How I Used Claude Code" section with 2-3 real prompts + 1-2 concrete corrections + an explicit out-of-bounds list — both assembled from a live log kept while building (covers DOC-02, DOC-03)
**Plans**: TBD
**UI hint**: yes

Context: Postgres + Redis + api containers were scaffolded locally in earlier phases using direct commands (local Postgres + `yarn dev` for the api) — this phase wires them into the compose file for the first time alongside the web container. Guards C14 (health checks are mandatory for the api's db/redis deps — without them parallel startup causes migration failures), C15 (DB host inside Docker is service name `postgres` not `localhost`; env vars via `env_file: .env`). The "How I Used Claude Code" deliverable requires authenticity — the log must be captured *during* build, not reconstructed at the end.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 (Phase 6 can run in parallel with Phase 5; Phase 7 can run in parallel with Phase 8; Phase 10 comes last).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo Foundation & Shared Schemas | 4/4 | Complete | 2026-04-20 |
| 2. Schema, Migrations & Seed | 4/4 | Complete   | 2026-04-20 |
| 3. Authentication | 4/4 | Complete | 2026-04-21 |
| 4. Campaigns & Recipients CRUD | 4/4 | Complete | 2026-04-21 |
| 5. Async Send Queue (Schedule + Send) | 4/4 | Complete | 2026-04-21 |
| 6. Open Tracking Pixel | 0/1 | Planned | - |
| 7. Backend Tests | 0/2 | Planned | - |
| 8. Frontend Foundation | 0/TBD | Not started | - |
| 9. Frontend Pages & Actions | 0/TBD | Not started | - |
| 10. Full Docker Stack, Integration & Docs | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-20*
*Last updated: 2026-04-21 — Phase 7 planned (2 plans)*
