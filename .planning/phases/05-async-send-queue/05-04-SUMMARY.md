---
phase: "05-async-send-queue"
plan: "04"
subsystem: "backend/test/smoke"
tags: ["smoke-tests", "camp-06", "camp-07", "bullmq", "concurrent-send", "worker-e2e"]
dependency_graph:
  requires:
    - "POST /campaigns/:id/schedule (Plan 05-03)"
    - "POST /campaigns/:id/send (Plan 05-03)"
    - "BullMQ worker processSendJob (Plan 05-01)"
    - "campaign state machine + atomic guard (Plan 05-02)"
  provides:
    - "CAMP-06 smoke acceptance gate"
    - "CAMP-07 smoke acceptance gate"
    - "Concurrent-send atomicity smoke gate"
    - "Worker end-to-end smoke gate (QUEUE-02/03/04)"
    - "Phase 5 acceptance orchestrator run-all-phase5.sh"
    - "Updated global gate run-all.sh (Phases 3+4+5)"
  affects:
    - "backend/test/smoke/run-all.sh (extended)"
tech_stack:
  added: []
  patterns:
    - "curl -w '%{http_code}' output-to-tmp smoke pattern"
    - "Parallel background curl + wait $PID atomicity check"
    - "Polling loop with MAX_WAIT cap for async worker verification"
    - "date -u -v +30M (macOS) with fallback date -d (Linux) for cross-platform future datetime"
key_files:
  created:
    - backend/test/smoke/05-send-queue/camp-06-schedule.sh
    - backend/test/smoke/05-send-queue/camp-07-send.sh
    - backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh
    - backend/test/smoke/05-send-queue/camp-worker-wait.sh
    - backend/test/smoke/05-send-queue/run-all-phase5.sh
  modified:
    - backend/test/smoke/run-all.sh
decisions:
  - "date -u -v +30M with || fallback covers macOS BSD date + Linux GNU date — cross-platform future timestamp without external deps"
  - "WORKER_MAX_WAIT env var (default 10s) caps polling loop in camp-worker-wait.sh — T-05-04-02 mitigation prevents unbounded hang in CI"
  - "Background curl + wait $PID pattern (not curl -Z) — available on bash 3.x/macOS without additional flags"
metrics:
  duration: "4m"
  completed: "2026-04-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 1
---

# Phase 05 Plan 04: Phase 5 Smoke Tests — CAMP-06, CAMP-07, Concurrent, Worker E2E Summary

**One-liner:** Created 5 bash smoke scripts proving CAMP-06 (schedule 202/409/400), CAMP-07 (send 202/409), concurrent-send atomicity (exactly one 202 + one 409 from parallel POSTs), and worker end-to-end (poll to sent + stats assertion), plus a Phase 5 orchestrator and updated global run-all.sh.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create 05-send-queue/ smoke scripts (camp-06, camp-07, concurrent-send, worker-wait) | b1da533 | 4 new files |
| 2 | Create run-all-phase5.sh and update run-all.sh | d48ee19 | 1 new + 1 modified |

## What Was Built

**backend/test/smoke/05-send-queue/camp-06-schedule.sh** — CAMP-06 acceptance gate:
- Creates fresh draft campaign
- POST /schedule with future date → asserts 202 + `status=scheduled`
- POST /schedule again → asserts 409 + `CAMPAIGN_NOT_SCHEDULABLE`
- Creates second draft, POST /schedule with `2020-01-01T00:00:00Z` → asserts 400 + `SCHEDULED_AT_NOT_FUTURE`
- Cross-platform future date: `date -u -v +30M` (macOS) with `|| date -u -d "+30 minutes"` (Linux) fallback

**backend/test/smoke/05-send-queue/camp-07-send.sh** — CAMP-07 acceptance gate:
- Creates fresh draft campaign
- POST /send → asserts 202 + `status=sending`
- POST /send again → asserts 409 + `CAMPAIGN_NOT_SENDABLE`

**backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh** — Concurrent atomicity gate:
- Creates fresh draft campaign
- Fires two `curl -X POST /send` requests simultaneously via bash background jobs (`PID1`, `PID2`)
- `wait $PID1; wait $PID2` to collect both results
- Asserts exactly one 202 + one 409 (either order) — proves atomic UPDATE guard (C11)

**backend/test/smoke/05-send-queue/camp-worker-wait.sh** — Worker end-to-end gate (QUEUE-02/03/04):
- Creates fresh draft, POST /send → 202
- Polls GET /campaigns/:id every 1s until `status=sent` or `WORKER_MAX_WAIT` (default 10s) timeout
- On timeout: exits 1 with diagnostic message pointing to app logs
- After `sent`: GET /campaigns/:id/stats → asserts `total > 0` and `sent + failed == total`

**backend/test/smoke/05-send-queue/run-all-phase5.sh** — Phase 5 orchestrator:
- Health check on /health (200) before any test
- Calls all 4 scripts in order
- Banner: `CAMP-06 · CAMP-07 · QUEUE-01 · QUEUE-02 · QUEUE-03 · QUEUE-04`

**backend/test/smoke/run-all.sh** — Global gate update:
- Header updated to "Phase 3 + 4 + 5 acceptance gate"
- Added Phase 5 section calling `05-send-queue/run-all-phase5.sh`
- Banner extended with `CAMP-06 · CAMP-07 · QUEUE-01 · QUEUE-02 · QUEUE-03 · QUEUE-04`
- All Phase 3 + Phase 4 calls preserved

## Verification Results

```
bash -n camp-06-schedule.sh        → OK
bash -n camp-07-send.sh            → OK
bash -n camp-07-concurrent-send.sh → OK
bash -n camp-worker-wait.sh        → OK
bash -n run-all-phase5.sh          → OK
bash -n run-all.sh                 → OK
grep "run-all-phase5.sh" run-all.sh → PRESENT
grep "CAMP-06" run-all.sh           → PRESENT
grep "QUEUE-04" run-all.sh          → PRESENT
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all scripts are functional acceptance gates with real curl assertions against live endpoints.

## Threat Flags

No new trust boundary surface. Plan threat mitigations applied:

| Mitigation | Status |
|-----------|--------|
| T-05-04-01: /tmp/ files contain only smoke test data (no real PII) | Implemented — all temp files use smoke test email addresses |
| T-05-04-02: MAX_WAIT env var caps polling in camp-worker-wait.sh | Implemented — `MAX_WAIT="${WORKER_MAX_WAIT:-10}"` with exit 1 + diagnostic on timeout |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| backend/test/smoke/05-send-queue/camp-06-schedule.sh exists | FOUND |
| backend/test/smoke/05-send-queue/camp-07-send.sh exists | FOUND |
| backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh exists | FOUND |
| backend/test/smoke/05-send-queue/camp-worker-wait.sh exists | FOUND |
| backend/test/smoke/05-send-queue/run-all-phase5.sh exists | FOUND |
| backend/test/smoke/run-all.sh updated with Phase 5 | FOUND |
| Commit b1da533 exists | FOUND |
| Commit d48ee19 exists | FOUND |
