---
phase: 04-campaigns-recipients-crud
plan: "03"
subsystem: backend-routes
tags: [campaign-routes, recipient-routes, offset-pagination, cursor-pagination, thin-handlers, decisions]
dependency_graph:
  requires: [phase-04-plan-01, phase-04-plan-02, phase-03-auth]
  provides: [campaignsRouter, recipientsRouter, DECISIONS-per-user-recipients, DECISIONS-offset-pagination]
  affects:
    - backend/src/routes/campaigns.ts
    - backend/src/routes/recipients.ts
    - docs/DECISIONS.md
tech_stack:
  added: []
  patterns:
    - thin-handler-try-catch-next
    - validate-middleware-query-coerce
    - router-level-authenticate-C7
    - offset-pagination-response-envelope
    - cursor-pagination-response-envelope
key_files:
  created: []
  modified:
    - backend/src/routes/campaigns.ts
    - backend/src/routes/recipients.ts
    - docs/DECISIONS.md
decisions:
  - "T-04-03-03: GET /:id/stats reuses getCampaignDetail for ownership check — no duplicate query, no bypass possible"
  - "D-24: handlers are thin — validate → service → envelope; zero business logic in route files"
  - "DECISIONS.md: per-user recipients composite constraint rationale appended"
  - "DECISIONS.md: offset-over-cursor for campaign list rationale appended"
metrics:
  duration: "~2m"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 3
---

# Phase 04 Plan 03: Route Handlers (campaigns + recipients) Summary

Two route files replacing Phase 3 stubs with 6 campaign endpoints (offset list, create, detail, patch, delete, stats) and 2 recipient endpoints (upsert, cursor list), plus two decision entries appended to docs/DECISIONS.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace campaigns.ts stub with 6 full route handlers | f305d3a | backend/src/routes/campaigns.ts |
| 2 | Replace recipients.ts stub + append docs/DECISIONS.md | d583fe0 | backend/src/routes/recipients.ts, docs/DECISIONS.md |

## Verification Results

1. `node .yarn/releases/yarn-4.14.1.cjs workspace @campaign/backend typecheck` — exits 0. PASS.
2. `grep -c "campaignsRouter\.(get|post|patch|delete)" campaigns.ts` — returns 6. PASS.
3. `grep "OffsetPageQuerySchema" campaigns.ts` — present. PASS.
4. `grep "pagination" campaigns.ts` — offset response envelope present. PASS.
5. `grep "CursorPageQuerySchema|nextCursor|hasMore" campaigns.ts` — 0 matches. PASS.
6. `grep -c "next(err)" campaigns.ts` — returns 6. PASS.
7. `grep "authenticate" campaigns.ts` — router-level mount preserved. PASS.
8. `grep -c "recipientsRouter.(post|get)" recipients.ts` — returns 2. PASS.
9. `grep "CursorPageQuerySchema" recipients.ts` — present. PASS.
10. `grep "nextCursor|hasMore" recipients.ts` — present. PASS.
11. `grep "OffsetPageQuerySchema|pagination.*page.*limit" recipients.ts` — 0 matches. PASS.
12. `grep "Per-User Recipients|Campaign List Pagination" DECISIONS.md` — 2 matches. PASS.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all 8 handlers wire to real service functions with no placeholders.

## Threat Flags

No new security surface introduced beyond the plan's threat model. All T-04-03-0x mitigations applied:
- T-04-03-01: getCampaignDetail WHERE createdBy=userId enforced in service layer
- T-04-03-02: updateCampaign/deleteCampaign atomic guards in service layer
- T-04-03-03: GET /:id/stats calls getCampaignDetail first — ownership verified before stats returned
- T-04-03-04: NaN from Number(req.params.id) propagates to service → NotFoundError 404
- T-04-03-05: OffsetPageQuerySchema Zod max(100) enforced via validate middleware

## Self-Check: PASSED

- `backend/src/routes/campaigns.ts` — FOUND (committed f305d3a)
- `backend/src/routes/recipients.ts` — FOUND (committed d583fe0)
- `docs/DECISIONS.md` — FOUND (committed d583fe0)
- Commit f305d3a — verified in git log
- Commit d583fe0 — verified in git log
