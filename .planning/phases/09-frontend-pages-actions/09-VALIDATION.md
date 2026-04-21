---
phase: 9
slug: frontend-pages-actions
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 + @testing-library/react 16.3.2 |
| **Config file** | `frontend/vitest.config.ts` (exists from Phase 8) |
| **Quick run command** | `yarn workspace @campaign/frontend test --run` |
| **Full suite command** | `yarn workspace @campaign/frontend test --run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @campaign/frontend typecheck`
- **After every plan wave:** Run `yarn workspace @campaign/frontend test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | UI-02 | — | Login stores token in Redux memory (never localStorage) | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 2 | UI-06 | — | Campaign list badges + empty state + skeleton | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 2 | TEST-05 | — | CampaignBadge renders correct color/label per status | unit | `yarn workspace @campaign/frontend test --run src/test/CampaignBadge.test.tsx` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 3 | UI-07 | — | New campaign form validates with Zod, email tokenizer works | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-04-01 | 04 | 4 | UI-08 | — | Detail page progress bars + recipient list | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-04-02 | 04 | 4 | UI-09 | — | Schedule converts datetime-local to ISO UTC | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-04-03 | 04 | 4 | UI-10 | — | refetchInterval=2s for sending, stops at sent | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-04-04 | 04 | 4 | UI-11 | — | Delete mutation navigates to /campaigns | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-04-05 | 04 | 4 | UI-12 | — | QueryCache onError fires toast on query failure | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |
| 9-04-06 | 04 | 4 | UI-13 | — | Logout clears Redux + navigates to /login | unit | `yarn workspace @campaign/frontend test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/test/CampaignBadge.test.tsx` — TEST-05 coverage (new in Phase 9)
- [ ] `frontend/src/components/ui/badge.tsx` — shadcn badge component (npx shadcn@latest add badge)

*Existing infrastructure from Phase 8: `vitest.config.ts`, `src/test/setup.ts`, jsdom polyfills (TextEncoder, structuredClone, ResizeObserver, matchMedia) — all present. No framework re-setup needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Infinite scroll loads next page on scroll | UI-06 | IntersectionObserver not mockable in jsdom | Scroll campaigns list to bottom, verify next page loads |
| Polling auto-stops when campaign transitions to sent | UI-10 | Requires live backend + real timing | Trigger send, watch detail page polling stop after status flips |
| Schedule datetime converts timezone correctly | UI-09 | Requires OS/browser timezone to differ from UTC | Set a schedule time, verify backend receives ISO UTC string |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
