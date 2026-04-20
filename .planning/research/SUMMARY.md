# Project Research Summary

**Project:** Mini Campaign Manager (Full-Stack Interview Project)
**Domain:** MarTech / Email Campaign Management
**Researched:** 2026-04-20
**Confidence:** HIGH

## Executive Summary

This is a simulated email campaign management system — canonical MarTech domain with a well-defined data model, strict status state machine, and async job processing layer. The key design challenge is not the CRUD layer but the correct implementation of `draft → scheduled → sending → sent` with atomic state transitions and a BullMQ worker that simulates delivery per recipient. Evaluators know this domain and will probe indexing, N+1 avoidance, status-guard correctness, and the Redux/React Query state boundary.

Monorepo with three packages: `@campaign/shared` (Zod schemas + TS types), `@campaign/backend` (Express + Sequelize + BullMQ), `@campaign/frontend` (React 18 + React Query + RTK). Stats are always computed via a single aggregate SQL query — never stored as counters. BullMQ worker returns `202 Accepted` immediately, transitions campaign to `sending`, processes recipients with random outcomes, transitions to `sent` after completion. React Query polls stats endpoint every 2s while `status === 'sending'`.

Top risks: (1) BullMQ IORedis misconfiguration causing silent job hangs, (2) missing atomic UPDATE enabling race conditions, (3) Sequelize N+1 on campaign detail, (4) Redux caching server state. All are senior-level red flags. Mitigation is baked into build order: schema + infra first, business logic second, queue third, frontend last.

---

## Stack (Confirmed — Do Not Deviate)

### Backend
- `express@^4.19.2`, `sequelize@^6.37.3`, `pg@^8.12.0`, `pg-hstore@^2.4.3`
- `bullmq@^5.12.0`, `ioredis@^5.4.1`
- `jsonwebtoken@^9.0.2`, `bcryptjs@^2.4.3`, `zod@^3.23.8`
- `jest@^29.7.0`, `supertest@^7.0.0`

### Frontend
- `react@^18.3.1`, `@tanstack/react-query@^5.51.1` (v5 — object-only `useQuery` syntax)
- `@reduxjs/toolkit@^2.2.7`, `react-redux@^9.1.2`
- `tailwindcss@^3.4.7` — **PIN to 3.x** (v4 breaks shadcn config)
- `vite@^5.3.5`, shadcn/ui New York style, Slate color

### Critical Constraints
- `@` path alias must be in BOTH `vite.config.ts` AND `tsconfig.json`
- `cookie-parser` registered before JWT auth middleware
- Separate IORedis connection instances for Queue vs Worker
- Every IORedis connection used with BullMQ must set `maxRetriesPerRequest: null`

---

## Table Stakes Features (Build All)

| Feature | Notes |
|---------|-------|
| Campaign CRUD with server-side status gating | 409 on edit/delete of non-draft |
| 4-state lifecycle: `draft → scheduled → sending → sent` | `sending` intermediate state is the interview trap |
| BullMQ delayed job for scheduled send; immediate job for manual send | Both converge to same worker |
| Per-recipient delivery simulation (random sent/failed) | `CampaignRecipient.status` + `sent_at` per row |
| Stats: total, sent, failed, opened, send_rate, open_rate | Single aggregate SQL; `opened` always 0 — document why |
| Pagination on campaign list | `{ data, meta: { page, limit, total, totalPages } }` |
| Auth: register, login, JWT httpOnly cookie, logout | Redis denylist for revocation |
| React Query polling during `sending` | `refetchInterval: 2000` while `sending`, `false` otherwise |
| 4 frontend pages: login, list, detail, create | Conditional action buttons mirroring server state machine |
| Docker Compose + seed data | `condition: service_healthy`; seed: 1 draft + 1 scheduled + 1 sent |

**Low-cost, high-signal polish:**
- Yellow `sending` badge with spinner
- Progress bar (shadcn `Progress`) for send_rate
- Per-recipient status rows in detail view

## Anti-Features (Do Not Build)

| Anti-Feature | Why |
|---|---|
| Real SMTP delivery | Out of scope; simulate with BullMQ random outcomes |
| WYSIWYG editor | Rabbit hole; use `<textarea>` |
| Recipient CSV import or segments | Scope creep; single `POST /recipient` |
| WebSocket real-time push | React Query polling is sufficient |
| Send cancellation/retry | `failed` is terminal in simulation; document |
| Open tracking pixel | `opened_at` stays null; document in README |

---

## Architecture Highlights

**Monorepo structure:**
```
packages/shared    → Zod schemas + TS types (@campaign/shared)
packages/backend   → Express + Sequelize + BullMQ
packages/frontend  → React 18 + Vite + React Query + RTK
```

**Key patterns:**
- Stats: `COUNT(*) FILTER (WHERE status = 'sent')` — single SQL, never computed in JS
- BullMQ: API returns `202 Accepted`; worker does ALL state transitions
- Atomic send guard: `UPDATE campaigns SET status='sending' WHERE id=$1 AND status IN ('draft','scheduled')` — check `rowCount` before enqueuing
- React Query = server state; Redux = auth token + UI flags ONLY

**Indexes (in migrations, not as afterthought):**
- `(created_by, status, created_at DESC)` on `campaigns`
- `(campaign_id, status)` on `campaign_recipients`
- Composite PK `(campaign_id, recipient_id)` covers worker update path

**Docker Compose:** `condition: service_healthy` on postgres + redis; startup command runs migrations before server boot; DB host inside Docker = service name `postgres`, not `localhost`.

---

## Top 5 Pitfalls

**P1 — BullMQ IORedis missing `maxRetriesPerRequest: null` (CRITICAL)**
Silent `ReplyError: Command timed out`. Required on every IORedis connection. Add `worker.on('failed')` and `worker.on('error')` — missing hides processor errors, leaves jobs stuck in `active`.

**P2 — Race condition on concurrent send (CRITICAL)**
Two HTTP requests both pass status check → two jobs enqueued → campaign processed twice. Fix: atomic Postgres UPDATE as the lock, check `rowCount === 0` → 409.

**P3 — Status transitions enforced only in frontend (HIGH)**
HTTP client bypasses UI guards. All status-guard logic in API service layer. Use `409 Conflict` (not `400`) for state machine violations.

**P4 — Sequelize N+1 on campaign detail (HIGH)**
Lazy-loading each `CampaignRecipient`'s `Recipient` = 101 queries for 100 recipients. Use nested `include` for eager loading. Stats must also be a single aggregate.

**P5 — Redux caching server state (HIGH)**
`campaignsSlice` storing server data = two sources of truth. Redux holds auth token + `isSendPolling` only. After mutations: `queryClient.invalidateQueries()`.

**Also:** `sequelize.sync()` in production, missing FK indexes, Docker without health checks, `datetime-local` timezone trap, `opened_at` not documented.

---

## Recommended Build Order

| Phase | Delivers | Key Pitfalls to Avoid |
|-------|----------|----------------------|
| 1: Foundation | Docker infra, schema (4-state enum + indexes + cascades), auth (JWT + Redis denylist), campaign/recipient CRUD + stats + pagination | C8 (no indexes), C14 (no health checks), C2 (sync()), C10 (no server-side status guard) |
| 2: Async Queue | BullMQ queue + worker, atomic send guard, transaction-wrapped simulation, delayed jobs for scheduling | C4 (job stuck active), C5 (maxRetriesPerRequest), C11 (race condition), C9 (no transaction) |
| 3: Frontend | Redux/React Query boundary first, then 4 pages, polling, shadcn components, conditional buttons | C12 (Redux stores server state), C13 (no invalidation), m1 (missing sending badge) |
| 4: Integration | Full Docker Compose, 3 backend tests (status-guard 409, stats aggregation, send 202), seed, README | Scope creep, `docker compose up` must work clean |

---

## Open Questions (Decide Before Planning)

| # | Question | Recommendation |
|---|----------|----------------|
| Q1 | `GET /auth/me` endpoint? | Add it — needed for token rehydration on refresh with httpOnly cookies |
| Q2 | Recipient deduplication: upsert or 409? | UPSERT: `INSERT ... ON CONFLICT (email) DO UPDATE RETURNING id` |
| Q3 | 4-state machine from day one? | Non-negotiable — PostgreSQL ENUM cannot be altered in a transaction |
| Q4 | Token persistence across page refresh? | Accept Redux in-memory = re-login on refresh; document the tradeoff |

---

*Research completed: 2026-04-20 | Ready for roadmap: yes*
