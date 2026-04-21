---
phase: 08-frontend-foundation
plan: "03"
subsystem: frontend
tags: [react-18, bootstrap, protected-route, vitest, redux-toolkit, react-router]
dependency_graph:
  requires:
    - "08-02"
  provides:
    - frontend/src/main.tsx (React 18 root mount with Provider > QueryClientProvider > BrowserRouter)
    - frontend/src/App.tsx (route tree + useBootstrap at top level)
    - frontend/src/hooks/useBootstrap.ts (auth rehydration sequence hook)
    - frontend/src/components/ProtectedRoute.tsx (route guard with skeleton/redirect/children)
  affects: [frontend]
tech_stack:
  added: []
  patterns:
    - Provider nesting order: Redux outermost, React Query inside, BrowserRouter innermost
    - useBootstrap guard: if (bootstrapped) return prevents StrictMode double-invoke
    - ProtectedRoute three-state: skeleton (bootstrapping) / Navigate (logged-out) / children (authed)
    - from state as React Router Location object (not raw URL) — open redirect defense T-08-03-01
    - Phase 9 placeholder components inline in App.tsx to prevent import errors
key_files:
  created:
    - frontend/src/main.tsx
    - frontend/src/App.tsx
    - frontend/src/hooks/useBootstrap.ts
    - frontend/src/components/ProtectedRoute.tsx
  modified:
    - frontend/src/test/bootstrap.test.tsx (Wave-0 .todo → 3 real assertions)
    - frontend/src/test/ProtectedRoute.test.tsx (Wave-0 .todo → 3 real assertions)
    - frontend/src/test/axios.test.ts (Wave-0 .todo → 3 real assertions)
  deleted:
    - frontend/src/index.ts (Phase 1 placeholder replaced by main.tsx)
decisions:
  - "Phase 9 placeholder components (LoginPage, AppShell) defined inline in App.tsx — avoids import errors while keeping route structure; will be replaced when Phase 9 creates actual page components"
  - "useBootstrap bootstrapped guard uses useSelector dependency in useEffect — re-runs effect when bootstrapped changes but guard short-circuits; avoids StrictMode double-bootstrap (T-08-03-04)"
  - "axios.test.ts response interceptor tested via internal .handlers array access — only reliable way to unit-test interceptor logic without a real HTTP server"
metrics:
  duration: "4m 1s"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
  files_deleted: 1
---

# Phase 08 Plan 03: App Entry, Bootstrap Hook, Route Guard + Tests Summary

**One-liner:** React 18 root mount with correct Provider nesting, useBootstrap /auth/refresh→/auth/me rehydration hook, ProtectedRoute three-state guard, and all 9 Wave-0 test scaffolds replaced with real passing assertions.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | main.tsx + App.tsx + useBootstrap + ProtectedRoute | a25b4c7 | frontend/src/main.tsx, App.tsx, hooks/useBootstrap.ts, components/ProtectedRoute.tsx |
| 2 | Replace Wave-0 test scaffolds with real passing tests | 19b80e4 | frontend/src/test/bootstrap.test.tsx, ProtectedRoute.test.tsx, axios.test.ts |
| fix | Cast responseInterceptorRejected return type | 4be5922 | frontend/src/test/axios.test.ts |

## Verification Results

| Check | Result |
|-------|--------|
| `yarn workspace @campaign/frontend typecheck` | PASS (exit 0) |
| `yarn workspace @campaign/frontend test --run` | PASS (9 passed, 0 failures) |
| main.tsx contains `QueryClientProvider` | PASS |
| main.tsx contains `<Provider store={store}>` as outermost wrapper | PASS |
| main.tsx contains `BrowserRouter` | PASS |
| App.tsx contains `useBootstrap()` at top level | PASS |
| App.tsx contains `<Toaster />` | PASS |
| useBootstrap.ts contains `if (bootstrapped) return` | PASS |
| useBootstrap.ts contains `/auth/refresh` | PASS |
| useBootstrap.ts contains `/auth/me` | PASS |
| useBootstrap.ts contains `dispatch(clearAuth())` in catch | PASS |
| ProtectedRoute.tsx contains `Navigate` | PASS |
| ProtectedRoute.tsx contains `state={{ from: location }}` | PASS |
| ProtectedRoute.tsx contains `aria-label="Loading application"` | PASS |
| frontend/src/index.ts deleted | PASS |
| No `data-testid` in main.tsx | PASS |
| bootstrap.test.tsx: 3 non-todo tests, all passing | PASS |
| ProtectedRoute.test.tsx: 3 non-todo tests, all passing | PASS |
| axios.test.ts: 3 non-todo tests, all passing | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS2571 type error in axios.test.ts**
- **Found during:** Task 2 post-commit typecheck
- **Issue:** `responseInterceptorRejected` returns `unknown` (typed as `(e: unknown) => unknown`); calling `.catch()` directly on `unknown` fails strict TypeScript
- **Fix:** Cast return value to `Promise<unknown>` before calling `.catch(() => {})`
- **Files modified:** `frontend/src/test/axios.test.ts`
- **Commit:** 4be5922

## Threat Mitigations Applied

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-08-03-01 | `from` state is React Router `Location` object — passed directly to `<Navigate state={{ from: location }}>`, consumed as relative path by router; cannot encode absolute URL |
| T-08-03-02 | `useBootstrap()` in App.tsx at top level; comment explains intentional placement; ProtectedRoute spinner blocks redirect until bootstrap complete |
| T-08-03-03 | accessToken accessed only via `useSelector` in hook/component; never prop-drilled; never rendered |
| T-08-03-04 | `if (bootstrapped) return` guard before async bootstrap(); bootstrapped in useEffect deps array |
| T-08-03-05 | bootstrap uses `api.post/get` directly (not useQuery); auth state only in Redux; QueryClient has no auth cache entries |

## Known Stubs

- `LoginPage` component in App.tsx renders placeholder `<div data-testid="login-page">Login (Phase 9)</div>` — intentional Phase 9 placeholder, replaced when Phase 9 creates actual login page
- `AppShell` component in App.tsx renders placeholder `<div data-testid="app-shell">App (Phase 9)</div>` — intentional Phase 9 placeholder, replaced when Phase 9 creates campaign layout

These stubs do not block the plan's goal (bootstrap + route guard infrastructure) — they are holding positions for Phase 9 pages.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced beyond those in the plan's threat model.

## Self-Check: PASSED

- frontend/src/main.tsx: FOUND
- frontend/src/App.tsx: FOUND
- frontend/src/hooks/useBootstrap.ts: FOUND
- frontend/src/components/ProtectedRoute.tsx: FOUND
- frontend/src/test/bootstrap.test.tsx: FOUND (9 passing tests)
- frontend/src/test/ProtectedRoute.test.tsx: FOUND (9 passing tests)
- frontend/src/test/axios.test.ts: FOUND (9 passing tests)
- frontend/src/index.ts: DELETED (confirmed)
- Commit a25b4c7 (Task 1): VERIFIED in git log
- Commit 19b80e4 (Task 2): VERIFIED in git log
- Commit 4be5922 (fix): VERIFIED in git log
- `tsc --noEmit` exits 0: VERIFIED
- `vitest run` exits 0 (9/9 passed): VERIFIED
