# Stack Research

**Domain:** Email Campaign Manager (MarTech)
**Researched:** 2026-04-20
**Confidence:** MEDIUM-HIGH (training knowledge, cutoff Aug 2025)

## Recommended Package Versions

### Backend
- `express@^4.19.2`
- `sequelize@^6.37.3`, `pg@^8.12.0`, `pg-hstore@^2.4.3` (pg-hstore is a silent required peer dep — install it)
- `bullmq@^5.12.0`, `ioredis@^5.4.1`
- `jsonwebtoken@^9.0.2`, `bcryptjs@^2.4.3`
- `zod@^3.23.8`
- `cookie-parser` (required before JWT auth middleware)
- `jest@^29.7.0`, `ts-jest@^29.2.3`, `supertest@^7.0.0`

### Frontend
- `react@^18.3.1`, `@tanstack/react-query@^5.51.1`
- `@reduxjs/toolkit@^2.2.7`, `react-redux@^9.1.2`
- `react-router-dom@^6.25.1`, `axios@^1.7.3`
- `tailwindcss@^3.4.7` (PIN to 3.x — v4 breaks shadcn config format)
- `vite@^5.3.5`
- shadcn runtime deps: `class-variance-authority@^0.7.0`, `clsx@^2.1.1`, `tailwind-merge@^2.4.0`, `lucide-react@^0.414.0`

## Key Patterns

### Sequelize
- Use class-based `Model.init()` + `static associate()` pattern — NOT `sequelize-typescript` decorators (version lag risk)
- `belongsToMany` through-table must be a named Model instance, not a string — otherwise you lose access to `CampaignRecipient.status`, `sent_at`, etc.
- Use `underscored: true` to auto-map camelCase to snake_case column names
- Call `associate()` after all models are initialized in `models/index.ts`
- Never call `sync()` outside isolated test setup

### BullMQ — Critical
- **CRITICAL:** Set `maxRetriesPerRequest: null` on every IORedis connection used with BullMQ. Omitting it causes `ReplyError: Command timed out` silently under load.
- Create one Queue instance at app startup and reuse — never create per-request
- Use **separate** IORedis connection instances for Queue and Worker (different connection objects)
- Add mandatory `worker.on('failed', ...)` and `worker.on('error', ...)` listeners

### JWT
- Use httpOnly cookie + `sameSite: strict` (not localStorage — XSS risk)
- Middleware reads from `req.cookies.token` with fallback to `Authorization` header for test compatibility
- 24h expiry for demo scope
- `cookie-parser` must be registered before JWT auth middleware
- Specify `algorithms` array in `jwt.verify()` call

### React Query v5
- Uses object-only syntax for `useQuery` — positional args were removed in v5
- RTK Query is out of scope (requirements specify React Query separately)
- React Query owns all server state; Redux owns auth token + UI flags only — never copy React Query results into Redux slices

### shadcn/ui Setup
- Run `npx shadcn@latest init` — choose New York style, Slate color, CSS variables enabled
- `@` path alias must be configured in **BOTH** `vite.config.ts` AND `tsconfig.json` — missing from tsconfig causes TS compilation failure even though Vite resolves at runtime
- Components to install: `button badge card table progress skeleton form input label dialog alert`

### Testing
- Split `app.ts` (Express config, routes) from `index.ts` (server listen) — required for Supertest to import app without starting a server
- Use `sync({ force: true })` in `beforeAll` for test database setup only
- 3 required tests: status-guard 409 on non-draft edit/delete, stats aggregation, send returns 202

### Docker Compose
- Backend startup command: `sh -c "npx sequelize db:migrate && node dist/index.js"` — idempotent, no separate init container needed
- Use `condition: service_healthy` for both postgres and redis dependencies (bare `depends_on` does not wait for service readiness)
- Inside Docker Compose, DB host is the service name (`postgres`), not `localhost`
- Frontend: multi-stage Dockerfile (node builder → nginx:alpine) with `try_files $uri /index.html` for SPA routing

## Version Conflicts & Critical Gotchas

| Issue | Severity |
|-------|----------|
| BullMQ ioredis missing `maxRetriesPerRequest: null` | CRITICAL |
| Sequelize PostgreSQL ENUM cannot be altered inside a transaction — plan status values upfront | HIGH |
| shadcn `@` alias must be in both `vite.config.ts` and `tsconfig.json` | HIGH |
| Pin `tailwindcss@^3.4.x` — Tailwind v4 breaks shadcn config format | HIGH |
| Docker `depends_on` without `condition: service_healthy` does not wait for DB readiness | HIGH |
| Supertest requires `app.ts` / `index.ts` split | MEDIUM |
| `pg-hstore` is a silent required peer dep of Sequelize | MEDIUM |
| React Query v5 uses object-only syntax for `useQuery` | MEDIUM |
| `bull` vs `bullmq` are different packages with incompatible APIs | MEDIUM |
| `cookie-parser` must be registered before JWT auth middleware | MEDIUM |

## Open Questions

- **`GET /auth/me` endpoint:** Not in requirements but needed for clean auth rehydration on refresh with httpOnly cookies. Add unless "re-login on refresh" is acceptable.
- **Recipient deduplication:** `Recipient.email` is unique — decide: upsert vs 409 conflict when `POST /recipient` called with existing email.
- **`sending` state confirmation:** v2 requirements include it; v1 did not. Use 4-state machine from day one: `draft → scheduled → sending → sent`.
