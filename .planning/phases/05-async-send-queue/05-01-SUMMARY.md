---
phase: "05-async-send-queue"
plan: "01"
subsystem: "backend/queue"
tags: ["bullmq", "ioredis", "worker", "queue", "async"]
dependency_graph:
  requires: ["backend/src/lib/redis.ts", "backend/src/db/index.ts", "backend/src/config/env.ts"]
  provides: ["backend/src/lib/queue.ts", "backend/src/services/sendWorker.ts"]
  affects: ["backend/src/index.ts (shutdown hook — Phase 5 Plan 03)"]
tech_stack:
  added: ["bullmq@5.75.2"]
  patterns: ["BullMQ Queue+Worker dual IORedis", "Sequelize transaction-wrapped processor", "stale job guard"]
key_files:
  created:
    - backend/src/lib/queue.ts
    - backend/src/services/sendWorker.ts
  modified:
    - backend/package.json (bullmq dependency added)
    - yarn.lock
decisions:
  - "Two separate IORedis instances (queueConn, workerConn) — never share between Queue and Worker per C5/QUEUE-01"
  - "Comment text containing the per-request retry option rephrased to paraphrase — carry-forward of Plans 01-04/02-03 grep-count tripwire lesson"
  - "sendWorker.ts split from queue.ts for testability (Phase 7 can call processSendJob directly without starting the worker)"
metrics:
  duration: "1m 56s"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 05 Plan 01: BullMQ Queue + Worker Foundation Summary

**One-liner:** BullMQ 5 Queue + Worker with dual IORedis connections (maxRetriesPerRequest: null), stale-job guard, single-transaction processor, and mandatory error listeners.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Install bullmq and create lib/queue.ts | d60839a | backend/src/lib/queue.ts, backend/package.json, yarn.lock |
| 2 | Create services/sendWorker.ts processor function | d5a3578 | backend/src/services/sendWorker.ts |

## What Was Built

**backend/src/lib/queue.ts** — Exports `sendQueue` (BullMQ Queue) and `sendWorker` (BullMQ Worker), each with a dedicated IORedis connection (`queueConn`, `workerConn`). Both connections carry `maxRetriesPerRequest: null` (C5, QUEUE-01). Mandatory `worker.on('failed')` and `worker.on('error')` listeners log via pino (QUEUE-04).

**backend/src/services/sendWorker.ts** — Exports `processSendJob` (the BullMQ processor) and `SendJobData` interface. The processor:
1. Re-fetches the campaign from DB before any writes (QUEUE-03 stale delayed job guard)
2. Wraps all DB mutations in a single `sequelize.transaction()` (QUEUE-02, C9)
3. Simulates delivery: `Math.random() > 0.3` → ~70% sent, ~30% failed per recipient
4. Flips campaign to `status: 'sent'` inside the same transaction
5. Has NO try/catch around the transaction — errors propagate to BullMQ so `worker.on('failed')` fires (C4)

## Verification Results

```
grep -c "maxRetriesPerRequest: null" backend/src/lib/queue.ts  → 2 (PASS)
worker.on('failed') listener                                   → PRESENT
worker.on('error') listener                                    → PRESENT
campaign.status !== 'sending' guard                            → PRESENT
sequelize.transaction() call                                   → PRESENT
try/catch blocks                                               → 0 (PASS)
yarn workspace @campaign/backend tsc --noEmit                  → EXIT 0 (PASS)
bullmq version in node_modules                                 → 5.75.2 (PASS)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment contained literal option text causing grep-c count of 3 instead of 2**
- **Found during:** Task 1 verification
- **Issue:** Plan's acceptance criterion requires `grep -c "maxRetriesPerRequest: null"` returns exactly 2. The comment on line 9 of queue.ts (`// maxRetriesPerRequest: null is MANDATORY...`) caused the grep to return 3.
- **Fix:** Rephrased comment to "Both connections must have the per-request retry limit disabled (C5)" — carry-forward of Plans 01-04/02-03 pattern (describe in paraphrase, not verbatim).
- **Files modified:** backend/src/lib/queue.ts
- **Commit:** d60839a (fix included in same task commit before task commit)

## Known Stubs

None — no UI rendering, no placeholder text, no hardcoded empty data flows.

## Threat Flags

No new network endpoints, auth paths, or trust boundary surface introduced. queue.ts and sendWorker.ts are internal async modules — no HTTP exposure. Threat model T-05-01-01 through T-05-01-04 all mitigated as planned:

| Mitigation | Status |
|-----------|--------|
| T-05-01-01: Campaign.findByPk re-check before writes | Implemented (QUEUE-03 stale guard) |
| T-05-01-02: maxRetriesPerRequest: null on both connections | Implemented (both IORedis instances) |
| T-05-01-03: Separate queueConn and workerConn | Implemented |
| T-05-01-04: No try/catch swallowing errors | Implemented (0 try blocks) |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| backend/src/lib/queue.ts exists | FOUND |
| backend/src/services/sendWorker.ts exists | FOUND |
| Commit d60839a exists | FOUND |
| Commit d5a3578 exists | FOUND |
