---
phase: 09-frontend-pages-actions
plan: "05"
subsystem: frontend
tags: [react, react-query, redux, shadcn, routing, campaign-detail]
dependency_graph:
  requires: ["09-01", "09-02", "09-03", "09-04"]
  provides: ["CampaignDetailPage", "App-routing"]
  affects: ["frontend/src/App.tsx", "frontend/src/pages/CampaignDetailPage.tsx"]
tech_stack:
  added: []
  patterns:
    - "React Query v5 refetchInterval with Query object (not data)"
    - "datetime-local to UTC ISO via new Date(localString).toISOString()"
    - "onSettled for logout — clears auth on both success and 401"
    - "AlertDialog confirm before destructive mutations"
    - "Conditional actions by campaign status (exhaustive 4-state)"
key_files:
  created:
    - frontend/src/pages/CampaignDetailPage.tsx
  modified:
    - frontend/src/App.tsx
decisions:
  - "Used onSettled (not onSuccess) for logout to clear auth on 401 as well"
  - "Rendered campaign.body as plain text (whitespace-pre-wrap) — no dangerouslySetInnerHTML"
  - "Progress bar values multiply decimal rates by 100 (stats rates are 0.0–1.0)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 05: CampaignDetailPage + App.tsx Routing Summary

**One-liner:** Campaign detail page with React Query v5 polling, ISO schedule conversion, AlertDialog confirms, conditional actions by status, and full SPA route tree replacing Phase 8 placeholders.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create CampaignDetailPage.tsx | 05b5f0b | frontend/src/pages/CampaignDetailPage.tsx (new) |
| 2 | Wire App.tsx — replace Phase 8 placeholders | 8f254c7 | frontend/src/App.tsx (modified) |

## What Was Built

**CampaignDetailPage.tsx** — Full campaign detail view:
- React Query v5 `refetchInterval: (query) => query.state.data?.status === 'sending' ? 2000 : false` — polls every 2s when sending
- Schedule mutation converts `datetime-local` value via `new Date(localDateString).toISOString()` before POST (TZ boundary fix)
- Send and Delete mutations wrapped in `AlertDialog` confirm dialogs
- Conditional actions by status: `draft` → schedule+send+delete; `scheduled` → send+delete; `sending`/`sent` → no actions
- Progress bars: `(stats.send_rate ?? 0) * 100` and `(stats.open_rate ?? 0) * 100` (decimal → percentage)
- Logout: `onSettled` fires `dispatch(clearAuth())` BEFORE `navigate('/login', { replace: true })`
- campaign.body rendered as `<p className="whitespace-pre-wrap">{campaign.body}</p>` — no `dangerouslySetInnerHTML` (XSS guard T-09-05-01)
- Skeleton loading state, recipients list, stats counts grid

**App.tsx** — Route tree wired:
- Removed placeholder functions `LoginPage()` and `AppShell()`
- Imports `LoginPage`, `CampaignListPage`, `NewCampaignPage`, `CampaignDetailPage`
- Routes: `/login` (public), `/campaigns`, `/campaigns/new`, `/campaigns/:id` (all protected)
- `/campaigns/new` before `/campaigns/:id` to prevent "new" matching as campaign ID param
- Default redirect `/ → /campaigns` and catch-all `* → /campaigns`

## Verification

- `tsc --noEmit` exits 0 (typecheck clean)
- All 13 frontend tests pass (4 test files: CampaignBadge, ProtectedRoute, axios, bootstrap)
- `grep "query.state.data.*sending.*2000"` — found (v5 refetchInterval)
- `grep "dangerouslySetInnerHTML="` — not found (XSS safe)
- `grep "dispatch.*clearAuth"` — found in `onSettled`
- `grep "new Date.*toISOString"` — found in schedule mutation
- `grep "function LoginPage\|function AppShell"` in App.tsx — not found (placeholders removed)
- 4 page imports in App.tsx confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Requirements Satisfied

- UI-08: Campaign detail page with status badge and stats
- UI-09: Schedule action with datetime-local → ISO conversion
- UI-10: Send action with AlertDialog confirm
- UI-11: Delete action with AlertDialog confirm
- UI-13: Polling during sending status (refetchInterval)

## Known Stubs

None — all data flows from real API calls.

## Threat Surface Scan

No new network endpoints or auth paths introduced. All STRIDE mitigations from threat register applied:
- T-09-05-01: XSS guard — plain text render confirmed
- T-09-05-02: Past-date bypass — `min={minDatetime}` on input
- T-09-05-03: Double-click guard — `disabled={mutation.isPending}` on triggers
- T-09-05-05: Logout expired token — `onSettled` clears regardless of API outcome
- T-09-05-06: datetime-local TZ — `new Date().toISOString()` conversion applied

## Self-Check: PASSED

- `frontend/src/pages/CampaignDetailPage.tsx` — exists (360 lines)
- `frontend/src/App.tsx` — updated (52 lines, no placeholders)
- Commit 05b5f0b — exists (Task 1)
- Commit 8f254c7 — exists (Task 2)
