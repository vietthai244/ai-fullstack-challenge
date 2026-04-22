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

### Developer–AI interaction

Throughout the build, the interaction was not "describe the app, get the code." It was iterative and scope-explicit at every phase gate:

**Scope discussions (before planning):**
- Phase 2: "Use `00000000000000-` prefix for the pgcrypto migration so it always sorts first — don't use a timestamp." Claude had defaulted to a timestamp; the user locked the requirement before the plan was written.
- Phase 3: "The refresh cookie Path must be `/auth` not `/auth/refresh` — logout needs to read and clear it to denylist the jti in Redis." Claude's research defaulted to `/auth/refresh`. User corrected before planning; Claude updated DECISIONS.md.
- Phase 4: "Campaign list uses offset pagination with page numbers, not cursor. I know CLAUDE.md says cursor — this is an explicit override for the UI." Claude accepted the override and documented it in DECISIONS.md.

**Approach confirmations (during planning):**
- Phase 3: Developer confirmed `buildApp()` factory split (in Phase 3, not Phase 7) so Supertest could import the app without binding a port — a structural investment Claude proposed, user approved.
- Phase 7: "The concurrent-send test must actually hit a real Postgres and fire two `Promise.all` requests — no mocks. I want proof the atomic guard works." Claude confirmed real-DB test with `singleFork: true`.
- Phase 9: Developer confirmed infinite scroll on recipients (React Query `useInfiniteQuery`) while explicitly blocking cursor pagination on the campaign list.

**Approvals (during execution):**
- All code review fixes (REVIEW.md items) were applied only after the executor presented the diff and the user let the checkpoint pass.
- README's "How I Used Claude Code" section (this section) was held behind a human-verify checkpoint — not committed until the user reviewed and approved the content.

**Corrections applied mid-execution:**
1. **Corepack shim** (Plan 01-02): Claude's initial scripts used bare `yarn`, which would invoke Homebrew classic Yarn 1.x. Corrected to `/usr/local/bin/yarn` (corepack shim) and added `corepack enable` to setup docs.
2. **pgcrypto prefix** (Plan 02-03): Timestamp prefix → `00000000000000-` numeric prefix for lexical ordering safety.
3. **Cookie Path** (Plan 03-03): `/auth/refresh` → `/auth` so `/auth/logout` can receive and clear the cookie.

### What was delegated vs. what was not

**Fully delegated:** All code implementation — migrations, services, middleware, BullMQ wiring, Dockerfiles, nginx config, React pages, Redux slices, React Query hooks, test files.

**Not delegated:**
- **`.docs/requirements.md`** — the reviewer's original spec. Claude was instructed to read it, never write it.
- **Locked architectural decisions** — Redux+React Query (not Zustand/SWR), BullMQ (not pg-boss), split-token JWT, cursor pagination on recipients, flat monorepo. Once decided, Claude could not re-open these even when research suggested alternatives.
- **v2 features** — the deferred list in REQUIREMENTS.md (real SMTP, rich-text editor, unsubscribe). Claude was blocked from pulling from it.
- **This section** — drafted from live STATE.md logs and git history captured during the build, not reconstructed after the fact. Committed only after user review.
