---
phase: 04-campaigns-recipients-crud
plan: "04"
subsystem: smoke-tests
tags: [smoke-scripts, acceptance-gate, offset-pagination, cursor-pagination, campaign-crud, recipient-crud]
dependency_graph:
  requires: [phase-04-plan-01, phase-04-plan-02, phase-04-plan-03]
  provides: [phase4-acceptance-gate, run-all-phase4, camp-smoke-scripts, recip-smoke-scripts]
  affects:
    - backend/test/smoke/camp-01-list.sh
    - backend/test/smoke/camp-02-create.sh
    - backend/test/smoke/camp-03-detail.sh
    - backend/test/smoke/camp-04-patch.sh
    - backend/test/smoke/camp-05-delete.sh
    - backend/test/smoke/camp-08-stats.sh
    - backend/test/smoke/recip-01-upsert.sh
    - backend/test/smoke/recip-02-list.sh
    - backend/test/smoke/run-all-phase4.sh
    - backend/test/smoke/run-all.sh
tech_stack:
  added: []
  patterns:
    - smoke-script-set-euo-pipefail
    - bearer-token-login-pattern
    - jq-assertions
    - offset-pagination-assertion
    - cursor-pagination-assertion
key_files:
  created:
    - backend/test/smoke/camp-01-list.sh
    - backend/test/smoke/camp-02-create.sh
    - backend/test/smoke/camp-03-detail.sh
    - backend/test/smoke/camp-04-patch.sh
    - backend/test/smoke/camp-05-delete.sh
    - backend/test/smoke/camp-08-stats.sh
    - backend/test/smoke/recip-01-upsert.sh
    - backend/test/smoke/recip-02-list.sh
    - backend/test/smoke/run-all-phase4.sh
  modified:
    - backend/test/smoke/run-all.sh
decisions:
  - "camp-04/05: 409 path guarded by conditional — warns if no non-draft campaign in DB (seed-dependent), does not hard-fail"
  - "recip-01: uses unique timestamp+RANDOM email per run for idempotent re-runs without DB reset"
  - "camp-08: asserts open_rate/send_rate null (not NaN) for fresh campaign — validates NULLIF division guard"
metrics:
  duration: "~2.5m"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 10
---

# Phase 04 Plan 04: Phase 4 Smoke Tests Summary

8 curl-based smoke scripts (one per requirement) plus a run-all-phase4.sh orchestrator, following the Phase 3 smoke harness pattern exactly. run-all.sh updated to chain Phase 4 so a single run covers all backend surface.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 8 smoke scripts (camp-01..05, camp-08, recip-01..02) | d92e8af | backend/test/smoke/camp-*.sh + recip-*.sh |
| 2 | run-all-phase4.sh orchestrator + update run-all.sh | fed4688 | backend/test/smoke/run-all-phase4.sh, run-all.sh |

## Verification Results

1. `ls backend/test/smoke/camp-0{1,2,3,4,5,8}-*.sh recip-0{1,2}-*.sh run-all-phase4.sh` — 9 files exist. PASS.
2. `grep -c "PASS: CAMP|PASS: RECIP" backend/test/smoke/*.sh` — 8 matching files (1 each). PASS.
3. `grep "run-all-phase4" backend/test/smoke/run-all.sh` — chain call present. PASS.
4. `grep "pagination.total|pagination.page" backend/test/smoke/camp-01-list.sh` — 3 matches (offset assertions). PASS.
5. `grep "nextCursor|hasMore" backend/test/smoke/recip-02-list.sh` — 5 matches (cursor assertions). PASS.
6. `grep -c "bash.*camp-0[12345]|bash.*camp-08|bash.*recip-0[12]" run-all-phase4.sh` — returns 8. PASS.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all scripts assert real API behavior. The 409 path in camp-04/05 is conditionally skipped with a WARN message when no non-draft campaign exists in the DB; seed data (Phase 2) should provide a sent campaign to cover that path fully.

## Threat Flags

No new security surface. Smoke scripts are test-only and not deployed. Demo credentials (demo@example.com / demo1234) are non-secret dev-only values per T-04-04-01 acceptance.

## Self-Check: PASSED

- `backend/test/smoke/camp-01-list.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/camp-02-create.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/camp-03-detail.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/camp-04-patch.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/camp-05-delete.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/camp-08-stats.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/recip-01-upsert.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/recip-02-list.sh` — FOUND (committed d92e8af)
- `backend/test/smoke/run-all-phase4.sh` — FOUND (committed fed4688)
- `backend/test/smoke/run-all.sh` — FOUND (committed fed4688)
- Commit d92e8af — verified in git log
- Commit fed4688 — verified in git log
