# Milestones: Mini Campaign Manager

## v1.0 MVP — SHIPPED 2026-04-22

**Phases:** 12 (1–10, 10.1, 10.2) | **Plans:** 38 | **Timeline:** 3 days (2026-04-20 → 2026-04-22)
**Files changed:** 291 | **Lines added:** ~61k | **Git commits:** 245
**Tests:** 11/11 backend (Vitest + Supertest) + TEST-05 (RTL) — all green
**Requirements:** 51/51 v1 requirements shipped

### Delivered

Full-stack Mini Campaign Manager — `docker compose up` at `http://localhost:8080`. Reviewer runs one command, logs in with demo credentials, and can exercise the full campaign lifecycle: create → schedule → send (async, BullMQ) → watch polling → open pixel → read stats.

### Key Accomplishments

1. **Yarn 4 monorepo** — flat workspaces (`backend/`, `frontend/`, `shared/`) with shared Zod schemas compiling to `dist/`; TypeScript + ESLint + Prettier across all workspaces
2. **4-state campaign machine** (`draft → scheduled → sending → sent`) — enforced atomically via `UPDATE WHERE status IN (...)`, 409 on guard violation, proven by concurrent-send atomicity test (two parallel POSTs → exactly one 202 + one 409)
3. **Split-token JWT auth** — short-lived access token in Redux memory + long-lived refresh in HttpOnly SameSite cookie + Redis denylist on logout; memoized in-flight refresh interceptor prevents race conditions
4. **BullMQ async queue** — separate IORedis connections, transaction-wrapped send worker, delayed scheduling, atomic stale-job guard; `maxRetriesPerRequest: null` on both connections
5. **Open tracking pixel** — 43-byte GIF89a, UUID `tracking_token` (122-bit entropy), always-200 oracle defense, idempotent `opened_at` (`WHERE opened_at IS NULL`)
6. **Backend test suite** — 11/11 tests: status guards (TEST-01), concurrent-send atomicity (TEST-02), stats aggregation (TEST-03), auth boundaries TEST-04) — against real Postgres + Redis (`singleFork`)
7. **Full React SPA** — login/register/campaigns list (offset pagination with `useInfiniteQuery`)/new campaign/detail pages with shadcn/ui, Redux auth state, React Query server state, 2s polling during `sending`
8. **Full Docker stack** — `docker compose up` at `http://localhost:8080`; nginx reverse-proxies `/api/*` + `/track/*` with `proxy_cookie_path` rewrite; no CORS, no build-time `VITE_API_URL`

### Inserted Phases (UAT-discovered)

- **Phase 10.1** — Auth/nav/register fixes: login button stuck loading, auth persistence on reload, ProtectedRoute redirect, NavBar component, `/register` route
- **Phase 10.2** — Send/delete bug fixes + UX polish: BullMQ `updatedAt` guard bug causing infinite polling, delete draft 409 conflict, space-key email tokenizer, meaningful toasts, editable recipients on draft

### Known Deviations (Documented)

- `GET /campaigns`: offset pagination instead of cursor — page-number UI incompatible with cursor semantics (see `docs/DECISIONS.md`)
- `POST /recipients`: plural path vs `/recipient` singular in spec — REST convention preferred

### Archives

- `.planning/milestones/v1.0-ROADMAP.md` — full phase details
- `.planning/milestones/v1.0-REQUIREMENTS.md` — all 51 requirements marked complete with verification notes

---
*Milestones log created: 2026-04-22*
