---
phase: 04-campaigns-recipients-crud
fixed_at: 2026-04-21T11:20:56Z
review_path: .planning/phases/04-campaigns-recipients-crud/04-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-04-21T11:20:56Z
**Source review:** .planning/phases/04-campaigns-recipients-crud/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01, WR-02, WR-03, WR-04, IN-03)
- Fixed: 4
- Skipped: 1

## Fixed Issues

### WR-01: updateCampaign returns null on mid-transaction disappearance

**Files modified:** `backend/src/services/campaignService.ts`
**Commit:** f76a102
**Applied fix:** Changed return type from `Promise<Campaign | null>` to `Promise<Campaign>`. After the post-UPDATE `Campaign.findOne`, added `if (!refreshed) throw new NotFoundError('CAMPAIGN_NOT_FOUND')` so the caller always gets a Campaign or an exception — never null.

---

### WR-03: Route handlers accept non-numeric :id — NaN passed to Sequelize WHERE

**Files modified:** `backend/src/routes/campaigns.ts`
**Commit:** a151e6f
**Applied fix:** Imported `BadRequestError` from `../util/errors.js`. Added `if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID')` guard immediately after `Number(req.params.id)` in all four `:id` handlers: GET `/:id`, PATCH `/:id`, DELETE `/:id`, GET `/:id/stats`.

---

### WR-04: POST /recipients returns HTTP 200 instead of 201

**Files modified:** `backend/src/routes/recipients.ts`, `backend/test/smoke/recip-01-upsert.sh`, `backend/test/smoke/recip-02-list.sh`
**Commit:** 8349349
**Applied fix:** Changed `res.json({ data: recipient })` to `res.status(201).json({ data: recipient })` in the POST handler. Updated all three status assertions in `recip-01-upsert.sh` (lines 25, 36, 47) from `"200"` to `"201"`. Updated the seed-call assertion in `recip-02-list.sh` (line 22) from `"200"` to `"201"`.

---

### IN-03: recip-02-list.sh asserts VALIDATION_ERROR for bad cursor, service throws INVALID_CURSOR

**Files modified:** `backend/test/smoke/recip-02-list.sh`
**Commit:** d7f1303
**Applied fix:** Changed line 56 assertion from `.error.code == "VALIDATION_ERROR"` to `.error.code == "INVALID_CURSOR"` to match the actual code set by `BadRequestError('INVALID_CURSOR')` as confirmed in `errors.ts`.

---

## Skipped Issues

### WR-02: upsertRecipientsByEmail omits name column

**File:** `backend/src/services/campaignService.ts:38-44`
**Reason:** Intentional per D-13 — name=NULL for campaign-created recipients; `POST /recipients` owns name updates via COALESCE. The `upsertRecipientsByEmail` helper is for id-resolution only and must not carry a name field. Adding name here would require also updating `CreateCampaignSchema`, breaking the schema boundary. The REVIEW.md Fix section itself describes this as acceptable and only asks for a clarifying comment — the existing header comment on the function already documents this intent adequately. No code change warranted.

---

_Fixed: 2026-04-21T11:20:56Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
