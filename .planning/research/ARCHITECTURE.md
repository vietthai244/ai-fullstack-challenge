# Architecture Patterns

**Domain:** Email Campaign Manager (MarTech)
**Researched:** 2026-04-20
**Updated:** 2026-04-20 (revised after user choices: flat monorepo, JWT split, cursor pagination, pixel endpoint)
**Confidence:** HIGH

## Recommended Architecture

```
flat yarn-workspaces monorepo (Yarn 4 + node-modules linker)
  backend/   (@campaign/backend  — Express + Sequelize + BullMQ + pino)
  frontend/  (@campaign/frontend — React 18 + Vite + React Query + RTK + shadcn)
  shared/    (@campaign/shared   — Zod schemas + inferred TS types)

Frontend ──HTTP/JSON (cookie + bearer)──► Express API ──SQL──► PostgreSQL
                                              │
                                              └──enqueue──► Redis ──► BullMQ Worker
                                                                          │
                                                              (txn: update campaign_recipients)
                                                                          │
                                                              (txn: update campaign.status)

Email client (proxy) ──GET /track/open/:trackingToken──► Express ──UPDATE opened_at──► PostgreSQL
                                                              └─► returns 1×1 GIF
```

Data flows are uni-directional:
- Frontend never writes to DB directly
- Worker never handles HTTP; reads/writes DB autonomously
- Stats are computed via SQL aggregation on read — not maintained as counters
- Tracking pixel writes `opened_at` directly; no auth, no JWT — relies on UUID unguessability

## Component Boundaries

| Component | Workspace | Responsibility | Communicates With |
|-----------|-----------|---------------|-------------------|
| Express API | `backend/src/` | Auth, REST endpoints, request validation, status-guard business rules | PostgreSQL (Sequelize), Redis (BullMQ producer + denylist) |
| BullMQ Worker | `backend/src/workers/` | Simulate delivery per recipient inside a transaction, update DB | PostgreSQL, Redis (job state) |
| Sequelize Models | `backend/src/models/` | Schema + association definitions | PostgreSQL |
| Tracking pixel | `backend/src/routes/track.ts` | Public, no-auth `GET /track/open/:trackingToken` → idempotent UPDATE → 200 GIF | PostgreSQL (single UPDATE) |
| React Query layer | `frontend/src/api/` | All HTTP calls, response caching, refetch on invalidation | Express API |
| Redux store | `frontend/src/store/` | Auth access token (memory), user identity, UI flags | In-memory only |
| Auth interceptor | `frontend/src/api/client.ts` | Inject Bearer, transparently refresh on 401, queue concurrent retries | `/auth/refresh` |
| Shared types | `shared/src/` | Zod schemas + inferred TS types used by both packages | Both packages |
| Docker Compose | root | Service wiring, health checks for postgres + redis + api | postgres, redis, api |

## 1. Database Schema

Tables: `users`, `campaigns`, `recipients`, `campaign_recipients`

`campaign_recipients` keeps composite PK `(campaign_id, recipient_id)` (natural, no surrogate id needed for internal lookups). It also gets a public-facing `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` column used **only** in the open-tracking pixel URL — keeps internal IDs natural while the public URL is unguessable. Requires `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (auto-on in PG 13+).

`status + sent_at + opened_at + tracking_token` on the junction row provides per-recipient delivery + open tracking without a separate events table.

Status columns use CHECK constraints (enforced at DB level as a safety net in addition to application-level guards):
- `campaigns.status`: `draft | scheduled | sending | sent`
- `campaign_recipients.status`: `pending | sent | failed`

## 2. PostgreSQL Indexing

```sql
-- Campaign list: cursor pagination by owner, sort by (created_at, id)
CREATE INDEX idx_campaigns_created_by_created_at_id
  ON campaigns (created_by, created_at DESC, id DESC);

-- Status filter is rare enough that the index above suffices; add a partial
-- index later only if "all scheduled" queries become hot.

-- Stats aggregation: all recipients for a campaign, filter by status
CREATE INDEX idx_campaign_recipients_campaign_status
  ON campaign_recipients (campaign_id, status);

-- Tracking pixel lookup
CREATE UNIQUE INDEX idx_campaign_recipients_tracking_token
  ON campaign_recipients (tracking_token);

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

**Worker sequence (inside Sequelize transaction):**
1. Re-check campaign status; bail if not `sending` (idempotency for delayed jobs that may have been cancelled via edit/delete prior to firing)
2. Fetch all `pending` recipients for campaign
3. For each recipient: random outcome (`Math.random() > 0.2 ? 'sent' : 'failed'`) — `CampaignRecipient.update({ status, sent_at })`
4. `job.updateProgress(percent)` periodically
5. After all recipients: `Campaign.update({ status: 'sent' })`

**API send endpoint** returns `202 Accepted` immediately — never awaits job completion. The atomic UPDATE that flips `draft|scheduled → sending` happens **before enqueue** (see §10).

**Concurrency:** `new Worker(..., { concurrency: 5 })` — safe default, 5 simultaneous campaigns.

## 4. API Response Shape Conventions

Envelope: `{ "data": T }` for success success of single objects; cursor responses use `{ data, nextCursor, hasMore }`. Errors: `{ error: { code, message } }`.

**Stats: embed in detail, separate endpoint for polling:**
- `GET /campaigns/:id` → includes `stats` sub-object (initial page load)
- `GET /campaigns/:id/stats` → stats only (polled every 2s during send)

**HTTP status codes:**
- `201` for POST (resource created)
- `202` for send (async queued)
- `409 Conflict` for status-guard violations and double-send race (atomic guard miss)
- `404` for cross-user access (avoids enumeration; not 403)
- `400` for past `scheduled_at`, malformed cursors

## 5. Cursor Pagination on `GET /campaigns`

Sort: `created_at DESC, id DESC`. Cursor encodes `{c: created_at_iso, i: id_string}` as base64url JSON.

**Encode/decode helpers (in `backend/src/util/cursor.ts`):**
```ts
export const encodeCursor = (createdAt: Date, id: string | number) =>
  Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: String(id) })).toString('base64url');

export const decodeCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const { c, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const date = new Date(c);
    if (isNaN(date.getTime())) throw new Error();
    return { createdAt: date, id: i };
  } catch { throw new HttpError(400, 'INVALID_CURSOR'); }
};
```

**Sequelize query (literal because Sequelize 6 has no row-value tuple support):**
```ts
const where: any = { created_by: userId };
if (cursor) {
  where[Op.and] = literal('(created_at, id) < (:cAt, :cId)');
}
const rows = await Campaign.findAll({
  where,
  order: [['created_at', 'DESC'], ['id', 'DESC']],
  limit: limit + 1,
  replacements: cursor ? { cAt: cursor.createdAt.toISOString(), cId: cursor.id } : {},
});
const hasMore = rows.length > limit;
const data = hasMore ? rows.slice(0, limit) : rows;
const last = data[data.length - 1];
return {
  data,
  nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  hasMore,
};
```

**Frontend hook (React Query v5):**
```ts
export const useCampaigns = (limit = 20) =>
  useInfiniteQuery({
    queryKey: ['campaigns', { limit }],
    queryFn: ({ pageParam }) =>
      api.get('/campaigns', { params: { cursor: pageParam, limit } }).then(r => r.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
```

## 6. Open-Tracking Pixel — `GET /track/open/:trackingToken`

**No auth, no JWT** — email clients strip cookies/headers. Public endpoint.

**Update is idempotent at the row-lock level — first open wins, races collapse:**
```sql
UPDATE campaign_recipients
   SET opened_at = NOW()
 WHERE tracking_token = $1 AND opened_at IS NULL;
```

**Response — always 200 + 43-byte GIF (verified canonical bytes):**
```ts
const PIXEL = Buffer.from(
  '47494638396101000100800100000000ffffff21f9040100000000002c00000000010001000002024c01003b',
  'hex'
);

router.get('/track/open/:token', async (req, res) => {
  await CampaignRecipient.update(
    { opened_at: new Date() },
    { where: { tracking_token: req.params.token, opened_at: null } }
  );
  // Always 200 — never reveal whether token exists (oracle defense)
  res
    .set({
      'Content-Type': 'image/gif',
      'Content-Length': PIXEL.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
    })
    .status(200)
    .end(PIXEL);
});
```

**Why `tracking_token UUID` (not the BIGINT composite PK) in the URL:**
- 122 bits of entropy defeat enumeration attacks (someone iterating IDs to falsely flip `opened_at`)
- Internal joins still use `(campaign_id, recipient_id)` — no perf cost on the hot path
- Keeps the public surface unguessable without HMAC tokens or rate limiting

**Production caveats (call out in README):** Gmail / Apple Mail proxy-prefetch images on delivery, inflating "opens" to nearly 100%. Treat `opened_at` as "first known proxy/client fetch," not user behavior.

## 7. Polling Over WebSocket

React Query `refetchInterval: 2000` on the stats query while `campaign.status === 'sending'`. Disabled when status reaches `sent`. WebSocket is out of scope — adds infrastructure complexity with no benefit at this scale.

```typescript
useQuery({
  queryKey: ['campaigns', campaignId, 'stats'],
  queryFn: () => api.getCampaignStats(campaignId),
  refetchInterval: (q) => q.state.data?.status === 'sending' ? 2000 : false,
});
```

## 8. Auth: Access Token in Memory + Refresh Token in httpOnly Cookie

**Token shapes:**
- **Access** (15 min): `{ sub, iat, exp, type: 'access' }` — signed with `JWT_ACCESS_SECRET`. No `jti`.
- **Refresh** (7 days): `{ sub, jti, iat, exp, type: 'refresh' }` — signed with separate `JWT_REFRESH_SECRET`. `jti` is the denylist key.

**Login flow** (`POST /auth/login`):
```ts
res.cookie('rt', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/auth/refresh',                  // cookie sent ONLY to this endpoint
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
res.json({ accessToken, user: { id, email, name } });
```

**Refresh flow** (`POST /auth/refresh`):
1. Verify refresh JWT from `req.cookies.rt`
2. Check `redis.exists('jwt:denylist:' + jti)` — if present, **clear cookie + 401** (replay signal)
3. **Rotate**: denylist old `jti`, mint new refresh (new `jti`) + new access, set new cookie
4. Return `{ accessToken }`

**Logout flow** (`POST /auth/logout`):
- Decode refresh token (no signature check needed — even expired tokens go to denylist)
- `redis.set('jwt:denylist:' + jti, '1', 'EX', secondsRemaining)`
- `res.clearCookie('rt', { path: '/auth/refresh' })`

**CSRF (minimum viable):** `SameSite=Strict` + 1-line `X-Requested-With: fetch` header check on `/auth/refresh`. No double-submit token unless OAuth/`SameSite=Lax` is added later.

**Frontend interceptor — memoized refresh promise (prevents 401 storms):**
```ts
let refreshPromise: Promise<string> | null = null;

axios.interceptors.response.use(r => r, async (error) => {
  const original = error.config;
  if (error.response?.status !== 401 || original._retry) throw error;
  original._retry = true;

  refreshPromise ??= axios.post('/auth/refresh', null, { headers: { 'X-Requested-With': 'fetch' } })
    .then(r => { store.dispatch(setAccessToken(r.data.accessToken)); return r.data.accessToken; })
    .catch(e => { store.dispatch(clearAuth()); window.location.href = '/login'; throw e; })
    .finally(() => { refreshPromise = null; });

  const token = await refreshPromise;
  original.headers.Authorization = `Bearer ${token}`;
  return axios(original);
});
```
N concurrent 401s all `await` the same promise → exactly one network call.

**App bootstrap:** on mount, call `/auth/refresh` then `/auth/me` to rehydrate session after a page refresh (since access token only lives in memory). Failed refresh is silent → unauthenticated.

**Redis denylist:** `KEY: jwt:denylist:{jti}`, `VALUE: '1'`, `TTL: token.exp - now()`. Redis `EXPIRE` auto-cleans.

## 9. State Management Split

**React Query owns all server state:** campaign list, campaign detail, stats, recipients. React Query cache IS the source of truth — never copy server data into Redux.

**Redux RTK owns pure client state:**
- `authSlice`: `{ accessToken: string | null, user: { id, email, name } | null, bootstrapped: boolean }` — `accessToken` lives in memory only; `bootstrapped` flag flips after the first refresh attempt
- `uiSlice`: `{ /* sparse — most UI state can live in components */ }`

**Token storage:** Access token in Redux memory; refresh token only as httpOnly cookie. Page refresh triggers `/auth/refresh` + `/auth/me` to rehydrate.

**Invalidation after mutations:** `queryClient.invalidateQueries({ queryKey: ['campaigns', id] })` on send/schedule/delete success.

## 10. Atomic Send Guard (race-condition prevention)

```typescript
const [count] = await Campaign.update(
  { status: 'sending' },
  { where: { id, status: { [Op.in]: ['draft', 'scheduled'] } } }
);
if (count === 0) {
  return res.status(409).json({ error: { code: 'CAMPAIGN_NOT_SENDABLE', message: 'Campaign already sending or sent' } });
}
await sendQueue.add('send-campaign', { campaignId: id, userId: req.user.id });
return res.status(202).json({ data: { id, status: 'sending' } });
```

The atomic UPDATE is the lock. Two concurrent requests = exactly one wins. Enqueue happens **after** the guard succeeds.

## 11. Monorepo Structure (flat, revised — was packages/*)

```
campaign/
├── .yarn/releases/yarn-4.x.x.cjs
├── .yarnrc.yml                  # nodeLinker: node-modules
├── .gitignore
├── .env.example                 # DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
├── docker-compose.yml           # postgres + redis + api (web runs via yarn dev)
├── package.json                 # root, workspaces: ["backend", "frontend", "shared"]
├── yarn.lock
├── README.md                    # setup, demo login, "How I Used Claude Code"
├── docs/
│   └── DECISIONS.md             # 4-state machine, indexes, async queue, JWT split, pixel rationale
├── shared/                      # @campaign/shared
│   ├── package.json             # main: dist/index.js, types: dist/index.d.ts
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # re-exports
│       └── schemas/             # Zod: CreateCampaignSchema, RegisterSchema, LoginSchema, ScheduleSchema
├── backend/                     # @campaign/backend
│   ├── package.json             # deps: @campaign/shared (workspace:*)
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── Dockerfile
│   ├── .sequelizerc
│   └── src/
│       ├── index.ts             # buildApp().listen(PORT)
│       ├── app.ts               # buildApp() factory — exported for Supertest
│       ├── db.ts                # Sequelize instance
│       ├── models/              # Sequelize model classes + associate
│       ├── migrations/          # Sequelize CLI migrations
│       ├── seeders/             # demo user + recipients + 1 draft + 1 scheduled + 1 sent
│       ├── routes/              # auth, campaigns, recipients, track
│       ├── middleware/          # authenticate, validate, errorHandler
│       ├── services/            # business logic (status guards, atomic send)
│       ├── workers/             # BullMQ worker
│       ├── queues/              # BullMQ Queue + connection
│       ├── util/                # cursor, pixel, jwt, redis, logger (pino)
│       └── test/                # vitest setup + fixtures
└── frontend/                    # @campaign/frontend
    ├── package.json             # deps: @campaign/shared (workspace:*)
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/                 # axios client + React Query hooks
        ├── store/               # Redux slices (authSlice, uiSlice)
        ├── pages/               # Login, Campaigns (list), CampaignNew, CampaignDetail
        ├── components/          # CampaignBadge, StatBar, RecipientRow, etc.
        ├── components/ui/       # shadcn-generated
        └── test/                # vitest setup + msw handlers
```

**Yarn 4 workspace setup (root):**
```json
{
  "name": "campaign",
  "private": true,
  "packageManager": "yarn@4.x.x",
  "workspaces": ["backend", "frontend", "shared"],
  "scripts": {
    "dev":       "yarn workspaces foreach -pi --all run dev",
    "build":     "yarn workspaces foreach -t --all run build",
    "test":      "yarn workspaces foreach --all run test",
    "lint":      "yarn workspaces foreach -p --all run lint",
    "typecheck": "yarn workspaces foreach -p --all run typecheck"
  }
}
```

**`shared/` emits `dist/` via `tsc -w` in dev** — the only setup that works identically in Vite, Vitest, tsx-dev, and compiled Node. Backend/frontend both add `"@campaign/shared": "workspace:*"`.

**TypeScript project references intentionally skipped** — workspace resolution is sufficient at three workspaces; references add ~30 min of config for negligible benefit at this scale.

## 12. Docker Compose Dependency Order

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 5s
      timeout: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10
  api:
    build: ./backend
    env_file: .env
    environment:
      DATABASE_URL: postgres://user:pass@postgres:5432/campaigns
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    command: sh -c "yarn workspace @campaign/backend run db:migrate && node dist/index.js"
```

`condition: service_healthy` is required — Docker starts containers in parallel otherwise and migrations fail.

## Suggested Build Order

| Step | Deliverable | Why This Order |
|------|-------------|----------------|
| 1 | Monorepo scaffold (Yarn 4 + 3 workspaces) + `@campaign/shared` Zod schemas | All other workspaces import from here |
| 2 | Docker Compose (postgres + redis), `.env.example` | Needed for migration runs immediately |
| 3 | Sequelize models + migrations (4-state enum, indexes, FK cascades, `tracking_token`) | Schema is the contract for all business logic and the worker |
| 4 | Auth: register, login, refresh, logout, /me, JWT middleware (split tokens, Redis denylist) | All campaign routes depend on this middleware |
| 5 | Campaign + Recipient CRUD + cursor pagination + stats endpoint + tracking pixel | Core business logic; status guards here |
| 6 | BullMQ queue + send worker (atomic guard + transaction) | Depends on models (3) and send endpoint (5) |
| 7 | Backend Vitest tests (status guard 409, send atomicity, stats, auth 401) + Docker `api` service | Written after business logic stable |
| 8 | Frontend: Vite + Redux + React Query + axios interceptor + bootstrap (refresh+/me) | Token in Redux required for API client auth header |
| 9 | Frontend: 4 pages (login, list with infinite scroll, new, detail) + polling + shadcn components | Depends on (8) and (5) |
| 10 | Seed script + README + "How I Used Claude Code" + decisions doc | Final integration and submission polish |

## Anti-Patterns to Avoid

- **Storing stats as columns on `campaigns`** — dual source of truth, drift risk. Always aggregate from `campaign_recipients`.
- **Awaiting job completion in HTTP handler** — `job.waitUntilFinished()` blocks the connection. Return `202` immediately.
- **Embedding recipient arrays in campaign list responses** — balloons payload. Return recipient count in list, full list only in detail.
- **Duplicating Zod schemas in both packages** — use `@campaign/shared` as the single source.
- **JWT in localStorage** — XSS exposure. Use Redux memory + httpOnly refresh cookie.
- **Counting in JS for stats** — must be a single SQL aggregate.
- **Returning total count in cursor responses** — defeats O(limit) cost.
- **404 from tracking pixel** — leaks token validity. Always 200 + GIF.
- **Sharing one IORedis connection across Queue + Worker** — required by BullMQ; separate instances mandatory.

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Schema design + tracking_token addition | HIGH | UUID PK pattern well-documented; pgcrypto bundled in PG 13+ |
| Indexing | HIGH | Standard PostgreSQL aggregate filter + B-tree seek patterns |
| BullMQ worker + atomic guard | HIGH | BullMQ v5 API stable; UPDATE-as-lock is canonical |
| React Query v5 useInfiniteQuery | HIGH | Verified API shape against TanStack docs |
| Cursor pagination in Sequelize 6 | HIGH | `literal()` workaround verified; row-value not native to Sequelize 6 |
| JWT access+refresh + Redis denylist | HIGH | Pattern verified against OWASP ASVS V3/V7 |
| Tracking pixel + 43-byte GIF | HIGH | GIF89a bytes verified canonical |
| Docker Compose health checks | HIGH | `condition: service_healthy` since Compose v1.29 |
| Yarn 4 flat workspaces | HIGH | Verified against Yarn 4 docs |
