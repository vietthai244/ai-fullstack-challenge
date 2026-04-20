# Stack Research

**Domain:** Email Campaign Manager (MarTech)
**Researched:** 2026-04-20
**Updated:** 2026-04-20 (revised after user choices: Vitest, flat monorepo, JWT split, cursor pagination, pixel endpoint)
**Confidence:** HIGH (npm-verified versions where called out)

## Recommended Package Versions

### Backend
- `express@^4.19.2`
- `sequelize@^6.37.3`, `pg@^8.12.0`, `pg-hstore@^2.4.3` (pg-hstore is a silent required peer dep — install it)
- `bullmq@^5.12.0`, `ioredis@^5.4.1`
- `jsonwebtoken@^9.0.2`, `bcryptjs@^2.4.3`
- `zod@^3.23.8`
- `cookie-parser` (required before JWT auth middleware)
- `pino` + `pino-http` for structured logging
- **Testing (Vitest, NOT Jest):**
  - `vitest@2.1.9` [VERIFIED: npm — last 2.x compatible with Vite 5]
  - `@vitest/coverage-v8@2.1.9`
  - `supertest@7.2.2` + `@types/supertest@6.0.3`
  - No `ts-jest` needed — Vitest handles TS via Vite

### Frontend
- `react@^18.3.1`, `@tanstack/react-query@^5.51.1`
- `@reduxjs/toolkit@^2.2.7`, `react-redux@^9.1.2`
- `react-router-dom@^6.25.1`, `axios@^1.7.3`
- `tailwindcss@^3.4.7` (PIN to 3.x — v4 breaks shadcn config format)
- `vite@^5.3.5`, `@vitejs/plugin-react@4.7.0` [VERIFIED: last 4.x supporting Vite 5]
- shadcn runtime deps: `class-variance-authority@^0.7.0`, `clsx@^2.1.1`, `tailwind-merge@^2.4.0`, `lucide-react@^0.414.0`
- **Testing:**
  - `vitest@2.1.9` (same pin as backend — **must match**)
  - `@testing-library/react@16.3.2`, `@testing-library/user-event@14.6.1`, `@testing-library/jest-dom@6.9.1`
  - `jsdom@29.0.2`
  - `msw@2.13.4` (optional — fresh QueryClient per test is also fine)

### Shared (workspace)
- `zod@^3.23.8` (declared HERE, not in backend/frontend — version-drift mitigation)
- `typescript@^5.5` (devDep, build-only)

### Tooling
- **Yarn 4** via `corepack use yarn@4.x` (pin in `packageManager` field). [VERIFIED: yarnpkg.com]
- `nodeLinker: node-modules` in `.yarnrc.yml` — DO NOT use Yarn PnP (breaks Vite optimizer, sequelize-cli, ts-node)
- `tsx` (backend dev runner — replaces ts-node, faster ESM)

## Key Patterns

### Sequelize
- Use class-based `Model.init()` + `static associate()` pattern — NOT `sequelize-typescript` decorators (version lag risk)
- `belongsToMany` through-table must be a named Model instance, not a string — otherwise you lose access to `CampaignRecipient.status`, `sent_at`, etc.
- Use `underscored: true` to auto-map camelCase to snake_case column names
- Call `associate()` after all models are initialized in `models/index.ts`
- Never call `sync()` outside isolated test setup — production uses Sequelize CLI migrations

### BullMQ — Critical
- **CRITICAL:** Set `maxRetriesPerRequest: null` on every IORedis connection used with BullMQ. Omitting it causes `ReplyError: Command timed out` silently under load.
- Create one Queue instance at app startup and reuse — never create per-request
- Use **separate** IORedis connection instances for Queue and Worker (different connection objects)
- Add mandatory `worker.on('failed', ...)` and `worker.on('error', ...)` listeners

### JWT — Split Access + Refresh (revised)

**Old pattern (single JWT in cookie) is replaced by access-in-memory + refresh-in-cookie split:**
- **Access token:** 15 min TTL, signed with `JWT_ACCESS_SECRET`, kept in Redux memory, sent as `Authorization: Bearer ...`. No `jti` (short TTL makes revocation moot).
- **Refresh token:** 7 day TTL, signed with separate `JWT_REFRESH_SECRET`, includes `jti` claim, set in `Set-Cookie: rt=...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh`.
- **Path scoping:** `Path=/auth/refresh` means the cookie is literally only sent to that endpoint — single most underused defense.
- **Rotation on refresh:** every `/auth/refresh` denylists the old `jti` and issues a new refresh + new access. Replay = stolen-token signal → force-logout.
- **Logout:** denylist refresh `jti` in Redis (`jwt:denylist:{jti}` with TTL = remaining token life).
- **CSRF:** `SameSite=Strict` covers ~95% of CSRF; add a 1-line `X-Requested-With: fetch` header check for the refresh endpoint.
- **App bootstrap:** call `/auth/refresh` then `/auth/me` on mount to rehydrate session after page refresh (since access token only lives in memory).
- **Frontend interceptor:** memoize a single in-flight refresh promise so N concurrent 401s = 1 refresh call.
- **`credentials: 'include'`** (fetch) or `withCredentials: true` (axios) is mandatory — most common bug is forgetting it.

`cookie-parser` must still be registered before JWT auth middleware. JWT verify must always specify `algorithms: ['HS256']`.

### React Query v5
- Object-only syntax for `useQuery` and `useInfiniteQuery` — positional args removed in v5
- `useInfiniteQuery` **requires `initialPageParam`** (breaking change from v4) — pass `undefined` for the first cursor
- `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined` — `undefined` flips `hasNextPage` to false
- React Query owns all server state; Redux owns auth token + UI flags only — never copy React Query results into Redux slices
- For tests: fresh `QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })` per test

### Cursor Pagination (revised — was offset)
- Cursor encodes `{created_at_iso, id}` as base64url-encoded JSON. Opaque to clients; lets us swap the underlying sort key later without breaking the contract.
- SQL uses row-value comparison: `WHERE created_by = $1 AND (created_at, id) < ($cAt, $cId) ORDER BY created_at DESC, id DESC LIMIT $limit + 1`. Fetch `limit + 1` to detect `hasMore`.
- **Sequelize 6 has no native row-value tuple support** — use `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with `replacements`. Never interpolate.
- Index: `CREATE INDEX ON campaigns (created_by, created_at DESC, id DESC);` — single B-tree scan handles ownership + sort + seek.
- Response shape: `{ data, nextCursor: string | null, hasMore: boolean }`. **No `total`** — counting defeats the O(limit) benefit.

### shadcn/ui Setup
- Run `npx shadcn@latest init` — choose New York style, Slate color, CSS variables enabled
- `@` path alias must be configured in **BOTH** `vite.config.ts` AND `tsconfig.json` — missing from tsconfig causes TS compilation failure even though Vite resolves at runtime
- Components to install: `button badge card table progress skeleton form input label dialog alert toast`

### Vitest — Backend
```ts
// backend/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // serialize DB tests
    setupFiles: ['./test/setup.ts'],
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
  },
});
```
- Split `app.ts` (Express config + routes; exports `buildApp()` factory) from `index.ts` (calls `buildApp().listen(PORT)`) — required for Supertest to import without binding a port.
- Test setup: `beforeAll` opens Sequelize + runs migrations, `beforeEach` truncates all tables (`TRUNCATE ... RESTART IDENTITY CASCADE`), `afterAll` closes connection.

### Vitest — Frontend
```ts
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: true },
});
```
- Setup file imports `@testing-library/jest-dom/vitest`, calls `cleanup()` in `afterEach`.
- jsdom 29 ships without `TextEncoder`, `structuredClone`, `ResizeObserver`, `matchMedia` — stub these in setup.

### Docker Compose (infra + api scope)
- Services: `postgres`, `redis`, `api`. Web runs via `yarn dev` (kept fast for iteration).
- Backend startup command: `sh -c "yarn workspace @campaign/backend run db:migrate && node dist/index.js"` — idempotent, no separate init container.
- Use `condition: service_healthy` for both postgres and redis dependencies (bare `depends_on` does not wait for service readiness).
- Inside Docker Compose, DB host is the service name (`postgres`), not `localhost`.

## Version Conflicts & Critical Gotchas

| Issue | Severity |
|-------|----------|
| Vitest 4.x requires Vite 6 — pin to `vitest@2.1.9` for Vite 5.3.x | HIGH |
| `@vitejs/plugin-react@5+` requires Vite 6 — pin to `4.7.0` | HIGH |
| BullMQ ioredis missing `maxRetriesPerRequest: null` | CRITICAL |
| Sequelize PostgreSQL ENUM cannot be altered inside a transaction — plan status values upfront | HIGH |
| Sequelize 6 has no row-value tuple support — use `literal()` for cursor predicate | HIGH |
| shadcn `@` alias must be in both `vite.config.ts` and `tsconfig.json` | HIGH |
| Pin `tailwindcss@^3.4.x` — Tailwind v4 breaks shadcn config format | HIGH |
| Yarn PnP breaks Vite optimizer + sequelize-cli — use `nodeLinker: node-modules` | HIGH |
| Docker `depends_on` without `condition: service_healthy` does not wait for DB readiness | HIGH |
| Forgetting `withCredentials: true` / `credentials: 'include'` — refresh cookie silently dropped | HIGH |
| `pg-hstore` is a silent required peer dep of Sequelize | MEDIUM |
| React Query v5 `useInfiniteQuery` requires `initialPageParam` (v4 didn't) | MEDIUM |
| `bull` vs `bullmq` are different packages with incompatible APIs | MEDIUM |
| `cookie-parser` must be registered before JWT auth middleware | MEDIUM |
| `pgcrypto` extension required for `gen_random_uuid()` (auto-on in PG 13+) | LOW |

## Open Questions (resolved)

- **`GET /auth/me` endpoint:** REQUIRED — needed for token rehydration on refresh with httpOnly cookies. Locked in REQUIREMENTS.md (AUTH-05).
- **Recipient deduplication:** UPSERT — `INSERT ... ON CONFLICT (email) DO UPDATE RETURNING id`.
- **`sending` state:** 4-state machine from day one: `draft → scheduled → sending → sent`.
- **`opened_at` tracking:** Pixel endpoint `GET /track/open/:trackingToken` (revised — see ARCHITECTURE.md). Use `tracking_token UUID` (not the natural composite PK) on `campaign_recipients` to defeat enumeration.
