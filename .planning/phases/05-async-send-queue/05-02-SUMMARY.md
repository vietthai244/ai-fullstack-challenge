---
phase: "05-async-send-queue"
plan: "02"
subsystem: "backend/service + shared/schema"
tags: ["bullmq", "atomic-guard", "campaign-state-machine", "zod", "shared-schema"]
dependency_graph:
  requires: ["backend/src/lib/queue.ts (Plan 05-01)", "backend/src/util/errors.ts", "shared/src/schemas/campaign.ts"]
  provides: ["backend/src/services/campaignService.ts (triggerSend, scheduleCampaign)", "shared/src/schemas/campaign.ts (ScheduleCampaignSchema)"]
  affects: ["backend/src/routes/campaigns.ts (Plan 05-03 — calls triggerSend + scheduleCampaign)"]
tech_stack:
  added: []
  patterns: ["Sequelize Op.in atomic UPDATE guard (C11)", "BullMQ delayed job enqueue", "Zod ISO 8601 datetime schema"]
key_files:
  created: []
  modified:
    - shared/src/schemas/campaign.ts
    - backend/src/services/campaignService.ts
decisions:
  - "triggerSend uses Op.in(['draft','scheduled']) — single atomic UPDATE, no findOne-then-update TOCTOU race (C11)"
  - "scheduleCampaign past-date guard in service layer (not Zod) so BadRequestError code is explicit: SCHEDULED_AT_NOT_FUTURE"
  - "Both functions carry createdBy: userId in all Campaign.update WHERE clauses (AUTH-07 ownership enforcement)"
  - "ScheduleCampaignSchema validates ISO 8601 shape only; future-date business rule stays in service layer"
  - "delay = scheduledDate.getTime() - Date.now() computed after DB UPDATE succeeds to minimize clock drift window"
metrics:
  duration: "4m"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 05 Plan 02: Service Layer — triggerSend + scheduleCampaign Summary

**One-liner:** Atomic campaign state-machine functions (draft|scheduled → sending via Op.in UPDATE guard + BullMQ immediate/delayed enqueue) plus ScheduleCampaignSchema in @campaign/shared.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add ScheduleCampaignSchema to shared/src/schemas/campaign.ts | 55a3a6d | shared/src/schemas/campaign.ts |
| 2 | Add triggerSend + scheduleCampaign to campaignService.ts | 95a2bf7 | backend/src/services/campaignService.ts |

## What Was Built

**shared/src/schemas/campaign.ts** — Appended `ScheduleCampaignSchema` (ISO 8601 datetime validation via `z.string().datetime()`) and `ScheduleCampaignInput` type. Re-exported automatically through the existing `export * from './campaign.js'` barrel in `shared/src/schemas/index.ts`. Shared package rebuilt and typecheck passes.

**backend/src/services/campaignService.ts** — Three import additions (`Op` from sequelize, `BadRequestError` from errors.js, `sendQueue` from lib/queue.js) and two new exported functions:

- `triggerSend(campaignId, userId)` — Atomic `Campaign.update WHERE status IN ('draft','scheduled') AND createdBy = userId`; rowCount=0 throws `ConflictError('CAMPAIGN_NOT_SENDABLE')`; on success enqueues immediate BullMQ job.
- `scheduleCampaign(campaignId, userId, scheduledAt)` — Guards `scheduledDate <= new Date()` → `BadRequestError('SCHEDULED_AT_NOT_FUTURE')`; atomic `Campaign.update WHERE status='draft' AND createdBy = userId`; rowCount=0 throws `ConflictError('CAMPAIGN_NOT_SCHEDULABLE')`; on success enqueues delayed BullMQ job with `delay = scheduledDate.getTime() - Date.now()`.

## Verification Results

```
grep "export async function triggerSend"    → PRESENT
grep "export async function scheduleCampaign" → PRESENT
grep "Op.in"                                → PRESENT
grep "CAMPAIGN_NOT_SENDABLE"               → PRESENT
grep "CAMPAIGN_NOT_SCHEDULABLE"            → PRESENT
grep "SCHEDULED_AT_NOT_FUTURE"             → PRESENT
grep -c "sendQueue.add"                    → 2 (immediate + delayed)
grep -c "createdBy: userId"                → 10 (includes both new WHERE clauses)
yarn workspace @campaign/backend tsc --noEmit → EXIT 0
yarn workspace @campaign/shared tsc --noEmit  → EXIT 0
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no UI rendering, no placeholder text, no hardcoded empty data flows. Both functions are pure service-layer logic wired to real DB and real queue.

## Threat Flags

No new network endpoints or auth paths introduced. All threat mitigations from the plan's STRIDE register implemented:

| Mitigation | Status |
|-----------|--------|
| T-05-02-01: createdBy: userId in all WHERE clauses (AUTH-07) | Implemented in both triggerSend and scheduleCampaign |
| T-05-02-02: Atomic UPDATE WHERE status IN ('draft','scheduled') — no findOne-then-update | Implemented (Op.in guard) |
| T-05-02-03: Past-date guard before any DB write | Implemented (scheduledDate <= new Date() check) |
| T-05-02-04: scheduleCampaign WHERE status='draft' only | Implemented |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| shared/src/schemas/campaign.ts contains ScheduleCampaignSchema | FOUND |
| backend/src/services/campaignService.ts contains triggerSend | FOUND |
| backend/src/services/campaignService.ts contains scheduleCampaign | FOUND |
| Commit 55a3a6d exists | FOUND |
| Commit 95a2bf7 exists | FOUND |
