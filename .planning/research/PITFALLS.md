# Domain Pitfalls

**Domain:** Mini Campaign Manager (MarTech / Full-Stack Interview Project)
**Stack:** Node.js + Express + Sequelize + PostgreSQL + BullMQ + Redis + React 18 + React Query + Redux Toolkit + shadcn/ui + Tailwind + Vitest
**Researched:** 2026-04-20
**Updated:** 2026-04-20 (revised after user choices: Vitest, flat monorepo, JWT split, cursor pagination, pixel endpoint)
**Confidence:** HIGH

## Critical Pitfalls

### C1: Sequelize N+1 on Campaign Detail

**What goes wrong:** `GET /campaigns/:id` lazy-loads each CampaignRecipient's Recipient separately — 101 queries for 100 recipients. Evaluators scanning SQL logs will see this immediately.

**Prevention:**
```typescript
Campaign.findByPk(id, {
  include: [{ model: CampaignRecipient, include: [{ model: Recipient }] }],
});
```
For stats, never count in application code — use a single aggregate SQL query.

**Phase:** Phase 1 (schema). Lock eager-load pattern before any endpoint returns recipient data.

---

### C2: Sequelize `sync()` in Production

**What goes wrong:** `sync({ force: true })` destroys data on restart. `sync({ alter: true })` has edge cases dropping columns on enum changes. Evaluators mark this as a junior mistake.

**Prevention:** Call `sequelize.authenticate()` only (proves connectivity). Run `yarn sequelize db:migrate` at startup. Never call `sync()` outside isolated Vitest setup.

**Phase:** Phase 1. Migration-first from day one.

---

### C3: Migration FK Ordering Failures

**What goes wrong:** `create-campaign-recipients` runs before `create-campaigns` — Postgres rejects FK constraints with `relation does not exist`.

**Prevention:** Generation order must match dependency order: Users → Campaigns → Recipients → CampaignRecipients. Remember `CREATE EXTENSION IF NOT EXISTS pgcrypto;` runs as the **first** migration (needed for `gen_random_uuid()` on `tracking_token`). Test `db:migrate:undo:all && db:migrate` before submission.

**Phase:** Phase 1.

---

### C4: BullMQ Job Stuck in `active` State

**What goes wrong:** Worker processor swallows error → job appears active but never completes → campaign status never transitions to `sent`.

**Prevention:**
- Let errors propagate out of processor — BullMQ catches throws and marks job `failed`
- Add required `worker.on('failed', ...)` and `worker.on('error', ...)` listeners
- Use separate IORedis connection instances for Queue and Worker — never share the same object
- Processor must explicitly update campaign status to `sent` before returning

**Warning signs:** `try { ... } catch(e) { console.log(e) }` wrapping entire processor without rethrowing; no `worker.on('failed')` listener.

**Phase:** Phase 2 (queue). Test failure path explicitly.

---

### C5: BullMQ IORedis Missing `maxRetriesPerRequest: null`

**What goes wrong:** Silent `ReplyError: Command timed out` under load.

**Prevention:** Every IORedis connection used with BullMQ must set `maxRetriesPerRequest: null`.

**Phase:** Phase 2.

---

### C6: Refresh-Token Pattern Gotchas (revised — was "JWT not invalidated on logout")

**What goes wrong:** Several distinct failure modes with the access + refresh split:
1. **Refresh races** — N concurrent 401s fire N refresh calls. Each rotates, denylists the previous `jti`, and the last one wins — first N-1 requests still fail. User is logged out.
2. **Missing `withCredentials: true`** — cookie silently dropped on `/auth/refresh`. Every refresh 401s even with a valid cookie. Hardest bug to see.
3. **No rotation** — stolen refresh token is usable until natural expiry (7 days). Replay detection is impossible.
4. **Forgetting to denylist on logout** — clearing the cookie only affects the honest browser; a stolen copy still works.

**Prevention:**
- **Memoized in-flight refresh promise** in the axios interceptor. N concurrent 401s all `await` the same promise → exactly one network call.
- Set `axios.defaults.withCredentials = true` (or `credentials: 'include'` on fetch) GLOBALLY in the API client module — not per-call.
- **Rotate on every refresh:** mint new refresh + access, denylist the old refresh `jti` in Redis with TTL = remaining token lifetime.
- **Logout:** decode refresh (no signature check needed), denylist `jti` in Redis (`SET jwt:denylist:{jti} 1 EX <secondsRemaining>`), clear cookie.
- Path-scope the refresh cookie: `Path=/auth/refresh` — cookie literally cannot be sent anywhere else.
- Use `SameSite=Strict` + 1-line `X-Requested-With: fetch` header check as CSRF minimum. Skip double-submit tokens.

**Phase:** Phase 1 (auth backend), Phase 3 (frontend interceptor).

---

### C7: Auth Middleware Missing from Routes

**What goes wrong:** Some routes added later without `authenticate` middleware — common on recipient routes or stats endpoint.

**Prevention:** Apply at router level, not per-route:
```typescript
campaignRouter.use(authenticate);
campaignRouter.get('/', listCampaigns);
```
Add integration test asserting 401 on unauthenticated requests. **Exception:** `GET /track/open/:trackingToken` is intentionally public — mount it on a separate router that doesn't inherit the `authenticate` middleware.

**Phase:** Phase 1.

---

### C8: Missing Indexes on FK and Query Columns

**What goes wrong:** PostgreSQL does NOT auto-create indexes on FK columns. `WHERE campaign_id = $1` on `campaign_recipients` = full sequential scan. Evaluators specifically ask about indexing.

**Prevention:**
```javascript
// campaigns — supports cursor pagination + ownership filter in a single B-tree scan
await queryInterface.addIndex('campaigns', ['created_by', 'created_at', 'id'], {
  name: 'idx_campaigns_created_by_created_at_id',
  // Postgres supports DESC on index column order via Sequelize 6 `order` option (raw literal)
});

// campaign_recipients — stats aggregation
await queryInterface.addIndex('campaign_recipients', ['campaign_id', 'status']);
await queryInterface.addIndex('campaign_recipients', ['recipient_id']);
// tracking pixel lookup — unique, also provides existence check
await queryInterface.addIndex('campaign_recipients', ['tracking_token'], { unique: true });

// users — unique email
await queryInterface.addIndex('users', ['email'], { unique: true });
// recipients — unique email
await queryInterface.addIndex('recipients', ['email'], { unique: true });
```
Prepare written rationale for each in `docs/DECISIONS.md` — requirements say "be ready to explain why."

**Phase:** Phase 1 (schema). Indexes are part of schema design, not an optimization pass.

---

### C9: No Transaction on Send Simulation (Partial State)

**What goes wrong:** Worker crashes between setting `sending` and `sent` → campaign stuck with mixed recipient statuses, no recovery path.

**Prevention:**
```typescript
await sequelize.transaction(async (t) => {
  // status = 'sending' was ALREADY set by the atomic guard in the HTTP handler;
  // here we just process and flip to 'sent'
  const recipients = await CampaignRecipient.findAll({
    where: { campaignId: id, status: 'pending' }, transaction: t
  });
  for (const r of recipients) {
    await r.update(
      { status: Math.random() > 0.2 ? 'sent' : 'failed', sent_at: new Date() },
      { transaction: t }
    );
  }
  await Campaign.update({ status: 'sent' }, { where: { id }, transaction: t });
});
```

**Phase:** Phase 2 (send logic).

---

### C10: Status Transition Not Enforced Server-Side

**What goes wrong:** Campaign mutations only blocked in frontend UI — any HTTP client can bypass. Double-sends possible.

**Prevention:**
```typescript
const campaign = await Campaign.findOne({ where: { id, created_by: req.user.id } });
if (!campaign) return res.status(404).json({ error: { code: 'NOT_FOUND' } });  // cross-user → 404 (not 403) to avoid enumeration
if (campaign.status !== 'draft') {
  return res.status(409).json({
    error: { code: 'NOT_EDITABLE', message: `Cannot edit campaign in status '${campaign.status}'` }
  });
}
```
Use **409 Conflict** for state machine violations (not 400).

**Phase:** Phase 1 (API). Business rules belong in the service layer.

---

### C11: Race Condition on Concurrent Send Requests

**What goes wrong:** Double-click → two requests both pass status check → two BullMQ jobs enqueued → campaign processed twice.

**Prevention:** Atomic Postgres UPDATE as the guard:
```typescript
const [count] = await Campaign.update(
  { status: 'sending' },
  { where: { id, created_by: req.user.id, status: { [Op.in]: ['draft', 'scheduled'] } } }
);
if (count === 0) return res.status(409).json({ error: { code: 'CAMPAIGN_NOT_SENDABLE' } });
await sendQueue.add('send-campaign', { campaignId: id, userId: req.user.id });
return res.status(202).json({ data: { id, status: 'sending' } });
```

**Phase:** Phase 2 (send endpoint).

---

### C12: Redux Caching Server State (Anti-Pattern)

**What goes wrong:** Campaign list/detail/stats in Redux slices alongside React Query. Two sources of truth. After mutation, one updates, the other doesn't.

**Prevention:**
- **React Query**: All server state (campaigns, recipients, stats)
- **Redux**: UI state only — access token (memory), user identity, `bootstrapped` flag
- Never dispatch server data into Redux slices
- After mutations: `queryClient.invalidateQueries()`

**Warning signs:** `campaignsSlice`, `campaignDetailSlice`; `dispatch(setCampaigns(response.data))`.

**Phase:** Phase 3 (frontend). Establish boundary before writing any data-fetching code.

---

### C13: React Query Cache Not Invalidated After Mutations

**What goes wrong:** Send/schedule/delete completes but UI still shows stale status.

**Prevention:**
```typescript
const sendMutation = useMutation({
  mutationFn: (id: string) => api.sendCampaign(id),
  onSuccess: (_, id) => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['campaigns', id] });
  },
});
```
For `sending` → `sent` polling:
```typescript
useQuery({
  queryKey: ['campaigns', id],
  queryFn: () => api.getCampaign(id),
  refetchInterval: (q) => q.state.data?.status === 'sending' ? 2000 : false,
});
```

**Phase:** Phase 3.

---

### C14: Docker Compose Without Health Checks

**What goes wrong:** Backend starts before Postgres/Redis are ready → connection failure → restart loop → evaluator's `docker compose up` appears to succeed but service is unreachable.

**Prevention:**
```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
    interval: 5s
    timeout: 5s
    retries: 10
redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 10
api:
  depends_on:
    postgres: { condition: service_healthy }
    redis:    { condition: service_healthy }
  command: sh -c "yarn workspace @campaign/backend run db:migrate && node dist/index.js"
```

**Phase:** Phase 1 (infrastructure). Must be in place from day one.

---

### C15: Environment Variables Not Passed to Containers

**What goes wrong:** Backend reads `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `REDIS_URL` from env. Without `env_file`, containers don't inherit host env. Also: `DATABASE_URL` pointing to `localhost` inside Docker refers to the container itself, not the Postgres service.

**Prevention:**
```yaml
api:
  env_file:
    - .env
  environment:
    DATABASE_URL: postgres://user:pass@postgres:5432/campaigns
    REDIS_URL: redis://redis:6379
```
Inside Docker Compose, DB host is the service name (`postgres`), not `localhost`.

**Phase:** Phase 1.

---

### C16: Cursor Pagination Implementation Bugs (new)

**What goes wrong (multiple modes):**
1. **Scalar `Op.lt` on `created_at` alone** — two campaigns with identical `created_at` → page boundary duplicates one and skips the other.
2. **Interpolating cursor values into the literal string** — SQL injection surface on a public endpoint.
3. **Decoding malformed cursors into `NaN` dates** → Postgres gets `'Invalid Date'` → 500 error.
4. **Embedding `userId` in the cursor** → tempting for "performance" but a client can forge another user's cursor. Authorize via `req.user.id` server-side; cursor is only a position.
5. **Sorting by a user-mutable column** (e.g., `name`) — any rename invalidates in-flight cursors.

**Prevention:**
- Always include the `id` tiebreaker in the ORDER BY and cursor payload.
- Use `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with `replacements` — never string interpolation.
- Validate the decoded date with `isNaN(d.getTime())` and throw `400 INVALID_CURSOR`.
- Filter ownership in `where`, not via cursor.
- Restrict cursor-sortable columns to immutable server-assigned timestamps + PK.

**Phase:** Phase 1 (campaigns list endpoint).

---

### C17: Tracking Pixel Leaks / Enumeration (new)

**What goes wrong:**
1. **BIGINT ID in URL** — attacker iterates `/track/open/1..N`, falsely flipping `opened_at` for every recipient.
2. **404 when token doesn't match** — oracle attack: attacker learns which IDs are valid.
3. **Missing idempotency guard** — a re-delivered email (Gmail proxy fetches image twice) overwrites `opened_at`.
4. **Setting referrer / CSP** — leaks the campaign URL to the proxy that fetched the pixel.

**Prevention:**
- Use `tracking_token UUID` (not the internal composite PK) in the public URL.
- **Always return 200 + 43-byte GIF**, regardless of whether the token matched. Pre-allocate the buffer at module scope.
- `UPDATE ... WHERE tracking_token = $1 AND opened_at IS NULL` — first open wins; additional requests match zero rows.
- Response headers: `Cache-Control: no-store, no-cache`, `Referrer-Policy: no-referrer`.
- No CSP on the image response — irrelevant for `<img>` requests.

**Phase:** Phase 1 (schema: add `tracking_token` column), Phase 2 (route).

---

### C18: Vitest / Yarn Workspaces Gotchas (new)

**What goes wrong:**
1. **`@campaign/shared` not built** — backend and frontend start importing stale types because `tsc -w` hasn't emitted `dist/` yet. Looks like "missing export" errors.
2. **Parallel backend tests racing on one Postgres DB** — tests pass in isolation, fail in CI.
3. **`vi.useFakeTimers()` + MSW / React Query retry backoff** — tests hang because MSW's internal timers are frozen.
4. **jsdom 29 missing globals** — `TextEncoder`, `structuredClone`, `ResizeObserver`, `matchMedia` need polyfills before component import.
5. **Vitest 4.x auto-installed by dependabot** — breaks Vite 5 compatibility. Pin `vitest@2.1.9`, `@vitejs/plugin-react@4.7.0`.
6. **Shared workspace shipping raw `src/*.ts`** — Vite's optimizer chokes on TS from `node_modules`. Always compile to `dist/`.

**Prevention:**
- Root `postinstall` script: `yarn workspace @campaign/shared run build`.
- Backend `vitest.config.ts`: `pool: 'forks', poolOptions: { forks: { singleFork: true } }` to serialize DB tests.
- Use `vi.useFakeTimers({ shouldAdvanceTime: true })` or scope fakes to specific `it()` blocks.
- Frontend test setup file stubs `window.matchMedia`, `global.ResizeObserver`, `global.TextEncoder`, `global.structuredClone` before any `import` from `src/`.
- Pin `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react` as exact versions with `"resolutions"` in the root `package.json`.
- `shared/` emits `dist/` via `tsc`; `main`/`types`/`exports` in its `package.json` point to `dist/`.

**Phase:** Phase 1 (monorepo scaffold) and Phase 4 (tests).

---

## Moderate Pitfalls

| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| M1 | Cascade delete not configured | `onDelete: 'CASCADE'` on `campaign_id` FK in `campaign_recipients` | Phase 1 schema |
| M2 | `scheduled_at` accepts past timestamps | Zod `.refine(val => new Date(val) > new Date())` + 400 response | Phase 1 validation |
| M3 | Stats division by zero / float precision | Let SQL do it: `NULLIF(denominator, 0)` + `ROUND(..., 2)` | Phase 1 stats function |
| M4 | Missing `sending` status in enum | Use 4-state machine from start: `draft\|scheduled\|sending\|sent` — PostgreSQL ENUM can't be altered in a transaction | Phase 1 schema |
| M5 | Recipient email not validated/deduplicated | `z.array(z.string().email())` + UNIQUE constraint + UPSERT | Phase 1 |
| M6 | Yarn PnP silently breaking tooling | Pin `nodeLinker: node-modules` in `.yarnrc.yml` — DO NOT use PnP for 4-8hr scope | Phase 1 scaffold |
| M7 | Version drift of zod between workspaces → instanceof fails | Declare `zod` only in `shared/`; backend/frontend consume via workspace | Phase 1 scaffold |
| M8 | `shared/` circular dep on `backend/` or `frontend/` | Enforce: `shared/` has zero workspace deps. Document in README. | Phase 1 scaffold |
| M9 | Build order — frontend/backend built before `shared/` emits dist | Use `yarn workspaces foreach -t --all run build` (topological) | Phase 1 scaffold |

## Minor Pitfalls

| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| m1 | `sending` badge not rendered in frontend | Add amber badge case; exhaustive TS switch covering all 4 states | Phase 3 |
| m2 | Hardcoded `JWT_*_SECRET` in source | Startup-time check: `if (!process.env.JWT_ACCESS_SECRET \|\| !process.env.JWT_REFRESH_SECRET) throw ...` | Phase 1 |
| m3 | Raw Sequelize errors forwarded to client | Central error handler: ValidationError → 400, UniqueConstraintError → 409, sanitize messages | Phase 1 |
| m4 | Over-engineering stats or send progress | Stats = one aggregate SQL. Progress = React Query poll. Each hour on unrequested features = one hour not on tests. | All phases |
| m5 | Missing `nextCursor` on last page | Return `nextCursor: null, hasMore: false` explicitly — not `undefined` | Phase 1 API |
| m6 | Same secret used for access + refresh tokens | Use separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — prevents cross-usage | Phase 1 auth |

## Phase-Specific Warning Summary

| Phase | Primary Pitfalls |
|-------|-----------------|
| Phase 1 scaffold | M6 (PnP), M7/M8/M9 (shared workspace), C18 (Vitest pins) |
| Phase 1 schema | C8 (no FK indexes), M4 (missing `sending` enum), M1 (no cascade), C3 (migration order + pgcrypto), C17 (tracking_token column) |
| Phase 1 auth | C6 (refresh gotchas), C7 (unprotected routes), m2 (hardcoded secret), m6 (shared secret) |
| Phase 1 API | C10 (no server-side status guard), M2 (past scheduled_at), m5 (nextCursor shape), C16 (cursor bugs), C17 (pixel always-200) |
| Phase 1 infra | C14 (no health checks), C15 (env vars), C2 (sync() in production) |
| Phase 2 queue | C4 (stuck active), C5 (maxRetriesPerRequest), C11 (race condition on send) |
| Phase 2 send | C9 (no transaction), C1 (N+1 in stats) |
| Phase 3 frontend | C6 (refresh races), C12 (Redux stores server state), C13 (no invalidation/polling), m1 (missing sending badge) |
| Phase 4 tests | C18 (Vitest/workspace issues) |

## Interview-Specific Awareness

### Questions Evaluators Commonly Ask
- "Walk me through your indexing strategy" — justify every index; composite `(campaign_id, status)` on `campaign_recipients` must be explained; cursor index `(created_by, created_at DESC, id DESC)` must be explained
- "What happens if the send worker crashes mid-job?" — transaction answer required; "it retries" is insufficient without idempotency explanation
- "Why access token in memory + refresh token in cookie?" — XSS-safe refresh + short replay window; be ready to contrast with localStorage
- "Why cursor pagination instead of offset?" — consistency under inserts + O(limit) cost; acknowledge offset is simpler for small datasets
- "Why a `tracking_token` column instead of using the composite PK?" — enumeration defense for a no-auth public endpoint
- "How did you use Claude Code, and where did it go wrong?" — first-class deliverable; they want judgment, not performance

### What Evaluators Flag in Code Review
1. `sequelize.sync()` in production path — senior-level red flag
2. Promise chains without error handling in BullMQ processor
3. JWT verification without `algorithms` specified in `verify()`
4. Same secret for access and refresh tokens
5. `res.json(err)` forwarding raw Sequelize errors
6. Hardcoded secrets in source
7. No input validation on any endpoint
8. Status transitions enforced only in frontend
9. Docker Compose that fails on first `up`
10. Interpolating cursor values into raw SQL
11. 404 on tracking pixel endpoint
12. Missing `withCredentials` on axios client

### Scope Calibration
**Do:** Robust error handling, complete input validation, meaningful tests for business rules, clear code structure (thin controllers, logic in services), README that works (`docker compose up && yarn dev && open http://localhost:5173`), `docs/DECISIONS.md` explaining the senior-flex choices (split-token auth, cursor pagination, pixel tracking)

**Defer:** Real-time WebSockets, rate limiting, RBAC, animation polish, complex chart libraries, 100% test coverage (3-5 meaningful tests on business rules beats 20 shallow tests), CI, dockerizing the web app
