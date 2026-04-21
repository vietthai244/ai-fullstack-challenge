# Phase 8: Frontend Foundation — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 14 new/modified files
**Analogs found:** 11 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/package.json` | config | — | `backend/package.json` | role-match |
| `frontend/tsconfig.json` | config | — | `backend/tsconfig.json` | role-match (override required) |
| `frontend/vite.config.ts` | config | — | `backend/vitest.config.ts` | partial (same defineConfig shape) |
| `frontend/vitest.config.ts` | config | — | `backend/vitest.config.ts` | exact |
| `frontend/tailwind.config.ts` | config | — | none | no analog |
| `frontend/postcss.config.cjs` | config | — | none | no analog |
| `frontend/src/main.tsx` | provider/entry | request-response | `backend/src/index.ts` | partial (bootstrap/boot sequence) |
| `frontend/src/App.tsx` | component | request-response | `backend/src/app.ts` | partial (route wiring + bootstrap) |
| `frontend/src/store/index.ts` | store | — | `backend/src/config/env.ts` | partial (single-export config module) |
| `frontend/src/store/authSlice.ts` | store/slice | — | none in codebase — use RESEARCH.md | no analog |
| `frontend/src/lib/apiClient.ts` | utility | request-response | `backend/src/middleware/authenticate.ts` + `backend/src/routes/auth.ts` | partial (token injection + auth flow) |
| `frontend/src/hooks/useBootstrap.ts` | hook | request-response | `backend/src/index.ts` (bootstrap sequence) | partial |
| `frontend/src/components/ProtectedRoute.tsx` | component/guard | request-response | `backend/src/middleware/authenticate.ts` | role-match (auth guard) |
| `frontend/src/test/setup.ts` | test | — | `backend/test/setup.ts` | role-match |

---

## Pattern Assignments

### `frontend/package.json` (config)

**Analog:** `backend/package.json`

**Script conventions pattern** (lines 8-17):
```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Key differences from backend:** Use `vite` instead of `tsx watch`; add `"type": "module"` (already present); replace `supertest` with `@testing-library/react`; pin `vitest@2.1.9` explicitly in devDependencies (root resolutions cover it but explicit pin is safer); pin `tailwindcss@^3.4.19` and `@vitejs/plugin-react@4.7.0` explicitly.

**Full dependency block to produce:**
```json
{
  "dependencies": {
    "@campaign/shared": "workspace:*",
    "@reduxjs/toolkit": "2.11.2",
    "@tanstack/react-query": "5.99.2",
    "axios": "1.15.1",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.1",
    "lucide-react": "0.414.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-redux": "9.2.0",
    "react-router-dom": "6.30.3",
    "tailwind-merge": "2.4.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/react": "^18.3.20",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "4.7.0",
    "autoprefixer": "^10.4.21",
    "jsdom": "29.0.2",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.19",
    "typescript": "^5.8.3",
    "vite": "5.4.21",
    "vitest": "2.1.9"
  }
}
```

---

### `frontend/tsconfig.json` (config)

**Analog:** `backend/tsconfig.json` (lines 1-10) — extends the same `../tsconfig.base.json` but MUST override `module` and `moduleResolution`.

**Backend analog** (`backend/tsconfig.json` lines 1-10):
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2022"],
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

**Critical override required** — `tsconfig.base.json` sets `"module": "NodeNext"` (line 4) and `"moduleResolution": "NodeNext"` (line 5). Frontend MUST override BOTH. Without this, `tsc --noEmit` fails with extension-import errors on all Vite-resolved paths. Also `rootDir` does not apply to frontend (no `noEmit: false` build); `include` must cover `.tsx` and config files.

**Frontend override pattern** (from 08-RESEARCH.md Pattern 6):
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

**Critical:** `"baseUrl": "."` is required for `paths` to work. `"types": ["vitest/globals"]` enables `describe`/`it`/`expect` without import in test files.

---

### `frontend/vite.config.ts` (config)

**Analog:** `backend/vitest.config.ts` (lines 1-20) — same `defineConfig` import pattern, same plugin + resolve structure.

**Backend vitest analog** (`backend/vitest.config.ts` lines 1-10):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { ... }
});
```

**Frontend vite pattern** (from 08-RESEARCH.md Pattern 5):
```typescript
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

**Note:** Uses `node:path` (not bare `path`) — matches the `node:` prefix convention used throughout the backend (e.g., `backend/test/globalSetup.ts` line 3: `import { resolve, dirname } from 'node:path'`). Uses `import.meta.dirname` or `path.resolve(__dirname, ...)` — with `"moduleResolution": "Bundler"` Vite handles `__dirname` via the plugin.

---

### `frontend/vitest.config.ts` (config)

**Analog:** `backend/vitest.config.ts` (exact role match)

**Backend vitest config** (`backend/vitest.config.ts` lines 1-20):
```typescript
// backend/vitest.config.ts
// C18: Vitest 2.1.9 pinned via root resolutions. Use singleFork (2.x syntax).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
```

**Frontend pattern** — same `defineConfig` from `vitest/config`, but jsdom environment (not forks), add react plugin + @ alias, no globalSetup (no DB):
```typescript
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

**Key difference:** Backend uses `pool: 'forks'` + `singleFork: true` for shared DB pool. Frontend uses `environment: 'jsdom'` — no forks needed, no DB. `globals: true` matches `"types": ["vitest/globals"]` in tsconfig.

---

### `frontend/tailwind.config.ts` (config)

**Analog:** None in codebase. Use RESEARCH.md pattern only.

**Pattern from RESEARCH.md:** shadcn New York / Slate requires `content` paths to cover all component files, and `theme.extend` for CSS variable-based color tokens. Run `npx shadcn@latest init` from `frontend/` — shadcn writes this file automatically. Manual template:

```typescript
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

---

### `frontend/postcss.config.cjs` (config)

**Analog:** None in codebase. Minimal — Tailwind 3.x requirement. Use `.cjs` extension to force CommonJS evaluation under Vite 5 ESM context (avoids ESM parse issues per RESEARCH.md assumption A3):

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

### `frontend/src/main.tsx` (provider/entry, request-response)

**Analog:** `backend/src/index.ts` — both are the process/app entry point that wires providers before the main logic runs.

**Backend boot pattern** (`backend/src/index.ts` lines 1-53): imports `buildApp`, calls startup checks (DB, Redis), then `.listen()`. Sequential boot with error exit.

**Frontend entry pattern** — same concept: import providers, call `ReactDOM.createRoot`, wrap tree. From RESEARCH.md:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/store/index';
import App from '@/App';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
);
```

**Provider nesting order:** Redux (`Provider`) outermost so axios interceptor can call `store.dispatch` at module scope; React Query inside; BrowserRouter inside both.

---

### `frontend/src/App.tsx` (component, request-response)

**Analog:** `backend/src/app.ts` — route wiring + middleware orchestration in one file. Both mount a sequence: auth check first, then protected routes, then fallback.

**Backend route wiring pattern** (`backend/src/app.ts` lines 20-60):
```typescript
// Middleware order — comment explains why each position
app.use(httpLogger);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.get('/health', ...);
app.use('/auth', authRouter);         // PUBLIC
app.use('/campaigns', campaignsRouter); // PROTECTED
app.use('/track', trackRouter);       // PUBLIC
app.use(errorHandler);                // TAIL
```

**Frontend equivalent** — Routes in order: public (`/login`), protected (`/campaigns/*`), fallback. Bootstrap runs before route decisions:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useBootstrap } from '@/hooks/useBootstrap';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  useBootstrap(); // fires /auth/refresh → /auth/me on mount

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <CampaignsLayout />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />  {/* mounted at root, renders Phase 9 toasts */}
    </>
  );
}
```

---

### `frontend/src/store/index.ts` (store, —)

**Analog:** `backend/src/config/env.ts` — single-export config module. Both export one thing used across the app.

**Backend config pattern** (`backend/src/config/env.ts` lines 38-47):
```typescript
// Parse once at import, export the validated config singleton
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) { ... process.exit(1); }
export const config = parsed.data;
```

**Frontend store pattern** — same single-import singleton, same TypeScript export-helper pattern from RTK docs:

```typescript
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

// Export RootState and AppDispatch types — used in every useSelector/useDispatch call
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

---

### `frontend/src/store/authSlice.ts` (store/slice, —)

**Analog:** None in existing codebase — no Redux exists yet. Use RESEARCH.md Pattern 2 directly.

**Pattern from 08-RESEARCH.md Pattern 2** (lines 291-331):
```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  accessToken: string | null;
  user: { id: number; email: string } | null;
  bootstrapped: boolean;
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
      state.bootstrapped = true; // stays true — we know the auth state now
    },
    setBootstrapped: (state) => {
      state.bootstrapped = true;
    },
  },
});

export const { setAuth, setToken, clearAuth, setBootstrapped } = authSlice.actions;
export default authSlice.reducer;
```

**Critical:** `clearAuth` sets `bootstrapped = true` (not false). After a failed refresh we know the auth state (logged out). Setting it false would cause infinite re-bootstrap loop.

---

### `frontend/src/lib/apiClient.ts` (utility, request-response)

**Analog:** `backend/src/middleware/authenticate.ts` (token reading pattern) + `backend/src/routes/auth.ts` lines 108-177 (refresh + denylist logic). Both are the central auth enforcement point.

**Backend token injection pattern** (`backend/src/middleware/authenticate.ts` lines 24-53):
```typescript
export function authenticate(req, _res, next): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('MISSING_TOKEN'));
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccess(token);
    req.user = { id: Number(payload.sub), email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError('INVALID_TOKEN'));
  }
}
```

**Backend refresh rotation pattern** (`backend/src/routes/auth.ts` lines 108-177): single-attempt rotation with denylist, 401 on failure.

**Frontend axios client pattern** (from 08-RESEARCH.md Pattern 1 — C6 CRITICAL guard):
```typescript
import axios from 'axios';
import { store } from '@/store/index';
import { setToken, clearAuth } from '@/store/authSlice';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // MANDATORY — httpOnly cookie must be sent on every call
});

// Module-scope singleton — NOT component state, NOT inside closure
let refreshPromise: Promise<string> | null = null;

// Request interceptor: inject Bearer token from Redux store
api.interceptors.request.use((config) => {
  const token = store.getState().auth.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with memoized single refresh
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
            refreshPromise = null; // MUST be in .finally() not .then()
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

**Backend `/auth/refresh` CSRF header requirement** (`backend/src/routes/auth.ts` lines 113-116):
```typescript
if (req.headers['x-requested-with'] !== 'fetch') {
  throw new UnauthorizedError('CSRF_CHECK_FAILED');
}
```
The axios client MUST send `X-Requested-With: fetch` on the refresh call, or the backend returns 401 immediately.

---

### `frontend/src/hooks/useBootstrap.ts` (hook, request-response)

**Analog:** `backend/src/index.ts` — sequential boot checks before the app is ready.

**Backend boot sequence** (`backend/src/index.ts` lines 23-33):
```typescript
async function main(): Promise<void> {
  await sequelize.authenticate();  // Step 1: prove DB
  await pingRedis();               // Step 2: prove Redis
  const app = buildApp();
  const server = app.listen(...);
}
main().catch((err) => { logger.fatal({ err }); process.exit(1); });
```

**Frontend bootstrap pattern** (from 08-RESEARCH.md Pattern 3):
```typescript
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '@/lib/apiClient';
import { setAuth, clearAuth } from '@/store/authSlice';
import type { AppDispatch, RootState } from '@/store/index';

export function useBootstrap() {
  const dispatch = useDispatch<AppDispatch>();
  const bootstrapped = useSelector((s: RootState) => s.auth.bootstrapped);

  useEffect(() => {
    if (bootstrapped) return; // guard: only run once

    async function bootstrap() {
      try {
        // Step 1: exchange httpOnly refresh cookie for new access token
        const refreshRes = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
        const accessToken = refreshRes.data.data.accessToken;

        // Step 2: fetch user with new token (inject header directly — store not updated yet)
        const meRes = await api.get<{ data: { id: number; email: string } }>('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        dispatch(setAuth({ accessToken, user: meRes.data.data }));
      } catch {
        // No refresh cookie / expired — fall through to logged-out state silently
        dispatch(clearAuth());
      }
    }

    void bootstrap();
  }, [bootstrapped, dispatch]);
}
```

**Note:** The `/auth/refresh` call here does NOT go through the response interceptor (bootstrapped=false, no token to retry with). This is correct — bootstrap is the explicit refresh path; the interceptor handles implicit refresh during normal API use.

---

### `frontend/src/components/ProtectedRoute.tsx` (component/guard, request-response)

**Analog:** `backend/src/middleware/authenticate.ts` — same role: intercept a request/render, check auth state, pass through or redirect/reject.

**Backend guard structure** (`backend/src/middleware/authenticate.ts` lines 34-53):
```typescript
export function authenticate(req, _res, next): void {
  // 1. Check for token
  if (!header) { next(new UnauthorizedError('MISSING_TOKEN')); return; }
  // 2. Verify token
  try { const payload = verifyAccess(token); req.user = ...; next(); }
  catch { next(new UnauthorizedError('INVALID_TOKEN')); }
}
```

**Frontend guard pattern** (from 08-RESEARCH.md Pattern 4):
```tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/index';
import { Skeleton } from '@/components/ui/skeleton';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { bootstrapped, user } = useSelector((s: RootState) => s.auth);
  const location = useLocation();

  // Phase 1 of guard: wait for bootstrap — spinner, not redirect
  if (!bootstrapped) {
    return (
      <div className="flex h-dvh items-center justify-center" aria-label="Loading application">
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    );
  }

  // Phase 2 of guard: bootstrap done, no user → redirect to /login with return-to
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Phase 3: authenticated — render children
  return <>{children}</>;
}
```

**`aria-label="Loading application"`** — required by 08-UI-SPEC.md copywriting contract (line 139).

---

### `frontend/src/test/setup.ts` (test, —)

**Analog:** `backend/test/setup.ts` — same role: test lifecycle hooks + import of test utilities.

**Backend test setup** (`backend/test/setup.ts` lines 1-22):
```typescript
import { beforeEach, afterAll } from 'vitest';
import { sequelize } from '../src/db/index.js';

beforeEach(async () => {
  await sequelize.query(`TRUNCATE TABLE ...`);
});

afterAll(async () => {
  await sequelize.close();
});
```

**Frontend test setup pattern** (from 08-RESEARCH.md Pattern 8 — C18 guard):
```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 29 ships without these globals — stub before any src/ import
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
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => { cleanup(); });
```

---

## Shared Patterns

### Response Envelope Shape
**Source:** `backend/src/routes/auth.ts` (lines 67-69, 92-97, 173)
**Apply to:** `apiClient.ts` (typed axios generics), `useBootstrap.ts` (response destructuring)
```typescript
// All API responses use { data: ... } wrapper — never naked objects
res.json({ data: { accessToken } });
res.json({ data: { id, email, name, accessToken, user } });
// Frontend consuming:
const refreshRes = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
const token = refreshRes.data.data.accessToken;
```

### Node: Import Prefix Convention
**Source:** `backend/test/globalSetup.ts` (line 3: `import { resolve, dirname } from 'node:path'`)
**Apply to:** `vite.config.ts`, `vitest.config.ts`
```typescript
import path from 'node:path'; // use node: prefix — matches backend convention
```

### Error Handling: Silent Catch / Fall-through
**Source:** `backend/src/routes/auth.ts` (lines 186-225 — logout: `catch { /* Invalid token — nothing to denylist */ }`)
**Apply to:** `useBootstrap.ts` (bootstrap failure is silent: `catch { dispatch(clearAuth()); }`)
```typescript
// Bootstrap failure is not an error state — user is simply not authenticated.
// Mirrors backend logout: invalid/missing token → clear state and continue.
try { ... } catch { dispatch(clearAuth()); }
```

### CSRF Header for `/auth/refresh`
**Source:** `backend/src/routes/auth.ts` (lines 113-116)
**Apply to:** `apiClient.ts` (refresh call) and `useBootstrap.ts` (bootstrap refresh call)
```typescript
// Backend enforces X-Requested-With: fetch on POST /auth/refresh
// All axios calls using the api instance must send this header
api.defaults.headers.common['X-Requested-With'] = 'fetch';
// OR per-call on the refresh POST inside the interceptor and bootstrap
```

### TypeScript Strict: Avoid `.js` Extension Imports
**Source:** `backend/tsconfig.json` + `tsconfig.base.json` (`"module": "NodeNext"` requires `.js`)
**Apply to:** Frontend source files — `"moduleResolution": "Bundler"` means NO `.js` extensions needed on local imports. Do not copy backend import style:
```typescript
// Backend (NodeNext — needs .js):
import { authRouter } from './routes/auth.js';
// Frontend (Bundler — no extension):
import { store } from '@/store/index';
import { api } from '@/lib/apiClient';
```

### Comment Header Convention
**Source:** All backend source files — first 3-8 lines are a comment block: filename, phase, purpose, invariants.
**Apply to:** All frontend source files
```typescript
// frontend/src/lib/apiClient.ts
//
// Phase 8 (UI-05): axios instance + interceptors.
// Memoized refresh promise (C6 guard) — module-scope variable, not component state.
// withCredentials: true on instance — never per-call.
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `frontend/tailwind.config.ts` | config | — | No CSS build config in codebase; shadcn init generates this |
| `frontend/postcss.config.cjs` | config | — | No PostCSS in codebase; Tailwind 3.x requirement only |
| `frontend/src/store/authSlice.ts` | store/slice | — | No Redux in codebase yet; use RESEARCH.md Pattern 2 verbatim |

---

## Metadata

**Analog search scope:** `backend/src/`, `backend/test/`, `frontend/src/`, root config files
**Files scanned:** 18 source files read
**Pattern extraction date:** 2026-04-21
