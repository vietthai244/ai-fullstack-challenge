---
phase: 5
slug: async-send-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual smoke scripts (curl) — Vitest+Supertest wired in Phase 7 |
| **Config file** | none — Phase 7 installs vitest |
| **Quick run command** | `bash backend/test/smoke/05-send-queue/camp-07-send.sh` |
| **Full suite command** | `bash backend/test/smoke/05-send-queue/run-all-phase5.sh` |
| **Estimated runtime** | ~30 seconds (curl scripts against local API) |

---

## Sampling Rate

- **After every task commit:** Run quick smoke for the specific route (send or schedule)
- **After every plan wave:** Run `bash backend/test/smoke/05-send-queue/run-all-phase5.sh`
- **Before `/gsd-verify-work`:** Full smoke suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | QUEUE-01 | — | Queue + Worker have separate IORedis with maxRetriesPerRequest:null | structural | `grep -r 'maxRetriesPerRequest: null' backend/src/lib/queue.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | QUEUE-04 | — | worker.on('failed') and worker.on('error') registered | structural | `grep -c "worker.on" backend/src/lib/queue.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | QUEUE-02/03 | — | processSendJob re-checks status, wraps in sequelize.transaction | structural | `grep -c "sequelize.transaction" backend/src/services/sendWorker.ts` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | CAMP-07 | T-C11 | POST /send returns 202 on draft campaign | smoke | `bash backend/test/smoke/05-send-queue/camp-07-send.sh` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 3 | CAMP-06 | — | POST /schedule returns 202; past date → 400 | smoke | `bash backend/test/smoke/05-send-queue/camp-06-schedule.sh` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 3 | CAMP-07 | T-C11 | Concurrent double-send: one 202, one 409 | smoke | `bash backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/smoke/05-send-queue/camp-07-send.sh` — POST /send on draft → 202, campaign transitions to sending
- [ ] `backend/test/smoke/05-send-queue/camp-06-schedule.sh` — POST /schedule with future date → 202; past date → 400; non-draft → 409
- [ ] `backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh` — two parallel POSTs → one 202 + one 409
- [ ] `backend/test/smoke/05-send-queue/camp-worker-wait.sh` — wait for worker to process → campaign status transitions to sent, recipients have sent/failed
- [ ] `backend/test/smoke/05-send-queue/run-all-phase5.sh` — orchestrator for all phase 5 smoke scripts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Delayed job fires at correct time | CAMP-06 | Requires wall-clock wait (not automatable in smoke) | Schedule campaign 30s in future; wait; confirm status=sent via GET /campaigns/:id |
| Worker processes campaign after restart | QUEUE-01 | Requires process restart with in-flight job | Enqueue job, kill API process, restart, confirm job completes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
