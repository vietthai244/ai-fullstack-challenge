---
phase: 4
slug: campaigns-recipients-crud
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 (pinned) — Phase 7 installs full test suite; Phase 4 uses smoke/curl only |
| **Config file** | `backend/vitest.config.ts` — not required until Phase 7 |
| **Quick run command** | `node .yarn/releases/yarn-4.14.1.cjs workspace @campaign/backend typecheck` |
| **Full suite command** | `bash backend/test/smoke/run-all-phase4.sh` (Wave 0 creates this) |
| **Estimated runtime** | ~30–60 seconds (curl + DB round-trips against running docker compose) |

---

## Sampling Rate

- **After every task commit:** `node .yarn/releases/yarn-4.14.1.cjs typecheck` (structural correctness)
- **After every plan wave:** All 8 smoke scripts in `backend/test/smoke/run-all-phase4.sh`
- **Before `/gsd-verify-work`:** Full smoke suite green + typecheck pass
- **Max feedback latency:** ~60 seconds (docker compose must be running)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Automated Command | File Exists | Status |
|---------|------|------|-------------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | CAMP-01..05, CAMP-08, RECIP-01, RECIP-02 | typecheck | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | migration/backfill | typecheck + `\d recipients` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | CAMP-01..05, CAMP-08 | typecheck | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | RECIP-01, RECIP-02 | typecheck | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 3 | CAMP-01..05, CAMP-08 | `bash backend/test/smoke/camp-*.sh` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 3 | RECIP-01, RECIP-02 | `bash backend/test/smoke/recip-*.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Plan 04-04 Deliverables

- [ ] `backend/test/smoke/camp-01-list.sh` — covers CAMP-01 offset pagination (page=1..N, totalPages correct, limit enforced)
- [ ] `backend/test/smoke/camp-02-create.sh` — covers CAMP-02 draft create + recipient upsert
- [ ] `backend/test/smoke/camp-03-detail.sh` — covers CAMP-03 eager-load recipients + inline stats
- [ ] `backend/test/smoke/camp-04-patch.sh` — covers CAMP-04 409 on non-draft PATCH
- [ ] `backend/test/smoke/camp-05-delete.sh` — covers CAMP-05 409 on non-draft DELETE + cascade on draft
- [ ] `backend/test/smoke/camp-08-stats.sh` — covers CAMP-08 aggregate with NULLIF zero-division
- [ ] `backend/test/smoke/recip-01-upsert.sh` — covers RECIP-01 name upsert via COALESCE
- [ ] `backend/test/smoke/recip-02-list.sh` — covers RECIP-02 paginated list per user
- [ ] `backend/test/smoke/run-all-phase4.sh` — orchestrator for all 8 above

*Note: Formal Vitest+Supertest tests (TEST-01..04) land in Phase 7, not Phase 4.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cursor no-dupe at `created_at` collision boundary | RECIP-02 | Requires seeding 50+ rows with identical `created_at` values to expose the id tiebreaker gap (applies to recipients cursor, not campaigns offset) | `yarn seed 50-same-ts && bash backend/test/smoke/recip-02-list.sh --pages all` |
| PATCH full recipient replace (tx atomicity) | CAMP-04 | Requires kill-connection test during tx | Manual kill during PATCH; verify campaign+recipients consistent |
| AUTH-07 cross-user 404 on GET /campaigns/:id | CAMP-03 | Requires two user accounts; see Phase 7 TEST-04 | Create user A + user B; user A tries GET /campaigns/:id of user B → 404 |

---

## Validation Sign-Off

- [ ] All tasks have typecheck automated verify or Plan 04-04 smoke dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Plan 04-04 covers all MISSING smoke scripts
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (docker compose running)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
