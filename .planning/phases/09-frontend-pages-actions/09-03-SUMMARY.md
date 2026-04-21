---
phase: 09-frontend-pages-actions
plan: "03"
subsystem: frontend
tags: [react-query, infinite-scroll, campaign-list, ui]
dependency_graph:
  requires: ["09-01"]
  provides: ["CampaignListPage"]
  affects: ["frontend/src/pages/CampaignListPage.tsx"]
tech_stack:
  added: []
  patterns:
    - useInfiniteQuery with initialPageParam (React Query v5 offset pagination)
    - IntersectionObserver sentinel for infinite scroll
key_files:
  created:
    - frontend/src/pages/CampaignListPage.tsx
  modified: []
decisions:
  - "Used isPending || !data guard to satisfy TypeScript strict null check on useInfiniteQuery data"
  - "Optional chaining on entries[0]?.isIntersecting to satisfy TS noUncheckedIndexedAccess"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
requirements:
  - UI-06
---

# Phase 9 Plan 03: CampaignListPage Summary

Offset-based infinite-scroll campaign list using useInfiniteQuery v5 with IntersectionObserver sentinel, CampaignBadge per row, skeleton loaders, and empty state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create CampaignListPage.tsx | e1fe3d3 | frontend/src/pages/CampaignListPage.tsx |

## What Was Built

`frontend/src/pages/CampaignListPage.tsx` — the primary post-login landing page.

Key behaviors:
- `useInfiniteQuery` with `initialPageParam: 1` (required by React Query v5)
- `getNextPageParam` reads `pagination.page < totalPages` — offset pagination, no `nextCursor`
- `IntersectionObserver` sentinel `<div>` at bottom of list triggers `fetchNextPage()` on viewport entry
- While `isPending`: renders 3 `Skeleton` rows (`h-20 w-full rounded-lg`)
- When campaigns array is empty: renders `EmptyState` with "No campaigns yet" + "New Campaign" CTA
- Each campaign row: `Card` with name (`text-sm font-semibold`), `createdAt` date (`text-xs muted`), `CampaignBadge`
- Clicking a row navigates to `/campaigns/:id`
- While `isFetchingNextPage`: single `Skeleton` row below list

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict null checks on useInfiniteQuery data**
- **Found during:** Task 1 — typecheck run
- **Issue:** `data.pages` TS error — `data` is `InfiniteData<CampaignPage> | undefined` even after `isPending` guard
- **Fix:** Changed guard to `if (isPending || !data)` to narrow `data` to non-undefined
- **Files modified:** frontend/src/pages/CampaignListPage.tsx
- **Commit:** e1fe3d3

**2. [Rule 1 - Bug] Optional chaining on IntersectionObserver entries[0]**
- **Found during:** Task 1 — typecheck run
- **Issue:** `entries[0]` typed as `IntersectionObserverEntry | undefined` under strict mode
- **Fix:** Changed to `entries[0]?.isIntersecting` 
- **Files modified:** frontend/src/pages/CampaignListPage.tsx
- **Commit:** e1fe3d3

## Known Stubs

None — CampaignListPage queries live API (`GET /campaigns`) via `useInfiniteQuery`. No hardcoded data.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Component consumes existing `GET /campaigns` API. Campaign names rendered as JSX text nodes — React escapes automatically. No `dangerouslySetInnerHTML`. No new threat surface beyond what plan's threat model covers.

## Self-Check: PASSED

- frontend/src/pages/CampaignListPage.tsx: FOUND
- commit e1fe3d3: FOUND
