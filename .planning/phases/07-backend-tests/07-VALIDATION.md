---
phase: 7
slug: backend-tests
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 (pinned) + Supertest |
| **Config file** | backend/vitest.config.ts — Wave 0 creates |
| **Quick run command** | `yarn workspace @campaign/backend test --run` |
| **Full suite command** | `yarn workspace @campaign/backend test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @campaign/backend test --run`
- **After every plan wave:** Run `yarn workspace @campaign/backend test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | TEST-01..04 | T-07-01 | status guards, atomicity, stats, auth | integration | `yarn workspace @campaign/backend test --run` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | TEST-01 | T-07-01 | 409 on PATCH/DELETE/send for non-draft | integration | `yarn workspace @campaign/backend test --run` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 1 | TEST-02 | T-07-02 | exactly one 202 + one 409 from Promise.all | integration | `yarn workspace @campaign/backend test --run` | ❌ W0 | ⬜ pending |
| 7-01-04 | 01 | 1 | TEST-03 | T-07-03 | correct stats aggregate with known seed | integration | `yarn workspace @campaign/backend test --run` | ❌ W0 | ⬜ pending |
| 7-01-05 | 01 | 1 | TEST-04 | T-07-04 | 401 missing, 401 tampered, 404 cross-user | integration | `yarn workspace @campaign/backend test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/vitest.config.ts` — singleFork pool, globalSetup, setupFiles
- [ ] `backend/test/setup/globalSetup.ts` — create campaigns_test DB, run migrations
- [ ] `backend/test/setup/setupFiles.ts` — load .env.test, TRUNCATE beforeEach
- [ ] `backend/.env.test` — DATABASE_URL_TEST, REDIS_URL, JWT secrets
- [ ] `backend/test/integration/status-guards.test.ts` — TEST-01 stub
- [ ] `backend/test/integration/concurrent-send.test.ts` — TEST-02 stub
- [ ] `backend/test/integration/stats.test.ts` — TEST-03 stub
- [ ] `backend/test/integration/auth.test.ts` — TEST-04 stub

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redis connectivity for concurrent-send | TEST-02 | Redis must be running locally; can't auto-start in test | `redis-cli ping` before running tests; or `docker compose up -d redis` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
