# Mini Campaign Manager

A simplified MarTech tool for creating, managing, scheduling, sending (simulated), and tracking email campaigns. Built as a senior full-stack interview deliverable.

**Stack:** Express 4 + Sequelize 6 + PostgreSQL 16 + BullMQ 5 + Redis | React 18 + Vite 5 + Redux Toolkit + React Query | nginx reverse-proxy | Docker Compose

## Quick Start

### One-command setup (Docker)

Prerequisites: Docker Desktop (or Docker Engine + Compose plugin)

```bash
# 1. Clone the repo
git clone <repo-url>
cd ai-fullstack-challenge

# 2. Copy and configure env
cp .env.example .env
# Edit .env: fill in JWT_ACCESS_SECRET and JWT_REFRESH_SECRET with random 48-char strings
# Generate: openssl rand -base64 48

# 3. Start the full stack
docker compose up --build

# 4. (Optional) Load demo data — in a second terminal
docker compose exec api yarn db:seed

# 5. Open in browser
open http://localhost:8080
```

Everything runs on a single port. No CORS. No manual API URL configuration.

**With seed data** — log in with `demo@example.com` / `demo1234`. The seed creates 1 user, 10 recipients, and 3 campaigns (draft / scheduled / sent).

**Without seed data** — visit `http://localhost:8080/register` to create your own account.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_ACCESS_SECRET` | Yes | >=32 char random string. Generate: `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | Yes | >=32 char random string, different from ACCESS_SECRET |
| `DATABASE_URL` | Local dev only | Postgres URL. Docker overrides to use service name `postgres`. |
| `REDIS_URL` | Local dev only | Redis URL. Docker overrides to use service name `redis`. |
| `ACCESS_TOKEN_TTL` | No | Default: `15m` |
| `REFRESH_TOKEN_TTL` | No | Default: `7d` |
| `BCRYPT_COST` | No | Default: `10` |
| `PORT` | No | Default: `3000` |
| `LOG_LEVEL` | No | Default: `debug` |

Docker Compose overrides `DATABASE_URL` and `REDIS_URL` automatically to use container service names — you only need to set the JWT secrets in `.env` for `docker compose up` to work.

## Running Tests

```bash
# Backend (Vitest + Supertest — requires local Postgres + Redis running)
yarn workspace @campaign/backend test

# Frontend (Vitest + @testing-library/react)
yarn workspace @campaign/frontend test
```

Backend tests require `DATABASE_URL` (default local Postgres) and `REDIS_URL` (default local Redis) set in the environment. Tests truncate all tables before each test and run serially (`singleFork: true`).

## Local Development (without Docker)

Run backend and frontend separately for hot-reload development.

**Prerequisites:** PostgreSQL 16 and Redis 7 running locally.

### Backend (port 3000)

```bash
# Terminal 1
cp .env.example .env          # fill in JWT secrets + DATABASE_URL + REDIS_URL
yarn workspace @campaign/backend dev
# API available at http://localhost:3000
```

### Frontend (port 5173)

```bash
# Terminal 2
yarn workspace @campaign/frontend dev
# App available at http://localhost:5173
# Vite proxies /api/* and /track/* → http://localhost:3000
```

Visit `http://localhost:5173/register` to create an account, then log in.

### Port reference

| Port | Service |
|------|---------|
| 3000 | Express API (backend) |
| 5173 | Vite dev server (frontend) |
| 5432 | PostgreSQL |
| 6379 | Redis |

> **Docker stack** runs everything behind nginx on a single port — `http://localhost:8080`. See Quick Start above.

## Corepack Note (for local development without Docker)

This project uses Yarn 4 (Berry). If you have Homebrew's classic Yarn 1.x on your PATH, it will shadow Yarn 4.

```bash
# One-time setup: enable corepack to activate Yarn 4 via package.json#packageManager
corepack enable
# Verify
yarn --version  # should be 4.x
```

## Architecture Highlights

- **Campaign state machine** (`draft -> scheduled -> sending -> sent`) enforced via atomic `UPDATE ... WHERE status IN (...)` with 409 on guard failure — tested by concurrent-send test
- **Split-token JWT** — short-lived access token in memory + long-lived refresh token in httpOnly SameSite cookie + Redis denylist on logout
- **Stats always SQL** — `COUNT(*) FILTER (WHERE status = 'sent')` aggregate, never computed in JS
- **Open tracking oracle defense** — tracking pixel always returns 200 + 43-byte GIF regardless of token validity
- **Cursor pagination** on recipients, offset pagination on campaigns (documented in `docs/DECISIONS.md`)

See `docs/DECISIONS.md` for detailed rationale on each architectural choice.

## How I Used Claude Code

This project was built with [Claude Code](https://claude.ai/code) and [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) — an automation development workflow tool that integrates structured AI-driven planning and execution directly into the Claude Code CLI. GSD provides a set of slash commands (skills) that orchestrate multi-agent workflows: spawning researcher agents, planner agents, executor agents, and verifier agents — each in isolated git worktrees — to complete a software phase end-to-end.

### The GSD workflow: how each phase was built

Each of the 10 phases followed this pipeline:

```
/gsd-plan-phase N
  └─ Spawns: gsd-phase-researcher agent
       Output: .planning/phases/{N}-{slug}/RESEARCH.md
               (domain research, patterns, pitfalls, assumptions)
  └─ Spawns: gsd-planner agent
       Output: .planning/phases/{N}-{slug}/{N}-{taskNum}-PLAN.md
               (one PLAN.md per sub-task; each with wave, tasks, verify steps)
  └─ Spawns: gsd-plan-checker agent
       Output: Verification gate (PASS/BLOCK); iterates planner on BLOCK

/gsd-execute-phase N
  └─ Reads all PLAN.md files → groups into waves (parallel within wave)
  └─ For each wave: spawns gsd-executor subagent per plan (isolated git worktree)
       Output: committed code files, .planning/phases/{N}-{slug}/{N}-{taskNum}-SUMMARY.md
  └─ Spawns: gsd-verifier agent
       Output: .planning/phases/{N}-{slug}/{N}-VERIFICATION.md
               (goal-backward pass/fail per requirement)
  └─ Spawns: gsd-code-reviewer agent (if enabled)
       Output: REVIEW.md + auto-applied fixes with /gsd-code-review-fix
```

**Example — Phase 5 (BullMQ Queue):**
- `/gsd-plan-phase 5` → researcher studied BullMQ IORedis connection requirements, concurrent-guard pitfalls (C5, C11), transaction semantics → planner produced `05-01-PLAN.md` through `05-04-PLAN.md`
- Developer reviewed plans, confirmed approach (separate Queue/Worker Redis connections, atomic `UPDATE WHERE status='sending'` guard)
- `/gsd-execute-phase 5` → 4 executor agents ran in parallel worktrees (Wave 1 queue/worker wiring, Wave 2 route handlers, Wave 3 smoke scripts) → verifier confirmed all SEND-* REQ-IDs satisfied → code review produced 4 fixes applied atomically

**Example — Phase 10 (Docker + Docs):**
- `/gsd-plan-phase 10` → planner produced 4 plans: backend Dockerfile, frontend Dockerfile + nginx, docker-compose.yml wiring, DECISIONS.md + README
- Plan 10-04 (README) was marked `autonomous: false` with a `checkpoint:human-verify` gate — executor wrote the README draft then **stopped and presented the "How I Used Claude Code" section for user review before committing**
- Developer reviewed the draft, provided corrections, executor committed the approved version

### 1. What tasks were delegated

All code implementation was delegated: database migrations, Sequelize models, Express route handlers, BullMQ queue and worker wiring, JWT middleware, Dockerfiles, nginx config, React pages, Redux slices, React Query hooks, Zod schemas, and test files. The GSD workflow also handled research (pitfall catalogues, architecture patterns), plan generation, and automated verification.

### 2. Real prompts used

> *"The concurrent-send test must actually hit a real Postgres and fire two `Promise.all` requests — no mocks. I want proof the atomic guard works under real database concurrency."*

This constrained how Phase 7 tests were written. Claude had proposed a simulated race with a setTimeout mock; the developer rejected it and required a real-DB test with `singleFork: true`.

> *"Campaign list uses offset pagination with page numbers, not cursor. I know CLAUDE.md says cursor — this is an explicit override for the UI. Document it in DECISIONS.md."*

CLAUDE.md §5 mandated cursor pagination. The developer overrode it for the campaign list because page-number UI is incompatible with cursor semantics. Claude accepted the override and documented the trade-offs.

> *"Use `00000000000000-` prefix for the pgcrypto migration so it always sorts first — don't use a timestamp."*

Claude had defaulted to a timestamp prefix. The developer locked the requirement before the plan was written to guarantee lexical ordering safety across environments.

### 3. Where Claude Code was wrong or needed correction

**Planning-stage corrections:**

- **pgcrypto prefix** (Phase 2): Claude defaulted to timestamp-prefixed migration filenames. Changed to `00000000000000-` numeric prefix before any code was written.
- **Corepack shim** (Phase 1): Claude's initial scripts used bare `yarn`, which invokes Homebrew classic Yarn 1.x on macOS. Corrected to use the corepack shim with `corepack enable`.

**Bugs found through manual smoke testing:**

After Phase 10 (full Docker stack), the developer ran the app end-to-end in a real browser and caught a class of issues that automated tests and AI verifiers both missed — because they exercised the stack through curl and Supertest, not through an actual browser session. Several phases also included formal `HUMAN-UAT.md` checkpoints where specific flows were exercised before marking the phase complete.

This produced two additional fix phases:

**Phase 10.1 — Auth & navigation bugs:**
- Login button stayed stuck in "Logging in..." after a successful login — Redux dispatch was resolving before navigation
- Page refresh lost auth state — bootstrap was calling `/auth/me` before `/auth/refresh`, so the access token was never rehydrated
- ProtectedRoute wasn't preserving the originally requested URL for post-login redirect
- NavBar component and `/register` route were missing entirely from the routing tree

**Phase 10.2 — Send/delete bugs and UX gaps:**
- Campaigns in `sending` state polled indefinitely — the BullMQ worker used `updatedAt` as a stale-job guard, but Sequelize wasn't touching that field during status transitions; fixed with a dedicated `started_at` column
- Deleting a draft campaign with recipients attached returned 409 — the delete handler needed to destroy junction rows before the campaign row
- Email input didn't tokenize on spacebar — only comma and Enter were handled
- No user feedback on send/schedule/delete actions — toasts were missing throughout
- Recipients were not editable on draft campaigns even though the status allowed it

Each bug was described by the developer, planned and fixed by Claude via the GSD workflow, and verified manually before the phase was marked complete.

### 4. What Claude Code was NOT allowed to do — and why

- **`.docs/requirements.md`** — Claude was instructed to read it, never write it. It is the reviewer's original spec and must remain verbatim as the unmodified source of truth. Any AI rewrite would blur the line between what was asked and what was built.
- **Locked architectural decisions** — Redux+React Query, BullMQ, split-token JWT, cursor pagination on recipients, flat monorepo. Once decided, Claude could not re-open these even when research suggested alternatives. Re-litigating locked decisions mid-build wastes time and introduces churn; the value of a decision is partly that it stays decided.
- **v2 features** — the deferred list in REQUIREMENTS.md (real SMTP, rich-text editor, unsubscribe). Claude was blocked from pulling from it because scope creep is a real risk when an AI agent is capable of implementing features that were never requested.
- **This section** — drafted collaboratively from live STATE.md logs and git history captured during the build, not reconstructed after the fact. Committed only after developer review. Letting Claude write its own performance review without oversight would undermine the transparency this section is meant to provide.
