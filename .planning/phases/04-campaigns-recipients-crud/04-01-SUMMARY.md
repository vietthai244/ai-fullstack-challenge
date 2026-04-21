---
phase: 04-campaigns-recipients-crud
plan: "01"
subsystem: backend-db + shared-schemas
tags: [migration, sequelize, zod, recipients, user-scoping]
dependency_graph:
  requires: [phase-02-schema, phase-03-auth]
  provides: [recipients-user-id-column, composite-unique-constraint, d26-zod-schemas]
  affects: [backend/src/models/recipient.ts, shared/src/schemas/]
tech_stack:
  added: []
  patterns: [nullable-add-then-backfill-then-not-null, barrel-re-export-dist]
key_files:
  created:
    - backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs
    - shared/src/schemas/recipient.ts
  modified:
    - backend/src/models/recipient.ts
    - shared/src/schemas/campaign.ts
    - shared/src/schemas/index.ts
decisions:
  - "D-01: recipients are per-user; userId FK added to model with belongsTo User"
  - "D-02: migration adds user_id nullable, backfills to MIN(users.id), enforces NOT NULL, swaps constraint"
  - "D-26/D-27: all CRUD Zod schemas added to @campaign/shared and rebuilt"
metrics:
  duration: "116s"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 5
---

# Phase 04 Plan 01: Migration + Recipient Model + Shared Schemas Summary

Foundation layer for Phase 4: `user_id` FK on recipients table via migration, updated Recipient Sequelize model exposing `userId`, and all D-26 Zod schemas added to `@campaign/shared`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration — add user_id FK to recipients | 056fb77 | backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs |
| 2 | Recipient model userId + shared Zod schemas | 7a9513a | backend/src/models/recipient.ts, shared/src/schemas/campaign.ts, shared/src/schemas/recipient.ts, shared/src/schemas/index.ts |

## Verification Results

1. `\d recipients` — user_id BIGINT NOT NULL, constraint `recipients_user_id_email_key` (user_id, email), index `idx_recipients_user_id`. Old `recipients_email_key` absent. PASS.
2. Round-trip undo+redo — both exited 0. PASS.
3. `yarn workspace @campaign/backend typecheck` — exits 0. PASS.
4. `yarn workspace @campaign/shared build` — exits 0. PASS.
5. `dist/schemas/campaign.js` contains `CreateCampaignSchema` — PASS (build uses barrel re-exports, not bundling).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — migration uses deterministic backfill with no user input. Constraint swap replaces weak global unique with stronger per-user composite unique (no security regression per T-04-01-02).

## Self-Check: PASSED

- `backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs` — FOUND (committed 056fb77)
- `backend/src/models/recipient.ts` — FOUND (committed 7a9513a)
- `shared/src/schemas/campaign.ts` — FOUND (committed 7a9513a)
- `shared/src/schemas/recipient.ts` — FOUND (committed 7a9513a)
- `shared/src/schemas/index.ts` — FOUND (committed 7a9513a)
- Commit 056fb77 — verified in git log
- Commit 7a9513a — verified in git log
