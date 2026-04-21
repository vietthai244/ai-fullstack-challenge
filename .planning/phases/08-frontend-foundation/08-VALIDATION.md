---
phase: 8
slug: frontend-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 |
| **Config file** | `frontend/vitest.config.ts` — Wave 0 gap (must create) |
| **Quick run command** | `yarn workspace @campaign/frontend typecheck` |
| **Full suite command** | `yarn workspace @campaign/frontend test --run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @campaign/frontend typecheck`
- **After every plan wave:** Run `yarn workspace @campaign/frontend test --run`
- **Before `/gsd-verify-work`:** Full suite must be green + `tsc --noEmit` clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | UI-01 | — | N/A | smoke | `yarn workspace @campaign/frontend typecheck` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | UI-01 | — | N/A | smoke | `yarn workspace @campaign/frontend typecheck` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 2 | UI-03 | T-8-03 | Access token in Redux only (never localStorage) | unit | `yarn workspace @campaign/frontend test --run src/test/bootstrap.test.tsx` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 2 | UI-04 | T-8-04 | Redirect fires after bootstrap; `from` state is relative URL only | unit | `yarn workspace @campaign/frontend test --run src/test/ProtectedRoute.test.tsx` | ❌ W0 | ⬜ pending |
| 8-02-03 | 02 | 2 | UI-05 | T-8-05 | N concurrent 401s = exactly 1 refresh call; token never in localStorage | unit | `yarn workspace @campaign/frontend test --run src/test/axios.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/vitest.config.ts` — Vitest 2.1.9 config (jsdom environment, globals, setupFiles)
- [ ] `frontend/src/test/setup.ts` — jsdom polyfills (TextEncoder, structuredClone, ResizeObserver, matchMedia) + jest-dom import
- [ ] `frontend/src/test/bootstrap.test.tsx` — UI-03 coverage: single refresh→me chain, silent fail for logged-out
- [ ] `frontend/src/test/ProtectedRoute.test.tsx` — UI-04 coverage: redirect to /login + `from` state preserved
- [ ] `frontend/src/test/axios.test.ts` — UI-05 coverage: memoized refresh (N concurrent 401s = 1 call)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `yarn workspace @campaign/frontend dev` boots on :5173, HMR works | UI-01 | Vite dev server is process-based — no unit test covers live HMR | Run `yarn workspace @campaign/frontend dev`, open http://localhost:5173, verify no console errors |
| shadcn New York / Slate components render correctly | UI-01 | Visual design verification | Open app shell in browser, confirm Skeleton spinner displays with correct Slate background |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
