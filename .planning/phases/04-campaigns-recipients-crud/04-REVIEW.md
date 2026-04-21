---
phase: 04-campaigns-recipients-crud
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs
  - shared/src/schemas/recipient.ts
  - backend/src/models/recipient.ts
  - shared/src/schemas/campaign.ts
  - shared/src/schemas/index.ts
  - backend/src/services/campaignService.ts
  - backend/src/services/recipientService.ts
  - backend/src/routes/campaigns.ts
  - backend/src/routes/recipients.ts
  - backend/test/smoke/camp-01-list.sh
  - backend/test/smoke/camp-02-create.sh
  - backend/test/smoke/camp-03-detail.sh
  - backend/test/smoke/camp-04-patch.sh
  - backend/test/smoke/camp-05-delete.sh
  - backend/test/smoke/camp-08-stats.sh
  - backend/test/smoke/recip-01-upsert.sh
  - backend/test/smoke/recip-02-list.sh
  - backend/test/smoke/run-all-phase4.sh
  - backend/test/smoke/run-all.sh
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 4 adds campaign and recipient CRUD on top of the JWT-auth Express/Sequelize backend established in Phase 3. The implementation is architecturally sound: offset pagination for campaigns, cursor pagination for recipients, atomic UPDATE guards on state-machine transitions, a single-SQL aggregate for stats, and the COALESCE name-preservation trick on recipient upsert. All named-replacement patterns are followed correctly — no string interpolation in raw SQL.

Four warnings require attention before the next phase. The most impactful is the `updateCampaign` handler returning `null` to the caller when the campaign vanishes between the atomic UPDATE and the final `findOne`, silently yielding `{ data: null }` to the client instead of a 404. A secondary concern is the `upsertRecipientsByEmail` helper silently omitting the `name` column, which differs from the `upsertRecipient` service (COALESCE) and could cause unexpected NULL names when campaigns share recipients with the standalone endpoint. Two additional warnings cover an unvalidated `:id` route parameter that accepts `NaN` and a missing 201 status code on the recipient upsert POST response.

---

## Warnings

### WR-01: updateCampaign returns null on mid-transaction disappearance — client gets `{ data: null }`

**File:** `backend/src/services/campaignService.ts:203`

**Issue:** After the atomic UPDATE succeeds (`results.length > 0`), the function closes with `Campaign.findOne({ where: { id: campaignId }, transaction: t })`. If the row somehow disappears between those two statements (e.g., concurrent transaction), `findOne` returns `null`. The route handler at `campaigns.ts:69` does `res.json({ data: updated })` unconditionally, so the client receives HTTP 200 with `{ "data": null }` — a silent failure. The service return type is `Promise<Campaign | null>`, which documents the null path but the route never handles it.

**Fix:**
```typescript
// campaignService.ts — end of updateCampaign transaction
const refreshed = await Campaign.findOne({ where: { id: campaignId }, transaction: t });
if (!refreshed) throw new NotFoundError('CAMPAIGN_NOT_FOUND');
return refreshed;

// Change return type to Promise<Campaign>
```
Then update the route to remove the `| null` expectation (it will always have a value or throw).

---

### WR-02: upsertRecipientsByEmail (private helper in campaignService) omits `name` column — recipients created via campaign POST always have NULL name

**File:** `backend/src/services/campaignService.ts:38-44`

**Issue:** The private `upsertRecipientsByEmail` helper inserts rows as `(user_id, email, created_at, updated_at)` with no `name` column. When the same email is later upserted via `POST /recipients` with a name, the COALESCE in `recipientService.upsertRecipient` correctly applies the name. However, any recipient first created through `createCampaign` or `updateCampaign` will have `name = NULL` with no way to carry a name through the campaign creation flow. This is consistent with the schema's optional `name` field in `CreateCampaignSchema` (no name field at all), but it creates a subtle asymmetry: recipients born via campaign creation always start nameless, even if the user later supplies a name via `/recipients`. The `ON CONFLICT DO UPDATE SET email = EXCLUDED.email` no-op (D-15) correctly returns the existing `id` on conflict — that part is correct.

This is acceptable if the product intent is that names are set only via `POST /recipients`. Document the asymmetry explicitly or enforce it in a comment to prevent future maintainers from accidentally adding a `name` column to `CreateCampaignSchema` without updating this helper.

**Fix:**
```typescript
// Add a comment above the INSERT in upsertRecipientsByEmail:
// NOTE: name is intentionally omitted — this helper is for id-resolution only.
// Recipients created here will have name=NULL until explicitly set via POST /recipients.
// Do NOT add name here without also updating CreateCampaignSchema.
```

---

### WR-03: Route handlers accept non-numeric `:id` — `Number(req.params.id)` yields `NaN` when `:id` is non-numeric, silently passed to Sequelize WHERE clause

**File:** `backend/src/routes/campaigns.ts:53,69,83,98`

**Issue:** All four campaign routes that accept `:id` do `Number(req.params.id)` without validation. When `:id` is a non-numeric string (e.g., `/campaigns/abc`), `Number('abc')` is `NaN`. Sequelize will convert `NaN` to `NULL` in the WHERE clause, causing a query like `WHERE id = NULL` which matches zero rows and surfaces as a 404 from the service — not a crash, but it's a misleading error path. A consumer calling `/campaigns/undefined` (a common JS client bug) gets 404 instead of 400, which makes debugging harder.

**Fix:**
```typescript
// Add a shared helper or inline guard in each handler:
const campaignId = Number(req.params.id);
if (!Number.isInteger(campaignId) || campaignId <= 0) {
  res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid campaign id' } });
  return;
}
```
Or add a Zod param schema and run it through the `validate` middleware.

---

### WR-04: POST /recipients returns HTTP 200 instead of 201 on new resource creation

**File:** `backend/src/routes/recipients.ts:21`

**Issue:** `res.json({ data: recipient })` defaults to HTTP 200. When a new recipient is created (not a conflict update), RFC 7231 specifies 201 Created. The smoke test at `recip-01-upsert.sh:25` asserts `"200"`, so this passes the gate, but it is semantically incorrect and inconsistent with `POST /campaigns` which returns 201. Client code that checks status codes for created-vs-updated distinctions will behave incorrectly.

The upsert nature makes a strict 201/200 split non-trivial (the SQL `RETURNING` doesn't indicate whether it was an insert or update without an `xmax` check). The pragmatic fix is to return 201 always (consistent with POST semantics) or return 200 always and document the choice. Returning 200 always is defensible for idempotent upserts.

**Fix (option A — always 201):**
```typescript
res.status(201).json({ data: recipient });
```
**Fix (option B — document the 200 choice):**
```typescript
// Intentionally 200: upsert is idempotent; caller cannot distinguish insert from update.
res.json({ data: recipient });
```
Update `recip-01-upsert.sh` line 25 to assert `"201"` if option A is chosen.

---

## Info

### IN-01: `deleteCampaign` uses `Campaign.update` (ORM) for the draft guard instead of raw SQL RETURNING — inconsistent with `updateCampaign` which uses raw SQL

**File:** `backend/src/services/campaignService.ts:221-225`

**Issue:** `updateCampaign` uses `sequelize.query` with `RETURNING id` for the atomic guard (raw SQL, fully explicit). `deleteCampaign` uses `Campaign.update(...)` which internally uses ORM-level UPDATE. Both work correctly, but the inconsistency between the two approaches in the same file makes auditing harder. The ORM path is slightly less transparent about the exact SQL being sent to Postgres.

**Suggestion:** Either standardize both to raw SQL `RETURNING` (more transparent) or note in a comment that `Campaign.update` is intentional here because delete doesn't need the returned id.

---

### IN-02: `listRecipients` passes `replacements` at `findAll` top level — Sequelize documentation shows replacements should pair with `where` literal, not top-level `findAll` options

**File:** `backend/src/services/recipientService.ts:91-106`

**Issue:** The `replacements` object is passed as a top-level option to `Recipient.findAll(...)`. Sequelize supports this but the placement is non-standard; official docs show `replacements` paired with the `where` clause object or via `sequelize.query`. The current approach works in practice with `Sequelize.literal` inside `where`, but it is not guaranteed to be stable across Sequelize minor versions and is not well-documented. The C16 invariant is correctly implemented (composite cursor with named replacements, no string interpolation), so this is a style/robustness note only.

**Suggestion:** Validate that Sequelize 6 handles this correctly in integration tests. No code change required if verified.

---

### IN-03: `recip-02-list.sh` asserts `VALIDATION_ERROR` for bad cursor, but `recipientService` throws `BadRequestError('INVALID_CURSOR')` — error code mismatch in smoke test

**File:** `backend/test/smoke/recip-02-list.sh:56`

**Issue:** Line 56 asserts `.error.code == "VALIDATION_ERROR"`. The service throws `new BadRequestError('INVALID_CURSOR')` which (per `errors.ts`) sets `code = 'INVALID_CURSOR'`, not `'VALIDATION_ERROR'`. The smoke test will FAIL at this assertion unless the error handler normalizes `BadRequestError` codes to `VALIDATION_ERROR` regardless of the constructor argument.

**Fix:** Check the error handler. If it passes through the `code` field from the error instance, change the smoke assertion:
```bash
jq -e '.error.code == "INVALID_CURSOR"' /tmp/smoke-recip02-badcursor.json >/dev/null
```
If the error handler overrides the code to `VALIDATION_ERROR` for all 400s, add a comment to `errors.ts` explaining this.

---

### IN-04: `run-all.sh` comment says "Phase 3 acceptance gate" but it runs both Phase 3 and Phase 4 scripts

**File:** `backend/test/smoke/run-all.sh:3`

**Issue:** The script header comment reads `# backend/test/smoke/run-all.sh — Phase 3 acceptance gate` but the final success banner says `Phase 3 + Phase 4 acceptance gate green` and it delegates to `run-all-phase4.sh`. The header comment was not updated. Minor documentation drift, not a correctness issue.

**Fix:**
```bash
# backend/test/smoke/run-all.sh — Phase 3 + Phase 4 acceptance gate
```

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
