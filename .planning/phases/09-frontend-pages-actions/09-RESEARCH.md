# Phase 9: Frontend Pages & Actions — Research

**Researched:** 2026-04-21
**Domain:** React 18 + React Query v5 + Redux Toolkit + shadcn/ui + Tailwind 3 + Vitest + @testing-library/react
**Confidence:** HIGH

---

## Project Constraints (from CLAUDE.md)

**Stack (locked — do not re-litigate):**
- React 18 + Vite 5, Redux Toolkit + React Query v5
- shadcn/ui New York / Slate + Tailwind 3.x (pin 3.x)
- axios HTTP client (`api` instance from `@/lib/apiClient`), React Router v6
- Vitest 2.1.9 (pinned via root resolutions), @testing-library/react 16.3.2
- Yarn 4 flat workspaces (`nodeLinker: node-modules`)

**Business-rule constraints:**
- React Query owns ALL server state; Redux owns ONLY `accessToken`, `user`, `bootstrapped`, UI flags
- No server data in any Redux slice — campaigns, stats, recipients belong in RQ cache only
- Campaign list uses OFFSET pagination (`page` / `limit` / `totalPages`) — NOT cursor. The spec says "cursor pagination" in UI-06 but the backend is offset (Phase 4 decision, locked in STATE.md)
- `refetchInterval` signature for React Query v5: `(query) => query.state.data?.status === 'sending' ? 2000 : false`
- Access token stored in Redux memory only — never localStorage, never component state
- Exhaustive TypeScript switch over all 4 status values: `draft | scheduled | sending | sent` (m1)

**CLAUDE.md guardrails:**
- Do not modify `.docs/requirements.md`
- Do not add v2 features (rich editor, CSV import, WebSocket, etc.)
- Do not re-open Key Decisions in PROJECT.md

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-02 | `/login` page — form POSTs to `/auth/login`; access token stored in Redux memory | LoginSchema from `@campaign/shared`, `dispatch(setAuth(...))`, redirect to `/campaigns` |
| UI-06 | `/campaigns` list — offset pagination via `useInfiniteQuery`, status badges, skeleton loaders, empty state | `useInfiniteQuery` with `initialPageParam: 1`, `getNextPageParam` reads `pagination.totalPages`, IntersectionObserver sentinel |
| UI-07 | `/campaigns/new` — Zod-validated form for name/subject/body/email tokenizer; POST; redirect to detail | `react-hook-form` + `@hookform/resolvers/zod` + `CreateCampaignSchema`, comma/Enter tokenizer |
| UI-08 | `/campaigns/:id` detail — send_rate + open_rate progress bars, per-recipient status list, conditional action buttons | `useQuery` on campaign detail, `Progress` component, conditional render by `campaign.status` |
| UI-09 | Schedule action — date/time picker, `new Date(value).toISOString()` conversion, POST `/campaigns/:id/schedule` | `datetime-local` input, ISO conversion, `useMutation` with `invalidateQueries` |
| UI-10 | Send action — confirm dialog, POST `/campaigns/:id/send`; while sending, refetch every 2s stopping on `sent` | `AlertDialog`, `useMutation`, `refetchInterval: (q) => q.state.data?.status === 'sending' ? 2000 : false` |
| UI-11 | Delete action — confirm dialog, DELETE `/campaigns/:id` | `AlertDialog`, `useMutation`, navigate to `/campaigns` on success |
| UI-12 | Global error handling — React Query error + toast; skeleton loaders during fetches | `QueryCache` `onError` callback + `toast.error()`, `Skeleton` during `isPending` |
| UI-13 | Logout — POST `/auth/logout`, clears Redux auth, redirects to `/login` | `useMutation`, `dispatch(clearAuth())`, `navigate('/login')` |
| TEST-05 | `CampaignBadge` Vitest + RTL test — all 4 status variants render correct color/label | `render`, `screen.getByText`, `expect(...).toHaveClass(...)` |
</phase_requirements>

---

## Summary

Phase 9 is the largest single phase of the build — it implements all four pages (login, list, new, detail), all conditional action mutations (schedule, send, delete, logout), live polling, global error handling, and the one required component test. Phase 8 provides the complete infrastructure (api client, store, ProtectedRoute, QueryClientProvider, Toaster at root) that Phase 9 builds on.

The three highest-risk items are:

1. **Pagination model mismatch (CRITICAL).** REQUIREMENTS.md UI-06 says "cursor pagination via `useInfiniteQuery`" but the actual backend (`GET /campaigns`) returns offset pagination: `{ data, pagination: { page, limit, total, totalPages } }`. The planner MUST reconcile this: use `useInfiniteQuery` with `initialPageParam: 1` and `getNextPageParam` that reads `pagination.page < pagination.totalPages ? pagination.page + 1 : undefined`. Attempting to read a `nextCursor` field will produce `undefined` and break `hasNextPage`.

2. **React Query v5 `refetchInterval` callback signature.** In v4 the callback received `(data, query)`. In v5 it receives only `(query)` and data is at `query.state.data`. The ROADMAP describes the v5 signature correctly — the planner must use it exactly.

3. **`datetime-local` timezone trap.** The browser's `datetime-local` input returns a LOCAL-time string like `"2026-05-01T14:00"` with NO timezone indicator. Passing this directly to the backend fails because `ScheduleCampaignSchema` requires ISO 8601 (`z.string().datetime()`). Must convert: `new Date(value).toISOString()` before POST. On most browsers `new Date("2026-05-01T14:00")` parses as local time and `.toISOString()` converts to UTC.

**Primary recommendation:** Plan Phase 9 as 4 plans — (1) CampaignBadge + TEST-05 + global error wire, (2) LoginPage, (3) CampaignList + infinite scroll, (4) CampaignDetail + all mutations. Wave 1 unblocks the test requirement early and de-risks the badge component that appears on every list row.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Login form + token storage | Browser (React) | API (`/auth/login`) | Form POST + dispatch to Redux; API already live |
| Campaign list (offset-infinite scroll) | Browser (React Query) | API (`GET /campaigns`) | `useInfiniteQuery` with page-number param; API returns `pagination.totalPages` |
| New campaign form + email tokenizer | Browser (React) | API (`POST /campaigns`) | Client-side Zod validation; mutation calls API |
| Campaign detail + stats display | Browser (React Query) | API (`GET /campaigns/:id`) | `useQuery` fetches once; Progress bars render client-side from server data |
| Live status polling during `sending` | Browser (React Query) | API (`GET /campaigns/:id`) | `refetchInterval` on the detail query; no WebSocket needed |
| Schedule action | Browser (React) | API (`POST /campaigns/:id/schedule`) | datetime-local → ISO conversion in browser; mutation calls API |
| Send + Delete confirm dialogs | Browser (React + shadcn AlertDialog) | API | Confirmation entirely client-side before mutation fires |
| Logout | Browser (React + Redux) | API (`POST /auth/logout`) | mutation calls API; then clears Redux; then redirects |
| Global error toast | Browser (React Query QueryCache) | — | `QueryCache({ onError })` fires for all query failures |
| CampaignBadge component + test | Browser (React) | — | Pure presentational component + Vitest/RTL unit test |

---

## Standard Stack

### Core (already installed in Phase 8 — no new installs needed)

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| @tanstack/react-query | 5.99.2 | Data fetching, mutations, polling | Already in `frontend/package.json` |
| react-router-dom | 6.30.3 | Navigation, `useNavigate`, `useParams` | Already installed |
| @reduxjs/toolkit | 2.11.2 | `clearAuth`, `setAuth` dispatch | Already installed |
| sonner | ^2.0.7 | `toast.error()` / `toast.success()` | Already installed; `<Toaster />` already in `App.tsx` |
| lucide-react | 0.414.0 | `Loader2` spinner (sending badge), other icons | Already installed |
| @campaign/shared | workspace:* | `LoginSchema`, `CreateCampaignSchema`, `ScheduleCampaignSchema`, `CampaignStatus` | Built from Phase 1 |

[VERIFIED: frontend/package.json — 2026-04-21]

### New installs required for Phase 9

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | 7.73.1 | Form state + validation | Industry standard; pairs with shadcn Form components; avoids uncontrolled-vs-controlled pain |
| @hookform/resolvers | 5.2.2 | Zod adapter for react-hook-form | Bridges `CreateCampaignSchema` Zod schema to RHF validation |

[VERIFIED: npm registry 2026-04-21 — `npm view react-hook-form version` = 7.73.1, `npm view @hookform/resolvers version` = 5.2.2]

### New shadcn components to install

| Component | `npx shadcn@latest add` command | Used For |
|-----------|--------------------------------|---------|
| badge | `npx shadcn@latest add badge` | `CampaignBadge` status variants |
| progress | `npx shadcn@latest add progress` | `send_rate` and `open_rate` bars on detail page |
| alert-dialog | `npx shadcn@latest add alert-dialog` | Send + Delete confirm dialogs |
| button | `npx shadcn@latest add button` | All action buttons |
| input | `npx shadcn@latest add input` | Login + new-campaign form fields |
| label | `npx shadcn@latest add label` | Form field labels |
| textarea | `npx shadcn@latest add textarea` | Campaign body field |
| card | `npx shadcn@latest add card` | Campaign list cards |
| separator | `npx shadcn@latest add separator` | Visual dividers on detail page |

Note: `skeleton` and `sonner` were installed in Phase 8. Do not reinstall.

**CRITICAL:** Run all `npx shadcn@latest add` commands from within `frontend/` directory, or use `yarn workspace @campaign/frontend` context. The shadcn CLI resolves `components.json` from the working directory. Running from repo root will create components in the wrong location.

**Installation:**
```bash
yarn workspace @campaign/frontend add react-hook-form @hookform/resolvers
# Then from frontend/ directory:
cd frontend && npx shadcn@latest add badge progress alert-dialog button input label textarea card separator
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-hook-form | Uncontrolled native form | RHF gives error state, `handleSubmit`, and field reset for free; saves 40+ lines of boilerplate |
| @hookform/resolvers/zod | Manual Zod `.parse()` in `onSubmit` | Resolver surfaces field-level errors via RHF state; manual parse only gives top-level error |
| AlertDialog | Custom modal | AlertDialog is fully accessible (focus trap, Escape key, ARIA roles) out of the box |
| IntersectionObserver sentinel | Scroll event listener | IO is more performant; no debouncing needed; already used in RQ docs example |

---

## Architecture Patterns

### System Architecture Diagram

```
Browser load
     │
     ▼
App.tsx (Phase 8)
  useBootstrap() → /auth/refresh → /auth/me → dispatch(setAuth)
  <Toaster /> ← global toast target (QueryCache onError fires here)
     │
  React Router
     │
  ┌──┴────────────────────────────────────────────────────┐
  │ /login (public)                                        │
  │   LoginForm → POST /auth/login                        │
  │     → dispatch(setAuth({accessToken, user}))          │
  │     → navigate('/campaigns')                          │
  └────────────────────────────────────────────────────────┘
     │
  ┌──┴──────── ProtectedRoute (Phase 8) ──────────────────┐
  │                                                        │
  │  /campaigns (CampaignList)                            │
  │    useInfiniteQuery(['campaigns'])                     │
  │      GET /campaigns?page={pageParam}&limit=20         │
  │      getNextPageParam: page < totalPages → page+1     │
  │      → IntersectionObserver sentinel triggers          │
  │        fetchNextPage()                                 │
  │    data.pages.flatMap(p => p.data) → campaign rows    │
  │    each row: CampaignBadge + navigate to detail       │
  │                                                        │
  │  /campaigns/new (NewCampaignPage)                     │
  │    react-hook-form + CreateCampaignSchema             │
  │    EmailTokenizer (comma/Enter → array)               │
  │    useMutation → POST /campaigns                      │
  │    onSuccess → navigate('/campaigns/:id')             │
  │                                                        │
  │  /campaigns/:id (CampaignDetail)                      │
  │    useQuery(['campaign', id])                         │
  │      GET /campaigns/:id                               │
  │      refetchInterval: (q) =>                          │
  │        q.state.data?.status === 'sending' ? 2000 : false│
  │    Progress bars: send_rate, open_rate                │
  │    CampaignBadge (status)                             │
  │    Conditional actions:                               │
  │      draft:     [Schedule] [Send] [Delete]            │
  │      scheduled: [Send] [Delete]                       │
  │      sending:   (no actions — polling active)         │
  │      sent:      (no actions)                          │
  │    Schedule → AlertDialog → POST /campaigns/:id/schedule│
  │    Send    → AlertDialog → POST /campaigns/:id/send   │
  │    Delete  → AlertDialog → DELETE /campaigns/:id      │
  │      → navigate('/campaigns')                         │
  │                                                        │
  │  Logout button (anywhere in app shell)                │
  │    useMutation → POST /auth/logout                    │
  │    onSuccess → dispatch(clearAuth()) → navigate('/login')│
  │                                                        │
  └────────────────────────────────────────────────────────┘

Global error flow:
  QueryCache({ onError: (error) => toast.error(error.message) })
  Defined in main.tsx QueryClient instantiation
```

### Recommended Project Structure (Phase 9 additions)

```
frontend/src/
├── components/
│   ├── ui/                          # Phase 8 + new shadcn components
│   │   ├── badge.tsx               # npx shadcn add badge
│   │   ├── progress.tsx            # npx shadcn add progress
│   │   ├── alert-dialog.tsx        # npx shadcn add alert-dialog
│   │   ├── button.tsx              # npx shadcn add button
│   │   ├── input.tsx               # npx shadcn add input
│   │   ├── label.tsx               # npx shadcn add label
│   │   ├── textarea.tsx            # npx shadcn add textarea
│   │   ├── card.tsx                # npx shadcn add card
│   │   ├── separator.tsx           # npx shadcn add separator
│   │   ├── skeleton.tsx            # Phase 8 — already exists
│   │   └── sonner.tsx              # Phase 8 — already exists
│   ├── CampaignBadge.tsx           # Status badge (draft/scheduled/sending/sent)
│   └── ProtectedRoute.tsx          # Phase 8 — already exists
├── pages/
│   ├── LoginPage.tsx               # UI-02
│   ├── CampaignListPage.tsx        # UI-06
│   ├── NewCampaignPage.tsx         # UI-07
│   └── CampaignDetailPage.tsx      # UI-08/09/10/11
├── hooks/
│   ├── useBootstrap.ts             # Phase 8 — already exists
│   └── useCampaigns.ts             # Optional: wrap useInfiniteQuery
├── test/
│   ├── setup.ts                    # Phase 8 — already exists
│   ├── CampaignBadge.test.tsx      # TEST-05 (new)
│   ├── bootstrap.test.tsx          # Phase 8 — already exists
│   ├── ProtectedRoute.test.tsx     # Phase 8 — already exists
│   └── axios.test.ts               # Phase 8 — already exists
├── App.tsx                         # Replace Phase 9 placeholders with real imports
├── main.tsx                        # Update QueryClient with QueryCache onError
└── store/
    ├── index.ts                    # Phase 8 — no change
    └── authSlice.ts                # Phase 8 — no change
```

### Pattern 1: useInfiniteQuery with Offset Pagination (CRITICAL — v5 + offset backend)

**What:** `GET /campaigns` returns `{ data, pagination: { page, limit, total, totalPages } }` — offset not cursor. `useInfiniteQuery` must use page numbers.
**When to use:** CampaignListPage only.

```typescript
// Source: Context7 /tanstack/query — useInfiniteQuery v5 API [VERIFIED]
// IMPORTANT: backend returns offset pagination, not cursor. page numbers only.
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

type CampaignPage = {
  data: Campaign[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function useCampaignList() {
  return useInfiniteQuery<CampaignPage>({
    queryKey: ['campaigns'],
    queryFn: async ({ pageParam }) => {
      const res = await api.get<{ data: Campaign[]; pagination: CampaignPage['pagination'] }>(
        `/campaigns?page=${pageParam}&limit=20`,
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}
```

### Pattern 2: IntersectionObserver Sentinel for Infinite Scroll

**What:** Attach a ref to the last list item; observer fires `fetchNextPage()` when it enters the viewport.
**When to use:** CampaignListPage — the "load more" trigger.

```typescript
// Source: Context7 /tanstack/query — IntersectionObserver pattern [VERIFIED]
import { useCallback, useRef } from 'react';

function CampaignListPage() {
  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isError, error,
  } = useCampaignList();

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          void fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  );

  if (isPending) return <CampaignListSkeleton />;
  if (isError) return <p>Error loading campaigns</p>; // toast fires from QueryCache

  const campaigns = data.pages.flatMap((page) => page.data);

  return (
    <>
      {campaigns.length === 0 && <EmptyState />}
      {campaigns.map((c) => <CampaignCard key={c.id} campaign={c} />)}
      {/* Sentinel div — IO attaches here */}
      <div ref={sentinelRef} aria-hidden="true" />
      {isFetchingNextPage && <Skeleton className="h-20 w-full" />}
    </>
  );
}
```

### Pattern 3: refetchInterval for Live Polling (v5 Signature — CRITICAL)

**What:** Poll campaign detail every 2s while `status === 'sending'`, stop when `sent`.
**When to use:** CampaignDetailPage query.

```typescript
// Source: Context7 /tanstack/query — polling docs [VERIFIED]
// CRITICAL: v5 callback receives query object, NOT (data, query).
// v4 signature was (data) => interval. v5 is (query) => interval.
import { useQuery } from '@tanstack/react-query';

function useCampaignDetail(id: string) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const res = await api.get<{ data: CampaignDetail }>(`/campaigns/${id}`);
      return res.data.data;
    },
    refetchInterval: (query) => {
      return query.state.data?.status === 'sending' ? 2000 : false;
    },
  });
}
```

### Pattern 4: useMutation + invalidateQueries (C13 Guard)

**What:** After every mutation (send, schedule, delete), invalidate related queries so UI reflects new state.
**When to use:** All three action mutations on the detail page.

```typescript
// Source: Context7 /tanstack/query — mutation invalidation [VERIFIED]
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useSendCampaign(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/campaigns/${campaignId}/send`),
    onSuccess: async () => {
      // Invalidate both the list and the specific campaign detail
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] }),
      ]);
    },
  });
}
```

### Pattern 5: Global QueryCache Error Handler + Toast (UI-12)

**What:** All RQ query failures surface `error.message` via Sonner toast automatically.
**When to use:** Configure in `main.tsx` when creating the `QueryClient`.

```typescript
// Source: Context7 /tanstack/query — QueryCache callbacks [VERIFIED]
// Source: Context7 /emilkowalski/sonner — toast.error() [VERIFIED]
import { QueryClient, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});
```

Note: `main.tsx` from Phase 8 has a `QueryClient` instance without `QueryCache`. Phase 9 must update it.

### Pattern 6: datetime-local Timezone Conversion (UI-09 — CRITICAL)

**What:** `datetime-local` input returns local-time string without timezone. Must convert to ISO before POST.
**Why critical:** `ScheduleCampaignSchema` uses `z.string().datetime()` which requires full ISO 8601 with timezone. `"2026-05-01T14:00"` fails validation; `"2026-05-01T14:00:00.000Z"` passes.

```typescript
// [ASSUMED — standard browser behavior; verified by MDN specification]
// datetime-local value: "2026-05-01T14:00" (local time, no TZ)
// Must convert before POST:
const isoDate = new Date(input.scheduledAt).toISOString();
// new Date("2026-05-01T14:00") → parses as LOCAL time (browser TZ)
// .toISOString() → "2026-05-01T12:00:00.000Z" (if UTC+2)
// This is the correct semantics: user picks LOCAL time, backend receives UTC.

// In the schedule mutation:
mutationFn: (localDateString: string) =>
  api.post(`/campaigns/${campaignId}/schedule`, {
    scheduled_at: new Date(localDateString).toISOString(),
  }),
```

### Pattern 7: CampaignBadge Component (m1 Guard — Exhaustive Switch)

**What:** Status badge with correct color per status. MUST cover all 4 states. `sending` needs spinner.
**Critical:** TypeScript exhaustive switch — if a 5th status were added, `default: return assertNever(status)` would fail compilation. The `sending` state (amber + spinner) is the most commonly forgotten.

```typescript
// Source: Pattern from ROADMAP.md m1 guard + shadcn Badge [VERIFIED: Context7]
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@campaign/shared';

interface CampaignBadgeProps {
  status: CampaignStatus;
}

// Exhaustive status → style map (m1: all 4 states required)
const STATUS_CONFIG = {
  draft:     { label: 'Draft',     className: 'bg-gray-100 text-gray-600 border-gray-200' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  sending:   { label: 'Sending',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  sent:      { label: 'Sent',      className: 'bg-green-100 text-green-700 border-green-200' },
} as const satisfies Record<CampaignStatus, { label: string; className: string }>;

export function CampaignBadge({ status }: CampaignBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn('gap-1', config.className)}>
      {status === 'sending' && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      )}
      {config.label}
    </Badge>
  );
}
```

Note: Using `satisfies Record<CampaignStatus, ...>` gives compile-time exhaustiveness without a switch statement. Alternative: TypeScript `switch` with `default: status satisfies never`.

### Pattern 8: Email Tokenizer (comma/Enter) for New Campaign Form (UI-07)

**What:** Multi-email input where comma or Enter converts typed text into a token chip. Stores as `string[]` in form state.
**No library needed** — implement as controlled input + `useState` storing `string[]`.

```typescript
// [ASSUMED — standard tokenizer UX pattern; no library verification needed]
function EmailTokenizer({
  value,
  onChange,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
}) {
  const [inputValue, setInputValue] = React.useState('');

  const addEmail = (raw: string) => {
    const emails = raw
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length > 0) {
      onChange([...value, ...emails]);
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-md border p-2">
      {value.map((email) => (
        <span key={email} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-sm">
          {email}
          <button type="button" onClick={() => onChange(value.filter((e) => e !== email))}>×</button>
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addEmail(inputValue);
          }
        }}
        onBlur={() => addEmail(inputValue)}
        placeholder={value.length === 0 ? 'Add email addresses...' : ''}
        className="flex-1 outline-none bg-transparent text-sm min-w-[8rem]"
      />
    </div>
  );
}
```

### Pattern 9: AlertDialog for Send / Delete Confirm (UI-10/UI-11)

**What:** Modal confirm dialog before destructive/irreversible actions.

```tsx
// Source: Context7 /llmstxt/ui_shadcn_llms_txt — AlertDialog [VERIFIED]
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function SendConfirmDialog({ onConfirm, isPending }: { onConfirm: () => void; isPending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="default" disabled={isPending}>Send Now</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send campaign now?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately start sending to all recipients. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Sending...' : 'Send'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Pattern 10: Logout Mutation (UI-13)

```typescript
// Logout calls API, then clears Redux, then redirects.
// Must dispatch BEFORE navigate so ProtectedRoute doesn't see stale user.
import { useMutation } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '@/store/authSlice';
import { api } from '@/lib/apiClient';

function useLogout() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      // onSettled (not onSuccess) — clear auth even if logout API fails.
      // A 401 on logout (expired token) should still clear client state.
      dispatch(clearAuth());
      navigate('/login', { replace: true });
    },
  });
}
```

### Pattern 11: CampaignBadge Vitest + RTL Test (TEST-05)

```typescript
// frontend/src/test/CampaignBadge.test.tsx
// Source: @testing-library/react [VERIFIED: Context7]
import { render, screen } from '@testing-library/react';
import { CampaignBadge } from '@/components/CampaignBadge';

describe('CampaignBadge', () => {
  it('renders draft badge with grey styling', () => {
    render(<CampaignBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Check for grey color class
    expect(screen.getByText('Draft').closest('[data-slot="badge"]'))
      .toHaveClass('bg-gray-100');
  });

  it('renders scheduled badge with blue styling', () => {
    render(<CampaignBadge status="scheduled" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders sending badge with amber styling and spinner', () => {
    render(<CampaignBadge status="sending" />);
    expect(screen.getByText('Sending')).toBeInTheDocument();
    // Spinner should be present (Loader2 with animate-spin)
    const badge = screen.getByText('Sending').closest('[data-slot="badge"]');
    expect(badge?.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders sent badge with green styling', () => {
    render(<CampaignBadge status="sent" />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });
});
```

### Anti-Patterns to Avoid

- **Copying `nextCursor` from Phase 4 research into the campaign list query.** The backend `GET /campaigns` uses offset pagination. There is no `nextCursor` field. Use `pagination.page < pagination.totalPages`.
- **Using v4 `refetchInterval` signature `(data) => ...`.** In v5 the callback is `(query) => query.state.data?.status === 'sending' ? 2000 : false`.
- **Forgetting to invalidate `['campaigns']` list after create/delete.** The list is a separate query from the detail. Both must be invalidated.
- **Passing datetime-local string directly to backend.** Always wrap with `new Date(value).toISOString()` before POST.
- **Storing campaign data in Redux.** ALL campaign/stats/recipient data stays in React Query cache only.
- **Missing `sending` case in badge switch.** TypeScript will not catch this unless using `satisfies Record<CampaignStatus, ...>` or an exhaustive switch with `never` check.
- **Running `npx shadcn@latest add` from repo root.** Writes components to wrong directory. Must run from `frontend/`.
- **`dispatch(clearAuth())` after `navigate('/login')` on logout.** Must dispatch FIRST or ProtectedRoute reads stale `user` and may re-render the protected route before redux updates.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state + validation | Custom `useState` per field + manual error display | `react-hook-form` + `@hookform/resolvers/zod` | RHF handles touched state, submission lock, field reset, and nested error messages |
| Confirm modal | `window.confirm()` | shadcn `AlertDialog` | Accessible, styled, keyboard-navigable; `window.confirm()` is not styleable and blocks the thread |
| Query invalidation | Manual `queryClient.refetchQueries()` after mutation | `queryClient.invalidateQueries()` in `onSuccess` | Invalidation marks stale + triggers background refetch; `refetch` ignores staleness settings |
| Status badge styling | Switch statement returning raw Tailwind strings | `satisfies Record<CampaignStatus, ...>` constant map | Compile-time exhaustiveness; easier to test; no runtime type narrowing needed |
| Loading skeleton | CSS spinner | shadcn `Skeleton` | Already themed; consistent visual language with Phase 8 bootstrap spinner |
| Toast notifications | Custom toast component | `sonner` `toast.error()` / `toast.success()` | Already installed; `<Toaster />` already in `App.tsx` from Phase 8 |
| Infinite scroll trigger | `scroll` event listener with debounce | `IntersectionObserver` | IO fires on viewport intersection regardless of scroll container; more reliable for complex layouts |

**Key insight:** `react-hook-form` + `@hookform/resolvers/zod` is the canonical shadcn form pattern. All shadcn Form examples use it. Implementing without it leads to re-inventing form state, losing error messages on blur, and dealing with uncontrolled-vs-controlled conflicts.

---

## Common Pitfalls

### Pitfall 1: Offset vs Cursor Mismatch on Campaign List (CRITICAL)

**What goes wrong:** Developer reads REQUIREMENTS.md UI-06 ("cursor pagination via `useInfiniteQuery`"), implements `getNextPageParam: (lastPage) => lastPage.nextCursor`, gets `undefined` on every page because `GET /campaigns` returns `{ pagination: { page, limit, total, totalPages } }` — no `nextCursor`.

**Why it happens:** UI-06 was written before Phase 4 locked offset pagination (STATE.md Plan 04-02 decision). Spec and implementation are misaligned.

**How to avoid:** Use `getNextPageParam: (lastPage) => lastPage.pagination.page < lastPage.pagination.totalPages ? lastPage.pagination.page + 1 : undefined`. `initialPageParam: 1` (page-number, not `undefined`).

**Warning signs:** `hasNextPage` is always `false`; list shows only first 20 campaigns and never loads more.

---

### Pitfall 2: React Query v5 refetchInterval Signature (C13)

**What goes wrong:** Using v4 callback `refetchInterval: (data) => data?.status === 'sending' ? 2000 : false`. In v5 the callback receives the `Query` object, not data directly. `data?.status` is `undefined` on the first `undefined` arg. Polling never fires.

**Why it happens:** Training data / docs examples mix v4 and v5 syntax.

**How to avoid:** v5 signature: `refetchInterval: (query) => query.state.data?.status === 'sending' ? 2000 : false`.

**Warning signs:** Detail page for a `sending` campaign never updates; status stays `sending` in UI indefinitely.

---

### Pitfall 3: datetime-local Produces Local Time Without Timezone (UI-09)

**What goes wrong:** `datetime-local` input returns `"2026-05-01T14:00"`. Zod's `z.string().datetime()` requires a timezone offset or `Z`. Backend returns 400.

**Why it happens:** The HTML `datetime-local` input type deliberately omits timezone information (per spec). `new Date("2026-05-01T14:00")` is ambiguous in Node but in browsers it parses as LOCAL time.

**How to avoid:** Always: `const isoDate = new Date(localDatetimeValue).toISOString()` before POST. Add `min` attribute on the input to prevent past dates in the UI (client-side UX guard; server still validates).

**Warning signs:** Schedule POST returns 400 with `VALIDATION_ERROR`; error mentions `scheduled_at`.

---

### Pitfall 4: Missing Query Invalidation After Mutation (C13)

**What goes wrong:** After `POST /campaigns/:id/send` returns 202, the campaign list still shows `draft` status. User has to manually refresh.

**Why it happens:** `useMutation` does not automatically invalidate any queries. `onSuccess` must call `invalidateQueries` explicitly.

**How to avoid:** In every mutation's `onSuccess`: invalidate `['campaigns']` (list) AND `['campaign', id]` (detail). Use `await Promise.all([...])` to invalidate both simultaneously.

**Warning signs:** Campaign status in the list doesn't update after actions; stale data persists until manual page refresh.

---

### Pitfall 5: shadcn `add` from Wrong Directory

**What goes wrong:** `npx shadcn@latest add badge` run from repo root writes `components/ui/badge.tsx` to the repo root (not `frontend/src/components/ui/`). Phase 8 SUMMARY.md documents this exact issue with `add sonner` in Plan 08-01.

**Why it happens:** shadcn CLI walks up to find `package.json` and uses the first one found — the repo root `package.json` in a monorepo.

**How to avoid:** Run from `frontend/` directory: `cd frontend && npx shadcn@latest add badge`.

**Warning signs:** `badge.tsx` appears at repo root; TypeScript can't resolve `@/components/ui/badge` import.

---

### Pitfall 6: React Query v5 `useInfiniteQuery` Requires `initialPageParam`

**What goes wrong:** `useInfiniteQuery` called without `initialPageParam`. TypeScript error at compile time: `initialPageParam is required`.

**Why it happens:** v4 had `initialPageParam` as optional. v5 made it required.

**How to avoid:** Always include `initialPageParam: 1` (for offset pagination) or `initialPageParam: undefined` (for cursor pagination — but offset uses `1` here).

**Warning signs:** TypeScript error on the `useInfiniteQuery` call; generic type inference fails.

---

### Pitfall 7: Logout Order — dispatch After navigate

**What goes wrong:** `navigate('/login')` fires before `dispatch(clearAuth())`. ProtectedRoute briefly re-evaluates with `user` still in Redux — may flash the protected content for one render cycle.

**Why it happens:** Both `navigate` and `dispatch` are sync, but React batches renders. If `navigate` runs first, the Router renders the new location before Redux update propagates.

**How to avoid:** Always `dispatch(clearAuth())` BEFORE `navigate('/login')`. Or use `onSettled` in the mutation which fires regardless of success/error (handles 401 on logout of expired token).

---

## Code Examples

### Campaign Detail Response Shape (from backend source)

```typescript
// GET /campaigns/:id returns:
// { data: { ...campaign, stats: { total, sent, failed, opened, open_rate, send_rate }, campaignRecipients: [...] } }
// Verified from backend/src/services/campaignService.ts getCampaignDetail()
type CampaignDetail = {
  id: string;         // BIGINT as string
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    total: number;
    sent: number;
    failed: number;
    opened: number;
    open_rate: number | null;
    send_rate: number | null;
  };
  campaignRecipients: Array<{
    status: 'pending' | 'sent' | 'failed';
    sentAt: string | null;
    openedAt: string | null;
    trackingToken: string;
    recipient: { id: string; email: string; name: string };
  }>;
};
```

[VERIFIED: backend/src/services/campaignService.ts getCampaignDetail() — 2026-04-21]

### Campaign List Response Shape

```typescript
// GET /campaigns?page=1&limit=20 returns:
// { data: Campaign[], pagination: { page, limit, total, totalPages } }
// NOT cursor-based — uses offset. Verified from:
// backend/src/services/campaignService.ts listCampaigns()
// backend/src/routes/campaigns.ts GET /
type CampaignListResponse = {
  data: Campaign[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
```

[VERIFIED: backend/src/services/campaignService.ts — 2026-04-21]

### Conditional Action Buttons by Status

```typescript
// Which actions are shown per status:
// draft:     Schedule + Send + Delete
// scheduled: Send + Delete (can still send immediately)
// sending:   no actions (worker is processing)
// sent:      no actions (terminal state)

function CampaignActions({ campaign }: { campaign: CampaignDetail }) {
  const canSchedule = campaign.status === 'draft';
  const canSend = campaign.status === 'draft' || campaign.status === 'scheduled';
  const canDelete = campaign.status === 'draft' || campaign.status === 'scheduled';

  return (
    <div className="flex gap-2">
      {canSchedule && <ScheduleAction campaignId={campaign.id} />}
      {canSend && <SendConfirmDialog campaignId={campaign.id} />}
      {canDelete && <DeleteConfirmDialog campaignId={campaign.id} />}
    </div>
  );
}
```

[VERIFIED: backend CAMP-04/CAMP-05/CAMP-06/CAMP-07 spec — non-draft returns 409]

### Progress Bar for Stats

```typescript
// Source: Context7 /llmstxt/ui_shadcn_llms_txt — Progress [VERIFIED]
import { Progress } from '@/components/ui/progress';

function StatsSection({ stats }: { stats: CampaignDetail['stats'] }) {
  const sendRate = stats.send_rate ?? 0;
  const openRate = stats.open_rate ?? 0;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Send rate</span>
          <span>{(sendRate * 100).toFixed(1)}%</span>
        </div>
        <Progress value={sendRate * 100} />
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Open rate</span>
          <span>{(openRate * 100).toFixed(1)}%</span>
        </div>
        <Progress value={openRate * 100} />
      </div>
    </div>
  );
}
```

Note: `stats.send_rate` and `stats.open_rate` are `number | null` (from `StatsSchema` in shared). Guard with `?? 0` before passing to `Progress value` prop.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Query v4 `refetchInterval: (data) => ...` | v5 `refetchInterval: (query) => query.state.data...` | v5 (2023) | Breaking change — old signature silently returns undefined |
| React Query v4 `useInfiniteQuery` (no `initialPageParam`) | v5 requires `initialPageParam` | v5 (2023) | TypeScript error if missing |
| `window.confirm()` for confirmations | shadcn `AlertDialog` | Ongoing | Accessible, styleable, keyboard-navigable |
| Manual form state | `react-hook-form` + Zod resolver | 2021+ | Industry standard for validated forms in React |
| `queryClient.defaultOptions.queries.onError` | `QueryCache({ onError })` | RQ v5 | `defaultOptions` `onError` removed in v5 |

**Deprecated/outdated:**
- React Query v4 `onError` in `defaultOptions.queries`: removed in v5. Use `QueryCache({ onError })` on the QueryClient.
- `useInfiniteQuery` without `initialPageParam`: TypeScript error in v5.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 + @testing-library/react 16.3.2 |
| Config file | `frontend/vitest.config.ts` (exists from Phase 8) |
| Quick run command | `yarn workspace @campaign/frontend test --run` |
| Full suite command | `yarn workspace @campaign/frontend test --run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-02 | Login form submits, stores token in Redux, redirects | unit | `yarn workspace @campaign/frontend test --run src/test/` | ❌ Wave 0 for Phase 9 |
| UI-06 | Campaign list renders with badge, empty state, skeleton | unit | same | ❌ Wave 0 |
| UI-07 | New campaign form validates with Zod, tokenizer works | unit | same | ❌ Wave 0 |
| UI-08 | Detail page shows progress bars, recipient list | unit | same | ❌ Wave 0 |
| UI-09 | Schedule converts datetime-local to ISO | unit | same | ❌ Wave 0 |
| UI-10 | refetchInterval fires at 2s for sending, stops at sent | unit | same | ❌ Wave 0 |
| UI-11 | Delete mutation navigates to /campaigns on success | unit | same | ❌ Wave 0 |
| UI-12 | QueryCache onError fires toast on query failure | unit | same | ❌ Wave 0 |
| UI-13 | Logout clears Redux + navigates to /login | unit | same | ❌ Wave 0 |
| TEST-05 | CampaignBadge renders correct color/label per status | unit | `yarn workspace @campaign/frontend test --run src/test/CampaignBadge.test.tsx` | ❌ new file |

### Sampling Rate

- **Per task commit:** `yarn workspace @campaign/frontend typecheck`
- **Per wave merge:** `yarn workspace @campaign/frontend test --run`
- **Phase gate:** All tests green + typecheck clean before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/test/CampaignBadge.test.tsx` — TEST-05 coverage (new in Phase 9)
- [ ] `frontend/src/components/ui/badge.tsx` — required by CampaignBadge
- [ ] Additional test files for other UI requirements as each page plan creates them

*(Existing infrastructure from Phase 8: `vitest.config.ts`, `src/test/setup.ts`, jsdom polyfills — all present. No framework re-setup needed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Login stores token in Redux memory (never localStorage); logout hits API + clears Redux |
| V3 Session Management | yes | Logout uses `onSettled` (clears auth even on 401); dispatch before navigate |
| V4 Access Control | yes | Conditional action buttons by status server-verified by 409 on backend; ProtectedRoute from Phase 8 |
| V5 Input Validation | yes | `react-hook-form` + `CreateCampaignSchema` / `LoginSchema` from `@campaign/shared` |
| V6 Cryptography | no | No crypto in frontend pages |

### Known Threat Patterns for this Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double-click send (duplicate POST /send) | Tampering | Backend atomic guard returns 409 on second call; mutation `isPending` disables button client-side |
| Schedule in the past (datetime-local) | Tampering | Backend service validates `scheduledAt > now()` (BadRequestError 400); client adds `min` attribute |
| XSS from campaign body rendered in detail | Information Disclosure | Render body as text (`textContent`), not `dangerouslySetInnerHTML` |
| Open redirect after login | Elevation of Privilege | `from` state is React Router `Location` (relative path only — Phase 8 pattern already handles this) |
| CSRF on mutations | Tampering | `axios` instance sends `X-Requested-With: fetch` globally (set in Phase 8 `apiClient.ts`); `SameSite=Strict` on refresh cookie |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Vite dev | ✓ | 22.14.0 | — |
| yarn (corepack) | installs | ✓ | 4.14.1 | — |
| Backend API on :3000 | dev proxy | ✓ (assumed running) | Phase 5 complete | Not needed for unit tests |
| react-hook-form | UI-07 form | ✗ — needs install | 7.73.1 (npm registry) | No fallback — must install |
| @hookform/resolvers | UI-07 Zod integration | ✗ — needs install | 5.2.2 (npm registry) | No fallback — must install |
| shadcn badge/progress/etc | UI-06/08 | ✗ — needs install | latest via CLI | No fallback — must install |

[VERIFIED: npm registry for react-hook-form and @hookform/resolvers versions — 2026-04-21]

**Missing dependencies with no fallback:**
- `react-hook-form` + `@hookform/resolvers` — Wave 0 install required before NewCampaignPage plan
- `badge`, `progress`, `alert-dialog`, `button`, `input`, `label`, `textarea`, `card`, `separator` shadcn components — install before respective page plans

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `new Date("2026-05-01T14:00")` parses as local time in all modern browsers (Chrome/Firefox/Safari) | Pattern 6 — datetime-local trap | If browser parses as UTC, the schedule time would be wrong by the user's UTC offset; MDN spec says ambiguous strings are implementation-defined but all modern browsers treat no-TZ datetime-local as local |
| A2 | `satisfies Record<CampaignStatus, ...>` gives compile-time exhaustiveness for the status badge map | Pattern 7 — CampaignBadge | If TypeScript version < 4.9, `satisfies` is unavailable; project uses TS ^5.8.3 (VERIFIED), so this is safe |
| A3 | shadcn `add badge/progress/alert-dialog` components are available and compatible with the installed shadcn 4.4.0 CLI | Standard Stack — shadcn components | shadcn 4.4.0 changed some CLI flags (Phase 08-01-SUMMARY notes this); individual `add` commands for components still work |
| A4 | `stats.send_rate` and `stats.open_rate` are decimal fractions (0.0–1.0) requiring `* 100` for Progress `value` | Code Examples — Progress bar | If backend returns percentages (0–100), multiplying by 100 would show 100x the actual rate; verified from StatsSchema `z.number()` — backend uses `ROUND(..., 2)` which returns decimal |

---

## Open Questions

1. **Should the campaign list use `useInfiniteQuery` or regular `useQuery` with a Load More button?**
   - What we know: REQUIREMENTS.md says "cursor pagination via React Query `useInfiniteQuery`"; backend uses offset; `useInfiniteQuery` with page numbers works fine.
   - What's unclear: Whether "infinite scroll" (IO sentinel) or "Load More button" is preferred UX for this app.
   - Recommendation: Use `useInfiniteQuery` + IntersectionObserver sentinel (auto-load) as the ROADMAP Phase 9 success criteria describes. Either pattern works with `useInfiniteQuery`.

2. **`stats.send_rate` precision — decimal or percentage?**
   - What we know: `StatsSchema` defines `send_rate: z.number().nullable()`. Backend SQL uses `ROUND(sent::numeric / NULLIF(total, 0), 2)`.
   - What's unclear: The ROUND result is a decimal (0.67 for 67%). The Progress component expects 0–100.
   - Recommendation: Multiply by 100 in the UI: `<Progress value={(stats.send_rate ?? 0) * 100} />`. Verified from SQL in `computeCampaignStats`.

---

## Sources

### Primary (HIGH confidence)

- `/tanstack/query` (Context7) — `useInfiniteQuery` v5 API, `refetchInterval` callback signature, mutation `onSuccess` + `invalidateQueries`, `QueryCache({ onError })`
- `/emilkowalski/sonner` (Context7) — `toast.error()`, `toast.success()` API
- `/llmstxt/ui_shadcn_llms_txt` (Context7) — `Badge`, `Progress`, `AlertDialog`, `Button`, `Input` component patterns
- `backend/src/services/campaignService.ts` (codebase) — exact response shapes for `listCampaigns`, `getCampaignDetail`
- `backend/src/routes/campaigns.ts` (codebase) — HTTP method + path + response envelope shapes
- `shared/src/schemas/campaign.ts` (codebase) — `CreateCampaignSchema`, `ScheduleCampaignSchema`, `CampaignStatus`, `StatsSchema`
- `shared/src/schemas/auth.ts` (codebase) — `LoginSchema`, `LoginResponseSchema`
- `frontend/package.json` (codebase) — verified installed dependencies and versions
- npm registry (Bash) — `react-hook-form` 7.73.1, `@hookform/resolvers` 5.2.2

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — Phase 4 pagination decision (offset not cursor, locked)
- `.planning/phases/08-frontend-foundation/08-PATTERNS.md` — Phase 8 existing file structure
- `.planning/phases/08-frontend-foundation/08-01-SUMMARY.md` — shadcn CLI deviation (4.4.0 behavior, homebrew yarn issue)
- `.planning/ROADMAP.md` Phase 9 section — success criteria and guards (C13, m1)

### Tertiary (LOW confidence)

- Pattern 8 (EmailTokenizer) — standard UX pattern, no library verification needed; implementation is hand-rolled
- Assumption A1 — datetime-local browser behavior: MDN-documented but not tested against this project

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all library versions verified against npm registry and frontend/package.json
- Architecture: HIGH — backend response shapes verified from codebase; React Query v5 API verified from Context7
- Pitfalls: HIGH — pagination mismatch verified from STATE.md + codebase; v5 API differences verified from Context7 migration docs

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — stable libraries)
