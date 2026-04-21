---
phase: 05-async-send-queue
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - backend/src/lib/queue.ts
  - backend/src/services/sendWorker.ts
  - backend/src/services/campaignService.ts
  - backend/src/routes/campaigns.ts
  - backend/src/index.ts
  - shared/src/schemas/campaign.ts
  - backend/test/smoke/05-send-queue/camp-06-schedule.sh
  - backend/test/smoke/05-send-queue/camp-07-send.sh
  - backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh
  - backend/test/smoke/05-send-queue/camp-worker-wait.sh
  - backend/test/smoke/05-send-queue/run-all-phase5.sh
  - backend/test/smoke/run-all.sh
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 5 introduces BullMQ async send/schedule with solid structural foundations: separate IORedis connections with `maxRetriesPerRequest: null` on both (C5 compliant), mandatory `failed`/`error` listeners on the worker (QUEUE-04), and an atomic `UPDATE WHERE status IN (...)` guard in `triggerSend` (C11 compliant). The smoke test suite covers the expected happy-path, duplicate-send 409, and concurrent-atomicity scenarios.

Three issues require attention before shipping. The most impactful is a split-commit hazard in both `triggerSend` and `scheduleCampaign` — the DB transition commits before the BullMQ enqueue, leaving campaigns stuck in `sending`/`scheduled` with no queued job if Redis is unavailable at that instant. The worker also has a stale-job TOCTOU gap: the pre-transaction guard check and the actual DB writes are not atomic. A lower-severity issue is that `job.data.userId` is threaded through to `SendJobData` but never used inside `processSendJob` for an ownership re-verify.

---

## Critical Issues

### CR-01: Split-commit hazard — DB transition commits before BullMQ enqueue in `triggerSend` and `scheduleCampaign`

**File:** `backend/src/services/campaignService.ts:295-308` and `315-337`

**Issue:** In both `triggerSend` and `scheduleCampaign`, the `Campaign.update(...)` call commits to Postgres before `sendQueue.add(...)` is called. If Redis is unavailable (network blip, restart) or `sendQueue.add` throws for any other reason, the campaign is permanently stranded in `sending` or `scheduled` with no job in the queue. No retry mechanism or compensating logic exists.

```typescript
// triggerSend (lines 297-307) — update commits, then add may throw:
const [count] = await Campaign.update({ status: 'sending' }, { where: {...} });
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SENDABLE');
await sendQueue.add('send-campaign', { campaignId, userId }); // ← if this throws, campaign stuck in 'sending'

// scheduleCampaign (lines 323-336) — same pattern:
const [count] = await Campaign.update({ status: 'scheduled', scheduledAt: scheduledDate }, { where: {...} });
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SCHEDULABLE');
await sendQueue.add('send-campaign', { campaignId, userId }, { delay }); // ← if this throws, stuck in 'scheduled'
```

**Fix:** Wrap both operations in a try/catch that rolls back the DB status on enqueue failure, or (simpler) add a startup reconciliation query that re-enqueues any campaigns found in `sending` or `scheduled` state with no corresponding active BullMQ job. The minimal defensive pattern:

```typescript
// triggerSend — rollback on enqueue failure
const [count] = await Campaign.update({ status: 'sending' }, { where: { id: campaignId, createdBy: userId, status: { [Op.in]: ['draft', 'scheduled'] } } });
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SENDABLE');
try {
  await sendQueue.add('send-campaign', { campaignId, userId });
} catch (enqueueErr) {
  // Roll back status so the campaign is not permanently stranded
  await Campaign.update({ status: 'draft' }, { where: { id: campaignId } });
  throw enqueueErr;
}
```

---

## Warnings

### WR-01: Worker stale-job guard is not atomic — TOCTOU between guard read and transaction

**File:** `backend/src/services/sendWorker.ts:29-36`

**Issue:** The guard check (`Campaign.findByPk`) at line 29 executes outside any transaction. The actual DB writes happen inside `sequelize.transaction(...)` starting at line 39. Between those two points, a second job (e.g., a BullMQ retry of the same job, or a scheduled + manual send race) could also pass the guard check because both see `status = 'sending'`. Both jobs then proceed to the transaction, and both set all recipients to sent/failed and both set campaign to `sent`. Recipients get double-processed.

The comment on line 6 says "bail cleanly ... BullMQ must NOT mark the job failed for a stale bail" — the intent is sound, but the implementation is not atomic.

**Fix:** Move the status re-check inside the transaction and use a `SELECT ... FOR UPDATE` or a conditional `UPDATE` that fails atomically if status is not `sending`:

```typescript
await sequelize.transaction(async (t) => {
  // Atomic re-check inside the same transaction — prevents double-processing
  const [guardCount] = await Campaign.update(
    { updatedAt: new Date() }, // no-op field touch; actual purpose is the WHERE guard
    {
      where: { id: campaignId, status: 'sending' },
      transaction: t,
    },
  );
  if (guardCount === 0) {
    // Stale job — campaign no longer in sending state; bail cleanly
    logger.info({ campaignId }, 'send job skipped — campaign not in sending state (atomic guard)');
    return;
  }
  // ... rest of recipient processing
});
```

Alternatively, use `Campaign.findOne({ where: { id: campaignId, status: 'sending' }, lock: true, transaction: t })` inside the transaction as the guard.

### WR-02: `job.data.userId` is populated but never used in `processSendJob` — ownership not re-verified in worker

**File:** `backend/src/services/sendWorker.ts:26`

**Issue:** `SendJobData` includes `userId` (line 22-23) and it is passed in both `sendQueue.add` calls in `campaignService.ts`. However `processSendJob` only destructures `campaignId` (line 26) and never checks that the campaign belongs to that user. The guard on line 30 only checks `campaign.status !== 'sending'` — not ownership.

In the current implementation this is low-risk because the job is enqueued only after a successful ownership-checked `UPDATE`, but it leaves ownership entirely un-verified in the worker layer. If a job is ever injected directly into the queue (admin tooling, bug, test helper), any campaign can be processed.

**Fix:** Include the ownership check in the stale-job guard:

```typescript
const campaign = await Campaign.findByPk(campaignId);
if (!campaign || campaign.status !== 'sending' || campaign.createdBy !== userId) {
  logger.info({ campaignId, status: campaign?.status ?? 'not found' }, 'send job skipped');
  return;
}
```

### WR-03: `scheduleCampaign` does not validate that `scheduledAt` is a valid date before arithmetic

**File:** `backend/src/services/campaignService.ts:320-321`

**Issue:** `new Date(scheduledAt)` where `scheduledAt` is already validated by `ScheduleCampaignSchema` (ISO 8601 `z.string().datetime()`). This is safe in the current path because Zod validation runs at the route layer before the service is called. However, the service function accepts a raw `string` with no internal guard, so if called directly (e.g., from tests or future internal callers without the route middleware), an invalid date string like `"not-a-date"` produces `NaN` from `getTime()`, which makes `delay = NaN`, and BullMQ will silently treat a `NaN` delay as `0` (immediate). This is a defence-in-depth gap.

**Fix:** Add a guard after the `new Date()` call:

```typescript
const scheduledDate = new Date(scheduledAt);
if (isNaN(scheduledDate.getTime())) throw new BadRequestError('INVALID_SCHEDULED_AT');
if (scheduledDate <= new Date()) throw new BadRequestError('SCHEDULED_AT_NOT_FUTURE');
```

---

## Info

### IN-01: `sendWorker.ts` always marks campaign `sent` even when all recipients failed

**File:** `backend/src/services/sendWorker.ts:58-61`

**Issue:** After processing all `CampaignRecipient` rows, the worker unconditionally sets `campaign.status = 'sent'` regardless of how many recipients succeeded. A campaign where every recipient landed in `failed` will still show `status = 'sent'`. The `stats` endpoint correctly reports `sent=0, failed=N`, but the top-level status is misleading.

This is within the stated simulation scope (the `~70% sent` comment on line 48 acknowledges it), but it is worth flagging for future status accuracy work.

**Fix (future):** Consider a final status of `'sent'` only when at least one recipient was delivered, or introduce a `'failed'` terminal campaign state. No action required for phase 5 scope.

### IN-02: `camp-07-concurrent-send.sh` does not verify the 409 response body error code

**File:** `backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh:44-51`

**Issue:** The concurrent-send smoke test verifies that one response is 202 and the other 409 (correct), but it does not assert `.error.code == "CAMPAIGN_NOT_SENDABLE"` on the 409 body the way `camp-07-send.sh` does at line 43. If the 409 is returned for an unexpected reason (wrong handler, malformed response), the test passes incorrectly.

**Fix:** After the code check, conditionally assert the error code on whichever response was 409:

```bash
if [ "$CODE1" = "409" ]; then
  jq -e '.error.code == "CAMPAIGN_NOT_SENDABLE"' /tmp/smoke-conc-r1.json >/dev/null
else
  jq -e '.error.code == "CAMPAIGN_NOT_SENDABLE"' /tmp/smoke-conc-r2.json >/dev/null
fi
```

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
