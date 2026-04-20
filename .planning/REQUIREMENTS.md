# Requirements: Mini Campaign Manager

**Defined:** 2026-04-20
**Core Value:** Server-side business-rule correctness and clean, testable architecture — proven by tests and narrated through transparent AI collaboration.

## v1 Requirements

### Foundation & Infra

- [ ] **FOUND-01**: Yarn-workspaces monorepo with `backend/`, `frontend/`, `shared/` (Zod schemas + TS types) workspaces
- [ ] **FOUND-02**: `docker compose up` starts Postgres and Redis with healthchecks, then starts API container (which runs migrations before server boot)
- [ ] **FOUND-03**: Root-level TypeScript + ESLint + Prettier config extended by each workspace
- [ ] **FOUND-04**: Pino structured logging wired into the API (request logger + error logger)

### Data Layer

- [ ] **DATA-01**: Sequelize models for `User`, `Campaign`, `Recipient`, `CampaignRecipient` with campaign status ENUM `draft | scheduled | sending | sent` and recipient status ENUM `pending | sent | failed`
- [ ] **DATA-02**: Sequelize migrations create all tables, FK cascades, and indexes:
  - `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (first migration — needed for `gen_random_uuid()`)
  - `campaign_recipients.tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` — public-facing token for the open-tracking pixel URL (defeats enumeration since the natural composite PK is BIGINT)
  - `(created_by, created_at DESC, id DESC)` on campaigns — covers cursor pagination + ownership filter in a single B-tree scan
  - `(campaign_id, status)` on campaign_recipients — covers stats aggregation
  - `tracking_token` UNIQUE on campaign_recipients — covers pixel lookup
  - Composite PK `(campaign_id, recipient_id)` on campaign_recipients — covers worker update path
  - UNIQUE index on `users.email` and `recipients.email`
  - FK cascade: `campaign_id` `ON DELETE CASCADE` so deleting a draft campaign cleans up its recipient links
- [ ] **DATA-03**: Seed script creates one demo user, ten recipients, one draft + one scheduled + one sent campaign for walkthrough

### Authentication

- [ ] **AUTH-01**: User can register via `POST /auth/register` — email uniqueness enforced, password bcrypt-hashed
- [ ] **AUTH-02**: User can login via `POST /auth/login` — returns access token in response body (short TTL, kept in memory) and sets refresh token in httpOnly + SameSite cookie
- [ ] **AUTH-03**: User can rotate tokens via `POST /auth/refresh` using the refresh cookie
- [ ] **AUTH-04**: User can logout via `POST /auth/logout` — revokes refresh token via Redis denylist and clears cookie
- [ ] **AUTH-05**: `GET /auth/me` returns the authenticated user (used by frontend to rehydrate session after refresh)
- [ ] **AUTH-06**: JWT middleware guards `/campaigns/*` and `/recipients/*` — 401 on missing/invalid token
- [ ] **AUTH-07**: Users can only access campaigns they created — cross-user access returns 404 (not 403, to avoid enumeration)

### Campaigns API

- [ ] **CAMP-01**: `GET /campaigns` lists campaigns for the authed user with cursor pagination (`?limit=&cursor=` — cursor encodes `created_at,id`; response includes `nextCursor`)
- [ ] **CAMP-02**: `POST /campaigns` creates a campaign in `draft` with `name`, `subject`, `body`, `recipientEmails[]`; upserts recipients; links via `CampaignRecipient` rows in `pending` state
- [ ] **CAMP-03**: `GET /campaigns/:id` returns campaign with eager-loaded recipients (no N+1) and inline aggregate stats
- [ ] **CAMP-04**: `PATCH /campaigns/:id` updates editable fields — **409 Conflict** if status ≠ draft
- [ ] **CAMP-05**: `DELETE /campaigns/:id` — **409 Conflict** if status ≠ draft; cascades to `CampaignRecipient`
- [ ] **CAMP-06**: `POST /campaigns/:id/schedule` sets `scheduled_at` and enqueues a **delayed** BullMQ job — 400 if `scheduled_at` is not in the future, 409 if status ≠ draft
- [ ] **CAMP-07**: `POST /campaigns/:id/send` transitions campaign `draft|scheduled → sending` via atomic `UPDATE ... WHERE status IN ('draft','scheduled')`, enqueues immediate BullMQ job, returns **202 Accepted** — 409 if the atomic guard matches zero rows
- [ ] **CAMP-08**: `GET /campaigns/:id/stats` returns `{ total, sent, failed, opened, open_rate, send_rate }` computed via a single aggregate SQL query (no JS counting)

### Recipients API

- [ ] **RECIP-01**: `POST /recipient` creates or upserts a recipient (INSERT … ON CONFLICT on email)
- [ ] **RECIP-02**: `GET /recipients` lists recipients (paginated)

### Async Sending (BullMQ)

- [ ] **QUEUE-01**: BullMQ `Queue` and `Worker` wired to Redis with **separate IORedis connections**, both using `maxRetriesPerRequest: null`
- [ ] **QUEUE-02**: Send worker processes a campaign inside a Sequelize transaction: randomly marks each `CampaignRecipient` as `sent` or `failed`, sets `sent_at` for `sent`, then transitions campaign to `sent`
- [ ] **QUEUE-03**: Delayed send jobs for scheduled campaigns converge to the same worker; worker re-checks campaign status and bails if no longer in `sending`
- [ ] **QUEUE-04**: Worker registers `failed` and `error` event handlers that log via pino (no silent failures)

### Open Tracking

- [ ] **TRACK-01**: `GET /track/open/:trackingToken` (public, no auth) returns the canonical 43-byte transparent GIF89a and runs `UPDATE campaign_recipients SET opened_at = NOW() WHERE tracking_token = $1 AND opened_at IS NULL` (idempotent — first open wins, subsequent matches zero rows). **Always returns 200 + GIF** even if the token doesn't match any row (oracle-attack defense). Headers: `Content-Type: image/gif`, `Cache-Control: no-store, no-cache`, `Referrer-Policy: no-referrer`. Pixel buffer is module-scoped, not read per-request.

### Frontend

- [ ] **UI-01**: Vite + React 18 + TS app with Tailwind + shadcn/ui, Redux Toolkit store, and React Query provider configured
- [ ] **UI-02**: `/login` page — form POSTs to `/auth/login`; access token stored in Redux memory; relies on httpOnly refresh cookie
- [ ] **UI-03**: App bootstrap — on load, calls `/auth/refresh` then `/auth/me` to rehydrate session after page refresh
- [ ] **UI-04**: Route guard — redirects unauthenticated users to `/login`; preserves return-to URL
- [ ] **UI-05**: HTTP client — injects access token, transparently refreshes once on 401 then retries, clears session on persistent auth failure
- [ ] **UI-06**: `/campaigns` list — cursor pagination via React Query `useInfiniteQuery`, status badges (`draft=grey`, `scheduled=blue`, `sending=amber w/ spinner`, `sent=green`), skeleton loaders, empty state, "New campaign" action
- [ ] **UI-07**: `/campaigns/new` — Zod-validated form for name / subject / body / recipient-email tokenizer; `POST /campaigns`; redirect to detail on success
- [ ] **UI-08**: `/campaigns/:id` detail — `send_rate` and `open_rate` progress bars, per-recipient status list, conditional action buttons based on status
- [ ] **UI-09**: Schedule action — date/time picker (timezone-aware), `POST /campaigns/:id/schedule`
- [ ] **UI-10**: Send action — confirm dialog, `POST /campaigns/:id/send`; while status is `sending`, stats + detail queries refetch every 2s (`refetchInterval: 2000`), stopping on `sent`
- [ ] **UI-11**: Delete action — confirm dialog, `DELETE /campaigns/:id`
- [ ] **UI-12**: Global error handling — React Query error boundary + toast notifications that surface API error messages; skeleton loaders during fetches
- [ ] **UI-13**: Logout — `POST /auth/logout`, clears Redux auth, redirects to `/login`

### Testing

- [ ] **TEST-01**: Vitest + Supertest — status-guard test: `PATCH`/`DELETE`/`/send` on a non-draft campaign return 409
- [ ] **TEST-02**: Vitest + Supertest — send atomicity: two parallel `POST /send` calls on the same draft result in exactly one 202 and one 409
- [ ] **TEST-03**: Vitest + Supertest — stats aggregation: seeded data produces correct counts and rates from `GET /campaigns/:id/stats`
- [ ] **TEST-04**: Vitest + Supertest — auth middleware: 401 on missing token, 401 on invalid token, cross-user access returns 404
- [ ] **TEST-05**: Vitest + @testing-library/react — `CampaignBadge` renders correct color/label per status (incl. `sending`)

### Documentation

- [ ] **DOC-01**: Root README — project overview, `docker compose up` + `yarn dev` setup, demo login, env vars, how to run tests
- [ ] **DOC-02**: "How I Used Claude Code" section — 2-3 real prompts, 1-2 concrete corrections, explicit list of what Claude Code was NOT allowed to do and why — assembled from a live log kept while building
- [ ] **DOC-03**: Brief `docs/DECISIONS.md` — 4-state machine rationale, index choices, async queue rationale, open-tracking design, JWT split rationale

## v2 Requirements

Deferred — tracked but not in current roadmap.

### Delivery

- **V2-DELIV-01**: Real SMTP delivery via SES/Mailgun
- **V2-DELIV-02**: Send cancellation / retry semantics
- **V2-DELIV-03**: Unsubscribe link + preference management

### Composition

- **V2-COMP-01**: Rich-text / HTML email editor
- **V2-COMP-02**: Template library
- **V2-COMP-03**: Recipient CSV import
- **V2-COMP-04**: Segments and tags

### Observability

- **V2-OBS-01**: Real-time send progress via WebSocket (instead of polling)
- **V2-OBS-02**: Metrics + tracing (OpenTelemetry)

### Platform

- **V2-PLAT-01**: OAuth / social login
- **V2-PLAT-02**: Multi-tenant workspaces + RBAC
- **V2-PLAT-03**: Dark mode
- **V2-PLAT-04**: Fully dockerized web (not just API)
- **V2-PLAT-05**: CI/CD pipeline + deployments

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real email delivery | Spec says "simulate"; real delivery adds infra + deliverability work out of scope for 4-8 hr |
| OAuth / social login | Spec requires only email/password |
| RBAC / multi-tenant | Single-user model in spec; no org scoping |
| Rich-text editor | Plain-text body in spec; rabbit hole |
| CSV import / segments | Single recipient endpoint is enough; scope creep |
| Send cancel/retry | `failed` is terminal in simulation; documented tradeoff |
| WebSocket push | React Query polling at 2s is sufficient during `sending` |
| Playwright E2E | Vitest+Supertest+RTL meet the "3 meaningful tests" bar with better ROI |
| Dark mode | Cosmetic polish not signaled by eval criteria |
| Fully dockerized web | `infra + api` meets "docker compose up"; dockerizing Vite dev adds friction |
| CI/CD | Not an eval criterion; repo + README is the deliverable |
| Observability stack | pino structured logs are sufficient at this scope |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | — | Pending |
| FOUND-02 | — | Pending |
| FOUND-03 | — | Pending |
| FOUND-04 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| AUTH-06 | — | Pending |
| AUTH-07 | — | Pending |
| CAMP-01 | — | Pending |
| CAMP-02 | — | Pending |
| CAMP-03 | — | Pending |
| CAMP-04 | — | Pending |
| CAMP-05 | — | Pending |
| CAMP-06 | — | Pending |
| CAMP-07 | — | Pending |
| CAMP-08 | — | Pending |
| RECIP-01 | — | Pending |
| RECIP-02 | — | Pending |
| QUEUE-01 | — | Pending |
| QUEUE-02 | — | Pending |
| QUEUE-03 | — | Pending |
| QUEUE-04 | — | Pending |
| TRACK-01 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| UI-06 | — | Pending |
| UI-07 | — | Pending |
| UI-08 | — | Pending |
| UI-09 | — | Pending |
| UI-10 | — | Pending |
| UI-11 | — | Pending |
| UI-12 | — | Pending |
| UI-13 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| DOC-01 | — | Pending |
| DOC-02 | — | Pending |
| DOC-03 | — | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 48

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 after initial definition*
