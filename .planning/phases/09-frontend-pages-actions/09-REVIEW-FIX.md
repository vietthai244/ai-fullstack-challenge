---
phase: 09-frontend-pages-actions
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/09-frontend-pages-actions/09-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-04-22T00:00:00Z
**Source review:** .planning/phases/09-frontend-pages-actions/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical, 4 Warning)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: AlertDialogAction closes dialog before send/delete mutation fires

**Files modified:** `frontend/src/pages/CampaignDetailPage.tsx`
**Commit:** 9f18823
**Applied fix:** Added `sendDialogOpen` and `deleteDialogOpen` controlled state variables. Both AlertDialog components now use `open`/`onOpenChange` props. The `AlertDialogAction` onClick uses `e.preventDefault()` to suppress Radix's built-in close behaviour. Dialogs close only inside `onSuccess` (`setSendDialogOpen(false)` / `setDeleteDialogOpen(false)`), so `disabled={mutation.isPending}` is now effective for the full duration of the in-flight request.

---

### WR-01: Schedule, send, and delete mutations have no onError handler

**Files modified:** `frontend/src/pages/CampaignDetailPage.tsx`
**Commit:** 9f18823
**Applied fix:** Added `onError` handler to all three action mutations (`scheduleMutation`, `sendMutation`, `deleteMutation`). Each handler calls `toast.error(message)` using the `sonner` toast already imported in the project. Error message falls back to a human-readable string when the error is not an `Error` instance.

---

### WR-02: Delete action allowed on scheduled campaigns — state-machine gap

**Files modified:** `frontend/src/pages/CampaignDetailPage.tsx`
**Commit:** 9f18823
**Applied fix:** Changed `canDelete` from `campaign.status === 'draft' || campaign.status === 'scheduled'` to `campaign.status === 'draft'` only, aligning the frontend guard with the backend DELETE endpoint which only permits draft campaigns.

---

### WR-03: Duplicate email in EmailTokenizer produces key collision and phantom remove

**Files modified:** `frontend/src/pages/NewCampaignPage.tsx`
**Commit:** 12b400f
**Applied fix:** Added `.filter((e) => !value.includes(e))` in `addEmail` to prevent duplicate entries being appended. Changed chip `key` from `email` to `` `${email}-${i}` `` (index tiebreaker). Changed remove handler from `value.filter((e) => e !== email)` to `value.filter((_, idx) => idx !== i)` so only the specific chip at position `i` is removed.

---

### WR-04: useQuery with enabled: !!id has no loading state when id is undefined

**Files modified:** `frontend/src/pages/CampaignDetailPage.tsx`
**Commit:** 9f18823
**Applied fix:** Added `if (!id) return <Navigate to="/campaigns" replace />;` as the first guard in the component body (before the `isPending` check). Also added `Navigate` to the react-router-dom import. This prevents the misleading "Campaign not found." message when the route has no `:id` segment and redirects cleanly to the campaign list.

---

_Fixed: 2026-04-22T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
