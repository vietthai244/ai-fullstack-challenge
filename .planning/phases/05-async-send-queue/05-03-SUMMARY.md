---
phase: "05-async-send-queue"
plan: "03"
subsystem: "backend/routes + backend/index"
tags: ["bullmq", "campaign-send", "campaign-schedule", "express-routes", "graceful-shutdown"]
dependency_graph:
  requires:
    - "backend/src/services/campaignService.ts (triggerSend, scheduleCampaign — Plan 05-02)"
    - "backend/src/lib/queue.ts (sendQueue, sendWorker — Plan 05-01)"
    - "shared/src/schemas/campaign.ts (ScheduleCampaignSchema — Plan 05-02)"
  provides:
    - "POST /campaigns/:id/send HTTP handler"
    - "POST /campaigns/:id/schedule HTTP handler"
    - "Worker started at boot via index.ts import"
    - "Graceful shutdown for sendQueue + sendWorker"
  affects:
    - "backend/src/app.ts (campaignsRouter already mounted)"
tech_stack:
  added: []
  patterns:
    - "Express thin handler — validate → service → envelope"
    - "202 Accepted for async operations"
    - "Promise.allSettled multi-resource shutdown"
key_files:
  created: []
  modified:
    - backend/src/routes/campaigns.ts
    - backend/src/index.ts
decisions:
  - "POST /:id/send returns 202 (not 200) — send is async, job enqueued not completed"
  - "POST /:id/schedule returns 202 — same rationale as send"
  - "Worker started implicitly via module import (C5 Pitfall — worker never starts unless imported)"
  - "sendQueue.close() + sendWorker.close() added to Promise.allSettled — graceful drain before process exit (T-05-03-04)"
metrics:
  duration: "3m"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 05 Plan 03: HTTP Route Wiring — POST /send + POST /schedule Summary

**One-liner:** Wired POST /:id/send and POST /:id/schedule handlers into campaigns router (202 responses, delegate to service layer) and extended index.ts to import the queue module (starts worker at boot) with graceful shutdown for sendQueue and sendWorker.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add POST /:id/send and POST /:id/schedule handlers to campaigns router | 88c5e3b | backend/src/routes/campaigns.ts |
| 2 | Import queue module + extend shutdown hook in index.ts | 84efd68 | backend/src/index.ts |

## What Was Built

**backend/src/routes/campaigns.ts** — Two new POST handlers appended after the GET /:id/stats handler:

- `POST /:id/send` — No request body. Validates campaignId from URL (integer > 0). Delegates to `campaignService.triggerSend(campaignId, req.user!.id)`. Returns `202 { data: { id, status: 'sending' } }`. ConflictError from service propagates to errorHandler → 409.
- `POST /:id/schedule` — Body validated via `validate(ScheduleCampaignSchema)` middleware (ISO 8601 datetime). Delegates to `campaignService.scheduleCampaign(campaignId, req.user!.id, req.body.scheduled_at)`. Returns `202 { data: { id, status: 'scheduled' } }`. BadRequestError → 400 (past date), ConflictError → 409 (non-draft) both propagate via next(err).

`ScheduleCampaignSchema` added to the `@campaign/shared` import block.

**backend/src/index.ts** — Two targeted edits:
1. `import { sendQueue, sendWorker } from './lib/queue.js'` added after the redis import — module evaluation starts the BullMQ worker immediately (C5 mitigation).
2. `Promise.allSettled` in the shutdown function extended to include `sendQueue.close()` and `sendWorker.close()` alongside the existing `sequelize.close()` and `redis.quit()`.

## Verification Results

```
grep "/:id/send" backend/src/routes/campaigns.ts         → PRESENT (line 115)
grep "/:id/schedule" backend/src/routes/campaigns.ts     → PRESENT (line 132)
grep "ScheduleCampaignSchema" campaigns.ts               → PRESENT (import + usage)
grep "validate(ScheduleCampaignSchema)" campaigns.ts     → PRESENT (schedule handler middleware)
grep "campaignService.triggerSend" campaigns.ts          → PRESENT
grep "campaignService.scheduleCampaign" campaigns.ts     → PRESENT
res.status(202) count                                    → 2 (one per handler)
grep "status: 'sending'" campaigns.ts                    → PRESENT
grep "status: 'scheduled'" campaigns.ts                  → PRESENT
grep "sendQueue, sendWorker" index.ts                    → PRESENT (line 19)
grep "sendQueue.close" index.ts                          → PRESENT (line 41)
grep "sendWorker.close" index.ts                         → PRESENT (line 42)
tsc --noEmit (new errors only)                           → 0 new errors
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no UI rendering, no placeholder text. Both handlers delegate to fully-implemented service functions.

## Threat Flags

No new trust boundary surface beyond what the plan's threat model covers. All four STRIDE mitigations implemented:

| Mitigation | Status |
|-----------|--------|
| T-05-03-01: authenticate middleware on campaignsRouter (pre-existing line 18) | Confirmed present — all new POST routes inherit it |
| T-05-03-02: Double-click 409 via service-layer atomic guard | Implemented — ConflictError from triggerSend propagates to errorHandler |
| T-05-03-03: validate(ScheduleCampaignSchema) rejects malformed body | Implemented as middleware on /:id/schedule |
| T-05-03-04: sendWorker.close() in Promise.allSettled | Implemented |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| backend/src/routes/campaigns.ts POST /:id/send handler present | FOUND |
| backend/src/routes/campaigns.ts POST /:id/schedule handler present | FOUND |
| backend/src/index.ts import sendQueue, sendWorker | FOUND |
| backend/src/index.ts sendQueue.close() in shutdown | FOUND |
| backend/src/index.ts sendWorker.close() in shutdown | FOUND |
| Commit 88c5e3b exists | FOUND |
| Commit 84efd68 exists | FOUND |
