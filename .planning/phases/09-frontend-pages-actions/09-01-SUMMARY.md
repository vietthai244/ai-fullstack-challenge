---
phase: 09-frontend-pages-actions
plan: "01"
subsystem: frontend
tags: [shadcn, react, react-hook-form, vitest, rtl, campaign-badge, query-cache, toast]
dependency_graph:
  requires:
    - frontend/src/components/ui/skeleton.tsx (Phase 8)
    - frontend/src/lib/utils.ts (Phase 8)
    - frontend/src/main.tsx (Phase 8)
    - shared/dist (CampaignStatus type)
  provides:
    - frontend/src/components/ui/badge.tsx
    - frontend/src/components/ui/progress.tsx
    - frontend/src/components/ui/alert-dialog.tsx
    - frontend/src/components/ui/button.tsx
    - frontend/src/components/ui/input.tsx
    - frontend/src/components/ui/label.tsx
    - frontend/src/components/ui/textarea.tsx
    - frontend/src/components/ui/card.tsx
    - frontend/src/components/ui/separator.tsx
    - frontend/src/components/CampaignBadge.tsx
    - frontend/src/test/CampaignBadge.test.tsx
    - frontend/src/main.tsx (QueryCache onError)
  affects: [frontend]
tech_stack:
  added:
    - react-hook-form@7.73.1
    - "@hookform/resolvers@5.2.2"
    - "@radix-ui/react-slot@^1.2.4"
    - "@radix-ui/react-progress@^1.1.8"
    - "@radix-ui/react-label@^2.1.8"
    - "@radix-ui/react-separator@^1.1.8"
    - "@radix-ui/react-alert-dialog@^1.1.15"
  patterns:
    - shadcn components written manually (homebrew yarn 1.22.19 blocks shadcn CLI `yarn add`)
    - badge.tsx adds data-slot="badge" attribute for RTL test DOM traversal
    - satisfies Record<CampaignStatus> for compile-time status exhaustiveness (m1 guard)
    - QueryCache onError wired to toast.error() for global React Query error handling
    - TDD RED/GREEN cycle for CampaignBadge
key_files:
  created:
    - frontend/src/components/ui/badge.tsx
    - frontend/src/components/ui/progress.tsx
    - frontend/src/components/ui/alert-dialog.tsx
    - frontend/src/components/ui/button.tsx
    - frontend/src/components/ui/input.tsx
    - frontend/src/components/ui/label.tsx
    - frontend/src/components/ui/textarea.tsx
    - frontend/src/components/ui/card.tsx
    - frontend/src/components/ui/separator.tsx
    - frontend/src/components/CampaignBadge.tsx
    - frontend/src/test/CampaignBadge.test.tsx
  modified:
    - frontend/package.json
    - frontend/src/main.tsx
    - yarn.lock
decisions:
  - "shadcn CLI add command blocked by homebrew yarn 1.22.19 (same as Phase 08-01 deviation); used --view to extract canonical source then wrote components manually with corepack yarn for deps"
  - "badge.tsx augmented with data-slot=badge attribute (not in shadcn default) to support RTL .closest('[data-slot=badge]') selector used in CampaignBadge.test.tsx"
  - "T-09-01-01 mitigated: QueryCache onError surfaces error.message only, not full axios error object (headers/tokens not leaked)"
metrics:
  duration: "4m"
  completed_date: "2026-04-22"
  tasks_completed: 3
  files_created: 11
  files_modified: 3
---

# Phase 09 Plan 01: Dependencies, shadcn Components, CampaignBadge, and Global Error Handler Summary

**One-liner:** 9 shadcn UI components installed manually, CampaignBadge with TDD + `satisfies Record<CampaignStatus>` exhaustiveness guard, and QueryCache `onError` toast wired in main.tsx.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install npm deps + shadcn UI components | 28a06b1 | frontend/package.json, 9x ui/*.tsx, yarn.lock |
| 2 (RED) | CampaignBadge test (failing) | a5d1cc1 | frontend/src/test/CampaignBadge.test.tsx |
| 2 (GREEN) | CampaignBadge component implementation | 0288c69 | frontend/src/components/CampaignBadge.tsx |
| 3 | Update main.tsx with QueryCache global error handler | edeca92 | frontend/src/main.tsx |

## Verification Results

| Check | Result |
|-------|--------|
| `yarn test --run src/test/CampaignBadge.test.tsx` (from worktree frontend/) | PASS — 4/4 tests |
| `tsc -p tsconfig.json --noEmit` | PASS — exit 0 |
| 11 files in frontend/src/components/ui/ | PASS |
| `grep QueryCache frontend/src/main.tsx` | PASS — import + instantiation |
| `grep "satisfies Record<CampaignStatus" CampaignBadge.tsx` | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI invokes homebrew yarn 1.22.19 (same as Phase 08-01)**
- **Found during:** Task 1
- **Issue:** `npx shadcn@latest add` internally calls PATH `yarn` which resolves to homebrew classic yarn 1.22.19; that CLI fails on `workspace:*` protocol in the monorepo. Pre-installing radix-ui deps via corepack yarn did not help — shadcn still tried to call `yarn add` and failed.
- **Fix:** Used `npx shadcn@latest add --view` to extract canonical component source; pre-installed all radix-ui deps via corepack `/usr/local/bin/yarn workspace @campaign/frontend add`; wrote all 9 component files manually.
- **Files modified:** badge.tsx, progress.tsx, alert-dialog.tsx, button.tsx, input.tsx, label.tsx, textarea.tsx, card.tsx, separator.tsx
- **Commits:** 28a06b1

**2. [Rule 1 - Bug] shadcn badge.tsx missing data-slot="badge" attribute**
- **Found during:** Task 1 (pre-emptive — inspected badge --view output before writing test)
- **Issue:** Canonical shadcn badge renders a `<div>` without any `data-slot` attribute. The plan's test uses `.closest('[data-slot="badge"]')` selector. Without the attribute, all 4 test assertions would fail.
- **Fix:** Added `data-slot="badge"` to the Badge component's root `<div>` when writing it manually. This is a minor augmentation consistent with newer shadcn versions that do add data-slot attributes.
- **Files modified:** frontend/src/components/ui/badge.tsx
- **Commits:** 28a06b1

**3. [Deviation] yarn workspace test command resolves to main repo**
- **Found during:** Task 2 verification
- **Issue:** `yarn workspace @campaign/frontend test --run` executes vitest against the MAIN repo's frontend directory (not the worktree), because `yarn workspace` resolves to the main repo root. Test files written in the worktree are not seen.
- **Fix:** Ran `yarn test --run` directly from `worktree/frontend/` directory instead of using `yarn workspace @campaign/frontend test`.
- **Impact:** No code change needed; just run commands directly from the worktree directory.

## Known Stubs

None — this plan creates infrastructure (UI components, global error handler, presentational badge component). No data-fetching or data rendering that could be stubbed.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. T-09-01-01 mitigated inline: QueryCache onError surfaces `error.message` only.

## Self-Check: PASSED

Files verified present:
- frontend/src/components/ui/badge.tsx: FOUND
- frontend/src/components/ui/progress.tsx: FOUND
- frontend/src/components/ui/alert-dialog.tsx: FOUND
- frontend/src/components/ui/button.tsx: FOUND
- frontend/src/components/ui/input.tsx: FOUND
- frontend/src/components/ui/label.tsx: FOUND
- frontend/src/components/ui/textarea.tsx: FOUND
- frontend/src/components/ui/card.tsx: FOUND
- frontend/src/components/ui/separator.tsx: FOUND
- frontend/src/components/CampaignBadge.tsx: FOUND
- frontend/src/test/CampaignBadge.test.tsx: FOUND
- frontend/src/main.tsx (QueryCache): FOUND

Commits verified in git log: 28a06b1, a5d1cc1, 0288c69, edeca92 — all present.
