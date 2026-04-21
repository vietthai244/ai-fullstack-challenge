---
phase: 04-campaigns-recipients-crud
gathered: 2026-04-21
status: ready-for-planning
---

# Phase 4: Campaigns & Recipients CRUD — Context

<domain>
## Phase Boundary

Authenticated users can list (with cursor pagination), create, read, update, and delete campaigns with server-enforced status guards; list recipients; upsert recipients by email; and pull per-campaign stats computed in a single SQL aggregate.

**In scope (REQUIREMENTS.md):** CAMP-01, CAMP-02, CAMP-03, CAMP-04, CAMP-05, CAMP-08, RECIP-01, RECIP-02

**Explicitly out of scope (belongs to other phases):**
- CAMP-06 schedule endpoint → Phase 5
- CAMP-07 send endpoint → Phase 5
- BullMQ queue/worker → Phase 5
- Open tracking pixel → Phase 6
- Automated test suite → Phase 7
</domain>

<decisions>
## Implementation Decisions

### Recipient data model (scope = per-user)

- **D-01:** Recipients are **per-user**. `recipients.user_id` FK + `UNIQUE(user_id, email)` replaces the current global `UNIQUE(email)`.
- **D-02:** Phase 4 ships a new migration `20260421xxxxxx-add-user-id-to-recipients.cjs` that:
  1. Adds `user_id BIGINT NOT NULL` FK → `users(id) ON DELETE CASCADE`.
  2. Backfills existing seed rows (created in Phase 2) to the demo user's id.
  3. Drops the old `UNIQUE(email)` constraint and adds `UNIQUE(user_id, email)`.
  4. Adds index on `recipients(user_id)` for list queries.
- **D-03:** Cross-user access to a recipient (user A fetches user B's recipient id) returns **404** (AUTH-07 precedent), not 403.
- **D-04:** `GET /recipients` filters by `req.user.id`. Uses the same cursor-pagination shape as `GET /campaigns` (base64url `{created_at, id}`, `Sequelize.literal` with `:replacements`, no string interpolation — C16).

### PATCH /campaigns/:id (editable fields)

- **D-05:** Accepts `{name?, subject?, body?, recipientEmails?}`. All optional. At least one must be present (Zod refinement).
- **D-06:** If `recipientEmails` is provided, server does a **full replace** inside a transaction:
  1. Upsert each email to `recipients` table under `req.user.id` (see D-10).
  2. Insert new `campaign_recipients` rows for emails not already linked.
  3. Delete `campaign_recipients` rows whose recipient is no longer in the list.
  4. All in a single Sequelize `sequelize.transaction()` block.
- **D-07:** If `recipientEmails` is omitted, CampaignRecipient rows are untouched — text-only update.
- **D-08:** `status ≠ draft` → **409 Conflict** via atomic guard at the **service layer** (C10). Controllers just call the service and forward errors.

### Stats computation strategy

- **D-09:** One shared service function `computeCampaignStats(campaignId, { transaction? })` owns the aggregate SQL.
  - Returns `{ total, sent, failed, opened, open_rate, send_rate }`.
  - Single `SELECT COUNT(*) FILTER (WHERE status = 'sent') AS sent, ... FROM campaign_recipients WHERE campaign_id = :id` query.
  - `open_rate = ROUND(opened::numeric / NULLIF(total, 0), 2)` — guards divide-by-zero (M3).
  - `send_rate = ROUND((sent + failed)::numeric / NULLIF(total, 0), 2)`.
- **D-10:** `GET /campaigns/:id` eager-loads recipients (nested `include` — C1, no N+1) AND calls `computeCampaignStats(id)` once. Response shape: `{ data: { ...campaign, recipients: [...], stats: {...} } }`.
- **D-11:** `GET /campaigns/:id/stats` returns `{ data: {...stats} }` from the same service fn. Same SQL, same guarantees — no risk of divergence.

### Recipient upsert semantics

- **D-12:** `recipientEmails` is `string[]` — plain emails, no name on the request. Zod validates each as email.
- **D-13:** `POST /campaigns` and `PATCH /campaigns/:id` run `INSERT INTO recipients (user_id, email) VALUES ... ON CONFLICT (user_id, email) DO NOTHING RETURNING id` inside the tx. Existing recipients keep their stored `name` untouched; new recipients are created with `name = NULL`.
- **D-14:** `POST /recipient` (RECIP-01) is the **only** endpoint that sets/updates `name`. Accepts `{email, name?}`. Does `INSERT ... ON CONFLICT (user_id, email) DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)` — only overwrites when name explicitly provided.
- **D-15:** The upsert in POST/PATCH campaigns must return `id` for every email in the input (both inserted and pre-existing). Since `DO NOTHING` does not return existing rows, use `ON CONFLICT (user_id, email) DO UPDATE SET email = EXCLUDED.email RETURNING id` (no-op update trick) OR a follow-up `SELECT id FROM recipients WHERE user_id = :uid AND email = ANY(:emails)`. Planner to pick — both work, first is one query, second is more readable.

### Cursor pagination (locked — all C16 pitfalls)

- **D-16:** Cursor format: `base64url(JSON.stringify({ cAt: created_at_iso, cId: id_string }))`. Opaque to client.
- **D-17:** Cursor query uses `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with `replacements: { cAt, cId }` — no string interpolation.
- **D-18:** Ownership scoping is NEVER in the cursor payload — always `where: { user_id: req.user.id }` on the query. Cursor only encodes positional fields.
- **D-19:** On last page, response is `{ data: [...], nextCursor: null, hasMore: false }` — explicit, not undefined (m5).
- **D-20:** Malformed cursor (bad base64, JSON parse fail, `isNaN(id)`, invalid ISO) → 400 `INVALID_CURSOR`. Do NOT silently fall back to page 1.
- **D-21:** Default `limit = 20`, max `limit = 100`. Zod-validated as `.int().positive().max(100)`.

### Route + service organization

- **D-22:** Route files: `backend/src/routes/campaigns.ts` (replace Phase 3 stub), `backend/src/routes/recipients.ts` (replace Phase 3 stub).
- **D-23:** Service layer: `backend/src/services/campaignService.ts` (owns all business rules + tx boundaries + 409 atomic guards), `backend/src/services/recipientService.ts` (list + upsert by email).
- **D-24:** Controllers are thin — parse via `validate(schema, source)` middleware (Phase 3), call service, forward errors via `catch (err) { next(err); }`. No inline error shaping (tail errorHandler owns that — Phase 3 decision).
- **D-25:** Status-transition guards live in the service, enforced via atomic `UPDATE campaigns SET ... WHERE id = :id AND user_id = :uid AND status = 'draft' RETURNING *`. If zero rows returned → throw `ConflictError('CAMPAIGN_NOT_EDITABLE')` (C10, C11 precedent — matches Phase 5's atomic send pattern).

### Zod schemas (add to shared)

- **D-26:** `@campaign/shared` adds: `CreateCampaignSchema`, `UpdateCampaignSchema`, `CampaignSchema`, `CampaignDetailSchema`, `CampaignListItemSchema`, `StatsSchema`, `CursorPageSchema` (generic), `CreateRecipientSchema`, `RecipientSchema`, `RecipientListSchema`.
- **D-27:** After adding schemas, run `yarn workspace @campaign/shared build` to rebuild `dist/` (same pattern as Phase 3 plan 02).

### Claude's Discretion

- Exact Sequelize query shape for the upsert-returning-id problem (D-15) — both options listed, planner picks one.
- Whether to inline or extract the cursor encode/decode helpers (planner call based on reuse in Phase 5 delayed-job status endpoint).
- Index strategy beyond the required `recipients(user_id)` and Phase 2's existing indexes — add only if EXPLAIN shows a seq scan on realistic data.
</decisions>

<specifics>
## Specific Ideas

- **Request/response contract** is strict: every response wrapped in `{ data: ... }` (matches Phase 3). Errors are `{ error: { code, message } }`.
- **Atomic update guards** are the single most important correctness property — the business-rule test matrix in Phase 7 (TEST-01..04) will hammer concurrent PATCH/DELETE/send. The service layer's `UPDATE ... WHERE status = 'draft' RETURNING` pattern is the defense.
- **Transaction boundary** for POST /campaigns: (1) upsert recipients, (2) create campaign, (3) insert campaign_recipients in one `INSERT ... SELECT` or batched insert. Wrap in `sequelize.transaction()`.
- **Cursor pagination is the reviewer's tripwire** — C16 lists 4 specific bugs. Tests must prove no-skip / no-dupe at `created_at` collision boundaries.
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before proceeding.**

### Project guardrails
- `./CLAUDE.md` — Stack locks (Yarn 4 workspaces, Sequelize 6, cursor format, atomic UPDATE patterns, status machine, 409 not 400)
- `.planning/PROJECT.md` — Core value, validated-vs-active requirements, deferred-idea discipline
- `.planning/REQUIREMENTS.md` — CAMP-01..05, CAMP-08, RECIP-01, RECIP-02 acceptance criteria
- `.planning/ROADMAP.md` — Phase 4 section with success criteria + context (C1, C10, C16, M3, m5 citations)

### Pitfalls catalog (read line-by-line for Phase 4 items)
- `.planning/research/PITFALLS.md` — C1 (N+1), C10 (status guard layer), C11 (atomic UPDATE RETURNING), C16 (cursor bugs: id tiebreaker, Sequelize.literal replacements, ownership outside cursor, explicit nulls on last page), M3 (stats divide-by-zero), m5 (nextCursor: null on last page)

### Prior phase artifacts (Phase 4 builds directly on these)
- `backend/src/db/index.ts` — Sequelize singleton + models registry (Phase 2)
- `backend/src/middleware/authenticate.ts` — Bearer guard, sets `req.user = {id, email}` (Phase 3)
- `backend/src/middleware/validate.ts` — Zod validation middleware `validate(schema, source)` (Phase 3)
- `backend/src/util/errors.ts` — `HttpError`, `ConflictError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`, `BadRequestError` (Phase 3)
- `backend/src/middleware/errorHandler.ts` — Tail `{ error: { code, message } }` formatter (Phase 3)
- `backend/src/routes/campaigns.ts` + `backend/src/routes/recipients.ts` — Phase 3 stubs with `router.use(authenticate)` — Phase 4 replaces bodies
- `backend/src/db/models/` — Campaign, Recipient, CampaignRecipient Sequelize models (Phase 2)
- `backend/src/migrations/20260101000002-create-recipients.cjs` — Existing schema that Phase 4 will modify
- `shared/src/schemas/` — RegisterSchema, LoginSchema, AuthUserSchema etc. (Phases 1+3) — pattern for adding CAMP/RECIP schemas

### Reviewer-facing docs
- `.docs/requirements.md` — Original take-home spec (DO NOT MODIFY — source of truth anchor)
- `docs/DECISIONS.md` — Senior-flex rationale (Phase 3 added Path=/auth cookie note; Phase 4 should append the per-user-recipients + migration rationale)
</canonical_refs>

<deferred>
## Deferred Ideas

- **Recipient object API** (name on request) — `recipientEmails` stays as `string[]` for v1. If the frontend needs to capture names during campaign creation, add a v2 endpoint `POST /recipients/bulk` or accept `{email, name?}` objects. Not in v1 scope per PROJECT.md.
- **Add/remove recipient ops** on PATCH — v1 does full replace. If large recipient lists become a problem, a v2 `PATCH /campaigns/:id/recipients` with add/remove deltas can land in a future phase. Captured in PROJECT.md v2 section if user confirms.
- **Recipient search / filter** on GET /recipients — no `?q=` or tag filter in v1. Pagination only.
- **Stats caching / materialized view** — v1 recomputes on every request. If stats endpoint becomes hot, add a `stats_cache` table or materialized view in a later phase.
</deferred>

---

*Phase: 04-campaigns-recipients-crud*
*Context gathered: 2026-04-21*
*Next: `/gsd-plan-phase 4` — researcher reads this, produces RESEARCH.md, then planner creates PLAN.md files.*
