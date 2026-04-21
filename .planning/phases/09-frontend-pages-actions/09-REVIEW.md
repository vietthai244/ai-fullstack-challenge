---
phase: 09-frontend-pages-actions
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - frontend/src/components/CampaignBadge.tsx
  - frontend/src/test/CampaignBadge.test.tsx
  - frontend/src/main.tsx
  - frontend/src/App.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/CampaignListPage.tsx
  - frontend/src/pages/NewCampaignPage.tsx
  - frontend/src/pages/CampaignDetailPage.tsx
  - frontend/src/components/ui/badge.tsx
  - frontend/src/components/ui/progress.tsx
  - frontend/src/components/ui/alert-dialog.tsx
  - frontend/src/components/ui/button.tsx
  - frontend/src/components/ui/input.tsx
  - frontend/src/components/ui/label.tsx
  - frontend/src/components/ui/textarea.tsx
  - frontend/src/components/ui/card.tsx
  - frontend/src/components/ui/separator.tsx
  - frontend/package.json
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-04-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Phase 9 delivers the full React frontend: login page, campaign list with infinite scroll, new campaign form, and campaign detail page with all state-machine actions. Security posture is strong — no `dangerouslySetInnerHTML`, tokens in Redux memory only, open-redirect defense is in place, and the `refetchInterval` uses the correct React Query v5 `(query) =>` signature.

One critical bug was found: the `sendMutation.isPending` check on the `AlertDialogAction` button inside the Send dialog is structurally unreachable, causing the dialog to close before the mutation ever completes, which can lead to double-submit. Four warnings cover missing mutation error surfaces, a state-machine gate omission for the Delete action, and a duplicate email key collision in the recipients tokenizer. Three info items cover minor quality issues.

---

## Critical Issues

### CR-01: AlertDialogAction closes dialog before send mutation fires — double-submit possible

**File:** `frontend/src/pages/CampaignDetailPage.tsx:279`

**Issue:** `AlertDialogAction` is a `@radix-ui/react-alert-dialog` Action primitive. By design, clicking it **always closes the dialog and unmounts it** before the `onClick` handler's async work completes. The `disabled={sendMutation.isPending}` on line 281 therefore never has a chance to be `true` from within the same dialog instance — by the time `sendMutation.isPending` flips to `true`, the dialog is already closed and the button is unmounted. The `AlertDialogAction` button for Delete (line 308) has the same structural issue.

The dangerous consequence: if the user somehow re-opens the dialog while the first send is still in-flight (e.g., via fast navigation back), a second `sendMutation.mutate()` call is made. The backend has an atomic status guard returning 409, so data corruption is prevented server-side, but the UI will show an unhandled error (no `onError` handler, only the global `QueryCache.onError` toast — which fires for all RQ errors but does not distinguish the 409 cause).

More critically, the `disabled` prop on `AlertDialogAction` has zero effect at the time it is rendered during the confirmation — `sendMutation.isPending` is `false` when the dialog is open (the mutation has not started yet). The button appears enabled every time the dialog opens, which is the intended behavior for a _confirmation_ step. But it means the guard is purely cosmetic: it could never prevent a double-click race within a single dialog session.

**Fix:** Move the mutation call out of `AlertDialogAction.onClick` and use controlled dialog state with `open`/`onOpenChange` so the dialog stays open while the mutation is in-flight. Disable the action button using a local `isPending` state derived from the mutation, and only close via `onSuccess`:

```tsx
// Replace uncontrolled AlertDialog pattern for send action:
const [sendDialogOpen, setSendDialogOpen] = useState(false);

const sendMutation = useMutation({
  mutationFn: () => api.post(`/campaigns/${id}/send`),
  onSuccess: async () => {
    setSendDialogOpen(false);  // close AFTER success
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
    ]);
  },
});

// In JSX:
<AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
  <AlertDialogTrigger asChild>
    <Button variant="default" disabled={sendMutation.isPending}>
      Send Now
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    ...
    <AlertDialogFooter>
      <AlertDialogCancel disabled={sendMutation.isPending}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={(e) => {
          e.preventDefault();  // prevent radix auto-close
          sendMutation.mutate();
        }}
        disabled={sendMutation.isPending}
      >
        {sendMutation.isPending ? 'Sending...' : 'Send'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Apply the same controlled pattern to the Delete `AlertDialog` (lines 289–317).

---

## Warnings

### WR-01: Schedule and send mutations have no `onError` handler — errors silently swallowed

**File:** `frontend/src/pages/CampaignDetailPage.tsx:108-131`

**Issue:** `scheduleMutation` (line 108) and `sendMutation` (line 124) define only `onSuccess`. Mutation errors (network failure, 409 conflict from the backend state-machine guard, 422 validation) are swallowed — the only surface is the global `QueryCache.onError` in `main.tsx`, which fires a toast. However `QueryCache.onError` only catches query errors, not mutation errors. Mutation errors are not captured by `QueryCache`; they require either a `mutationCache` option on `QueryClientProvider` or an explicit `onError` in the mutation definition. The result is: if `POST /campaigns/:id/send` returns 409 (campaign already sending/sent), the user sees no feedback.

**Fix:** Add `onError` handlers, or add a `MutationCache` to the `QueryClient` in `main.tsx`:

```tsx
// Option A: per-mutation (preferred for action-specific messaging)
const sendMutation = useMutation({
  mutationFn: () => api.post(`/campaigns/${id}/send`),
  onError: (error) => {
    const message = error instanceof Error ? error.message : 'Failed to send campaign';
    toast.error(message);
  },
  onSuccess: async () => { ... },
});

// Option B: global mutationCache in main.tsx (catches all mutations)
import { MutationCache } from '@tanstack/react-query';
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: ... }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      toast.error(message);
    },
  }),
});
```

The same applies to `deleteMutation` (line 135) and `scheduleMutation` (line 108).

---

### WR-02: Delete action allowed on `scheduled` campaigns — state-machine gap

**File:** `frontend/src/pages/CampaignDetailPage.tsx:159`

**Issue:** `canDelete` is defined as:
```ts
const canDelete = campaign.status === 'draft' || campaign.status === 'scheduled';
```

Allowing deletion of `scheduled` campaigns is potentially correct if the backend permits it, but there is a state-machine risk: a scheduled campaign could be picked up by the BullMQ worker between the user clicking "Delete" and the DELETE request arriving. The backend must handle this with an atomic guard (similar to the send endpoint). If the backend returns 409 or 404 on delete-of-a-sending/sent campaign, the UI has no `onError` handler (see WR-01) to surface this to the user — they will see no feedback and the campaign will remain on the list.

This is a composite issue with WR-01, but worth calling out independently because it is a state-machine correctness concern: if the spec (CLAUDE.md) states the delete endpoint only accepts `draft` status, then `canDelete` should be `campaign.status === 'draft'` only. Verify the backend endpoint's allowed-status guard and align the frontend condition to match exactly.

**Fix:** Confirm backend DELETE guard. If DELETE is only permitted for `draft`, change to:
```ts
const canDelete = campaign.status === 'draft';
```

---

### WR-03: Duplicate email in recipients tokenizer produces broken UI (key collision + phantom remove)

**File:** `frontend/src/pages/NewCampaignPage.tsx:47`

**Issue:** The `EmailTokenizer` uses `email` string as the React `key` for chip spans (line 47: `key={email}`). If the user adds the same email twice (which is not prevented by `addEmail`), two chips render with identical keys — React's reconciler silently deduplicates DOM nodes, causing one chip to disappear visually while both strings remain in the `value` array. The remove button (line 51) uses `value.filter((e) => e !== email)`, which removes **all occurrences** of that email when clicked, not just the intended one.

Additionally, `addEmail` does not deduplicate against the existing `value` array before calling `onChange`. Zod validation on the backend (`CreateCampaignSchema`) may also reject duplicate emails depending on the schema definition, but the user gets no feedback until form submission.

**Fix:** Deduplicate on add and use index as a key tiebreaker:

```tsx
const addEmail = (raw: string) => {
  const emails = raw
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .filter((e) => !value.includes(e)); // deduplicate against existing
  if (emails.length > 0) {
    onChange([...value, ...emails]);
    setInputValue('');
  }
};

// In JSX — use index as part of key to avoid collisions if somehow duplicates exist:
{value.map((email, i) => (
  <span key={`${email}-${i}`} ...>
    {email}
    <button onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
      ×
    </button>
  </span>
))}
```

---

### WR-04: `useQuery` with `enabled: !!id` does not handle missing `id` — renders "Campaign not found" on direct navigation with undefined id

**File:** `frontend/src/pages/CampaignDetailPage.tsx:95-105`

**Issue:** `id` comes from `useParams<{ id: string }>()`. TypeScript types it as `string | undefined`. The `enabled: !!id` guard prevents the query from firing when `id` is falsy, which is correct. However when `id` is undefined (direct navigation to `/campaigns/` with no id segment), the component does not return early — it falls through to:

```ts
if (isPending) return <DetailSkeleton />;
if (!campaign) return <p ...>Campaign not found.</p>;
```

With `enabled: false`, `isPending` is `false` and `campaign` is `undefined`, so the user sees "Campaign not found." immediately without any skeleton. This is a minor UX issue but also a potential diagnostic confusion — the real problem is the missing route parameter, not a 404. More importantly, `api.get('/campaigns/undefined')` would fire if the `enabled` guard were accidentally removed.

This is unlikely in practice because the router only navigates here with a valid `:id`. But it's a fragile pattern.

**Fix:** Add an explicit guard at the top of the component body:

```tsx
if (!id) return <Navigate to="/campaigns" replace />;
```

---

## Info

### IN-01: `CampaignListPage` comment says "offset-based" but code is actually page-number based — misleading comment

**File:** `frontend/src/pages/CampaignListPage.tsx:3-6`

**Issue:** The file header comment states "offset-based infinite scroll" and "CRITICAL: GET /campaigns uses OFFSET pagination (page/limit/totalPages)". True offset pagination uses `?offset=N&limit=M`. What the code actually uses is page-number pagination (`?page=N&limit=20`). These are related but distinct — offset is computed server-side from `(page-1)*limit`. The comment at the top is technically misleading and contradicts CLAUDE.md which specifies cursor-based pagination (`Base64url {created_at_iso, id}`).

If the backend was built to CLAUDE.md spec (cursor pagination), but this frontend uses `?page=N`, they will be incompatible at integration time. If the backend was intentionally changed to page-number pagination, CLAUDE.md should be updated. This needs alignment confirmation before integration testing.

**Fix:** Either align frontend to use cursor-based `?cursor=...` pagination matching the backend spec, or confirm the spec was intentionally changed to page-number and update CLAUDE.md accordingly.

---

### IN-02: `scheduleMutation` converts `datetime-local` without timezone validation

**File:** `frontend/src/pages/CampaignDetailPage.tsx:112`

**Issue:** `new Date(localDateString).toISOString()` interprets a `datetime-local` string (e.g., `"2026-05-01T14:00"`) as **local time** in the browser's timezone. This is the intended and correct behavior as documented in the comment. However, there is no validation that the resulting ISO string is in the future at submission time — the `min` attribute on the `<input>` (line 246: `min={minDatetime}`) prevents past selection in browsers that enforce it, but `min` is not enforced on all browsers and can be bypassed by direct DOM manipulation or programmatic input.

The backend should validate `scheduled_at` is in the future, and likely does. This is an info item because a past schedule on the backend may result in the campaign being immediately dispatched (not an error per se), but the UX intent is to prevent past scheduling.

**Fix:** Add a pre-submit guard in the `onClick` handler before calling `scheduleMutation.mutate`:
```tsx
onClick={() => {
  if (new Date(scheduleInput) <= new Date()) {
    toast.error('Scheduled time must be in the future');
    return;
  }
  scheduleMutation.mutate(scheduleInput);
}}
```

---

### IN-03: `main.tsx` mounts `document.getElementById('root')!` with non-null assertion — no null guard

**File:** `frontend/src/main.tsx:33`

**Issue:** `document.getElementById('root')!` uses a non-null assertion. If the `root` div is absent from `index.html` (e.g., template error or incorrect build), React will throw an uncaught runtime error with a cryptic message ("Cannot read properties of null"). This is a standard React pattern but worth noting — since the app ships in Docker with nginx, a malformed `index.html` would be the likely failure mode.

**Fix:** Add an explicit null check for clearer error messaging in development:
```ts
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');
ReactDOM.createRoot(rootEl).render(...);
```

---

_Reviewed: 2026-04-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
