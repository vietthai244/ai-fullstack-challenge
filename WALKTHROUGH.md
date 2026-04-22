# Mini Campaign Manager — Walkthrough Summary

## What it is

A full-stack MarTech tool for creating, managing, scheduling, sending (simulated), and tracking email campaigns. Built as a senior take-home challenge in ~3 days using AI-assisted development with Claude Code + GSD workflow.

---

## Running it

```bash
git clone <repo-url> && cd ai-fullstack-challenge
cp .env.example .env          # fill in two JWT secrets
docker compose up --build
docker compose exec api yarn db:seed   # optional demo data
open http://localhost:8080
```

Demo login: `demo@example.com` / `demo1234`

---

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Backend | Express 4 + Sequelize 6 + PostgreSQL 16 | Spec requirement; Sequelize CLI migrations (no sync()) |
| Queue | BullMQ 5 + Redis 7 | Real job queue for "simulate async" — shows production instinct |
| Auth | Split-token JWT | Access token in Redux memory, refresh in httpOnly cookie, Redis denylist on logout |
| Frontend | React 18 + Vite 5 + Redux Toolkit + React Query | Redux owns client state, React Query owns server cache — clear SoC |
| UI | shadcn/ui + Tailwind 3 | Component library with full TypeScript support |
| Infra | Docker Compose + nginx | Single-origin reverse proxy — no CORS, no build-time env vars |

---

## Key features

**Campaign state machine** — `draft → scheduled → sending → sent` enforced via atomic `UPDATE ... WHERE status IN (...)`. Any out-of-order transition returns 409. Proven by a concurrent-send test: two parallel POST requests → exactly one 202 + one 409.

**BullMQ async send queue** — scheduling delay built-in; separate IORedis connections for Queue and Worker; transaction-wrapped send worker with stale-job guard (`updatedAt` check prevents double-processing if job retries).

**Open tracking pixel** — `GET /track/open/:trackingToken` returns a 43-byte GIF89a regardless of token validity (oracle defense). Token is a UUID column (`gen_random_uuid()`), not the BIGINT PK (enumeration defense). Idempotent: sets `opened_at` only once.

**Auth security** — memoized in-flight refresh promise prevents race conditions on parallel requests after token expiry. Cookie path scoped to `/auth` so logout can read and denylist the jti in Redis before clearing.

**Stats always SQL** — `COUNT(*) FILTER (WHERE status = 'sent')` aggregate at query time; never stored as counters or computed in JS.

---

## Backend tests (11/11 green)

| Test | What it proves |
|---|---|
| TEST-01 | Status guards reject PATCH/DELETE/send on non-draft/sent campaigns |
| TEST-02 | Concurrent send atomicity — real Postgres + `Promise.all` → one 202, one 409 |
| TEST-03 | Stats aggregation correctness — seeded distribution, asserted via API |
| TEST-04 | Auth boundaries — protected routes reject unauthenticated requests |

All tests run against a real Postgres + Redis instance (`singleFork: true`).

---

## Documented deviations from spec

- `GET /campaigns` uses offset pagination (not cursor) — page-number UI is incompatible with cursor semantics. Documented in `docs/DECISIONS.md`.
- `POST /recipients` uses plural path — REST convention over spec's singular `/recipient`.

---

## AI collaboration

Built with Claude Code + GSD (Get Shit Done) workflow — structured slash commands that orchestrate researcher, planner, executor, and verifier agents across isolated git worktrees. Each phase followed: research → plan → human review → execute → verify.

Developer retained control over all architectural decisions, locked choices before planning started, and reviewed every plan before execution. The `.planning/` directory is committed as a full evidence trail. See the **"How I Used Claude Code"** section in `README.md` for the complete account including corrections applied and what was explicitly not delegated.
