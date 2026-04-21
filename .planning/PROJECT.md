# Mini Campaign Manager

## What This Is

A simplified MarTech tool that lets marketers create, manage, schedule, send (simulated), and track email campaigns. Built as a senior full-stack take-home challenge to demonstrate architecture judgment, business-rule discipline, testing rigor, and transparent AI collaboration.

Stack: Node.js + Express + PostgreSQL (Sequelize), React 18 + TypeScript (Vite), Redux Toolkit + React Query, JWT auth, BullMQ + Redis for async sending — in a flat yarn-workspaces monorepo. Delivered as `docker compose up` at `http://localhost:8080`.

## Core Value

**Server-side business-rule correctness and clean, testable architecture** — enforced through the API, verified by tests, and made credible by a transparent record of how Claude Code was used.

The campaign state machine (`draft → scheduled → sending → sent`) is the backbone — atomic guards, 409s on violations, and a concurrent-send test that proves the guard under real database concurrency.

## Current State

**Shipped: v1.0 MVP — 2026-04-22**

- 12 phases complete, 38 plans, 51/51 requirements shipped
- 11/11 backend tests green (Vitest + Supertest against real Postgres + Redis)
- Full Docker stack live at `http://localhost:8080` — one-command reviewer setup
- `docs/DECISIONS.md` covers index choices, pagination deviation, JWT, BullMQ, tracking pixel
- README "How I Used Claude Code" section complete (user-reviewed checkpoint)

## Requirements

### Validated

*All v1 requirements shipped and confirmed. See [v1.0-REQUIREMENTS.md](.planning/milestones/v1.0-REQUIREMENTS.md) for full verification notes.*

- ✓ Yarn 4 monorepo with shared Zod schemas — v1.0
- ✓ PostgreSQL schema + Sequelize migrations + seed — v1.0
- ✓ 4-state campaign machine enforced atomically with 409 guards — v1.0
- ✓ Split-token JWT auth (memory + httpOnly cookie + Redis denylist) — v1.0
- ✓ Full campaigns + recipients CRUD with status guards — v1.0
- ✓ BullMQ async send queue with delayed scheduling — v1.0
- ✓ Open tracking pixel (UUID token, always-200, idempotent) — v1.0
- ✓ Backend tests: status guards, send atomicity, stats aggregation, auth boundaries — v1.0
- ✓ React SPA: login/register/list/new/detail with Redux + React Query + shadcn — v1.0
- ✓ Full Docker stack: nginx-proxied single-origin, no CORS, no VITE_API_URL — v1.0
- ✓ README + DECISIONS.md + "How I Used Claude Code" — v1.0

### Active

*No active requirements — v1.0 is complete. Next milestone would pull from v2 list.*

### Out of Scope

- Real email delivery (SES/Mailgun/SendGrid) — spec says "simulate"; real delivery adds infra + deliverability concerns out of scope for 4–8 hr
- OAuth / social login — spec only requires email/password
- Role-based access control / multi-tenant — spec has single user model, no org scoping
- Rich-text / HTML email composition — spec is plain text body
- A/B testing, segmentation, unsubscribe management — not in spec
- Full E2E tests (Playwright) — Vitest+Supertest+RTL meet the "3 meaningful tests" bar with better ROI
- Dark mode — cosmetic polish not signaled by eval criteria
- CI/CD pipeline — not an eval criterion; repo + README is the deliverable
- Observability stack (tracing, metrics) — pino structured logs are enough at this scope

## Context

**Who this is for:** Reviewer evaluating a senior full-stack candidate. They will clone the repo, run `docker compose up` once, open `http://localhost:8080`, exercise the API and UI, read the code, and read the "How I Used Claude Code" section.

**Shipped state (v1.0):** ~61k lines added across 291 files. Backend: Express 4 + Sequelize 6 + BullMQ 5 + pino. Frontend: React 18 + Vite 5 + Redux Toolkit + React Query v5 + shadcn/ui. Infra: Docker Compose with postgres:16, redis:7, nginx:alpine.

**Known deviations from spec (documented):**
- `GET /campaigns` uses offset pagination instead of cursor — page-number UI incompatible with cursor semantics (see `docs/DECISIONS.md`)
- `POST /recipients` uses plural path vs `/recipient` singular in spec — REST convention preferred

**Outstanding deliverable:** Public GitHub repo URL + walkthrough summary (requires user action).

## Constraints

- **Tech stack**: Node.js + Express, PostgreSQL + Sequelize, JWT, Zod, Vitest, React 18 + TS (Vite), Redux Toolkit + React Query, shadcn/ui + Tailwind, BullMQ + Redis — locked
- **Monorepo**: Flat structure — `backend/` + `frontend/` + `shared/` with yarn workspaces; shared Zod schemas compile to `dist/`
- **Security**: Access token in memory, refresh token in httpOnly+SameSite cookie; bcrypt for passwords; parameterized queries (Sequelize); no CORS (single-origin nginx proxy)
- **Deliverable**: Public GitHub repo + `docker compose up` at `http://localhost:8080`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `.docs/requirements.md` v2 as source of truth | v2 adds `sending` status, `/recipients` endpoints, Sequelize, Vite, monorepo — supersedes v1 | ✓ Implemented |
| Redux Toolkit + React Query (not Zustand-only) | Clear separation: Redux for client/UI/auth state, React Query for server cache. Signals senior SoC judgment | ✓ Implemented |
| BullMQ + Redis for async send simulation | "Simulate asynchronous" → real job queue is the senior read. Shows production instinct vs setTimeout | ✓ Implemented |
| JWT: in-memory access + httpOnly refresh | XSS-safe refresh, short-lived access; textbook senior auth pattern | ✓ Implemented |
| shadcn/ui + Tailwind | Modern, taste signal, lean bundle, copy-in components pair with Vite | ✓ Implemented |
| GET `/track/open/:trackingToken` pixel endpoint | Spec has `opened_at` + `open_rate` but no open endpoint — pixel matches real ESP mental model | ✓ Implemented |
| Zod validation with shared schemas workspace | Single source of truth for types; validates at API boundary; frontend reuses types | ✓ Implemented |
| Flat monorepo: `backend/` + `frontend/` + `shared/` | Matches doc v2 wording; yarn workspaces enables shared types | ✓ Implemented |
| Vitest on both sides + Supertest + RTL | Unified runner; faster ESM; strong TS ergonomics | ✓ Implemented |
| docker-compose scope = full stack | True one-command setup; nginx proxies `/api/*` + `/track/*` → single origin; no CORS; no build-time `VITE_API_URL` | ✓ Implemented |
| Offset pagination on `GET /campaigns` | Page-number UI incompatible with cursor semantics (user override of CLAUDE.md §5) | ✓ Implemented — documented in DECISIONS.md |
| Sequelize CLI migrations | Matches "PostgreSQL with Sequelize" spec; standard tooling | ✓ Implemented |
| Cookie Path = `/auth` (not `/auth/refresh`) | `/auth/logout` must read+clear cookie to denylist jti; nginx rewrites to `/api/auth` for browser | ✓ Implemented — documented in DECISIONS.md |
| `buildApp()` factory in Phase 3 (not Phase 7) | Enables Supertest to import app without binding port — cheaper than retrofitting | ✓ Implemented |
| Per-user recipient scoping (`UNIQUE(user_id, email)`) | AUTH-07 enumeration defense; prevents cross-user campaign linkage | ✓ Implemented |
| Log AI collaboration as work happens | Authenticity for README section; reconstruction from memory is weaker | ✓ Implemented |

## Evolution

**v1.0 retrospective:** The 4-state machine, split-token JWT, and BullMQ queue held up correctly under UAT. Two inserted phases (10.1, 10.2) were needed to fix auth persistence bugs and a BullMQ `updatedAt` guard bug that caused infinite polling. The concurrent-send atomicity test caught real behavior (one 202 + one 409 confirmed live). The offset pagination deviation from the cursor requirement was the most significant intentional scope decision — documented and accepted.

---
*Last updated: 2026-04-22 after v1.0 milestone close — all 51 requirements shipped*
