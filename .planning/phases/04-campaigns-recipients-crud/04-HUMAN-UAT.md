---
status: partial
phase: 04-campaigns-recipients-crud
source: [04-VERIFICATION.md]
started: 2026-04-21T00:00:00Z
updated: 2026-04-21T00:00:00Z
---

## Current Test

[awaiting human testing — requires live backend stack]

## Tests

### 1. Full smoke suite against live stack
expected: `bash backend/test/smoke/run-all-phase4.sh` exits 0 — all 8 camp/recip scripts pass
result: [pending]

### 2. recip-02-list.sh INVALID_CURSOR code mismatch
expected: Script at line 56 should assert `INVALID_CURSOR` (not `VALIDATION_ERROR`). Service throws `BadRequestError('INVALID_CURSOR')` — the smoke assertion needs a one-line patch to match. After patch, bad-cursor test should return 400 with `{ error: { code: 'INVALID_CURSOR' } }`.
result: [pending — fix script before running]

### 3. CAMP-04/05 409 seed dependency
expected: Phase 2 seed provides at least one non-draft campaign so the 409 guard branch executes during camp-04-patch.sh and camp-05-delete.sh. If no non-draft campaign exists, tests fall through the WARN path only.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
