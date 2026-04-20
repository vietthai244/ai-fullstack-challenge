# Architecture Patterns

**Domain:** Email Campaign Manager (MarTech)
**Researched:** 2026-04-20
**Confidence:** HIGH

## Recommended Architecture

```
yarn workspace monorepo
  packages/frontend  (React 18 + Vite + React Query + RTK)
  packages/backend   (Express + Sequelize + BullMQ)
  packages/shared    (Zod schemas + TypeScript types)

Frontend ──HTTP/JSON──► Express API ──SQL──► PostgreSQL
                             │
                             └──enqueue──► Redis ──► BullMQ Worker
                                                         │
                                              (update campaign_recipients)
                                                         │
                                              (update campaign.status)
```

Data flows are uni-directional:
- Frontend never writes to DB directly
- Worker never handles HTTP; reads/writes DB autonomously
- Stats are computed via SQL aggregation on read — not maintained as counters

## Component Boundaries

| Component | Package | Responsibility | Communicates With |
|-----------|---------|---------------|-------------------|
| Express API | `packages/backend/src/` | Auth, REST endpoints, request validation, status-guard business rules | PostgreSQL (Sequelize), Redis (BullMQ producer) |
| BullMQ Worker | `packages/backend/src/workers/` | Simulate delivery per recipient, update DB, emit progress | PostgreSQL, Redis (job state) |
| Sequelize Models | `packages/backend/src/models/` | Schema + association definitions | PostgreSQL |
| React Query layer | `packages/frontend/src/api/` | All HTTP calls, response caching, refetch on invalidation | Express API |
| Redux store | `packages/frontend/src/store/` | Auth token, UI flags (polling active) | In-memory only |
| Shared types | `packages/shared/src/` | Zod schemas + inferred TS types used by both packages | Both packages |
| Docker Compose | root | Service wiring, health checks | postgres, redis, backend, frontend |

## 1. Database Schema

Tables: `users`, `campaigns`, `recipients`, `campaign_recipients`

`campaign_recipients` uses composite PK `(campaign_id, recipient_id)`. No surrogate id needed — the pair is naturally unique and all lookups use both columns. `status + sent_at + opened_at` on the junction row provides per-recipient delivery tracking without a separate events table.

`opened_at` is schema-present but never populated during simulation — forward-looking design without scope creep.

Status columns use CHECK constraints (enforced at DB level as a safety net in addition to application-level guards):
- `campaigns.status`: `draft | scheduled | sending | sent`
- `campaign_recipients.status`: `pending | sent | failed`

## 2. PostgreSQL Indexing

```sql
-- Campaign list: filter by owner, sort by created_at
CREATE INDEX idx_campaigns_created_by_status
  ON campaigns (created_by, status, created_at DESC);

-- Stats aggregation: all recipients for a campaign, filter by status
CREATE INDEX idx_campaign_recipients_campaign_status
  ON campaign_recipients (campaign_id, status);

-- Worker update path: covered by composite PRIMARY KEY on (campaign_id, recipient_id)
```

**Stats aggregation — single SQL, no N+1:**

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'sent') AS sent,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
  ROUND(COUNT(*) FILTER (WHERE status = 'sent')::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS send_rate,
  ROUND(COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0) * 100, 2) AS open_rate
FROM campaign_recipients
WHERE campaign_id = :campaignId;
```

## 3. BullMQ Architecture

**Job payload** — minimal, worker fetches recipients from DB:
```typescript
interface SendCampaignJobPayload { campaignId: string; userId: string; }
```

**Worker sequence:**
1. `Campaign.update({ status: 'sending' })`
2. Fetch all `pending` recipients for campaign
3. For each recipient: random outcome (`Math.random() > 0.2 ? 'sent' : 'failed'`)
4. `CampaignRecipient.update({ status, sent_at })`
5. `job.updateProgress(percent)`
6. After all recipients: `Campaign.update({ status: 'sent' })`

**API send endpoint** returns `202 Accepted` immediately — never awaits job completion.

**Concurrency:** `new Worker(..., { concurrency: 5 })` — safe default, 5 simultaneous campaigns.

## 4. API Response Shape Conventions

Envelope: `{ "data": T, "meta"?: PaginationMeta }` for success; `{ "error": { "code", "message" } }` for errors.

**Stats: embed in detail, separate endpoint for polling:**
- `GET /campaigns/:id` → includes `stats` sub-object (initial page load)
- `GET /campaigns/:id/stats` → stats only (polled every 2s during send)

**HTTP status codes:**
- `201` for POST (resource created)
- `202` for send (async queued)
- `409 Conflict` for status-guard violations (not `400`)
- `403` for wrong-owner access

**Pagination:** offset-based. `GET /campaigns?page=1&limit=20` → `{ data: Campaign[], meta: { page, limit, total, totalPages } }`

## 5. Frontend: Polling Over WebSocket

React Query `refetchInterval: 2000` on the stats query while `campaign.status === 'sending'`. Disabled when status reaches `sent`. WebSocket is out of scope — adds infrastructure complexity with no benefit at this scale.

```typescript
useQuery({
  queryKey: ['campaigns', campaignId, 'stats'],
  queryFn: () => api.getCampaignStats(campaignId),
  refetchInterval: isSending ? 2000 : false,
});
```

## 6. State Management Split

**React Query owns all server state:** campaign list, campaign detail, stats, recipients. React Query cache IS the source of truth — never copy server data into Redux.

**Redux RTK owns pure client state:**
- `authSlice`: `{ token: string | null, user: { id, email, name } | null }` — JWT persists across route changes
- `uiSlice`: `{ isSendPolling: boolean }` — UI coordination flag

**Token storage:** Redux in-memory (not localStorage — XSS risk). Page refresh requires re-login. Document this tradeoff.

**Invalidation after mutations:** `queryClient.invalidateQueries({ queryKey: ['campaigns', id] })` on send success.

## 7. Monorepo Structure

```
interview-test/
├── package.json              (workspaces: ["packages/*"])
├── yarn.lock
├── docker-compose.yml
├── packages/
│   ├── shared/               (@campaign/shared)
│   │   └── src/
│   │       ├── types/        (Campaign, Recipient, User, job payloads)
│   │       └── schemas/      (Zod: CreateCampaignSchema, RegisterSchema, etc.)
│   ├── backend/              (@campaign/backend)
│   │   └── src/
│   │       ├── models/       (Sequelize model classes)
│   │       ├── migrations/
│   │       ├── routes/
│   │       ├── middleware/   (auth, error, validate)
│   │       ├── workers/      (BullMQ worker)
│   │       └── queues/
│   └── frontend/             (@campaign/frontend)
│       └── src/
│           ├── api/          (React Query hooks + axios client)
│           ├── store/        (Redux slices)
│           ├── pages/
│           └── components/
```

Both backend and frontend `package.json` include `"@campaign/shared": "*"`. Yarn workspaces symlinks the package.

## 8. Docker Compose Dependency Order

```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy   # pg_isready must pass
    redis:
      condition: service_healthy   # redis-cli ping must pass
  command: sh -c "yarn sequelize db:migrate && yarn start"
```

`condition: service_healthy` (not bare `depends_on`) is required — Docker starts containers in parallel otherwise and migrations fail. Run migrations inside the backend start command — idempotent, no separate init container needed.

## Suggested Build Order

| Step | Deliverable | Why This Order |
|------|-------------|----------------|
| 1 | Monorepo scaffold + `@campaign/shared` | All other packages import from here; Zod schemas must exist first |
| 2 | Docker Compose (postgres + redis only) | Needed for migration runs immediately |
| 3 | Sequelize models + migrations | Schema is the contract for all business logic and the worker |
| 4 | Auth endpoints + JWT middleware | All campaign routes depend on this middleware |
| 5 | Campaign + Recipient CRUD + stats endpoint | Core business logic; status guards here |
| 6 | BullMQ queue + send worker | Depends on models (step 3) and send endpoint (step 5) |
| 7 | Backend tests (3 minimum) | Written after business logic is stable |
| 8 | Frontend: auth + Redux + React Query setup | Token in Redux required for API client auth header |
| 9 | Frontend: campaign list + detail + polling | Depends on auth (step 8) and stats endpoint (step 6) |
| 10 | Seed script + full Docker Compose | Final integration validation |

## Anti-Patterns to Avoid

- **Storing stats as columns on `campaigns`** — dual source of truth, drift risk. Always aggregate from `campaign_recipients`.
- **Awaiting job completion in HTTP handler** — `job.waitUntilFinished()` blocks the connection. Return `202` immediately.
- **Embedding recipient arrays in campaign list responses** — balloons payload. Return recipient count in list, full list only in detail.
- **Duplicating Zod schemas in both packages** — use `@campaign/shared` as the single source.
- **JWT in localStorage** — XSS exposure. Use Redux in-memory.

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Schema design | HIGH | PostgreSQL + Sequelize patterns are stable and well-documented |
| Indexing | HIGH | Standard PostgreSQL aggregate filter patterns |
| BullMQ worker | HIGH | BullMQ v4/v5 API stable; patterns from official docs |
| React Query split | HIGH | v5 stable, refetchInterval pattern well-established |
| Docker Compose health checks | HIGH | condition: service_healthy since Compose v1.29 |
| Monorepo / yarn workspaces | HIGH | Yarn 4 workspace patterns stable |
