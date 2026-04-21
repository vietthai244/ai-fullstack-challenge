---
phase: "09"
plan: "04"
subsystem: frontend
tags: [react, react-hook-form, zod, react-query, email-tokenizer]
dependency_graph:
  requires:
    - "09-01"  # shadcn components + CampaignBadge
    - "09-02"  # LoginPage (import pattern reference)
    - "09-03"  # CampaignListPage (query key contract)
  provides:
    - NewCampaignPage  # Zod-validated campaign creation form
  affects:
    - frontend/src/pages/NewCampaignPage.tsx
tech_stack:
  added: []
  patterns:
    - react-hook-form Controller for controlled array field (recipientEmails)
    - EmailTokenizer inline component (comma/Enter tokenization + onBlur finalization)
    - useMutation onSuccess: invalidateQueries + navigate
key_files:
  created:
    - frontend/src/pages/NewCampaignPage.tsx
  modified: []
decisions:
  - "EmailTokenizer kept inline in NewCampaignPage.tsx (single consumer; plan permits inline or extracted)"
  - "addEmail splits on /[,\\s]+/ to handle comma, space, and combined delimiters"
metrics:
  duration: "~5 min"
  completed: "2026-04-22"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
requirements:
  - UI-07
---

# Phase 09 Plan 04: NewCampaignPage Summary

One-liner: Zod-validated campaign creation form with inline EmailTokenizer (comma/Enter chip tokenization) and React Query mutation routing to detail on success.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create NewCampaignPage.tsx | bb6c316 | frontend/src/pages/NewCampaignPage.tsx |

## What Was Built

`NewCampaignPage` — a React page at `/campaigns/new` with:

- `react-hook-form` + `zodResolver(CreateCampaignSchema)` for form validation
- Four fields: Campaign Name (`Input`), Email Subject (`Input`), Email Body (`Textarea`), Recipients (`EmailTokenizer`)
- `EmailTokenizer`: inline component that converts comma/Enter key input to string[] chip tokens; `onBlur` finalizes pending text; each chip has an × remove button
- Per-field Zod error messages rendered as `<p class="text-destructive text-sm">` below each field
- `useMutation` → `POST /campaigns` → on success: `invalidateQueries(['campaigns'])` then `navigate('/campaigns/:id')`
- Submit button shows `'Creating...'` and is disabled while `createMutation.isPending` (double-submit guard per T-09-04-03)
- Server error surfaced inline below the form

## Deviations from Plan

None — plan executed exactly as written. EmailTokenizer matches the reference implementation from `<interfaces>` section verbatim.

## Threat Model Compliance

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-09-04-01 | `zodResolver(CreateCampaignSchema)` validates all fields client-side (server validates independently) |
| T-09-04-02 | Email chips display user's own input back — no cross-user info leak |
| T-09-04-03 | `disabled={createMutation.isPending}` prevents double-submit |

## Known Stubs

None — all form fields wired to the POST mutation. No placeholder data.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check

- [x] `frontend/src/pages/NewCampaignPage.tsx` exists
- [x] `zodResolver(CreateCampaignSchema)` present (line 88)
- [x] `Controller` + `recipientEmails` present
- [x] `e.key === 'Enter'` and `e.key === ','` present
- [x] `onBlur` present
- [x] `invalidateQueries` present
- [x] `'Creating...'` present
- [x] `tsc --noEmit` exits 0
- [x] Commit bb6c316 exists

## Self-Check: PASSED
