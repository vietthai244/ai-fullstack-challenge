# Mini Campaign Manager

## What This Is

A simplified MarTech tool that lets marketers create, manage, schedule, send (simulated), and track email campaigns. Built as a senior-full-stack take-home challenge to demonstrate architecture judgment, business-rule discipline, testing rigor, and transparent AI collaboration.

Stack: Node.js + Express + PostgreSQL (Sequelize), React 18 + TypeScript (Vite), Redux Toolkit + React Query, JWT auth, BullMQ + Redis for async sending — in a flat yarn-workspaces monorepo.

## Core Value

**Server-side business-rule correctness and clean, testable architecture** — enforced through the API, verified by tests, and made credible by a transparent record of how Claude Code was used.

If everything else slips, the API must still enforce the spec's state transitions correctly (draft → scheduled → sending → sent), reject invalid inputs, and be covered by meaningful tests.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

**Backend**

- [ ] PostgreSQL schema: User, Campaign, Recipient, CampaignRecipient (per spec, with `sending` status)
- [ ] Sequelize migrations + seed script (demo user + recipients)
- [ ] JWT auth: access token (in-memory, short-lived) + refresh token (httpOnly cookie)
- [ ] `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- [ ] `/campaigns` CRUD with status-gated edit/delete (only when `draft`)
- [ ] `/campaigns/:id/schedule` (scheduled_at must be future)
- [ ] `/campaigns/:id/send` enqueues a BullMQ job; worker randomly marks recipients `sent` or `failed`; campaign transitions draft/scheduled → sending → sent
- [ ] `/campaigns/:id/stats` returns total/sent/failed/opened/open_rate/send_rate
- [ ] `/recipients` GET + POST
- [ ] `GET /track/open/:campaignRecipientId` — 1×1 pixel that records `opened_at`
- [ ] Cursor-based pagination on `GET /campaigns` (created_at DESC + id tiebreaker)
- [ ] Zod input validation (shared schemas package)
- [ ] Indexes with explainable rationale (FKs, campaigns.status, campaigns.scheduled_at, campaign_recipients.campaign_id)
- [ ] Vitest + Supertest: at least 3 meaningful tests covering state-machine rules

**Frontend**

- [ ] `/login` page with httpOnly refresh + in-memory access token
- [ ] `/campaigns` list with status badges, cursor pagination, skeleton loaders
- [ ] `/campaigns/new` form (name, subject, body, recipient emails)
- [ ] `/campaigns/:id` detail: stats (progress bars for open_rate / send_rate), recipient list, conditional Schedule/Send/Delete buttons
- [ ] Redux Toolkit for auth/UI state; React Query for server state
- [ ] shadcn/ui + Tailwind components
- [ ] Status badges: draft=grey, scheduled=blue, sending=amber, sent=green
- [ ] Error and loading states across all pages
- [ ] Vitest + @testing-library/react for 1–2 key component tests

**Ops / DX**

- [ ] `docker compose up` brings up **full stack**: Postgres, Redis, API container, and web container (nginx serving the compiled Vite build)
- [ ] nginx in the web container reverse-proxies `/api/*` and `/track/*` to the API container — single origin for the browser, no CORS headaches, no build-time `VITE_API_URL` baked in
- [ ] Developer iteration: README documents optional `yarn workspace @campaign/frontend dev` for HMR against the dockerized API
- [ ] Seed data + demo login in README
- [ ] README includes "How I Used Claude Code" section (real prompts, corrections, what was out-of-bounds, authored with live evidence captured during build)
- [ ] Public GitHub repo + walkthrough summary

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Real email delivery (SES/Mailgun/SendGrid) — spec says "simulate"; real delivery adds infra + deliverability concerns out of scope for 4–8 hr
- OAuth / social login — spec only requires email/password
- Role-based access control / multi-tenant — spec has single user model, no org scoping
- Rich-text / HTML email composition — spec is plain text body
- A/B testing, segmentation, unsubscribe management — not in spec, true MarTech depth is out of scope
- Full E2E tests (Playwright) — unit/integration with Vitest+Supertest meet the "3 meaningful tests" bar with better ROI
- Dark mode — cosmetic polish not signaled by eval criteria
- CI/CD pipeline — not an eval criterion; repo + README is the deliverable
- Observability stack (tracing, metrics) — pino structured logs are enough at this scope

## Context

**Who this is for:** Reviewer evaluating a senior full-stack candidate. They will clone the repo, run `docker compose up` once, open `http://localhost:8080`, exercise the API and UI, read the code, and read the "How I Used Claude Code" section.

**What's being evaluated** (from spec, ordered by inferred weight for senior role):
1. Backend correctness (business rules enforced server-side, efficient SQL, safe state transitions)
2. Code quality (readability, separation of concerns, testability)
3. API design (REST conventions, error codes, response shapes)
4. AI collaboration (judgment, transparency — showing *where* AI was useful and where it wasn't)
5. Testing (meaningful coverage of business-rule correctness, not a test count)
6. Frontend quality (UX polish, error/loading states)

**Existing starting point:** Empty repo on `main` branch, git initialized, `.docs/requirements.md` captured. No code yet.

**Spec source of truth:** The second half of `.docs/requirements.md` (v2) — it adds `sending` status, `/recipients` endpoints, Sequelize, Vite, Zustand/Redux, and the yarn-workspaces monorepo requirement. Where v1 and v2 disagree, v2 wins.

**Polish budget:** Targeting the high end of 4–8 hrs. Invest polish in: database schema rationale, middleware layering, validation boundary, worker/job design, tests, and the AI-usage README section — NOT visual theming or extra screens.

## Constraints

- **Timeline**: 4–8 hours of focused build time — scope aggressively; cut differentiators before cutting quality
- **Tech stack**: Node.js + Express, PostgreSQL + Sequelize, JWT, Zod, Vitest, React 18 + TS (Vite), Redux Toolkit + React Query, shadcn/ui + Tailwind, BullMQ + Redis — set by spec + decisions below
- **Monorepo**: Flat structure — `backend/` + `frontend/` with yarn workspaces at root (matches spec wording); shared Zod schemas live in a lightweight `shared/` workspace so both sides import the same types
- **Security**: Access token in memory, refresh token in httpOnly+SameSite cookie; bcrypt for password hashing; parameterized queries only (Sequelize handles); CORS restricted to web origin
- **Deliverable**: Public GitHub repo + one-command `docker compose up` bringing up full stack (Postgres + Redis + API + nginx-served web) at `http://localhost:8080`; developer HMR optional via `yarn workspace @campaign/frontend dev`
- **AI transparency**: Real prompts and corrections captured *as work happens* (not reconstructed), for the required README section

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use `.docs/requirements.md` v2 as source of truth | v2 adds `sending` status, `/recipients` endpoints, Sequelize, Vite, monorepo — supersedes v1 | — Pending |
| Redux Toolkit + React Query (not Zustand-only) | Clear separation: Redux for client/UI/auth state, React Query for server cache. Signals senior SoC judgment at small extra cost | — Pending |
| BullMQ + Redis for async send simulation | "Simulate asynchronous" → real job queue is the senior read. Shows production instinct vs setTimeout | — Pending |
| JWT: in-memory access + httpOnly refresh | XSS-safe refresh, short-lived access; textbook senior auth pattern | — Pending |
| shadcn/ui + Tailwind | Modern, taste signal, lean bundle, copy-in components pair with Vite | — Pending |
| GET `/track/open/:campaignRecipientId` pixel endpoint | Spec has `opened_at` + `open_rate` but no open endpoint — pixel matches real ESP mental model and is demoable via `curl` | — Pending |
| Zod validation with shared schemas workspace | Single source of truth for types; validates at API boundary; frontend reuses types | — Pending |
| Flat monorepo: `backend/` + `frontend/` + `shared/` | Matches doc v2 wording; yarn workspaces still enables shared types | — Pending |
| Vitest on both sides + Supertest + RTL | Unified runner; faster ESM; strong TS ergonomics | — Pending |
| docker-compose scope = full stack (postgres + redis + api + web as nginx-served static) | True one-command setup for the reviewer; nginx proxies `/api/*` + `/track/*` → single origin (no CORS) and no build-time `VITE_API_URL`; dev-time HMR preserved via optional `yarn workspace @campaign/frontend dev` against the dockerized API | — Pending |
| Cursor pagination on `/campaigns` | Senior flex over offset; (created_at DESC, id) cursor is simple enough to justify | — Pending |
| Sequelize CLI migrations | Matches "PostgreSQL with Sequelize" spec; standard tooling | — Pending |
| Log AI collaboration as we build | Authenticity for README section; reconstruction from memory is weaker | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-20 after initialization*
