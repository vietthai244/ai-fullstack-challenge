---
phase: 04-campaigns-recipients-crud
plan: "02"
subsystem: backend-services
tags: [campaign-service, recipient-service, offset-pagination, cursor-pagination, atomic-guards, stats-sql]
dependency_graph:
  requires: [phase-04-plan-01, phase-03-auth, phase-02-schema]
  provides: [campaignService, recipientService, offset-pagination-campaigns, cursor-pagination-recipients]
  affects:
    - backend/src/services/campaignService.ts
    - backend/src/services/recipientService.ts
tech_stack:
  added: []
  patterns:
    - offset-pagination-findAndCountAll
    - cursor-pagination-Sequelize-literal-composite
    - atomic-UPDATE-WHERE-status-RETURNING
    - COALESCE-EXCLUDED-upsert
    - COUNT-FILTER-aggregate-stats
    - sequelize-transaction-TOCTOU-guard
key_files:
  created:
    - backend/src/services/campaignService.ts
    - backend/src/services/recipientService.ts
  modified: []
decisions:
  - "D-15: upsertRecipientsByEmail uses ON CONFLICT DO UPDATE SET email = EXCLUDED.email RETURNING id (no-op trick for returning both new and existing rows in one query)"
  - "D-14: upsertRecipient uses COALESCE(EXCLUDED.name, recipients.name) — name preserved when not provided"
  - "C10/C11: atomic UPDATE WHERE status=draft RETURNING guards both updateCampaign and deleteCampaign — zero rows → ConflictError"
  - "C11-TOCTOU: deleteCampaign wraps findOne + guard + destroy in single sequelize.transaction() to prevent race between 404 check and destroy"
  - "D-16..D-21: listCampaigns uses findAndCountAll with OFFSET — page-number UI"
  - "D-16r..D-21r: listRecipients uses Sequelize.literal composite cursor — no offset"
  - "CLAUDE.md §3: computeCampaignStats uses single COUNT(*) FILTER aggregate SQL — zero JS counting"
metrics:
  duration: "~8m"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 2
---

# Phase 04 Plan 02: Service Layer (campaignService + recipientService) Summary

Both service files implementing all campaign and recipient business rules: offset-paginated campaign list, atomic status guards for update/delete, single-SQL stats aggregate, cursor-paginated recipient list, and COALESCE upsert semantics.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | campaignService.ts — 6 exports, stats SQL, atomic guards | 0d6c6c2 | backend/src/services/campaignService.ts |
| 2 | recipientService.ts — upsertRecipient + listRecipients (cursor) | 2376cf1 | backend/src/services/recipientService.ts |

## Verification Results

1. `node .yarn/releases/yarn-4.14.1.cjs workspace @campaign/backend typecheck` — exits 0. PASS.
2. `grep -c "FILTER (WHERE" campaignService.ts` — returns 5 (≥ 4 required). PASS.
3. `grep "NULLIF" campaignService.ts` — 2 NULLIF occurrences (divide-by-zero guards). PASS.
4. `grep "EXCLUDED.email" campaignService.ts` — present (D-15 no-op trick). PASS.
5. `grep "COALESCE(EXCLUDED.name" recipientService.ts` — present (D-14). PASS.
6. `grep "pagination" campaignService.ts` — offset pagination response shape present. PASS.
7. `grep "findAndCountAll" campaignService.ts` — present. PASS.
8. `grep -c "ConflictError" campaignService.ts` — returns 4 (≥ 2 required). PASS.
9. `grep -c "INVALID_CURSOR" recipientService.ts` — returns 4 (≥ 3 required). PASS.
10. `grep "Sequelize.literal" recipientService.ts` — present (C16 composite cursor). PASS.
11. No offset in recipientService.ts — confirmed. PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `transaction: undefined` incompatible with Sequelize `Transaction | null`**
- **Found during:** Task 1 typecheck
- **Issue:** `opts.transaction` typed as `Transaction | undefined`; Sequelize options require `Transaction | null`
- **Fix:** Spread `...(opts.transaction ? { transaction: opts.transaction } : {})` — omits the key entirely when no transaction provided
- **Files modified:** backend/src/services/campaignService.ts
- **Commit:** 0d6c6c2 (included in task commit)

**2. [Rule 1 - Bug] Fixed array element possibly undefined in `data[data.length - 1]`**
- **Found during:** Task 1 typecheck
- **Issue:** TypeScript's `exactOptionalPropertyTypes` flags array index access as `Recipient | undefined`
- **Fix:** Extracted `const lastItem = data.length > 0 ? data[data.length - 1] : null` with null guard
- **Files modified:** backend/src/services/recipientService.ts
- **Commit:** 2376cf1 (included in task commit)

## Known Stubs

None — all service functions implement real business logic with no placeholders.

## Threat Flags

No new security surface introduced. Both services enforce:
- T-04-02-01: cursor payload validated (isNaN guards) before reaching SQL
- T-04-02-02: atomic UPDATE WHERE status='draft' guards status transitions
- T-04-02-03: createdBy/userId filter on every query; NotFoundError on ownership miss
- T-04-02-04: all raw SQL uses named replacements — no string interpolation
- T-04-02-05: malformed cursor throws BadRequestError before reaching Sequelize

## Self-Check: PASSED

- `backend/src/services/campaignService.ts` — FOUND (committed 0d6c6c2)
- `backend/src/services/recipientService.ts` — FOUND (committed 2376cf1)
- Commit 0d6c6c2 — verified in git log
- Commit 2376cf1 — verified in git log
