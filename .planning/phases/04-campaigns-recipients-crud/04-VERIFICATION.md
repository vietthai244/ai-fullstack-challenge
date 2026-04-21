---
phase: 04-campaigns-recipients-crud
verified: 2026-04-21T00:00:00Z
status: human_needed
score: 7/8 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "GET /campaigns returns cursor pagination (REQUIREMENTS.md CAMP-01)"
    reason: "Phase context (04-CONTEXT.md D-16) explicitly revised CAMP-01 to use offset pagination with page-number UI before planning began. DECISIONS.md documents the override with full rationale. The REQUIREMENTS.md traceability table still shows CAMP-01 as belonging to Phase 4, but the phase goal itself (per ROADMAP and CONTEXT) describes offset pagination. The deviation is intentional, documented, and the response shape { data, pagination: { page, limit, total, totalPages } } is fully implemented and tested."
    accepted_by: "verifier"
    accepted_at: "2026-04-21T00:00:00Z"
gaps: []
deferred: []
human_verification:
  - test: "Run backend smoke suite against a running server"
    expected: "bash backend/test/smoke/run-all-phase4.sh exits 0 for all 8 scripts"
    why_human: "Server must be running (yarn dev + docker postgres + redis). Cannot verify live HTTP behavior without executing the stack."
  - test: "Verify recip-02-list.sh bad-cursor assertion (line 56) against live server"
    expected: "GET /recipients?cursor=badbase64!!! returns { error: { code: 'INVALID_CURSOR' } } (HTTP 400). The smoke script asserts VALIDATION_ERROR — this may be wrong and will fail the smoke run if so."
    why_human: "This is a static discrepancy (script asserts VALIDATION_ERROR; service throws BadRequestError('INVALID_CURSOR') which serializes to code='INVALID_CURSOR'). Confirm actual HTTP response to determine if the script assertion is broken. If broken, the script must be patched before the acceptance gate can pass."
  - test: "Verify camp-04-patch.sh and camp-05-delete.sh 409 path against seed data"
    expected: "A non-draft (sent/scheduled) campaign exists in the DB via Phase 2 seed so the 409 conditional branch executes. If no non-draft exists, scripts emit WARN and skip the 409 assertion."
    why_human: "Script has a conditional guard: only runs the 409 assertion when a non-draft campaign is found. The 409 business rule is verified by code review but the smoke test path depends on seed state."
---

# Phase 4: Campaigns & Recipients CRUD Verification Report

**Phase Goal:** Authenticated users can list (offset pagination, page-number UI), create, read, update, and delete campaigns with server-enforced status guards; list recipients (cursor-paginated); upsert recipients by email; and pull per-campaign stats computed in a single SQL aggregate.
**Verified:** 2026-04-21
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /campaigns returns { data, pagination: { page, limit, total, totalPages } } — offset, not cursor | PASSED (override) | `listCampaigns` uses `findAndCountAll` + offset. Route returns `{ data, pagination }`. Override: CAMP-01 spec in REQUIREMENTS.md says cursor, but phase context D-16 and DECISIONS.md explicitly revised to offset before planning. Fully documented. |
| 2 | POST /campaigns creates draft campaign with recipient upsert in a transaction | VERIFIED | `createCampaign` wraps upsertRecipientsByEmail + Campaign.create + CampaignRecipient.bulkCreate in `sequelize.transaction()`. |
| 3 | GET /campaigns/:id returns campaign with eager-loaded recipients AND inline stats | VERIFIED | `getCampaignDetail` uses nested `include` (CampaignRecipient → Recipient) then calls `computeCampaignStats`. Returns `{ ...campaign.toJSON(), stats }`. |
| 4 | PATCH /campaigns/:id on non-draft status returns 409 with code CAMPAIGN_NOT_EDITABLE | VERIFIED | `updateCampaign` uses atomic `UPDATE WHERE status='draft' RETURNING id`; zero rows → `throw new ConflictError('CAMPAIGN_NOT_EDITABLE')`. ErrorHandler serializes ConflictError as `{ error: { code: 'CAMPAIGN_NOT_EDITABLE' } }` HTTP 409. |
| 5 | DELETE /campaigns/:id on non-draft returns 409; cascade removes CampaignRecipient rows | VERIFIED | `deleteCampaign` wraps findOne + `Campaign.update WHERE status='draft'` + `Campaign.destroy` in single transaction. Zero update rows → `ConflictError`. FK CASCADE on `campaign_id ON DELETE CASCADE` (Phase 2 migration) handles CampaignRecipient cleanup. |
| 6 | GET /campaigns/:id/stats returns { total, sent, failed, opened, open_rate, send_rate } using SQL COUNT(*) FILTER aggregate | VERIFIED | `computeCampaignStats` uses single SQL with 5× `COUNT(*) FILTER (WHERE ...)` + `NULLIF` divide-by-zero guard + `ROUND`. Zero JS counting. Returns parsed int/float/null values. |
| 7 | POST /recipient upserts by email, preserves name via COALESCE | VERIFIED | `upsertRecipient` uses `INSERT ... ON CONFLICT (user_id, email) DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)`. Existing name preserved when `name=null` provided. |
| 8 | GET /recipients returns cursor-paginated list with { data, nextCursor, hasMore } | VERIFIED | `listRecipients` uses `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with replacements. Returns `{ data, nextCursor, hasMore }` with explicit `null` on last page. |

**Score:** 8/8 truths verified (1 via documented override, 7 directly)

---

### Deferred Items

None.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs` | Add user_id FK + backfill + constraint swap | VERIFIED | File exists. 6-step up(): addColumn nullable → backfill → changeColumn NOT NULL → removeConstraint old → addConstraint composite → addIndex. Correct down(). |
| `backend/src/models/recipient.ts` | userId attribute + belongsTo User association | VERIFIED | `userId: number` in interface + declare + init column. `Recipient.belongsTo(models.User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' })` present. |
| `shared/src/schemas/campaign.ts` | CreateCampaignSchema, UpdateCampaignSchema, OffsetPageQuerySchema, CursorPageQuerySchema, StatsSchema, CampaignSchema | VERIFIED | All 6 schemas present, exported, with correct Zod shapes. UpdateCampaignSchema has `.refine()` requiring at least one field. |
| `shared/src/schemas/recipient.ts` | CreateRecipientSchema, RecipientSchema | VERIFIED | Both schemas present. CreateRecipientSchema: `{ email: z.string().email().max(320), name: z.string().min(1).max(200).optional() }`. |
| `shared/src/schemas/index.ts` | Re-exports all three schema files | VERIFIED | `export * from './recipient.js'` present alongside auth and campaign exports. |
| `backend/src/services/campaignService.ts` | 6 exported functions, stats SQL, atomic guards | VERIFIED | 6 exported async functions confirmed. 5× `FILTER (WHERE` in SQL. 4× ConflictError. 2× NULLIF. EXCLUDED.email present. |
| `backend/src/services/recipientService.ts` | upsertRecipient (COALESCE) + listRecipients (cursor) | VERIFIED | COALESCE(EXCLUDED.name, recipients.name) present. Sequelize.literal composite cursor. 4× INVALID_CURSOR guards. No offset in listRecipients. |
| `backend/src/routes/campaigns.ts` | 6 routes, router-level authenticate, offset pagination | VERIFIED | 6 route handlers (GET /, POST /, GET /:id, PATCH /:id, DELETE /:id, GET /:id/stats). `campaignsRouter.use(authenticate)` at router level. OffsetPageQuerySchema on list. No cursor/nextCursor code. |
| `backend/src/routes/recipients.ts` | 2 routes, router-level authenticate, cursor pagination | VERIFIED | 2 route handlers (POST /, GET /). `recipientsRouter.use(authenticate)` at router level. CursorPageQuerySchema on GET. Returns `{ data, nextCursor, hasMore }`. |
| `docs/DECISIONS.md` | Offset pagination rationale + per-user recipients rationale appended | VERIFIED | Both sections present: "Per-User Recipients (Phase 4)" and "Campaign List Pagination: Offset over Cursor (Phase 4)". |
| `backend/test/smoke/run-all-phase4.sh` | Phase 4 acceptance gate | VERIFIED | File exists. Chains all 8 camp/recip smoke scripts. |
| `backend/test/smoke/run-all.sh` | Updated to call run-all-phase4.sh | VERIFIED | "--- Phase 4: Campaigns & Recipients CRUD ---" + `bash "$HERE/run-all-phase4.sh"` present at line 28-29. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `campaigns.ts` route | `campaignService.ts` | `import * as campaignService` | WIRED | All 6 handlers call campaignService.* functions. |
| `recipients.ts` route | `recipientService.ts` | `import * as recipientService` | WIRED | Both handlers call recipientService.* functions. |
| `campaignService.ts` | `sequelize / Campaign / CampaignRecipient / Recipient` | `import from '../db/index.js'` | WIRED | All 4 model + sequelize imports present; used in every function. |
| `computeCampaignStats` | `campaign_recipients` table | `sequelize.query COUNT(*) FILTER` | WIRED | SQL targets `campaign_recipients WHERE campaign_id = :campaignId`. |
| `upsertRecipientsByEmail` | `recipients` table | `ON CONFLICT (user_id, email) DO UPDATE SET email = EXCLUDED.email RETURNING id` | WIRED | D-15 no-op trick confirmed in source. |
| `upsertRecipient` | `recipients` table | `ON CONFLICT (user_id, email) DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)` | WIRED | D-14 COALESCE confirmed in source. |
| `listRecipients` cursor | `Recipient.findAll` | `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` | WIRED | C16-compliant cursor with named replacements; no string interpolation. |
| `campaignsRouter` | `app.ts` | `app.use('/campaigns', campaignsRouter)` | WIRED | Mounted at line 52 of app.ts. |
| `recipientsRouter` | `app.ts` | `app.use('/recipients', recipientsRouter)` | WIRED | Mounted at line 53 of app.ts. |
| `authenticate` middleware | both routers | `router.use(authenticate)` | WIRED | Both campaign and recipient routers apply authenticate at router level (C7 pattern). |
| `ConflictError('CAMPAIGN_NOT_EDITABLE')` | `errorHandler` | HttpError → `{ error: { code, message } }` | WIRED | errorHandler.ts: `if (err instanceof HttpError) res.status(err.status).json({ error: { code: err.code, message } })`. ConflictError sets status=409, code='CAMPAIGN_NOT_EDITABLE'. |
| `shared/dist` | `campaignService.ts` + route files | `import from '@campaign/shared'` | WIRED | dist/schemas/campaign.js contains all schemas. dist/index.js re-exports via `export * from './schemas/index.js'`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `GET /campaigns` | `result.data, result.pagination` | `Campaign.findAndCountAll` with `WHERE createdBy=userId` + `OFFSET` | Yes — DB query with ownership filter | FLOWING |
| `GET /campaigns/:id` | `campaign` + `stats` | `Campaign.findOne` with nested include + `computeCampaignStats` SQL | Yes — DB join + aggregate | FLOWING |
| `GET /campaigns/:id/stats` | `campaign.stats` | `getCampaignDetail` → `computeCampaignStats` | Yes — `COUNT(*) FILTER` aggregate SQL | FLOWING |
| `GET /recipients` | `data, nextCursor, hasMore` | `Recipient.findAll` with cursor condition + ownership | Yes — DB query with composite cursor | FLOWING |
| `POST /campaigns` | `campaign` | `sequelize.transaction`: upsert recipients → Campaign.create → CampaignRecipient.bulkCreate | Yes — transactional writes | FLOWING |
| `POST /recipient` | `rows[0]` | Raw SQL `INSERT ... ON CONFLICT ... RETURNING` | Yes — DB upsert returning full row | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires running server (yarn dev + docker). Tests are smoke scripts that must be run against a live API. See Human Verification section.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CAMP-01 | 04-01, 04-02, 04-03 | GET /campaigns — list with pagination | SATISFIED (override) | Implemented as offset pagination. REQUIREMENTS.md specifies cursor, but phase context D-16 and DECISIONS.md document the revision to offset. Override accepted. |
| CAMP-02 | 04-01, 04-02, 04-03 | POST /campaigns — creates draft, upserts recipients, links CampaignRecipient | SATISFIED | `createCampaign` transaction: upsertRecipientsByEmail → Campaign.create(draft) → CampaignRecipient.bulkCreate(pending). |
| CAMP-03 | 04-01, 04-02, 04-03 | GET /campaigns/:id — eager-loaded recipients + inline stats | SATISFIED | `getCampaignDetail`: nested include (CampaignRecipient + Recipient) + computeCampaignStats. No N+1. |
| CAMP-04 | 04-01, 04-02, 04-03 | PATCH /campaigns/:id — 409 if non-draft | SATISFIED | Atomic `UPDATE WHERE status='draft' RETURNING`; 0 rows → `ConflictError('CAMPAIGN_NOT_EDITABLE')` → HTTP 409. |
| CAMP-05 | 04-01, 04-02, 04-03 | DELETE /campaigns/:id — 409 if non-draft; cascade on draft | SATISFIED | Transaction: findOne + update guard + destroy. FK CASCADE handles CampaignRecipient rows. |
| CAMP-08 | 04-01, 04-02, 04-03 | GET /campaigns/:id/stats — single SQL aggregate | SATISFIED | `computeCampaignStats`: 5× `COUNT(*) FILTER`, NULLIF guard, ROUND. No JS counting. Returns { total, sent, failed, opened, open_rate, send_rate }. |
| RECIP-01 | 04-01, 04-02, 04-03 | POST /recipient — upsert by email, COALESCE name | SATISFIED | `upsertRecipient`: `ON CONFLICT DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)`. |
| RECIP-02 | 04-01, 04-02, 04-03 | GET /recipients — cursor-paginated | SATISFIED | `listRecipients`: composite cursor, Sequelize.literal, { data, nextCursor, hasMore }. |

**No orphaned requirements.** REQUIREMENTS.md maps exactly CAMP-01, CAMP-02, CAMP-03, CAMP-04, CAMP-05, CAMP-08, RECIP-01, RECIP-02 to Phase 4 — all 8 are claimed by plans and verified.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/test/smoke/recip-02-list.sh` | 56 | `jq -e '.error.code == "VALIDATION_ERROR"'` asserts wrong error code for bad cursor | WARNING | The service throws `BadRequestError('INVALID_CURSOR')` which serializes to `{ error: { code: 'INVALID_CURSOR' } }`. The smoke assertion checks `VALIDATION_ERROR`. This assertion will fail when run against the live server. Needs human confirmation and likely a patch to the smoke script. |
| `backend/test/smoke/camp-04-patch.sh` | 53-64 | 409 path is conditional — only runs when non-draft campaign exists in DB | INFO | WARN message emitted if no non-draft campaign found. Business rule is correct in the service; smoke test path depends on seed state. Low impact — Phase 2 seed creates a sent campaign which should cover this. |
| `backend/test/smoke/camp-05-delete.sh` | (same pattern) | 409 path conditional on seed state | INFO | Same seed-dependency as camp-04. |

No blockers in production code. The anti-pattern in recip-02-list.sh is a test-only bug.

---

### Human Verification Required

#### 1. Full Smoke Suite Run

**Test:** Start services (`docker compose up -d postgres redis`, `yarn workspace @campaign/backend db:migrate && db:seed`, `yarn workspace @campaign/backend dev`), then run `bash backend/test/smoke/run-all-phase4.sh`
**Expected:** All 8 scripts report PASS. Exit code 0.
**Why human:** Requires running server stack. Cannot verify HTTP responses statically.

#### 2. Bad-Cursor Error Code Assertion (recip-02-list.sh line 56)

**Test:** Run `bash backend/test/smoke/recip-02-list.sh` against the live server. Observe the HTTP response for `GET /recipients?cursor=badbase64!!!`.
**Expected:** Server returns `{ "error": { "code": "INVALID_CURSOR", ... } }` (HTTP 400). The smoke script currently asserts `VALIDATION_ERROR`. If the script fails on this assertion, patch line 56 of `recip-02-list.sh` from `VALIDATION_ERROR` to `INVALID_CURSOR`.
**Why human:** The static code review shows a mismatch between the service error code (`INVALID_CURSOR` via `BadRequestError('INVALID_CURSOR')`) and the smoke script assertion (`VALIDATION_ERROR`). Exact live behavior must be confirmed — it is possible the `validate` middleware or some other layer changes the code, but code review indicates it should not.

#### 3. CAMP-04 / CAMP-05 409 Path Against Seed Data

**Test:** Confirm Phase 2 seed data creates at least one non-draft (sent or scheduled) campaign for the demo user. Run camp-04-patch.sh and camp-05-delete.sh and verify the 409 branch executes (not just the WARN bypass).
**Expected:** Scripts report the 409 assertion was exercised, not just the WARN fallback.
**Why human:** Depends on live DB state after seeding.

---

### Gaps Summary

No blocking gaps in production code. All 8 requirements are implemented and wired.

One WARNING item requires human confirmation: the smoke script `recip-02-list.sh` line 56 asserts `VALIDATION_ERROR` for a bad cursor but the service emits code `INVALID_CURSOR`. If confirmed broken, this is a one-line smoke script fix — it does not affect the production implementation correctness.

The CAMP-01 deviation (offset vs. cursor pagination) is a documented, intentional override recorded in DECISIONS.md and the phase context file before planning began. It is accepted as-is.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
