---
phase: 05-async-send-queue
verified: 2026-04-21T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run camp-worker-wait.sh against a live stack"
    expected: "Campaign transitions to 'sent' within 10s; stats show sent+failed=total"
    why_human: "Requires live BullMQ worker + Redis + Postgres; cannot verify programmatically without running services"
  - test: "Run camp-07-concurrent-send.sh against a live stack"
    expected: "Two parallel POST /send on same draft produce exactly one 202 and one 409"
    why_human: "Concurrent atomicity proof requires live HTTP server; timing-sensitive behavior"
---

# Phase 5: Async Send Queue Verification Report

**Phase Goal:** A campaign can be scheduled for future auto-send or sent immediately via BullMQ; both paths transition draft|scheduled → sending atomically in the HTTP handler and converge on one worker that randomly marks recipients sent/failed inside a transaction before flipping the campaign to sent.
**Verified:** 2026-04-21
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /campaigns/:id/send on draft returns 202, atomic UPDATE WHERE status IN ('draft','scheduled'); two concurrent POSTs → one 202 + one 409 | ✓ VERIFIED | `triggerSend` uses `Op.in` UPDATE guard, rowCount=0 → 409; route returns 202 + `{id, status:'sending'}`; concurrent script uses parallel curl+PID pattern |
| 2 | POST /campaigns/:id/schedule with future date returns 202 + delayed BullMQ job; past date → 400; non-draft → 409 | ✓ VERIFIED | `scheduleCampaign` checks `scheduledDate <= new Date()` → BadRequestError; UPDATE WHERE status='draft' + rowCount=0 → 409; `sendQueue.add(..., {delay})`; route returns 202 + `{id, status:'scheduled'}` |
| 3 | BullMQ worker processes job inside single Sequelize transaction: pending recipients randomly marked sent/failed with sent_at, campaign flipped to sent — all or nothing | ✓ VERIFIED | `processSendJob` wraps all mutations in `sequelize.transaction()`; `Math.random() > 0.3` simulation; `r.update({status, sentAt})` inside tx; `Campaign.update({status:'sent'})` inside same tx; no try/catch wrapping tx |
| 4 | BullMQ Queue and Worker use separate IORedis instances both with maxRetriesPerRequest: null; worker.on('failed') and worker.on('error') log via pino | ✓ VERIFIED | `queue.ts` line 20-21: two IORedis instances; `grep -c "maxRetriesPerRequest: null" queue.ts` = 2; both mandatory listeners present with pino logger calls |
| 5 | Delayed scheduled job that fires after campaign status changed bails without mutating recipients or re-transitioning status | ✓ VERIFIED | `processSendJob` uses atomic `Campaign.update WHERE status='sending'` as first transaction op; guardCount=0 returns early; no orphaned writes possible |

**Score: 5/5 truths verified**

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/lib/queue.ts` | sendQueue + sendWorker exports, two IORedis instances | ✓ VERIFIED | Exists; 2x maxRetriesPerRequest: null; both event listeners; exports confirmed |
| `backend/src/services/sendWorker.ts` | processSendJob + SendJobData exports | ✓ VERIFIED | Exists; stale guard via atomic UPDATE inside tx; no try/catch; Math.random() simulation |
| `backend/src/services/campaignService.ts` | triggerSend + scheduleCampaign exports | ✓ VERIFIED | Exists; Op.in guard; CAMPAIGN_NOT_SENDABLE/SCHEDULABLE/SCHEDULED_AT_NOT_FUTURE error codes; sendQueue.add x2 |
| `shared/src/schemas/campaign.ts` | ScheduleCampaignSchema + ScheduleCampaignInput | ✓ VERIFIED | Exists at line 67; z.string().datetime() validation |
| `shared/src/schemas/index.ts` | Re-exports ScheduleCampaignSchema | ✓ VERIFIED | `export * from './campaign.js'` barrel re-exports it |
| `shared/dist/schemas/campaign.js` | Built ScheduleCampaignSchema | ✓ VERIFIED | Found in dist/schemas/campaign.js; accessible via barrel chain |
| `backend/src/routes/campaigns.ts` | POST /:id/send + POST /:id/schedule handlers | ✓ VERIFIED | Lines 114-144; ScheduleCampaignSchema imported; validate() middleware on schedule; 202 responses |
| `backend/src/index.ts` | Queue module import + shutdown extension | ✓ VERIFIED | Line 19: import sendQueue, sendWorker; sendQueue.close() + sendWorker.close() in Promise.allSettled |
| `backend/test/smoke/05-send-queue/camp-06-schedule.sh` | CAMP-06 smoke gate | ✓ VERIFIED | Exists; bash -n passes; asserts 202/409/400 |
| `backend/test/smoke/05-send-queue/camp-07-send.sh` | CAMP-07 smoke gate | ✓ VERIFIED | Exists; bash -n passes; asserts 202/409 |
| `backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh` | Concurrent atomicity gate | ✓ VERIFIED | Exists; bash -n passes; PID1+PID2 parallel pattern; one-202-one-409 assertion |
| `backend/test/smoke/05-send-queue/camp-worker-wait.sh` | Worker E2E gate | ✓ VERIFIED | Exists; bash -n passes; polling loop; sent+failed==total stats assertion |
| `backend/test/smoke/05-send-queue/run-all-phase5.sh` | Phase 5 orchestrator | ✓ VERIFIED | Exists; calls all 4 scripts; banner includes all 6 REQ-IDs |
| `backend/test/smoke/run-all.sh` | Updated global gate | ✓ VERIFIED | Calls run-all-phase5.sh; banner includes CAMP-06 and QUEUE-04 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `queue.ts` | `sendWorker.ts` | `import processSendJob` | ✓ WIRED | Line 17 of queue.ts; Worker constructor uses processSendJob |
| `queue.ts` | `ioredis` | `new IORedis with maxRetriesPerRequest: null` | ✓ WIRED | Lines 20-21; both instances confirmed |
| `campaignService.ts (triggerSend)` | `queue.ts` | `sendQueue.add` immediate | ✓ WIRED | Line 308; sendQueue imported from '../lib/queue.js' |
| `campaignService.ts (scheduleCampaign)` | `queue.ts` | `sendQueue.add(..., {delay})` | ✓ WIRED | Line 344; delay computed from scheduledDate.getTime() - Date.now() |
| `routes/campaigns.ts` | `campaignService.ts` | `campaignService.triggerSend` | ✓ WIRED | Line 120; called with (campaignId, req.user!.id) |
| `routes/campaigns.ts` | `campaignService.ts` | `campaignService.scheduleCampaign` | ✓ WIRED | Line 138; called with (campaignId, req.user!.id, req.body.scheduled_at) |
| `index.ts` | `queue.ts` | `import { sendQueue, sendWorker }` | ✓ WIRED | Line 19; module evaluation starts worker at boot |
| `run-all.sh` | `run-all-phase5.sh` | `bash "$HERE/05-send-queue/run-all-phase5.sh"` | ✓ WIRED | Confirmed by grep |

### Data-Flow Trace (Level 4)

Not applicable — phase produces async processing logic (service/queue/worker), not UI components with rendered state.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles without errors | `yarn workspace @campaign/backend tsc --noEmit` | Exit 0 | ✓ PASS |
| sendWorker has no try/catch (no error swallowing) | `grep -c "try {" sendWorker.ts` | 0 | ✓ PASS |
| maxRetriesPerRequest: null on both IORedis instances | `grep -c "maxRetriesPerRequest: null" queue.ts` | 2 | ✓ PASS |
| sendQueue.add called exactly twice (immediate + delayed) | `grep -c "sendQueue.add" campaignService.ts` | 2 | ✓ PASS |
| All smoke scripts pass bash syntax check | `bash -n *.sh` | All OK | ✓ PASS |
| Worker end-to-end (campaign → sent, stats correct) | Requires live stack | N/A | ? SKIP |
| Concurrent atomicity (one 202, one 409) | Requires live HTTP server | N/A | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CAMP-06 | 05-02, 05-03, 05-04 | POST /schedule: future date→202+delayed job; past→400; non-draft→409 | ✓ SATISFIED | scheduleCampaign past-date guard + Op WHERE status='draft' + sendQueue.add({delay}); route 202; smoke gate present |
| CAMP-07 | 05-02, 05-03, 05-04 | POST /send: atomic draft|scheduled→sending; 202; concurrent → one 202 + one 409 | ✓ SATISFIED | triggerSend Op.in UPDATE guard; route 202; concurrent smoke script asserts exactly one 202 + one 409 |
| QUEUE-01 | 05-01 | Separate IORedis for Queue + Worker; both maxRetriesPerRequest: null | ✓ SATISFIED | queueConn + workerConn; grep-c = 2 |
| QUEUE-02 | 05-01 | Worker wraps all mutations in single Sequelize transaction | ✓ SATISFIED | processSendJob: sequelize.transaction() wraps guard update + recipient updates + campaign flip |
| QUEUE-03 | 05-01 | Worker re-checks status before any writes; bails if not sending | ✓ SATISFIED | Atomic UPDATE WHERE status='sending' inside tx; guardCount=0 → return (not error) |
| QUEUE-04 | 05-01 | worker.on('failed') + worker.on('error') log via pino | ✓ SATISFIED | Lines 33-38 of queue.ts; both listeners call logger.error |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `campaignService.ts` | 307-312 | `try { sendQueue.add(...) } catch { ... throw enqueueErr }` in triggerSend | ℹ️ Info | Deviation from plan (plan had no try/catch). Adds Redis rollback resilience — campaign status reverted to 'draft' if Redis is unavailable. Errors still re-thrown; not a swallow. Strictly an improvement. |
| `campaignService.ts` | 343-348 | Same pattern in scheduleCampaign | ℹ️ Info | Same rationale as above. |

No STUB patterns, no TODO/FIXME, no placeholder text, no empty implementations found.

**Deviation note:** `sendWorker.ts` uses an atomic `Campaign.update WHERE status='sending'` inside the transaction as the stale guard instead of the plan's `Campaign.findByPk` + status comparison outside the transaction. This is a strictly stronger variant — it closes the TOCTOU window by making the re-check atomic with the first write. QUEUE-03 is fully satisfied.

### Human Verification Required

#### 1. Worker End-to-End Transition

**Test:** Start full stack (`docker compose up -d postgres redis` + `yarn workspace @campaign/backend dev`), then run `bash backend/test/smoke/05-send-queue/camp-worker-wait.sh`
**Expected:** Script polls GET /campaigns/:id until status='sent' (within 10s), then asserts that GET /campaigns/:id/stats returns total > 0 and sent+failed == total; script exits 0 printing "PASS: QUEUE-02/03 worker end-to-end"
**Why human:** Requires live BullMQ worker connected to Redis + Postgres; cannot verify job processing without running services

#### 2. Concurrent Send Atomicity

**Test:** Start full stack, then run `bash backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh`
**Expected:** Two parallel POST /send requests on the same draft campaign return exactly one 202 (status=sending) and one 409 (CAMPAIGN_NOT_SENDABLE)
**Why human:** Concurrent atomicity proof requires live HTTP server under real Postgres serialization; timing-sensitive by nature

### Gaps Summary

No programmatically-verifiable gaps found. All 5 roadmap success criteria are met in code. All 6 requirement IDs (CAMP-06, CAMP-07, QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04) are fully implemented and wired. TypeScript compiles clean. Smoke scripts are syntactically valid and encode correct assertions.

Two items require live-stack verification to confirm end-to-end behavior (worker job processing, concurrent atomicity under Postgres). These are the expected final-mile checks for an async queue phase.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
