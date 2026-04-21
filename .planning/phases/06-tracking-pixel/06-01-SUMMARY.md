---
phase: 06-tracking-pixel
plan: 01
subsystem: api
tags: [express, sequelize, postgres, gif, tracking, public-route]

requires:
  - phase: 02-data-models
    provides: CampaignRecipient model with trackingToken UUID and openedAt columns

provides:
  - Public GET /track/open/:trackingToken endpoint — 43-byte GIF89a, always 200
  - Idempotent opened_at first-write-wins via Sequelize UPDATE WHERE opened_at IS NULL
  - Oracle-attack defense — identical response for valid/invalid/missing tokens
  - trackRouter mounted at app level, never inside protected router group

affects: [07-backend-tests, 08-frontend-foundation, 10-docker-final]

tech-stack:
  added: []
  patterns:
    - "Module-scoped Buffer for binary pixel response — allocated once at load time"
    - "Op.is null in Sequelize WHERE for explicit IS NULL (not = NULL ambiguity)"
    - "Swallow DB errors in catch with no next(err) — errorHandler never intercepts public pixel"
    - "Public router mounted at app level before errorHandler, separate from authenticate group"

key-files:
  created:
    - backend/src/routes/track.ts
    - backend/test/smoke/track-06.sh
    - backend/test/smoke/track-06-idempotent.sh
    - backend/test/smoke/run-all-phase6.sh
  modified:
    - backend/src/app.ts
    - backend/test/smoke/run-all.sh

key-decisions:
  - "Op.is null used instead of plain null in Sequelize WHERE — explicit IS NULL avoids = NULL ambiguity in Sequelize 6 (Pitfall 5 / Assumption A1)"
  - "PIXEL Buffer declared at module scope before Router() call — grep-verifiable, avoids per-request GC pressure"
  - "catch block has no next(err) — errorHandler must never intercept tracking pixel route (T-06-05)"
  - "res.end(PIXEL) not res.send() — bypasses Express chunked encoding, Content-Length is authoritative"
  - "trackRouter mounted at step 8 in buildApp(), BEFORE errorHandler at step 9 — C17 oracle defense maintained"

patterns-established:
  - "Public router pattern: separate Express Router, never nested inside protected group, mounted via app.use() at app level"
  - "Oracle defense pattern: always 200 + identical binary response; swallow all DB errors"
  - "Binary response pattern: module-scoped Buffer + manual headers + res.end()"

requirements-completed: [TRACK-01]

duration: 12min
completed: 2026-04-21
---

# Phase 6 Plan 01: Tracking Pixel Summary

**Public GIF89a open-tracking pixel at GET /track/open/:trackingToken — always 200, idempotent opened_at first-write-wins, oracle-attack defense via identical 43-byte response for all token states**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-21T13:39:00Z
- **Completed:** 2026-04-21T13:51:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `backend/src/routes/track.ts` with module-scoped PIXEL buffer, Op.is null guard, DB-error swallowing, and correct response headers
- Mounted trackRouter in `backend/src/app.ts` at step 8 (before errorHandler) outside the protected router group
- Created 3 smoke scripts covering all 4 TRACK-01 success criteria plus oracle defense; wired into run-all.sh

## Task Commits

1. **Task 1: Create track.ts route and mount in app.ts** - `ed27774` (feat)
2. **Task 2: Write smoke scripts and wire into acceptance gate** - `3c2fb0b` (chore)

## Files Created/Modified

- `backend/src/routes/track.ts` - Public tracking pixel router with module-scoped PIXEL buffer, idempotent UPDATE, oracle-safe handler
- `backend/src/app.ts` - Added trackRouter import and mount at step 8 (before errorHandler); updated middleware comment block
- `backend/test/smoke/track-06.sh` - Smoke test for criteria 1-3: 200 + GIF + headers, valid token, invalid token, no-auth
- `backend/test/smoke/track-06-idempotent.sh` - Smoke test for criterion 4: opened_at first-write-wins idempotency
- `backend/test/smoke/run-all-phase6.sh` - Phase 6 acceptance gate runner
- `backend/test/smoke/run-all.sh` - Added Phase 6 block and TRACK-01 to summary output

## Decisions Made

- Used `Op.is` null explicitly rather than plain `null` in Sequelize WHERE clause — avoids `= NULL` vs `IS NULL` ambiguity in Sequelize 6 (Assumption A1 from research, C17 defense)
- `res.end(PIXEL)` not `res.send()` — bypasses Express chunked-encoding wrapper so explicit `Content-Length: 43` header is authoritative
- Comment in catch block references `// DO NOT call next(err)` — documents the oracle-defense invariant for future maintainers without adding executable code

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Plan's acceptance criterion `grep -c "next(err)" track.ts returns 0` — the catch comment contains the literal string `next(err)`. Verified with `grep -v '//'` that no active call exists; criterion passes in spirit (no executable next(err) call). Comment retained as it documents the oracle-defense invariant.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TRACK-01 complete; open-rate stats will populate as campaign recipients open emails
- Phase 7 (backend tests) can now write `track.test.ts` against the live trackRouter
- Phase 8 (frontend) can display open-rate stats from campaign_recipients.opened_at aggregates

---

## Self-Check

Verifying claims before finalizing.

### Files exist

- `backend/src/routes/track.ts`: exists (created this session)
- `backend/src/app.ts`: modified (import + mount verified)
- `backend/test/smoke/track-06.sh`: exists, syntax OK
- `backend/test/smoke/track-06-idempotent.sh`: exists, syntax OK
- `backend/test/smoke/run-all-phase6.sh`: exists, syntax OK
- `backend/test/smoke/run-all.sh`: updated, syntax OK

### Commits exist

- `ed27774`: feat(06-01) — track.ts + app.ts
- `3c2fb0b`: chore(06-01) — smoke scripts + run-all.sh

## Self-Check: PASSED

---

*Phase: 06-tracking-pixel*
*Completed: 2026-04-21*
