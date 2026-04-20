# Mini Campaign Manager — Claude Code Project Guide

This is a full-stack senior take-home challenge. See `.planning/PROJECT.md` for full context, `.planning/REQUIREMENTS.md` for the 51 REQ-IDs, and `.planning/ROADMAP.md` for the 10-phase build plan.

## What this is

A simplified MarTech tool — create, manage, schedule, send (simulated), and track email campaigns. Built as a senior full-stack interview deliverable. 4–8 hours of focused build time. Reviewer will run `docker compose up` and evaluate.

## Stack (locked — do not re-litigate)

- **Monorepo:** Yarn 4 flat workspaces (`nodeLinker: node-modules`) — `backend/`, `frontend/`, `shared/`
- **Backend:** Express 4, Sequelize 6 + PostgreSQL 16, BullMQ 5 + Redis, JWT (access in memory + refresh in httpOnly cookie), pino
- **Frontend:** React 18 + Vite 5, Redux Toolkit + React Query v5, shadcn/ui + Tailwind 3 (pin 3.x)
- **Shared:** Zod schemas compiled to `dist/` via `tsc`
- **Testing:** Vitest 2.1.9 both sides, Supertest (backend), @testing-library/react (frontend)
- **Docker:** Full stack (`postgres + redis + api + web-as-nginx`) on one host port (8080); nginx reverse-proxies `/api/*` + `/track/*` → no CORS

## Core constraints

1. **Business-rule correctness is everything** — campaign state machine (`draft → scheduled → sending → sent`) enforced server-side via atomic UPDATE guards; 409 on violations; tests prove it.
2. **No sync() in prod** — Sequelize CLI migrations only. Never `sync({ force })` or `sync({ alter })` outside isolated test setup.
3. **Stats are always aggregate SQL** — `COUNT(*) FILTER (WHERE status = 'sent')`, never computed in JS, never stored as counters.
4. **BullMQ discipline** — `maxRetriesPerRequest: null` on every IORedis connection, separate connections for Queue and Worker, mandatory `worker.on('failed')` and `worker.on('error')` listeners.
5. **Cursor pagination, not offset** — on `GET /campaigns`. Base64url `{created_at_iso, id}`; `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with `replacements` (never string interpolation).
6. **Tracking pixel is public + always 200** — `GET /track/open/:trackingToken` uses the UUID `tracking_token` column (not the BIGINT composite PK); always returns the 43-byte GIF89a even when the token doesn't match (oracle defense).
7. **Auth: access in memory + refresh in cookie** — memoized in-flight refresh promise in the axios interceptor; bootstrap calls `/auth/refresh` then `/auth/me` to rehydrate after page refresh.
8. **React Query owns server state; Redux owns client state** — never copy server data into Redux slices.

## Key pitfalls (cited by ID in ROADMAP per-phase context)

See `.planning/research/PITFALLS.md` for the full 18-item catalog. Highlights:
- **C5** `maxRetriesPerRequest: null` missing → silent job hangs
- **C11** concurrent send without atomic guard → double-processed campaigns
- **C6** refresh-token races without memoized promise → user logged out
- **C16** cursor pagination without `id` tiebreaker → page boundary skips/dupes
- **C17** tracking pixel with BIGINT ID → enumeration; 404 → oracle leak
- **C18** Vitest 4.x auto-install → Vite 5 compatibility break (pin `2.1.9`)
- **M6** Yarn PnP → breaks Vite/sequelize-cli (use node-modules linker)

## AI collaboration transparency (required deliverable)

Final README must include a **"How I Used Claude Code"** section with:
1. What tasks were delegated
2. 2–3 real prompts used
3. Where Claude Code was wrong or needed correction
4. What Claude Code was NOT allowed to do, and why

**Logging strategy:** capture real prompts, corrections, and skipped delegations as you build (don't reconstruct from memory). The `.planning/` directory itself is part of the evidence trail and is committed to the public repo.

## GSD workflow

- **Plan a phase:** `/gsd-plan-phase <N>` (reads PROJECT, REQUIREMENTS, ROADMAP, research/)
- **Execute a phase:** `/gsd-execute-phase <N>` — wave-based parallelization (config.parallelization = true)
- **Progress check:** `/gsd-progress`
- **Next action:** `/gsd-next`

**Mode:** yolo (auto-approve at phase transitions). **Granularity:** fine (10 phases). **Research/Plan-Check/Verifier:** all enabled.

## Guardrails for agents

- **Do not** modify `.docs/requirements.md` — it's the reviewer's original spec, kept verbatim as the source-of-truth anchor.
- **Do not** add features not in REQUIREMENTS.md v1 scope. The v2 list is a deferred-tracking section, not a backlog to pull from.
- **Do not** re-open Key Decisions in PROJECT.md without explicit user instruction. Choices like Redux+RQ, BullMQ, split-token JWT, cursor pagination, pixel endpoint, flat monorepo, Vitest, full docker stack are **locked**.
- **Do** follow the phase ordering in ROADMAP.md. Phase 6 (tracking pixel) and Phase 7 (backend tests) are safe to parallelize with their listed deps; everything else respects the critical path.

## File layout (after build)

```
backend/      @campaign/backend  — Express API + BullMQ worker
frontend/     @campaign/frontend — React SPA, nginx-served in prod
shared/       @campaign/shared   — Zod schemas, compiled to dist/
docs/         DECISIONS.md (senior-flex rationale)
.planning/    PROJECT, REQUIREMENTS, ROADMAP, STATE, config, research/
.docs/        requirements.md (original spec — do not modify)
docker-compose.yml   full stack: postgres + redis + api + web
README.md     reviewer setup + "How I Used Claude Code"
```
