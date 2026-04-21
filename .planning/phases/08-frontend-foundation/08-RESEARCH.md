# Phase 8: Frontend Foundation — Research

**Researched:** 2026-04-21
**Domain:** React 18 + Vite 5 + shadcn/ui + Redux Toolkit + React Query v5 + axios interceptor
**Confidence:** HIGH

---

## Project Constraints (from CLAUDE.md)

**Stack (locked — do not re-litigate):**
- React 18 + Vite 5, Redux Toolkit + React Query v5
- shadcn/ui New York / Slate + Tailwind 3.x (pin 3.x)
- axios HTTP client, React Router v6
- Vitest 2.1.9 (pinned via root resolutions), Yarn 4 flat workspaces

**Coding constraints:**
- `axios.defaults.withCredentials = true` set GLOBALLY (not per-call) — C6 guard
- Memoized in-flight refresh promise — N concurrent 401s = exactly 1 `/auth/refresh` call
- React Query owns ALL server state; Redux owns ONLY `accessToken`, `user`, `bootstrapped`, UI flags
- `@` path alias in BOTH `vite.config.ts` AND `tsconfig.json`
- jsdom polyfill stubs in test setup file for Phase 9 component tests
- No `sync()`, no server state in Redux slices

**Enforcement:**
- Do not modify `.docs/requirements.md`
- Do not re-open Key Decisions
- Do not pull from v2 deferred list

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Vite + React 18 + TS app with Tailwind + shadcn/ui, Redux Toolkit store, and React Query provider configured | shadcn `npx shadcn@latest init`, Vite config with `@vitejs/plugin-react@4.7.0`, RTK `configureStore`, RQ `QueryClientProvider` |
| UI-03 | App bootstrap — on load, calls `/auth/refresh` then `/auth/me` to rehydrate session after page refresh | `useEffect` in root `App.tsx`, dispatches to `authSlice`, sets `bootstrapped = true` when complete |
| UI-04 | Route guard — redirects unauthenticated users to `/login`; preserves return-to URL | React Router v6 `<Navigate>` with `state: { from: location }`, `useLocation` hook |
| UI-05 | HTTP client — injects access token, transparently refreshes once on 401 then retries, clears session on persistent auth failure | axios request + response interceptors, module-scope `let refreshPromise: Promise<string> | null` |
</phase_requirements>

---

## Summary

Phase 8 wires the complete frontend infrastructure shell. No pages are rendered — only the bootstrap loading shell, the route guard redirect mechanism, and the axios interceptor plumbing. The output is a Vite + React 18 app that starts on `:5173`, bootstraps auth state from the backend on mount, guards protected routes, and has a production-ready axios interceptor for transparent token refresh.

The single highest-risk item is the memoized refresh promise (C6). If the module-scope `refreshPromise` variable is not used as the singleton, N concurrent 401s will fire N requests to `/auth/refresh`, each rotating the token — the first completes, and subsequent ones 401 because the token was already rotated. The user is logged out silently.

The second risk is tsconfig incompatibility. The base `tsconfig.base.json` uses `"module": "NodeNext"` which is backend-appropriate. The frontend workspace needs `"module": "ESNext"` and `"moduleResolution": "Bundler"` (Vite-appropriate). The `@` path alias must appear in BOTH `vite.config.ts` `resolve.alias` AND `tsconfig.json` `compilerOptions.paths` — missing from either causes either runtime or typecheck failures.

**Primary recommendation:** Write the axios interceptor's memoized refresh logic first; it is the C6 guard that downstream Phase 9 hooks depend on.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App bootstrap (`/auth/refresh` → `/auth/me`) | Browser (React) | API (Phase 3) | Client triggers the chain on mount; API already implements both endpoints |
| Access token storage | Browser (Redux memory) | — | In-memory only; never localStorage/sessionStorage (XSS defense) |
| Refresh token transport | Browser (axios) | API (httpOnly cookie) | axios `withCredentials: true` sends cookie automatically; browser owns transport |
| Route guard redirect | Browser (React Router) | — | `<ProtectedRoute>` wrapper in component tree; no server involvement |
| Token refresh interception | Browser (axios interceptor) | API (`/auth/refresh`) | Interceptor fires on 401; API rotates tokens |
| Server state (campaigns, stats) | React Query cache | API | RQ fetches and caches; Redux must not touch this data |
| UI flags (loading, modals) | Browser (Redux) | — | Non-server client state; Redux is appropriate |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 18.3.1 | UI rendering | Locked in CLAUDE.md |
| react-dom | 18.3.1 | DOM renderer | Paired with react |
| vite | 5.4.21 | Build + dev server | Locked in CLAUDE.md; 5.x required for @vitejs/plugin-react@4.7.0 |
| @vitejs/plugin-react | 4.7.0 | JSX transform + HMR | PINNED — 5.x requires Vite 6 (C18) |
| tailwindcss | 3.4.19 | Utility CSS | PINNED to 3.x — v4 breaks shadcn config format |
| @reduxjs/toolkit | 2.11.2 | Redux state management | Locked in CLAUDE.md |
| react-redux | 9.2.0 | React bindings for Redux | Locked in CLAUDE.md |
| @tanstack/react-query | 5.99.2 | Server state fetching + caching | Locked in CLAUDE.md |
| react-router-dom | 6.30.3 | Client-side routing | Locked in CLAUDE.md; v6 API used (v7 is a different product) |
| axios | 1.15.1 | HTTP client | Locked in CLAUDE.md; interceptor API used for refresh |

[VERIFIED: npm registry for all versions above]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 0.414.0+ | Icons (shadcn default) | Bootstrap spinner `Loader2`, later phase icons |
| clsx | 2.1.1 | Conditional class strings | shadcn util via `cn()` helper |
| tailwind-merge | 2.4.0 | Merge Tailwind classes without conflicts | Part of shadcn `cn()` utility |
| class-variance-authority | 0.7.0 | Variant-based component styling | shadcn component variants |
| postcss | 8.x | CSS processing pipeline | Required by Tailwind 3.x |
| autoprefixer | 10.x | CSS vendor prefixes | Required by Tailwind 3.x |

[ASSUMED — shadcn peer deps based on training knowledge; confirmed by shadcn docs pattern]

### Testing

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| vitest | 2.1.9 | Test runner | PINNED via root resolutions — do not upgrade |
| @vitejs/plugin-react | 4.7.0 | Plugin for vitest+react | Same pin as build |
| @testing-library/react | 16.3.2 | Component testing | React 18 compatible |
| @testing-library/user-event | 14.6.1 | User interaction simulation | Works with RTL 16.x |
| @testing-library/jest-dom | 6.9.1 | DOM matchers | Import in setup file |
| jsdom | 29.0.2 | DOM environment for Vitest | Requires polyfill stubs |

[VERIFIED: npm registry for vitest 2.1.9 availability]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axios | native fetch | fetch has no interceptors; refresh memoization is harder |
| Redux Toolkit | Zustand | RTK is locked; Zustand would be simpler but not in spec |
| React Query | SWR | RQ v5 locked; SWR has no `initialPageParam` |
| shadcn/ui | Radix UI direct | shadcn is locked; Radix would require manual styling |

**Installation (complete frontend setup):**
```bash
yarn workspace @campaign/frontend add react react-dom @reduxjs/toolkit react-redux @tanstack/react-query react-router-dom axios lucide-react clsx tailwind-merge class-variance-authority

yarn workspace @campaign/frontend add -D vite @vitejs/plugin-react tailwindcss@^3.4.19 postcss autoprefixer typescript @types/react @types/react-dom vitest@2.1.9 @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

**Version verification:** All versions verified against npm registry on 2026-04-21. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Page refresh / App mount
        │
        ▼
   App.tsx mount
        │
        ▼
   useEffect: bootstrap sequence
        │
   POST /auth/refresh ──────────────────────────────► API (Phase 3)
        │ 200: accessToken                              └─ rotates tokens
        │ 401: no cookie / expired ──► dispatch clearAuth()
        ▼
   GET /auth/me ─────────────────────────────────────► API (Phase 3)
        │ 200: { id, email }
        │ 401: ──────────────────────────────────────► dispatch clearAuth()
        ▼
   dispatch setAuth({ accessToken, user })
   dispatch setBootstrapped(true)
        │
        ▼
   React Router renders routes
        │
   ┌────┴──────────────────────────┐
   │ ProtectedRoute wrapper         │
   │  bootstrapped=false → spinner  │
   │  bootstrapped=true,            │
   │   !user → <Navigate /login>    │
   │   user  → render children      │
   └────────────────────────────────┘
        │
   User interaction triggers API call
        │
   axios request interceptor
        │ inject Authorization: Bearer {accessToken}
        ▼
   API call ──────────────────────────────────────────► API
        │ 200: normal response
        │ 401: response interceptor fires
              │
              ├─ refreshPromise exists? ──► await existing promise
              │
              └─ no promise? ──► create + store refreshPromise
                                      │
                                      ▼
                               POST /auth/refresh
                                      │ 200: new accessToken
                                      │   dispatch setToken()
                                      │   resolve refreshPromise
                                      │   retry original request
                                      │ 401: clearAuth() + navigate /login
                                      └─ clear refreshPromise ref
```

### Recommended Project Structure

```
frontend/
├── src/
│   ├── main.tsx                # Vite entry — mounts React root
│   ├── App.tsx                 # Bootstrap effect + Router + Providers
│   ├── app/
│   │   └── store.ts            # configureStore + RootState / AppDispatch types
│   ├── features/
│   │   └── auth/
│   │       └── authSlice.ts    # setAuth / clearAuth / setBootstrapped
│   ├── lib/
│   │   ├── axios.ts            # axios instance + interceptors (memoized refresh)
│   │   └── utils.ts            # cn() shadcn utility
│   ├── components/
│   │   ├── ui/                 # shadcn-generated components (skeleton, sonner)
│   │   └── ProtectedRoute.tsx  # Route guard wrapper
│   ├── index.css               # Tailwind directives + shadcn CSS variables
│   └── test/
│       └── setup.ts            # jsdom polyfills + @testing-library/jest-dom
├── vite.config.ts              # plugin-react + @ alias + server.proxy
├── vitest.config.ts            # jsdom env + @ alias + setupFiles
├── tsconfig.json               # ESNext + Bundler moduleResolution + paths
├── tailwind.config.ts          # content paths + shadcn theme extension
├── postcss.config.cjs          # tailwindcss + autoprefixer
└── components.json             # shadcn config (new-york, slate, cssVariables)
```

### Pattern 1: Memoized Refresh Promise (C6 Critical Guard)

**What:** Module-scope variable holds a single in-flight refresh promise. All concurrent 401s await the same promise.
**When to use:** Always — this is the ONLY safe pattern for refresh token interception with rotation.

```typescript
// src/lib/axios.ts
// Source: C6 pattern from .planning/research/PITFALLS.md + STACK.md
import axios from 'axios';
import { store } from '@/app/store';
import { setToken, clearAuth } from '@/features/auth/authSlice';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // MANDATORY — httpOnly cookie must be sent
});

// Memoized in-flight refresh promise — module scope, not component scope
let refreshPromise: Promise<string> | null = null;

// Request interceptor: inject access token
api.interceptors.request.use((config) => {
  const token = store.getState().auth.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with single memoized refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = api
          .post<{ data: { accessToken: string } }>('/auth/refresh')
          .then((res) => {
            const token = res.data.data.accessToken;
            store.dispatch(setToken(token));
            return token;
          })
          .finally(() => {
            refreshPromise = null; // reset after settle
          });
      }

      const newToken = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch {
      store.dispatch(clearAuth());
      window.location.href = '/login';
      return Promise.reject(error);
    }
  },
);
```

### Pattern 2: authSlice (Redux Owns Auth Only)

```typescript
// src/features/auth/authSlice.ts
// Source: RTK createSlice pattern [VERIFIED: Context7 /reduxjs/redux-toolkit]
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  accessToken: string | null;
  user: { id: number; email: string } | null;
  bootstrapped: boolean;  // false until /auth/refresh + /auth/me resolves
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  bootstrapped: false,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (state, action: PayloadAction<{ accessToken: string; user: { id: number; email: string } }>) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.bootstrapped = true;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },
    clearAuth: (state) => {
      state.accessToken = null;
      state.user = null;
      state.bootstrapped = true; // bootstrapped stays true — we know the state
    },
    setBootstrapped: (state) => {
      state.bootstrapped = true;
    },
  },
});

export const { setAuth, setToken, clearAuth, setBootstrapped } = authSlice.actions;
export default authSlice.reducer;
```

### Pattern 3: App Bootstrap Sequence

```typescript
// src/App.tsx
// Source: Phase 8 requirement UI-03 + STACK.md §JWT Pattern
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '@/lib/axios';
import { setAuth, clearAuth } from '@/features/auth/authSlice';
import type { AppDispatch, RootState } from '@/app/store';

export function useBootstrap() {
  const dispatch = useDispatch<AppDispatch>();
  const bootstrapped = useSelector((s: RootState) => s.auth.bootstrapped);

  useEffect(() => {
    if (bootstrapped) return;

    async function bootstrap() {
      try {
        // Step 1: get new access token using httpOnly refresh cookie
        const refreshRes = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
        const accessToken = refreshRes.data.data.accessToken;

        // Step 2: fetch user with new token (inject via store before /me call)
        const meRes = await api.get<{ data: { id: number; email: string } }>('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        dispatch(setAuth({ accessToken, user: meRes.data.data }));
      } catch {
        // No refresh cookie / expired — silently fall through to logged-out state
        dispatch(clearAuth());
      }
    }

    void bootstrap();
  }, [bootstrapped, dispatch]);
}
```

### Pattern 4: Protected Route Guard (UI-04)

```typescript
// src/components/ProtectedRoute.tsx
// Source: React Router v6 docs [VERIFIED: Context7 /websites/reactrouter_6_30_3]
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/app/store';
import { Skeleton } from '@/components/ui/skeleton';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { bootstrapped, user } = useSelector((s: RootState) => s.auth);
  const location = useLocation();

  // Wait for bootstrap to complete before making redirect decision
  if (!bootstrapped) {
    return (
      <div className="flex h-dvh items-center justify-center" aria-label="Loading application">
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

### Pattern 5: Vite Config with @ Alias and Dev Proxy

```typescript
// vite.config.ts
// Source: shadcn Vite installation docs [VERIFIED: Context7 /shadcn-ui/ui]
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/track': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
```

### Pattern 6: Frontend tsconfig (ESNext/Bundler — NOT NodeNext)

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "noEmit": true
  },
  "include": ["src/**/*", "vite.config.ts", "vitest.config.ts"]
}
```

**Critical:** `"module": "NodeNext"` from `tsconfig.base.json` must be OVERRIDDEN here. NodeNext requires `.js` extension imports which Vite/Bundler resolves automatically. Extending base and overriding `module` + `moduleResolution` is the correct approach.

[VERIFIED: shadcn Vite docs via Context7]

### Pattern 7: Vitest Config (Frontend)

```typescript
// vitest.config.ts
// Source: Vitest docs [VERIFIED: Context7 /vitest-dev/vitest]
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

### Pattern 8: jsdom Polyfill Setup File (C18 Guard)

```typescript
// src/test/setup.ts
// Source: C18 pattern from .planning/research/PITFALLS.md
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 29 ships without these globals — must stub before any src/ import
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('node:util');
  Object.assign(global, { TextEncoder, TextDecoder });
}

if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => { cleanup(); });
```

### Pattern 9: shadcn Init Command

```bash
# Run from frontend/ workspace directory
npx shadcn@latest init
# Interactive prompts:
#   Style: New York
#   Base color: Slate
#   CSS variables: Yes
#   Components path: @/components/ui
#   Utils path: @/lib/utils

# Install Phase 8 components only
npx shadcn@latest add skeleton
npx shadcn@latest add sonner
```

**Note:** shadcn writes to `components.json` at the workspace root it's run from. Must be run inside `frontend/` directory. [VERIFIED: Context7 /shadcn-ui/ui]

### Anti-Patterns to Avoid

- **`withCredentials` per-call:** setting it on individual requests means the bootstrap call or logout call can silently drop the cookie. Set globally: `axios.defaults.withCredentials = true` or on the axios instance.
- **`refreshPromise` as React state:** if stored in component state or context, it resets on re-render. Must be module-scope.
- **Dispatching server data to Redux:** `campaigns`, `recipients`, `stats` must never appear in any Redux slice. Only `accessToken`, `user`, `bootstrapped`, and UI flags permitted.
- **Bootstrap in login page:** bootstrap runs in `App.tsx` on ALL routes, not inside the login page. Login page assumes bootstrap is done.
- **`NodeNext` module resolution in frontend tsconfig:** breaks Vite's bundler resolution. Override with `Bundler`.
- **`@ alias only in vite.config.ts`:** TypeScript won't resolve it. Must also appear in `tsconfig.json` under `paths`.
- **shadcn init without `--monorepo` at root level:** running `npx shadcn@latest init` from the repo root will create `components.json` at root and write components to the wrong directory. Run from `frontend/` or use `--monorepo` with explicit paths.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token injection | Manual header in every `fetch()` | axios request interceptor | Interceptor fires for ALL requests including RQ; manual is error-prone |
| Token refresh on 401 | Try/catch around every API call | axios response interceptor with memoized promise | Centralized; handles concurrency |
| Route protection | Custom auth check in each component | `<ProtectedRoute>` wrapper + React Router | Consistent; return-to URL handling |
| CSS utility merging | Custom concat logic | `clsx` + `tailwind-merge` via `cn()` | Tailwind class conflicts are non-obvious |
| Component base | Writing Radix primitives from scratch | shadcn/ui | Accessibility, focus management, keyboard nav |
| Loading skeleton | CSS spinner from scratch | shadcn `Skeleton` | Already themed to Slate palette |

**Key insight:** The axios interceptor pattern handles ALL of: concurrent 401 deduplication, token injection, retry logic, and redirect on persistent failure. Any per-call approach will miss at least one edge case.

---

## Common Pitfalls

### Pitfall 1: Concurrent 401s Without Memoized Promise (C6 — CRITICAL)

**What goes wrong:** On page load, React Query fires 2-3 queries simultaneously. All 401 on expired access token. Each fires a separate `/auth/refresh` call. Backend rotates token on first call, second call gets a 401 (old refresh token was denylisted by first rotation). User logged out silently.

**Why it happens:** `refreshPromise` stored in wrong scope (component state, inside closure) or checked after async gap.

**How to avoid:** Module-scope `let refreshPromise: Promise<string> | null = null`. Check before creating. Clear in `.finally()` not `.then()`.

**Warning signs:** User reports random logouts on page load; 2+ simultaneous requests to `/auth/refresh` visible in network tab.

---

### Pitfall 2: NodeNext Module Resolution in Frontend tsconfig

**What goes wrong:** `tsconfig.base.json` sets `"module": "NodeNext"`. Frontend extends it without override. TypeScript demands `.js` extension on all local imports. Vite works at runtime (resolves without extensions) but `tsc --noEmit` fails with hundreds of errors.

**Why it happens:** `tsconfig.base.json` is designed for the backend (Node.js ESM). Frontend uses Vite's bundler which doesn't need extensions.

**How to avoid:** Frontend `tsconfig.json` MUST override: `"module": "ESNext"`, `"moduleResolution": "Bundler"`.

**Warning signs:** `tsc --noEmit` passes but Vite builds fail, OR `tsc --noEmit` fails with "relative import path must start with ./ or ../" errors.

---

### Pitfall 3: `@` Alias Missing from tsconfig.json

**What goes wrong:** Vite resolves `@/components/ui/button` at runtime. `tsc --noEmit` fails with "Cannot find module '@/components/ui/button'". shadcn-generated components use `@/lib/utils` — importing any shadcn component breaks typecheck.

**Why it happens:** shadcn init writes `@/` imports into all generated components. Without `paths` in tsconfig, TypeScript doesn't know the alias.

**How to avoid:** Always add to `tsconfig.json`:
```json
"paths": { "@/*": ["./src/*"] }
```
AND `baseUrl: "."` (required for paths to work).

**Warning signs:** Typecheck passes on `src/` files but fails on anything in `src/components/ui/`.

---

### Pitfall 4: shadcn Init Run from Wrong Directory

**What goes wrong:** Running `npx shadcn@latest init` from the repo root creates `components.json` at root and writes components to `components/ui/`. The frontend `vite.config.ts` and `tsconfig.json` path alias points to `frontend/src/` — imports break immediately.

**Why it happens:** shadcn detects project root by walking up for `package.json`.

**How to avoid:** Run from `frontend/` directory:
```bash
cd frontend && npx shadcn@latest init
```
Or use the `--monorepo` flag with explicit paths.

**Warning signs:** `components/` directory appears at repo root instead of `frontend/src/components/`.

---

### Pitfall 5: Bootstrap Running in Login Page Component

**What goes wrong:** Bootstrap (`/auth/refresh` → `/auth/me`) placed inside `LoginPage` component. Logged-in users who navigate directly to `/` or `/campaigns` never bootstrap — `bootstrapped` stays `false`, route guard spins forever.

**Why it happens:** Developer puts auth logic near auth UI.

**How to avoid:** Bootstrap runs in `App.tsx` (top-level component, before Router renders routes) on ALL routes unconditionally (with `if (bootstrapped) return` guard against double-run).

**Warning signs:** Direct navigation to `/campaigns` shows infinite spinner; login page works but app shell doesn't.

---

### Pitfall 6: Tailwind v4 Auto-Installed

**What goes wrong:** `yarn add tailwindcss` without version pin installs v4. shadcn's `components.json` and generated components expect `tailwind.config.ts` + `@tailwind base/components/utilities` directives. Tailwind v4 uses a completely different config mechanism (`@import "tailwindcss"`), breaking every generated component.

**Why it happens:** npm/yarn installs latest by default.

**How to avoid:** Always pin: `tailwindcss@^3.4.19`. Root `resolutions` does NOT cover this because tailwindcss is not in shared — must be explicit in `frontend/package.json`.

**Warning signs:** `postcss` errors about unrecognized directives; shadcn `cn()` works but components render unstyled.

---

### Pitfall 7: React Router v7 Instead of v6

**What goes wrong:** `yarn add react-router-dom` installs v7.14.2 (current latest). v7 has breaking changes in how loaders and actions work vs v6. The `<Navigate>` component and `useNavigate` work in both, but data router patterns differ.

**Why it happens:** Version drift from unpinned install.

**How to avoid:** Pin to v6: `react-router-dom@^6.30.3`.

**Warning signs:** TypeScript errors on `loader`/`action` props that weren't there before; `createBrowserRouter` API differs.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `frontend/vitest.config.ts` — Wave 0 gap (must create) |
| Quick run command | `yarn workspace @campaign/frontend test --run` |
| Full suite command | `yarn workspace @campaign/frontend test --run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Vite dev server starts, shadcn resolves, @ alias works | smoke (build verification) | `yarn workspace @campaign/frontend typecheck` | ❌ Wave 0 |
| UI-03 | Bootstrap fires once on mount; logged-out falls through silently | unit | `yarn workspace @campaign/frontend test --run src/test/bootstrap.test.tsx` | ❌ Wave 0 |
| UI-04 | Unauthenticated → /login with `from` state; authenticated → renders children | unit | `yarn workspace @campaign/frontend test --run src/test/ProtectedRoute.test.tsx` | ❌ Wave 0 |
| UI-05 | N concurrent 401s = exactly 1 refresh call; retry fires with new token | unit | `yarn workspace @campaign/frontend test --run src/test/axios.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `yarn workspace @campaign/frontend typecheck`
- **Per wave merge:** `yarn workspace @campaign/frontend test --run`
- **Phase gate:** Full suite green + `tsc --noEmit` clean before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `frontend/vitest.config.ts` — Vitest environment config (jsdom, globals, setupFiles)
- [ ] `frontend/src/test/setup.ts` — jsdom polyfills + jest-dom import
- [ ] `frontend/src/test/bootstrap.test.tsx` — UI-03 coverage
- [ ] `frontend/src/test/ProtectedRoute.test.tsx` — UI-04 coverage
- [ ] `frontend/src/test/axios.test.ts` — UI-05 memoized refresh coverage
- [ ] `frontend/package.json` — needs Vite, React, RTK, RQ, axios, shadcn deps added (currently only has `@campaign/shared`)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Access token in Redux memory (never localStorage); refresh via httpOnly cookie |
| V3 Session Management | yes | Memoized refresh promise; `bootstrapped` flag prevents race; `clearAuth` on persistent 401 |
| V4 Access Control | yes | `<ProtectedRoute>` wrapper; redirect fires after bootstrap (not before) |
| V5 Input Validation | partial | Phase 9 owns form validation; Phase 8 validates auth responses by shape |
| V6 Cryptography | no | JWT signing is backend-only (Phase 3) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS stealing access token | Information Disclosure | Token in Redux memory only — never `localStorage` / `sessionStorage` |
| CSRF on refresh endpoint | Tampering | `SameSite=Strict` cookie (set by backend Phase 3) |
| Refresh token replay after rotation | Repudiation | Backend denylists old jti; frontend clears Redux + redirects on persistent 401 |
| Concurrent 401 rotation race | Elevation of Privilege | Memoized `refreshPromise` — exactly 1 `/auth/refresh` call per expiry event |
| Open redirect via `from` state | Tampering | `from` is a React Router `Location` object (relative URL only) — not a raw string from URL params |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Vite dev server | ✓ | 22.14.0 | — |
| yarn (corepack) | package install | ✓ | 4.14.1 | — |
| npx | shadcn init | ✓ | bundled with Node | — |
| Backend API on :3000 | `vite server.proxy` for local dev | assumed ✓ | Phase 3 complete | Not needed for unit tests |

[VERIFIED: Bash `node --version`, `npx` check — 2026-04-21]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `create-react-app` | Vite 5 | 2022+ | Faster HMR, ESM-native, no ejection |
| Redux `connect()` HOC | RTK `useSelector`/`useDispatch` hooks | RTK 1.0 (2020) | Less boilerplate |
| React Query v4 `useInfiniteQuery` positional args | v5 object-only syntax + `initialPageParam` required | v5 (2023) | Breaking change — planner must use v5 syntax |
| `axios.interceptors` on `axios.defaults` | Axios instance (`axios.create()`) | Best practice always | Instance scoping prevents global pollution |
| CSS modules / styled-components | Tailwind + shadcn/ui | 2022-2023 | CSS-in-JS performance concerns; utility-first wins in most orgs |

**Deprecated/outdated:**
- `react-scripts` / CRA: unsupported, no Vite 5 compatibility — not used here
- React Query v4: `positionalArgs` removed in v5; `initialPageParam` required for `useInfiniteQuery`
- Tailwind v4 config format: NOT compatible with shadcn — pin to 3.x

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn peer deps (`clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`) are still the required runtime deps for shadcn New York style | Standard Stack — Supporting | shadcn init may pull different deps; `npx shadcn@latest init` will install what it needs |
| A2 | React Router v6.30.3 is the correct v6 pin (not v7) | Standard Stack | v7 has different data router API; wrong pin causes TS errors |
| A3 | `postcss.config.cjs` (CommonJS) works with Vite 5's ESM setup | Architecture Patterns | Some Vite 5 versions prefer `.mjs`; `.cjs` forces CJS evaluation which avoids ESM parsing issues |

---

## Open Questions

1. **shadcn monorepo flag needed?**
   - What we know: `npx shadcn@latest init` detects project root by walking up for `package.json`. There is a `--monorepo` flag in newer shadcn versions.
   - What's unclear: Whether shadcn will detect the monorepo root and write to wrong location when run from `frontend/`.
   - Recommendation: Run `cd frontend && npx shadcn@latest init` to be explicit. If it fails, try `npx shadcn@latest init --monorepo`.

2. **`tsconfig.base.json` `module: NodeNext` — partial override?**
   - What we know: `tsconfig.base.json` sets `module: NodeNext`, `moduleResolution: NodeNext`.
   - What's unclear: Whether extending the base and overriding only `module` + `moduleResolution` will work cleanly, or if other NodeNext-specific settings conflict.
   - Recommendation: Override both `module: ESNext` and `moduleResolution: Bundler` in `frontend/tsconfig.json`. The `extends` still inherits all other strict settings.

---

## Sources

### Primary (HIGH confidence)
- `/reduxjs/redux-toolkit` (Context7) — createSlice, configureStore patterns
- `/tanstack/query` (Context7) — QueryClientProvider setup
- `/websites/reactrouter_6_30_3` (Context7) — navigate with state, useLocation
- `/shadcn-ui/ui` (Context7) — Vite init command, components.json, @ alias
- `/vitest-dev/vitest` (Context7) — jsdom environment, setupFiles
- npm registry (Bash) — all version numbers verified 2026-04-21

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — C6, C12, C18 pitfall documentation (project-internal, researched 2026-04-20)
- `.planning/research/STACK.md` — frontend package list and version constraints (project-internal)
- `08-UI-SPEC.md` — design contract (project-internal, shadcn gate result)

### Tertiary (LOW confidence)
- shadcn peer dependency list (A1 in Assumptions Log) — based on training knowledge, not verified in this session

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions verified against npm registry
- Architecture: HIGH — patterns from verified Context7 docs + existing Phase 3 backend contract
- Pitfalls: HIGH — C6/C12/C18 documented in project PITFALLS.md from prior research session

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — stable libraries)
