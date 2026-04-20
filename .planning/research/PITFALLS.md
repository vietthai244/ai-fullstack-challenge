# Domain Pitfalls

**Domain:** Mini Campaign Manager (MarTech / Full-Stack Interview Project)
**Stack:** Node.js + Express + Sequelize + PostgreSQL + BullMQ + Redis + React 18 + React Query + Redux Toolkit + shadcn/ui + Tailwind
**Researched:** 2026-04-20
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

**Prevention:** Call `sequelize.authenticate()` only (proves connectivity). Run `sequelize db:migrate` at startup. Never call `sync()` outside isolated unit tests.

**Phase:** Phase 1. Migration-first from day one.

---

### C3: Migration FK Ordering Failures

**What goes wrong:** `create-campaign-recipients` runs before `create-campaigns` — Postgres rejects FK constraints with `relation does not exist`.

**Prevention:** Generation order must match dependency order: Users → Campaigns → Recipients → CampaignRecipients. Test `db:migrate:undo:all && db:migrate` before submission.

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

### C6: JWT Not Invalidated on Logout

**What goes wrong:** Frontend clears token but token remains valid until expiry. With 7d expiry, replay window is huge.

**Prevention:** Redis denylist — add `jti: uuid` claim at sign time, store in Redis SET with TTL matching expiry on logout, check denylist in auth middleware. Set `JWT_EXPIRY=1h`. Add `POST /auth/logout`.

**Phase:** Phase 1 (auth).

---

### C7: Auth Middleware Missing from Routes

**What goes wrong:** Some routes added later without `authenticate` middleware — common on recipient routes or stats endpoint.

**Prevention:** Apply at router level, not per-route:
```typescript
campaignRouter.use(authenticate);
campaignRouter.get('/', listCampaigns);
```
Add integration test asserting 401 on unauthenticated requests.

**Phase:** Phase 1.

---

### C8: Missing Indexes on FK and Query Columns

**What goes wrong:** PostgreSQL does NOT auto-create indexes on FK columns. `WHERE campaign_id = $1` on `campaign_recipients` = full sequential scan. Evaluators specifically ask about indexing.

**Prevention:**
```javascript
await queryInterface.addIndex('campaign_recipients', ['campaign_id']);
await queryInterface.addIndex('campaign_recipients', ['recipient_id']);
await queryInterface.addIndex('campaign_recipients', ['campaign_id', 'status']); // composite for stats
await queryInterface.addIndex('campaigns', ['created_by']);
await queryInterface.addIndex('campaigns', ['status']);
```
Prepare written rationale for each — requirements say "be ready to explain why."

**Phase:** Phase 1 (schema). Indexes are part of schema design, not an optimization pass.

---

### C9: No Transaction on Send Simulation (Partial State)

**What goes wrong:** Worker crashes between setting `sending` and `sent` → campaign stuck with mixed recipient statuses, no recovery path.

**Prevention:**
```typescript
await sequelize.transaction(async (t) => {
  await Campaign.update({ status: 'sending' }, { where: { id }, transaction: t });
  await Promise.allSettled(recipients.map(r =>
    CampaignRecipient.update(
      { status: randomStatus(), sent_at: new Date() },
      { where: { campaignId: id, recipientId: r.id }, transaction: t }
    )
  ));
  await Campaign.update({ status: 'sent' }, { where: { id }, transaction: t });
});
```

**Phase:** Phase 2 (send logic).

---

### C10: Status Transition Not Enforced Server-Side

**What goes wrong:** Campaign mutations only blocked in frontend UI — any HTTP client can bypass. Double-sends possible.

**Prevention:**
```typescript
const campaign = await Campaign.findByPk(id);
if (!campaign) return res.status(404).json({ error: 'Not found' });
if (campaign.status !== 'draft') {
  return res.status(409).json({ error: `Cannot edit campaign with status '${campaign.status}'` });
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
  { where: { id, status: ['draft', 'scheduled'] } }
);
if (count === 0) return res.status(409).json({ error: 'Campaign already sending or sent' });
await sendQueue.add('send-campaign', { campaignId: id });
```

**Phase:** Phase 2 (send endpoint).

---

### C12: Redux Caching Server State (Anti-Pattern)

**What goes wrong:** Campaign list/detail/stats in Redux slices alongside React Query. Two sources of truth. After mutation, one updates, the other doesn't.

**Prevention:**
- **React Query**: All server state (campaigns, recipients, stats)
- **Redux**: UI state only — auth token, user identity, UI flags
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
    queryClient.invalidateQueries({ queryKey: ['campaign', id] });
  },
});
```
For `sending` → `sent` polling:
```typescript
useQuery({
  queryKey: ['campaign', id],
  queryFn: () => api.getCampaign(id),
  refetchInterval: (data) => data?.status === 'sending' ? 2000 : false,
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
    test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER"]
    interval: 5s
    timeout: 5s
    retries: 10

redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 5s
    retries: 10

backend:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  command: sh -c "npx sequelize db:migrate && node dist/index.js"
```

**Phase:** Phase 1 (infrastructure). Must be in place from day one.

---

### C15: Environment Variables Not Passed to Containers

**What goes wrong:** Backend reads `JWT_SECRET`, `DATABASE_URL` from env. Without `env_file`, containers don't inherit host env. Also: `DATABASE_URL` pointing to `localhost` inside Docker refers to the container itself, not the Postgres service.

**Prevention:**
```yaml
backend:
  env_file:
    - .env
  environment:
    DATABASE_URL: postgres://user:pass@postgres:5432/campaigns
    REDIS_URL: redis://redis:6379
```
Inside Docker Compose, DB host is the service name (`postgres`), not `localhost`.

**Phase:** Phase 1.

---

## Moderate Pitfalls

| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| M1 | Cascade delete not configured | `onDelete: 'CASCADE'` on `campaign_id` FK in `campaign_recipients` | Phase 1 schema |
| M2 | `scheduled_at` accepts past timestamps | Zod `.refine(val => new Date(val) > new Date())` + 422 response | Phase 1 validation |
| M3 | Stats division by zero / float precision | Guard `total === 0 ? 0 : ...` + `Math.round((sent/total)*10000)/100` | Phase 1 stats function |
| M4 | Missing `sending` status in enum | Use 4-state machine from start: `draft\|scheduled\|sending\|sent` | Phase 1 schema |
| M5 | Recipient email not validated/deduplicated | `z.array(z.string().email())` + UNIQUE constraint + `ignoreDuplicates: true` | Phase 1 |

## Minor Pitfalls

| # | Pitfall | Prevention | Phase |
|---|---------|------------|-------|
| m1 | `sending` badge not rendered in frontend | Add yellow badge case; exhaustive TS switch covering all 4 states | Phase 3 |
| m2 | Hardcoded `JWT_SECRET` in source | Startup-time `if (!process.env.JWT_SECRET) throw new Error(...)` | Phase 1 |
| m3 | Raw Sequelize errors forwarded to client | Central error handler: ValidationError → 422, UniqueConstraintError → 409, sanitize messages | Phase 1 |
| m4 | Over-engineering stats or send progress | Stats = one aggregate SQL. Progress = React Query poll. Each hour on unrequested features = one hour not on tests. | All phases |
| m5 | Missing pagination on campaign list | `{ data: Campaign[], total, page, totalPages }` response shape; offset pagination | Phase 1 API |

## Phase-Specific Warning Summary

| Phase | Primary Pitfalls |
|-------|-----------------|
| Phase 1: DB Schema | C8 (no FK indexes), M4 (missing `sending` enum), M1 (no cascade), C3 (migration order) |
| Phase 1: Auth | C6 (no revocation), C7 (unprotected routes), m2 (hardcoded secret) |
| Phase 1: API | C10 (no server-side status guard), M2 (past scheduled_at), m5 (no pagination shape) |
| Phase 1: Infra | C14 (no health checks), C15 (env vars), C2 (sync() in production) |
| Phase 2: Queue | C4 (stuck active), C5 (maxRetriesPerRequest), C11 (race condition on send) |
| Phase 2: Send | C9 (no transaction), C1 (N+1 in stats) |
| Phase 3: Frontend | C12 (Redux stores server state), C13 (no invalidation/polling), m1 (missing sending badge) |

## Interview-Specific Awareness

### Questions Evaluators Commonly Ask
- "Walk me through your indexing strategy" — justify every index; composite `(campaign_id, status)` on `campaign_recipients` must be explained
- "What happens if the send worker crashes mid-job?" — transaction answer required; "it retries" is insufficient without idempotency explanation
- "How did you use Claude Code, and where did it go wrong?" — first-class deliverable; they want judgment, not performance

### What Evaluators Flag in Code Review
1. `sequelize.sync()` in production path — senior-level red flag
2. Promise chains without error handling in BullMQ processor
3. JWT verification without `algorithms` specified in `verify()`
4. `res.json(err)` forwarding raw Sequelize errors
5. Hardcoded secrets in source
6. No input validation on any endpoint
7. Status transitions enforced only in frontend
8. Docker Compose that fails on first `up`

### Scope Calibration
**Do:** Robust error handling, complete input validation, meaningful tests for business rules, clear code structure (thin controllers, logic in services), README that works (`docker compose up && open http://localhost:5173`)

**Defer:** Real-time WebSockets, refresh token rotation, rate limiting, RBAC, animation polish, complex chart libraries, 100% test coverage (3 meaningful tests on business rules beats 20 shallow tests)
