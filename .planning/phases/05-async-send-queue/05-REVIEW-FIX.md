---
phase: 05-async-send-queue
fixed_at: 2026-04-21T00:00:00Z
review_path: .planning/phases/05-async-send-queue/05-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-04-21T00:00:00Z
**Source review:** .planning/phases/05-async-send-queue/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Split-commit hazard in `triggerSend` and `scheduleCampaign`

**Files modified:** `backend/src/services/campaignService.ts`
**Commit:** cef7f08
**Applied fix:** Wrapped `sendQueue.add(...)` in try/catch in both `triggerSend` and `scheduleCampaign`. On enqueue failure, a compensating `Campaign.update({ status: 'draft' })` rolls back the DB transition so the campaign is not permanently stranded in `sending` or `scheduled` when Redis is unavailable.

### WR-01: Worker stale-job guard not atomic (TOCTOU)

**Files modified:** `backend/src/services/sendWorker.ts`
**Commit:** 85e5661
**Applied fix:** Removed the pre-transaction `Campaign.findByPk` guard. Replaced with an atomic conditional `Campaign.update({ updatedAt: new Date() }, { where: { id, createdBy, status: 'sending' } })` inside `sequelize.transaction()`. If `guardCount === 0` the job bails cleanly without marking it failed. This closes the TOCTOU window between the old guard read and the actual DB writes.

### WR-02: `job.data.userId` not used — ownership not re-verified in worker

**Files modified:** `backend/src/services/sendWorker.ts`
**Commit:** 85e5661
**Applied fix:** Resolved as part of the WR-01 fix. The new atomic guard WHERE clause includes `createdBy: userId`, so ownership is verified at the same instant as the status check. `userId` is now destructured from `job.data` and used in the guard.

### WR-03: `scheduleCampaign` missing NaN guard before date arithmetic

**Files modified:** `backend/src/services/campaignService.ts`
**Commit:** f5699eb
**Applied fix:** Added `if (isNaN(scheduledDate.getTime())) throw new BadRequestError('INVALID_SCHEDULED_AT')` immediately after `new Date(scheduledAt)`. This ensures invalid date strings produce an explicit 400 with a named error code rather than a silent NaN delay passed to BullMQ.

---

_Fixed: 2026-04-21T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
