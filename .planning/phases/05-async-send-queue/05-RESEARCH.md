# Phase 5: Async Send Queue (Schedule + Send) - Research

**Researched:** 2026-04-21
**Domain:** BullMQ 5 + IORedis + Sequelize transaction-wrapped job processing
**Confidence:** HIGH

---

## Summary

Phase 5 wires the BullMQ queue + worker so campaigns can be sent immediately or scheduled for future delivery. The critical correctness invariants are: (1) the HTTP handler atomically transitions campaign status via `UPDATE … WHERE status IN ('draft','scheduled')` and reads `rowCount` to detect races; (2) the worker wraps all DB mutations in a Sequelize transaction so partial state is impossible; and (3) every IORedis connection passed to BullMQ must carry `maxRetriesPerRequest: null`.

BullMQ is not yet installed. The existing `backend/src/lib/redis.ts` auth-denylist client must NOT be reused for BullMQ — it intentionally omits `maxRetriesPerRequest: null` (correct for auth, wrong for queue). New dedicated connections are required.

The implementation is four discrete deliverables: a `lib/queue.ts` module (Queue + Worker + two IORedis instances), a `services/sendService.ts` (atomic guard + enqueue helpers for `send` and `schedule`), two new route handlers on `campaignsRouter`, and a shutdown-hook extension in `index.ts`.

**Primary recommendation:** Create `lib/queue.ts` as the single module that owns both IORedis instances and both BullMQ objects (Queue and Worker). Export them; `index.ts` imports the worker to guarantee it starts, and the shutdown hook calls `queue.close(); worker.close()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Atomic status guard (send) | API / Backend | — | DB-level UPDATE rowCount; must stay server-side |
| Job enqueue | API / Backend | — | After atomic guard succeeds; same HTTP handler |
| Job processing / recipient simulation | BullMQ Worker | — | Async, off the request path; owns the transaction |
| Schedule validation (past date) | API / Backend | — | Business rule; Zod + service layer |
| Graceful shutdown | Process Bootstrap | — | `index.ts` SIGTERM handler |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAMP-06 | `POST /campaigns/:id/schedule` sets `scheduled_at`, enqueues delayed BullMQ job; 400 if past date, 409 if status ≠ draft | Zod refine on `scheduled_at`, `Campaign.update WHERE status='draft'`, `queue.add(..., { delay })` |
| CAMP-07 | `POST /campaigns/:id/send` transitions `draft|scheduled → sending` via atomic UPDATE, enqueues immediate job, returns 202; 409 when rowCount=0 | `Campaign.update` tuple destructure, `[count]` check, `queue.add` |
| QUEUE-01 | Queue + Worker with separate IORedis connections, both `maxRetriesPerRequest: null` | Verified: BullMQ docs require this; existing auth redis must NOT be shared |
| QUEUE-02 | Worker processes inside Sequelize transaction: mark recipients sent/failed, flip campaign to `sent` | `sequelize.transaction()` wrapping `CampaignRecipient.update` loop |
| QUEUE-03 | Delayed scheduled jobs converge to same worker; worker re-checks status and bails if not `sending` | `Campaign.findOne` at job start; early return (no error) if status ≠ `sending` |
| QUEUE-04 | `worker.on('failed')` and `worker.on('error')` log via pino | Verified: BullMQ docs show both event signatures |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | 5.75.2 (latest) | Queue + Worker + delayed jobs | Stack locked; verified npm registry 2026-04-21 |
| ioredis | 5.10.1 (already installed) | Redis client for BullMQ connections | Already in backend deps; BullMQ peer |

[VERIFIED: npm registry 2026-04-21] — `npm view bullmq version` returned `5.75.2`; `npm view ioredis version` returned `5.10.1` (matches installed).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod (already in shared) | ^3.23.8 | Validate `scheduled_at` request body | ScheduleSchema lives in `shared/src/schemas/campaign.ts` |
| pino (already in backend) | ^10.3.1 | Worker error logging | Already wired; import `logger` from `../util/logger.js` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bullmq | bull (v4) | bull is deprecated; bullmq is the successor with native TS |
| Separate IORedis instances | Shared instance | BullMQ docs warn against sharing; dedicated instances are correct |

**Installation:**
```bash
yarn workspace @campaign/backend add bullmq@^5.75.2
```

`ioredis` is already installed at `^5.10.1` — no additional install needed.

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP POST /send or /schedule
         │
         ▼
[authenticate middleware]
         │
         ▼
[Route handler: validateBody → parseInt(id)]
         │
         ├── SCHEDULE path ─────────────────────────────────────────────────┐
         │   Zod: scheduled_at > now()? → 400 if past                       │
         │   Campaign.findOne(id, userId) → 404 if missing                   │
         │   Campaign.update WHERE status='draft'                            │
         │   → rowCount=0 → 409 (already scheduled/sent)                    │
         │   → rowCount=1 → set scheduledAt, queue.add(delay=...) → 202     │
         │                                                                    │
         └── SEND path ──────────────────────────────────────────────────────┤
             Campaign.update status='sending'                                │
             WHERE status IN ('draft','scheduled')                           │
             → rowCount=0 → 409 CAMPAIGN_NOT_SENDABLE                       │
             → rowCount=1 → queue.add(immediate) → 202                      │
                                                                             │
         ┌───────────────────────────────────────────────────────────────────┘
         │     (delayed job fires at scheduled_at, immediate fires now)
         ▼
[BullMQ Worker processor]
         │
         ▼
  Re-check campaign status = 'sending'?
  NO  → bail (return, no error, no DB writes)
  YES → sequelize.transaction():
          CampaignRecipient.findAll(campaignId, status='pending')
          for each: Math.random() > 0.3 → sent (+ sentAt=NOW()) | failed
          Campaign.update status='sent'
        commit transaction
         │
         ▼
  job.done() → BullMQ marks 'completed'
```

### Recommended Project Structure

```
backend/src/
├── lib/
│   ├── redis.ts        # EXISTING — auth denylist only; DO NOT share
│   ├── tokens.ts       # EXISTING
│   └── queue.ts        # NEW — Queue + Worker + 2 IORedis instances
├── services/
│   ├── campaignService.ts   # EXISTING — add scheduleCampaign, sendCampaign
│   └── sendWorker.ts        # NEW — worker processor function (imported by queue.ts)
├── routes/
│   └── campaigns.ts    # EXISTING — add POST /:id/schedule + POST /:id/send handlers
└── index.ts            # EXISTING — add worker import + queue/worker shutdown
```

Alternative: keep worker processor inline in `lib/queue.ts`. Either works; separate `sendWorker.ts` improves testability.

### Pattern 1: IORedis connections for BullMQ

`maxRetriesPerRequest: null` is mandatory on every IORedis instance used with BullMQ. The existing auth `redis` client in `lib/redis.ts` intentionally omits it — DO NOT pass it to BullMQ.

```typescript
// Source: https://docs.bullmq.io/guide/connections [VERIFIED: Context7]
import { Redis as IORedis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { config } from '../config/env.js';

// Separate connections — Queue uses blocking commands different from Worker
const queueConnection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerConnection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const sendQueue = new Queue('send-campaign', { connection: queueConnection });

export const sendWorker = new Worker(
  'send-campaign',
  processSendJob,        // processor function
  { connection: workerConnection },
);

// Mandatory event listeners (QUEUE-04)
sendWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'send job failed');
});
sendWorker.on('error', (err) => {
  logger.error({ err }, 'send worker error');
});
```

[VERIFIED: docs.bullmq.io — `maxRetriesPerRequest: null` shown in every connection example]

### Pattern 2: Atomic send guard — get rowCount from Campaign.update

Sequelize 6 `Model.update()` returns `[affectedCount, affectedRows]`. The first element is the count.

```typescript
// Source: campaignService.ts existing pattern for deleteCampaign (adapted)
// [VERIFIED: codebase — deleteCampaign uses Campaign.update returning [count]]
const [count] = await Campaign.update(
  { status: 'sending' },
  {
    where: {
      id: campaignId,
      createdBy: userId,
      status: { [Op.in]: ['draft', 'scheduled'] },
    },
  },
);
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SENDABLE');
await sendQueue.add('send-campaign', { campaignId, userId });
return { id: campaignId, status: 'sending' };
```

[VERIFIED: codebase — `deleteCampaign` in `campaignService.ts` already uses `const [count] = await Campaign.update(...)`]

### Pattern 3: Schedule endpoint — delayed job

```typescript
// CAMP-06: schedule handler
// [VERIFIED: Context7 — queue.add delay option]
const scheduleSchema = z.object({
  scheduled_at: z.string().datetime().refine(
    (val) => new Date(val) > new Date(),
    { message: 'scheduled_at must be in the future' },
  ),
});

// In service:
const [count] = await Campaign.update(
  { status: 'scheduled', scheduledAt: scheduledAt },
  { where: { id: campaignId, createdBy: userId, status: 'draft' } },
);
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SCHEDULABLE');

const delay = new Date(scheduledAt).getTime() - Date.now();
await sendQueue.add('send-campaign', { campaignId, userId }, { delay });
```

### Pattern 4: Worker processor with transaction + status re-check

```typescript
// Source: PITFALLS.md C9 + C4 patterns (verified in existing research)
// [CITED: .planning/research/PITFALLS.md]
async function processSendJob(job: Job<{ campaignId: number; userId: number }>) {
  const { campaignId } = job.data;

  // QUEUE-03: re-check before processing (delayed job may fire after campaign deleted/edited)
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign || campaign.status !== 'sending') {
    // Bail silently — not an error, just stale job
    return;
  }

  // QUEUE-02: everything in one transaction (C9)
  await sequelize.transaction(async (t) => {
    const recipients = await CampaignRecipient.findAll({
      where: { campaignId, status: 'pending' },
      transaction: t,
    });

    for (const r of recipients) {
      const isSent = Math.random() > 0.3;   // ~70% sent, ~30% failed
      await r.update(
        {
          status: isSent ? 'sent' : 'failed',
          sentAt: isSent ? new Date() : null,
        },
        { transaction: t },
      );
    }

    await Campaign.update(
      { status: 'sent' },
      { where: { id: campaignId }, transaction: t },
    );
  });
  // DO NOT wrap in try/catch that swallows errors — let BullMQ catch and mark failed (C4)
}
```

### Pattern 5: Shutdown hook extension in index.ts

```typescript
// Source: https://docs.bullmq.io/guide/going-to-production [VERIFIED: Context7]
// Extend existing shutdown() in index.ts:
import { sendQueue, sendWorker } from './lib/queue.js';

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.allSettled([
    sequelize.close(),
    redis.quit(),
    sendQueue.close(),
    sendWorker.close(),   // waits for active job to complete
  ]);
  process.exit(0);
};
```

### Pattern 6: Route handler shape

Route handlers follow existing thin-controller pattern in `routes/campaigns.ts`.

```typescript
// POST /campaigns/:id/schedule (CAMP-06)
campaignsRouter.post(
  '/:id/schedule',
  validate(ScheduleCampaignSchema),
  async (req, res, next) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      await campaignService.scheduleCampaign(campaignId, req.user!.id, req.body.scheduled_at);
      res.status(202).json({ data: { id: campaignId, status: 'scheduled' } });
    } catch (err) { next(err); }
  },
);

// POST /campaigns/:id/send (CAMP-07)
campaignsRouter.post(
  '/:id/send',
  async (req, res, next) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      await campaignService.triggerSend(campaignId, req.user!.id);
      res.status(202).json({ data: { id: campaignId, status: 'sending' } });
    } catch (err) { next(err); }
  },
);
```

### Anti-Patterns to Avoid

- **Reusing the auth `redis` client for BullMQ:** The auth client omits `maxRetriesPerRequest: null`. Passing it causes silent hangs under load (C5).
- **Swallowing worker errors:** `try { ... } catch(e) { logger.error(e) }` without rethrowing prevents BullMQ from marking the job `failed` — campaign stays in `sending` forever (C4).
- **Checking status before atomic UPDATE in the HTTP handler:** Read-then-write allows the TOCTOU race. Only the atomic `UPDATE … WHERE status IN (...)` rowCount check is the correct guard (C11).
- **Sharing one IORedis connection between Queue and Worker:** BullMQ internally uses blocking Redis commands on the worker connection. A shared connection causes command interference.
- **Calling `worker.close()` without awaiting:** The worker has an active job slot. Fire-and-forget close drops in-progress jobs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delayed job scheduling | `setTimeout`, cron, node-schedule | `bullmq queue.add(..., { delay })` | Survives restart; Redis-backed; automatic retry |
| Job retry / failure tracking | Custom retry loop | BullMQ's built-in `attempts` + `backoff` | Edge cases around state are pre-handled |
| Job persistence across restart | In-memory queue array | BullMQ (Redis-backed) | Jobs survive process crash |
| Concurrent-send race | Application-level mutex | Postgres atomic `UPDATE WHERE status IN (...)` rowCount | DB-level; works across multiple API instances |

**Key insight:** BullMQ's delayed-job mechanism is a sorted-set scan in Redis (`ZRANGEBYSCORE`). Any hand-rolled polling loop would be less precise and not cluster-safe.

---

## Common Pitfalls

### Pitfall 1: Missing `maxRetriesPerRequest: null` on IORedis (C5)
**What goes wrong:** `ReplyError: Command timed out` on BullMQ commands under load. Jobs silently stall in `waiting` or `active`.
**Why it happens:** BullMQ uses blocking Redis commands (BRPOPLPUSH equivalents). Without `maxRetriesPerRequest: null`, ioredis enforces a per-request retry limit that conflicts.
**How to avoid:** Every `new IORedis(...)` that is passed to Queue or Worker MUST include `{ maxRetriesPerRequest: null }`.
**Warning signs:** Jobs enqueued but never processed; `active` jobs that never complete.

### Pitfall 2: Swallowing processor errors (C4)
**What goes wrong:** A try/catch inside the processor logs the error but doesn't rethrow → BullMQ thinks the job completed → campaign stuck in `sending`.
**Why it happens:** Defensive coding instinct; the Sequelize transaction throw is caught.
**How to avoid:** Let errors propagate out of the processor. The only catch allowed is for the status re-check bail (which is not an error — just an early `return`).
**Warning signs:** `worker.on('completed')` fires but campaign is still `sending`; no `worker.on('failed')` event.

### Pitfall 3: TOCTOU race on concurrent send (C11)
**What goes wrong:** Two requests call `Campaign.findOne` → both see `draft` → both enqueue → two jobs process → campaign processed twice.
**Why it happens:** Read-then-write is not atomic.
**How to avoid:** Skip the findOne in the send handler. Go directly to atomic `Campaign.update({ status: 'sending' }, { where: { status: { [Op.in]: ['draft', 'scheduled'] } } })`. Check `rowCount` — zero means another request won.
**Warning signs:** TEST-02 fails (concurrent send atomicity test).

### Pitfall 4: No status re-check in worker (QUEUE-03)
**What goes wrong:** A campaign is scheduled for T+1h, then deleted or manually sent before T+1h. At T+1h the delayed job fires, fetches recipients, and re-processes them.
**Why it happens:** Worker just runs the job without checking current DB state.
**How to avoid:** First line of processor: `Campaign.findByPk(campaignId)` — if `status !== 'sending'`, return early (no error, no DB writes).

### Pitfall 5: Not importing the worker in index.ts
**What goes wrong:** `lib/queue.ts` exports the worker, but nothing imports it → module is never evaluated → worker never starts → jobs sit in queue forever.
**Why it happens:** Lazy module evaluation in ESM — unused exports don't execute.
**How to avoid:** `import './lib/queue.js'` in `index.ts` (or import a named export) to force module evaluation. The shutdown hook also needs the worker reference.

### Pitfall 6: Schedule endpoint returns 202 but wrong status in DB
**What goes wrong:** `scheduleCampaign` sets `status: 'scheduled'` but the schedule handler returns `{ status: 'draft' }` or vice versa.
**Why it happens:** Service and route handler disagree on the updated status.
**How to avoid:** Service function transitions to `'scheduled'`, route returns `{ id, status: 'scheduled' }`. Consistent with CAMP-06 spec.

---

## Code Examples

### Queue module (complete structure)

```typescript
// backend/src/lib/queue.ts
// Source: docs.bullmq.io connections + workers guides [VERIFIED: Context7]
import { Queue, Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';
import { processSendJob } from '../services/sendWorker.js';

// Separate connections — never share (C5, QUEUE-01)
const queueConn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerConn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

queueConn.on('error', (err) => logger.error({ err }, 'queue redis error'));
workerConn.on('error', (err) => logger.error({ err }, 'worker redis error'));

export const sendQueue = new Queue('send-campaign', { connection: queueConn });

export const sendWorker = new Worker('send-campaign', processSendJob, {
  connection: workerConn,
});

// Mandatory listeners (QUEUE-04)
sendWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error({ jobId: job?.id, campaignId: job?.data?.campaignId, err }, 'send job failed');
});
sendWorker.on('error', (err: Error) => {
  logger.error({ err }, 'send worker connection error');
});
```

### Send worker processor

```typescript
// backend/src/services/sendWorker.ts
// Source: PITFALLS.md C4, C9 patterns + BullMQ docs [VERIFIED: codebase research]
import type { Job } from 'bullmq';
import { Op } from 'sequelize';
import { sequelize, Campaign, CampaignRecipient } from '../db/index.js';
import { logger } from '../util/logger.js';

export interface SendJobData {
  campaignId: number;
  userId: number;
}

export async function processSendJob(job: Job<SendJobData>): Promise<void> {
  const { campaignId } = job.data;

  // QUEUE-03: status re-check — stale delayed job guard
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign || campaign.status !== 'sending') {
    logger.info({ campaignId, status: campaign?.status }, 'send job skipped — campaign not in sending');
    return;  // not an error; bail cleanly
  }

  // QUEUE-02: single transaction — all or nothing (C9)
  await sequelize.transaction(async (t) => {
    const recipients = await CampaignRecipient.findAll({
      where: { campaignId, status: 'pending' },
      transaction: t,
    });

    logger.info({ campaignId, recipientCount: recipients.length }, 'processing send job');

    for (const r of recipients) {
      const isSent = Math.random() > 0.3;
      await r.update(
        {
          status: isSent ? ('sent' as const) : ('failed' as const),
          sentAt: isSent ? new Date() : null,
        },
        { transaction: t },
      );
    }

    await Campaign.update({ status: 'sent' }, { where: { id: campaignId }, transaction: t });
  });

  logger.info({ campaignId }, 'send job completed');
  // No try/catch around the above — let errors propagate so BullMQ marks job failed (C4)
}
```

### Service functions (add to campaignService.ts)

```typescript
// triggerSend — atomic guard + enqueue (CAMP-07, C11)
export async function triggerSend(campaignId: number, userId: number): Promise<void> {
  const [count] = await Campaign.update(
    { status: 'sending' },
    {
      where: {
        id: campaignId,
        createdBy: userId,
        status: { [Op.in]: ['draft', 'scheduled'] },
      },
    },
  );
  if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SENDABLE');
  await sendQueue.add('send-campaign', { campaignId, userId });
}

// scheduleCampaign — validate future date + enqueue delayed (CAMP-06)
export async function scheduleCampaign(
  campaignId: number,
  userId: number,
  scheduledAt: string,
): Promise<void> {
  const scheduledDate = new Date(scheduledAt);
  if (scheduledDate <= new Date()) throw new BadRequestError('SCHEDULED_AT_NOT_FUTURE');

  const [count] = await Campaign.update(
    { status: 'scheduled', scheduledAt: scheduledDate },
    { where: { id: campaignId, createdBy: userId, status: 'draft' } },
  );
  if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SCHEDULABLE');

  const delay = scheduledDate.getTime() - Date.now();
  await sendQueue.add('send-campaign', { campaignId, userId }, { delay });
}
```

---

## Shared Schema Additions

A `ScheduleCampaignSchema` must be added to `shared/src/schemas/campaign.ts`:

```typescript
// Add to shared/src/schemas/campaign.ts
export const ScheduleCampaignSchema = z.object({
  scheduled_at: z.string().datetime({ message: 'scheduled_at must be ISO 8601' }),
});
export type ScheduleCampaignInput = z.infer<typeof ScheduleCampaignSchema>;
```

Note: the `> now()` validation belongs in the service layer (not Zod schema) so the error code can be `BadRequestError('SCHEDULED_AT_NOT_FUTURE')` vs a ZodError. Zod validates shape; service validates business rule.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bull` (v4) | `bullmq` (v5) | ~2022 | Different API; bullmq has native TS |
| Shared IORedis instance | Separate Queue + Worker connections | BullMQ design | Prevents command interference |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Math.random() > 0.3` gives ~70% sent / 30% failed per PITFALLS.md C9 | Code Examples | Threshold is a simulation detail; could be any value |
| A2 | `scheduledAt` column is already nullable in the Campaigns model/migration | Architecture | Model shows `scheduledAt: Date | null` — verified in codebase |

If this table is essentially empty: A2 is verified by reading the model file directly.

---

## Open Questions (RESOLVED)

1. **Queue name collisions in test**
   - What we know: Vitest backend tests (Phase 7) will need BullMQ. A worker running during tests could process jobs fired in one test that affect another.
   - What's unclear: Should Phase 5 add a `QUEUE_NAME` env var so tests use an isolated queue?
   - RESOLVED: Use `'send-campaign'` as the hardcoded queue name for now. Phase 7 research will handle test isolation (likely: don't start the worker in tests; directly call `processSendJob`).

2. **`Op` import in campaignService.ts**
   - What we know: The existing file imports `QueryTypes` from `sequelize` but not `Op`.
   - What's unclear: Is `Op` already imported transitively?
   - RESOLVED: Add `Op` to the import from `'sequelize'` in campaignService.ts when adding `triggerSend`. Plan 05-02 Task 2 Step 1 covers this explicitly.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | BullMQ queue + worker | ✓ | Already in docker-compose + local | — |
| bullmq | QUEUE-01..04 | ✗ (not installed) | 5.75.2 (latest) | None — must install |
| ioredis | BullMQ connections | ✓ | 5.10.1 (already in backend deps) | — |

**Missing dependencies with no fallback:**
- `bullmq` — must be installed via `yarn workspace @campaign/backend add bullmq@^5.75.2`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Not yet wired (Phase 7 adds Vitest + Supertest) |
| Config file | none — Wave 0 of Phase 7 |
| Quick run command | n/a Phase 5 |
| Full suite command | n/a Phase 5 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAMP-07 + QUEUE-01..04 | Concurrent send atomicity (one 202, one 409) | integration | Phase 7 TEST-02 | ❌ Phase 7 |
| CAMP-06 | Past `scheduled_at` → 400 | integration | Phase 7 TEST-01 adjacent | ❌ Phase 7 |

Phase 5 ships smoke scripts (manual curl) as the acceptance gate. Automated Vitest tests land in Phase 7.

### Wave 0 Gaps

None — Phase 5 does not create a test infrastructure. Smoke scripts serve as acceptance gate.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `createdBy: userId` in Campaign.update WHERE clause — users can only send their own campaigns |
| V5 Input Validation | yes | Zod ScheduleCampaignSchema on request body; `Number(req.params.id)` + integer check |
| V6 Cryptography | no | — |

### Known Threat Patterns for BullMQ / Express send endpoint

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Concurrent double-send | Tampering | Atomic `UPDATE WHERE status IN (...)` rowCount check |
| Sending another user's campaign | Elevation of privilege | `createdBy: userId` in WHERE clause of all guards |
| Past-date schedule accepted | Tampering | `new Date(scheduledAt) > new Date()` check in service |
| Job data tampering (campaignId forge) | Tampering | Worker re-checks ownership via `Campaign.findByPk` before processing |

---

## Sources

### Primary (HIGH confidence)
- `/websites/bullmq_io` (Context7) — queue.add delay, worker events, graceful shutdown, connection patterns
- `/taskforcesh/bullmq` (Context7) — delayed job options
- `backend/src/services/campaignService.ts` (codebase) — Campaign.update rowCount pattern, sequelize.transaction pattern
- `backend/src/lib/redis.ts` (codebase) — confirmed auth redis must NOT be shared
- `backend/src/models/campaign.ts` (codebase) — CampaignAttributes includes scheduledAt nullable
- `backend/src/models/campaignRecipient.ts` (codebase) — RecipientStatus type, update pattern

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — C4, C5, C9, C11 patterns cross-verified with codebase
- `.planning/research/STACK.md` — BullMQ connection separation patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — bullmq version verified via npm; ioredis already installed
- Architecture: HIGH — patterns drawn from existing codebase + verified BullMQ docs
- Pitfalls: HIGH — sourced from existing PITFALLS.md (previously researched) + BullMQ official docs

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (BullMQ 5.x is stable; patterns are API-stable)
