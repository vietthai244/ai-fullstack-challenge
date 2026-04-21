# Phase 9: Frontend Pages & Actions — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/src/pages/LoginPage.tsx` | page/component | request-response | `frontend/src/hooks/useBootstrap.ts` + `frontend/src/components/ProtectedRoute.tsx` | role-match |
| `frontend/src/pages/CampaignListPage.tsx` | page/component | request-response (infinite) | `frontend/src/components/ProtectedRoute.tsx` | role-match |
| `frontend/src/pages/NewCampaignPage.tsx` | page/component | request-response (mutation) | `frontend/src/hooks/useBootstrap.ts` | role-match |
| `frontend/src/pages/CampaignDetailPage.tsx` | page/component | request-response + polling | `frontend/src/hooks/useBootstrap.ts` + `frontend/src/components/ProtectedRoute.tsx` | role-match |
| `frontend/src/components/CampaignBadge.tsx` | component | transform | `frontend/src/components/ProtectedRoute.tsx` | role-match |
| `frontend/src/test/CampaignBadge.test.tsx` | test | — | `frontend/src/test/ProtectedRoute.test.tsx` | exact |
| `frontend/src/App.tsx` | config/router | request-response | `frontend/src/App.tsx` (self — modify) | exact |
| `frontend/src/main.tsx` | config/entry | — | `frontend/src/main.tsx` (self — modify) | exact |
| `frontend/src/hooks/useCampaigns.ts` (optional) | hook | request-response | `frontend/src/hooks/useBootstrap.ts` | exact |

---

## Pattern Assignments

### `frontend/src/pages/LoginPage.tsx` (page, request-response)

**Analog:** `frontend/src/hooks/useBootstrap.ts` (auth flow) + `frontend/src/components/ProtectedRoute.tsx` (Redux selector pattern)

**Imports pattern** — copy from `frontend/src/hooks/useBootstrap.ts` lines 8-12 and `frontend/src/components/ProtectedRoute.tsx` lines 10-13:
```typescript
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { setAuth } from '@/store/authSlice';
import type { AppDispatch } from '@/store/index';
import { LoginSchema, type LoginInput } from '@campaign/shared';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
```

**Redux dispatch pattern** — from `frontend/src/hooks/useBootstrap.ts` lines 14-15:
```typescript
const dispatch = useDispatch<AppDispatch>();
```

**Navigate with from-state pattern** — from `frontend/src/components/ProtectedRoute.tsx` lines 36-39 (mirror direction):
```typescript
// ProtectedRoute sends: <Navigate to="/login" state={{ from: location }} replace />
// LoginPage reads it back:
const location = useLocation();
const from = (location.state as { from?: Location })?.from?.pathname ?? '/campaigns';
// On success: navigate(from, { replace: true })
```

**Auth dispatch pattern** — from `frontend/src/hooks/useBootstrap.ts` lines 34-36:
```typescript
dispatch(setAuth({ accessToken, user: meRes.data.data }));
// LoginPage equivalent:
dispatch(setAuth({ accessToken: res.data.data.accessToken, user: res.data.data.user }));
```

**useMutation pattern** — matches RESEARCH.md Pattern 4 (copy mutationFn + onSuccess):
```typescript
const loginMutation = useMutation({
  mutationFn: (data: LoginInput) =>
    api.post<{ data: { accessToken: string; user: { id: number; email: string } } }>('/auth/login', data),
  onSuccess: (res) => {
    dispatch(setAuth({ accessToken: res.data.data.accessToken, user: res.data.data.user }));
    navigate(from, { replace: true });
  },
});
```

**Error display pattern** — inline below form (NOT toast — login errors are field-level):
```typescript
{loginMutation.isError && (
  <p className="text-destructive text-sm">
    {loginMutation.error instanceof Error
      ? loginMutation.error.message
      : 'Invalid credentials'}
  </p>
)}
```

**Layout contract (from UI-SPEC):**
- Outer: `<div className="flex min-h-screen items-center justify-center">`
- Card: `<Card className="w-full max-w-md">`
- Title h1: `text-2xl font-semibold` — "Campaign Manager"
- Button: `variant="default"` full-width, text "Log in" → "Logging in..." while pending

---

### `frontend/src/pages/CampaignListPage.tsx` (page, request-response infinite)

**Analog:** No direct analog in Phase 8 (first real page). Copy structure from `frontend/src/components/ProtectedRoute.tsx` for conditional render skeleton/content pattern.

**Imports pattern:**
```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useCallback, useRef } from 'react';
import { api } from '@/lib/apiClient';
import { CampaignBadge } from '@/components/CampaignBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Campaign } from '@campaign/shared';
```

**Skeleton conditional render** — from `frontend/src/components/ProtectedRoute.tsx` lines 24-34 (copy pattern, change content):
```typescript
// ProtectedRoute:
if (!bootstrapped) {
  return (
    <div className="flex h-dvh items-center justify-center" aria-label="Loading application">
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  );
}
// CampaignListPage equivalent:
if (isPending) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

**useInfiniteQuery (offset pagination)** — RESEARCH.md Pattern 1 (CRITICAL — use this exactly):
```typescript
// CRITICAL: backend returns offset pagination — NO nextCursor field.
// initialPageParam: 1 is REQUIRED in v5 (TypeScript error if missing).
const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useInfiniteQuery({
  queryKey: ['campaigns'],
  queryFn: async ({ pageParam }) => {
    const res = await api.get<{
      data: Campaign[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/campaigns?page=${pageParam}&limit=20`);
    return res.data;
  },
  initialPageParam: 1,
  getNextPageParam: (lastPage) => {
    const { page, totalPages } = lastPage.pagination;
    return page < totalPages ? page + 1 : undefined;
  },
});
```

**IntersectionObserver sentinel** — RESEARCH.md Pattern 2:
```typescript
const observerRef = useRef<IntersectionObserver | null>(null);
const sentinelRef = useCallback(
  (node: HTMLDivElement | null) => {
    if (isFetchingNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) void fetchNextPage();
    });
    if (node) observerRef.current.observe(node);
  },
  [isFetchingNextPage, hasNextPage, fetchNextPage],
);
// In JSX at end of list:
<div ref={sentinelRef} aria-hidden="true" />
```

**Layout contract (from UI-SPEC):**
- Container: `max-w-3xl mx-auto px-4 py-8`
- Header row: `flex items-center justify-between mb-6`
- Heading: `text-xl font-semibold` — "Campaigns"
- "New Campaign" button: `variant="default"` → `navigate('/campaigns/new')`
- Each campaign row: `Card` wrapping name + `CampaignBadge` + date, clickable → `navigate('/campaigns/:id')`
- Empty state: heading "No campaigns yet" + body "Create your first campaign to get started." + "New Campaign" CTA

---

### `frontend/src/pages/NewCampaignPage.tsx` (page, request-response mutation)

**Analog:** `frontend/src/hooks/useBootstrap.ts` (api call pattern) + `frontend/src/test/bootstrap.test.tsx` (vi.mock api pattern for tests)

**Imports pattern:**
```typescript
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/lib/apiClient';
import { CreateCampaignSchema, type CreateCampaignInput } from '@campaign/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
```

**react-hook-form + zod resolver pattern** — standard RHF pattern aligned with RESEARCH.md:
```typescript
const {
  register,
  handleSubmit,
  control,
  formState: { errors },
} = useForm<CreateCampaignInput>({
  resolver: zodResolver(CreateCampaignSchema),
  defaultValues: { name: '', subject: '', body: '', recipientEmails: [] },
});
```

**useMutation + invalidateQueries** — RESEARCH.md Pattern 4; also mirrors `useBootstrap` api call:
```typescript
const queryClient = useQueryClient();
const navigate = useNavigate();
const createMutation = useMutation({
  mutationFn: (data: CreateCampaignInput) =>
    api.post<{ data: { id: string } }>('/campaigns', data),
  onSuccess: async (res) => {
    await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    navigate(`/campaigns/${res.data.data.id}`);
  },
});
```

**EmailTokenizer** — inline component (RESEARCH.md Pattern 8); use `Controller` from RHF to integrate:
```typescript
// Controlled via RHF Controller — keeps emails in form state
<Controller
  name="recipientEmails"
  control={control}
  render={({ field }) => (
    <EmailTokenizer value={field.value} onChange={field.onChange} />
  )}
/>
```

**Layout contract (from UI-SPEC):**
- Container: `max-w-2xl mx-auto px-4 py-8`
- Each field: `<div className="space-y-1">` wrapping `Label` + `Input`/`Textarea`
- Submit button: `variant="default"` full-width, "Create Campaign" → "Creating..." while `isPending`
- Error per field: `errors.name?.message` rendered as `<p className="text-destructive text-sm">`

---

### `frontend/src/pages/CampaignDetailPage.tsx` (page, request-response + polling)

**Analog:** `frontend/src/components/ProtectedRoute.tsx` (conditional render) + `frontend/src/hooks/useBootstrap.ts` (dispatch pattern for logout)

**Imports pattern:**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { api } from '@/lib/apiClient';
import { clearAuth } from '@/store/authSlice';
import type { AppDispatch } from '@/store/index';
import { CampaignBadge } from '@/components/CampaignBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { CampaignStatus } from '@campaign/shared';
```

**useQuery with refetchInterval (v5 CRITICAL)** — RESEARCH.md Pattern 3:
```typescript
// CRITICAL: v5 callback signature is (query) — NOT (data).
// v4 was (data) => data?.status — that produces undefined in v5.
const { data: campaign, isPending } = useQuery({
  queryKey: ['campaign', id],
  queryFn: async () => {
    const res = await api.get<{ data: CampaignDetail }>(`/campaigns/${id}`);
    return res.data.data;
  },
  refetchInterval: (query) => {
    return query.state.data?.status === 'sending' ? 2000 : false;
  },
});
```

**Skeleton pending state** — from `frontend/src/components/ProtectedRoute.tsx` lines 24-34:
```typescript
// Mirror ProtectedRoute skeleton pattern but with section skeletons:
if (isPending) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-8 w-48" />        {/* name */}
      <Skeleton className="h-4 w-full" />       {/* send_rate bar */}
      <Skeleton className="h-4 w-full" />       {/* open_rate bar */}
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}
```

**Conditional action buttons by status (exhaustive — all 4 states REQUIRED):**
```typescript
// draft:     Schedule + Send (AlertDialog) + Delete (AlertDialog)
// scheduled: Send (AlertDialog) + Delete (AlertDialog)
// sending:   no actions
// sent:      no actions
const canSchedule = campaign.status === 'draft';
const canSend = campaign.status === 'draft' || campaign.status === 'scheduled';
const canDelete = campaign.status === 'draft' || campaign.status === 'scheduled';
```

**Schedule mutation (datetime-local → ISO CRITICAL):**
```typescript
// CRITICAL: datetime-local returns "2026-05-01T14:00" — no TZ indicator.
// Zod z.string().datetime() requires full ISO. Must convert:
const scheduleMutation = useMutation({
  mutationFn: (localDateString: string) =>
    api.post(`/campaigns/${id}/schedule`, {
      scheduled_at: new Date(localDateString).toISOString(),
    }),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
    ]);
  },
});
```

**Send + Delete mutations** — RESEARCH.md Pattern 4:
```typescript
const sendMutation = useMutation({
  mutationFn: () => api.post(`/campaigns/${id}/send`),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
    ]);
  },
});
const deleteMutation = useMutation({
  mutationFn: () => api.delete(`/campaigns/${id}`),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    navigate('/campaigns');
  },
});
```

**AlertDialog pattern** — RESEARCH.md Pattern 9:
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="default" disabled={sendMutation.isPending}>Send Now</Button>
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
      <AlertDialogAction onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
        {sendMutation.isPending ? 'Sending...' : 'Send'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Delete AlertDialog** — same structure, destructive variant:
```tsx
// AlertDialogAction uses variant="destructive" for Delete only
<AlertDialogAction
  onClick={() => deleteMutation.mutate()}
  disabled={deleteMutation.isPending}
  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
>
  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
</AlertDialogAction>
```

**Progress bars** — `stats.send_rate` and `stats.open_rate` are decimal (0.0–1.0); multiply by 100:
```typescript
// A4 guard: rates are decimal fractions — not percentages.
<Progress value={(campaign.stats.send_rate ?? 0) * 100} />
<Progress value={(campaign.stats.open_rate ?? 0) * 100} />
```

**Logout mutation** — RESEARCH.md Pattern 10; dispatch pattern from `frontend/src/hooks/useBootstrap.ts` lines 38-39:
```typescript
// CRITICAL: dispatch(clearAuth()) BEFORE navigate('/login') — order is mandatory.
// Use onSettled not onSuccess — clears auth even if logout API returns 401.
const dispatch = useDispatch<AppDispatch>();
const logoutMutation = useMutation({
  mutationFn: () => api.post('/auth/logout'),
  onSettled: () => {
    dispatch(clearAuth());              // FIRST
    navigate('/login', { replace: true }); // SECOND
  },
});
```

**Body render (XSS guard from UI-SPEC):**
```tsx
// Never dangerouslySetInnerHTML — render body as plain text only.
<p className="text-sm whitespace-pre-wrap">{campaign.body}</p>
```

**Layout contract (from UI-SPEC):**
- Container: `max-w-3xl mx-auto px-4 py-8`
- Header: `flex items-center gap-2` — name `text-xl font-semibold` + `CampaignBadge`
- Sections separated by `<Separator />` with `space-y-6` on outer div
- Logout button in page header: `variant="ghost" size="sm"` — "Log out"
- `sending` state text: `<p className="text-sm text-muted-foreground">Sending in progress...</p>`

---

### `frontend/src/components/CampaignBadge.tsx` (component, transform)

**Analog:** `frontend/src/components/ProtectedRoute.tsx` (component structure, TypeScript props interface)

**Full implementation** — RESEARCH.md Pattern 7 (copy exactly for m1 exhaustiveness guard):
```typescript
// Copy imports from ProtectedRoute.tsx pattern (lines 10-13) — adapt for Badge:
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@campaign/shared';

interface CampaignBadgeProps {
  status: CampaignStatus;
}

// satisfies gives compile-time exhaustiveness over all 4 CampaignStatus values (m1 guard).
// If a 5th status is added to the shared enum, TypeScript errors here before runtime.
const STATUS_CONFIG = {
  draft:     { label: 'Draft',     className: 'bg-gray-100 text-gray-600 border-gray-200' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  sending:   { label: 'Sending',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  sent:      { label: 'Sent',      className: 'bg-green-100 text-green-700 border-green-200' },
} as const satisfies Record<CampaignStatus, { label: string; className: string }>;

export function CampaignBadge({ status }: CampaignBadgeProps): React.ReactElement {
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

---

### `frontend/src/test/CampaignBadge.test.tsx` (test, TEST-05)

**Analog:** `frontend/src/test/ProtectedRoute.test.tsx` — exact same test structure: `describe/it/expect`, `render` + `screen`, `Provider` + `configureStore` pattern.

**Imports pattern** — from `frontend/src/test/ProtectedRoute.test.tsx` lines 5-11:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignBadge } from '@/components/CampaignBadge';
// No Provider needed — CampaignBadge is a pure presentational component (no Redux/RQ)
```

**Test structure** — from `frontend/src/test/ProtectedRoute.test.tsx` lines 45-67:
```typescript
// No store setup needed (pure component — no Redux).
// No MemoryRouter needed (no navigation).
// All 4 status variants must be tested (TEST-05 requires exhaustive coverage).
describe('CampaignBadge', () => {
  it('renders draft badge with grey styling', () => {
    render(<CampaignBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // shadcn Badge renders data-slot="badge" on the root span
    expect(screen.getByText('Draft').closest('[data-slot="badge"]'))
      .toHaveClass('bg-gray-100');
  });

  it('renders scheduled badge with blue styling', () => {
    render(<CampaignBadge status="scheduled" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Scheduled').closest('[data-slot="badge"]'))
      .toHaveClass('bg-blue-100');
  });

  it('renders sending badge with amber styling and spinner', () => {
    render(<CampaignBadge status="sending" />);
    expect(screen.getByText('Sending')).toBeInTheDocument();
    const badge = screen.getByText('Sending').closest('[data-slot="badge"]');
    expect(badge).toHaveClass('bg-amber-100');
    expect(badge?.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders sent badge with green styling', () => {
    render(<CampaignBadge status="sent" />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Sent').closest('[data-slot="badge"]'))
      .toHaveClass('bg-green-100');
  });
});
```

**Setup file** — already configured at `frontend/src/test/setup.ts` (Phase 8). No changes needed. All jsdom polyfills (TextEncoder, ResizeObserver, matchMedia) already present.

---

### `frontend/src/App.tsx` (modify — replace placeholders)

**Analog:** Self — current file at `frontend/src/App.tsx`. Read lines 1-43.

**Current state:** Phase 8 placeholder `LoginPage` and `AppShell` functions (lines 12-19). Replace with real imports.

**Replacement pattern** — lines 12-19 become:
```typescript
// Replace Phase 8 placeholders with real page imports:
import { LoginPage } from '@/pages/LoginPage';
import { CampaignListPage } from '@/pages/CampaignListPage';
import { NewCampaignPage } from '@/pages/NewCampaignPage';
import { CampaignDetailPage } from '@/pages/CampaignDetailPage';
```

**Route tree update** — replace `AppShell` route with real nested routes:
```tsx
// Replace <AppShell /> with nested campaign routes:
<Route
  path="/*"
  element={
    <ProtectedRoute>
      <Routes>
        <Route path="/campaigns" element={<CampaignListPage />} />
        <Route path="/campaigns/new" element={<NewCampaignPage />} />
        <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="/" element={<Navigate to="/campaigns" replace />} />
      </Routes>
    </ProtectedRoute>
  }
/>
```

**Preserve from Phase 8** — lines 7-10 (imports: Routes, Route, Navigate, useBootstrap, ProtectedRoute, Toaster), lines 21-24 (useBootstrap call), line 40 (`<Toaster />`).

---

### `frontend/src/main.tsx` (modify — add QueryCache onError)

**Analog:** Self — current file at `frontend/src/main.tsx`. Read lines 17-24.

**Current state:** `QueryClient` without `QueryCache` (lines 17-24). Phase 9 MUST add it.

**Replacement for lines 17-24** — RESEARCH.md Pattern 5:
```typescript
// Add import:
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';

// Replace QueryClient instantiation:
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
```

**Preserve from Phase 8** — all Provider nesting (lines 26-36): Redux outermost → QueryClientProvider → BrowserRouter → App. Order is critical per Phase 8 comment.

---

## Shared Patterns

### Auth Dispatch
**Source:** `frontend/src/hooks/useBootstrap.ts` lines 14-15 and lines 34-36
**Apply to:** `LoginPage.tsx`, `CampaignDetailPage.tsx` (logout)
```typescript
const dispatch = useDispatch<AppDispatch>();
// setAuth:
dispatch(setAuth({ accessToken: token, user }));
// clearAuth:
dispatch(clearAuth());
```

### API Call Pattern
**Source:** `frontend/src/lib/apiClient.ts` — `api` instance; `frontend/src/hooks/useBootstrap.ts` lines 25-32
**Apply to:** All page components
```typescript
// api instance auto-injects Bearer token (request interceptor) and handles 401 refresh.
// withCredentials: true is set at instance level — DO NOT pass per-call.
import { api } from '@/lib/apiClient';
const res = await api.get<{ data: T }>('/endpoint');
return res.data.data; // unwrap envelope
```

### useMutation + invalidateQueries
**Source:** RESEARCH.md Pattern 4; mirrors `useBootstrap` api call structure
**Apply to:** `LoginPage.tsx`, `NewCampaignPage.tsx`, `CampaignDetailPage.tsx`
```typescript
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (payload) => api.post('/endpoint', payload),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  },
});
// Disable button while pending:
<Button disabled={mutation.isPending}>
  {mutation.isPending ? 'Loading...' : 'Action'}
</Button>
```

### Redux Selector Pattern
**Source:** `frontend/src/components/ProtectedRoute.tsx` lines 19-20
**Apply to:** `CampaignDetailPage.tsx` (logout needs dispatch; page may read `user` for display)
```typescript
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/index';
const { user } = useSelector((s: RootState) => s.auth);
```

### Conditional Render with Skeleton
**Source:** `frontend/src/components/ProtectedRoute.tsx` lines 24-34
**Apply to:** `CampaignListPage.tsx`, `CampaignDetailPage.tsx`
```typescript
import { Skeleton } from '@/components/ui/skeleton';
if (isPending) {
  return (
    <div className="..." aria-label="Loading">
      <Skeleton className="h-N w-full" />
    </div>
  );
}
```

### Test Store Factory
**Source:** `frontend/src/test/ProtectedRoute.test.tsx` lines 13-19
**Apply to:** Any test that needs Redux (LoginPage test if written)
```typescript
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';

function makeStore(bootstrapped: boolean, user: { id: number; email: string } | null) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { accessToken: null, user, bootstrapped } },
  });
}
```

### API Mock Pattern for Tests
**Source:** `frontend/src/test/bootstrap.test.tsx` lines 12-27
**Apply to:** `CampaignBadge.test.tsx` does NOT need this (pure component). Use for any future page tests.
```typescript
vi.mock('@/lib/apiClient', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));
const { api } = await import('@/lib/apiClient');
```

---

## No Analog Found

All files have at least a role-match analog. The following patterns come from RESEARCH.md only (no codebase analog exists yet — this is a greenfield frontend):

| File / Pattern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| `useInfiniteQuery` with offset pagination | hook | infinite scroll | No infinite query exists in Phase 8 codebase |
| `refetchInterval` polling | hook | polling | No polling hook exists in Phase 8 codebase |
| `react-hook-form` + `@hookform/resolvers/zod` | form | request-response | No form components in Phase 8 codebase |
| `AlertDialog` confirm flows | component | request-response | No dialogs in Phase 8 codebase |
| `EmailTokenizer` | component | transform | No complex input components in Phase 8 codebase |

**For these:** Use RESEARCH.md Patterns 1–11 as the primary reference. Analogs from codebase provide the structural skeleton (imports style, conditional render, Redux dispatch, api call) while RESEARCH.md provides the library-specific API calls.

---

## Metadata

**Analog search scope:** `frontend/src/` — all 14 existing Phase 8 files
**Files scanned:** 14 (all files in frontend/src/ via Glob + Read)
**Shared schemas scanned:** `shared/src/schemas/campaign.ts`, `shared/src/schemas/auth.ts`
**Pattern extraction date:** 2026-04-22
