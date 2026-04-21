# Phase 5: Async Send Queue (Schedule + Send) - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 7
**Analogs found:** 6 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/lib/queue.ts` | lib/config | event-driven | `backend/src/lib/redis.ts` | role-match |
| `backend/src/services/sendWorker.ts` | service | event-driven | `backend/src/services/campaignService.ts` (transaction pattern) | partial-match |
| `backend/src/services/campaignService.ts` (add triggerSend + scheduleCampaign) | service | CRUD | self — existing functions in same file | exact |
| `backend/src/routes/campaigns.ts` (add POST /:id/send + POST /:id/schedule) | route/controller | request-response | self — existing handlers in same file | exact |
| `backend/src/index.ts` (extend shutdown hook) | config/bootstrap | request-response | self — existing shutdown function | exact |
| `shared/src/schemas/campaign.ts` (add ScheduleCampaignSchema) | schema | transform | self — existing schemas in same file | exact |
| `backend/test/smoke/05-send-queue/` | test | request-response | `backend/test/smoke/camp-02-create.sh` + `camp-05-delete.sh` | exact |

---

## Pattern Assignments

### `backend/src/lib/queue.ts` (lib, event-driven)

**Analog:** `backend/src/lib/redis.ts`

**Imports pattern** (`backend/src/lib/redis.ts` lines 16-18):
```typescript
import { Redis as IORedis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';
```

**Connection + event listener pattern** (`backend/src/lib/redis.ts` lines 20-25):
```typescript
export const redis = new IORedis(config.REDIS_URL, {
  lazyConnect: false,
});

redis.on('error', (err: Error) => logger.error({ err }, 'redis client error'));
redis.on('connect', () => logger.debug('redis connected'));
```

**Critical difference for queue.ts:** The auth redis omits `maxRetriesPerRequest: null` intentionally (lines 9-11 of redis.ts explain why). The queue module MUST add it to both IORedis instances:
```typescript
// Two separate connections — never share between Queue and Worker
const queueConn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerConn = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

queueConn.on('error', (err: Error) => logger.error({ err }, 'queue redis error'));
workerConn.on('error', (err: Error) => logger.error({ err }, 'worker redis error'));
```

**Worker event listener pattern** (new — BullMQ mandatory QUEUE-04):
```typescript
sendWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error({ jobId: job?.id, campaignId: job?.data?.campaignId, err }, 'send job failed');
});
sendWorker.on('error', (err: Error) => {
  logger.error({ err }, 'send worker connection error');
});
```

---

### `backend/src/services/sendWorker.ts` (service, event-driven)

**Analog:** `backend/src/services/campaignService.ts` — `sequelize.transaction()` + `Campaign.findOne` + `CampaignRecipient` update pattern.

**Imports pattern** (`backend/src/services/campaignService.ts` lines 12-16):
```typescript
import { QueryTypes } from 'sequelize';
import { sequelize, Campaign, Recipient, CampaignRecipient } from '../db/index.js';
import { ConflictError, NotFoundError } from '../util/errors.js';
import type { Transaction } from 'sequelize';
import type { CreateCampaignInput, UpdateCampaignInput, Stats } from '@campaign/shared';
```

For sendWorker.ts, use:
```typescript
import type { Job } from 'bullmq';
import { sequelize, Campaign, CampaignRecipient } from '../db/index.js';
import { logger } from '../util/logger.js';
```

**Transaction pattern** (`backend/src/services/campaignService.ts` lines 91-116 createCampaign, lines 216-231 deleteCampaign):
```typescript
// deleteCampaign transaction pattern (lines 216-231) — cleanest analog for worker tx:
await sequelize.transaction(async (t) => {
  const campaign = await Campaign.findOne({
    where: { id: campaignId, createdBy: userId },
    transaction: t,
  });
  if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');

  const [count] = await Campaign.update(
    { updatedAt: new Date() },
    { where: { id: campaignId, createdBy: userId, status: 'draft' }, transaction: t },
  );
  if (count === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');

  await Campaign.destroy({ where: { id: campaignId, createdBy: userId }, transaction: t });
});
```

**Status re-check + early bail pattern** (QUEUE-03 — adapted from getCampaignDetail 404 guard, lines 144):
```typescript
// Early bail — not an error; BullMQ must NOT see this as failure
const campaign = await Campaign.findByPk(campaignId);
if (!campaign || campaign.status !== 'sending') {
  logger.info({ campaignId, status: campaign?.status }, 'send job skipped — not in sending');
  return;
}
```

**No error swallowing:** Do NOT wrap the `sequelize.transaction(...)` call in try/catch. Errors must propagate so BullMQ marks the job failed (C4). The only allowed early return is the status re-check bail above.

---

### `backend/src/services/campaignService.ts` — add `triggerSend()` and `scheduleCampaign()` (service, CRUD)

**Analog:** Existing `deleteCampaign` function in same file (lines 215-231) — same `[count] = Campaign.update` atomic guard pattern.

**Existing `[count]` atomic guard pattern** (`backend/src/services/campaignService.ts` lines 223-228):
```typescript
const [count] = await Campaign.update(
  { updatedAt: new Date() },
  { where: { id: campaignId, createdBy: userId, status: 'draft' }, transaction: t },
);
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');
```

**`triggerSend` must use same pattern** — no `sequelize.transaction()` wrapper needed (atomic UPDATE is itself the guard; no other writes in this function):
```typescript
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
```

**Import additions needed** — `Op` is not yet imported in campaignService.ts (line 12 only has `QueryTypes`):
```typescript
import { QueryTypes, Op } from 'sequelize';
```

**Error type pattern** (`backend/src/services/campaignService.ts` line 14 — existing imports):
```typescript
import { ConflictError, NotFoundError } from '../util/errors.js';
```

---

### `backend/src/routes/campaigns.ts` — add POST /:id/send + POST /:id/schedule (route, request-response)

**Analog:** Existing handlers in same file — especially DELETE /:id (lines 81-93) and GET /:id (lines 50-62).

**Handler shape pattern** (`backend/src/routes/campaigns.ts` lines 81-93):
```typescript
campaignsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      await campaignService.deleteCampaign(campaignId, req.user!.id);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
);
```

**New handlers use same shape** — only differences: method is `post`, status code is `202`, and body validation for schedule:
```typescript
// POST /:id/send — no body needed; just ID guard
campaignsRouter.post(
  '/:id/send',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      await campaignService.triggerSend(campaignId, req.user!.id);
      res.status(202).json({ data: { id: campaignId, status: 'sending' } });
    } catch (err) { next(err); }
  },
);

// POST /:id/schedule — body validated with ScheduleCampaignSchema
campaignsRouter.post(
  '/:id/schedule',
  validate(ScheduleCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = Number(req.params.id);
      if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
      await campaignService.scheduleCampaign(campaignId, req.user!.id, req.body.scheduled_at);
      res.status(202).json({ data: { id: campaignId, status: 'scheduled' } });
    } catch (err) { next(err); }
  },
);
```

**Validate middleware pattern** (`backend/src/routes/campaigns.ts` lines 6-11 imports, line 38 usage):
```typescript
import { validate } from '../middleware/validate.js';
// Usage: validate(Schema) for body, validate(Schema, 'query') for query params
```

**ScheduleCampaignSchema import** — add to the existing named imports from `@campaign/shared`:
```typescript
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  OffsetPageQuerySchema,
  ScheduleCampaignSchema,   // ADD
} from '@campaign/shared';
```

---

### `backend/src/index.ts` — extend shutdown hook (bootstrap, request-response)

**Analog:** Existing shutdown function in same file (lines 34-42).

**Existing shutdown pattern** (`backend/src/index.ts` lines 34-41):
```typescript
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.allSettled([sequelize.close(), redis.quit()]);
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
```

**Extended version** — add queue/worker to `Promise.allSettled` array and import at top:
```typescript
import { sendQueue, sendWorker } from './lib/queue.js';   // ADD to imports

// In shutdown():
await Promise.allSettled([
  sequelize.close(),
  redis.quit(),
  sendQueue.close(),
  sendWorker.close(),   // waits for active job slot
]);
```

---

### `shared/src/schemas/campaign.ts` — add ScheduleCampaignSchema (schema, transform)

**Analog:** Existing schemas in same file — especially `UpdateCampaignSchema` (lines 16-24) showing `.refine()` usage, and `CursorPageQuerySchema` (lines 35-39) showing simple object shape.

**Existing schema pattern** (`shared/src/schemas/campaign.ts` lines 16-24):
```typescript
export const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  // ...
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
```

**New schema** — add after existing exports:
```typescript
// CAMP-06 — Schedule request body (shape only; future-date check belongs in service layer)
export const ScheduleCampaignSchema = z.object({
  scheduled_at: z.string().datetime({ message: 'scheduled_at must be ISO 8601' }),
});
export type ScheduleCampaignInput = z.infer<typeof ScheduleCampaignSchema>;
```

**Export from index** — check `shared/src/schemas/index.ts` and add `ScheduleCampaignSchema` + `ScheduleCampaignInput` to its re-exports.

---

### `backend/test/smoke/05-send-queue/` (test scripts, request-response)

**Analog:** `backend/test/smoke/camp-02-create.sh` and `camp-05-delete.sh` — same shell pattern throughout.

**Script header + login pattern** (`backend/test/smoke/camp-02-create.sh` lines 1-14):
```bash
#!/usr/bin/env bash
# backend/test/smoke/camp-06-schedule.sh — CAMP-06
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

code=$(curl -sS -o /tmp/smoke-camp06-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-06 login: got $code"; cat /tmp/smoke-camp06-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp06-login.json)
```

**Assertion pattern** (`backend/test/smoke/camp-02-create.sh` lines 27-29):
```bash
jq -e '.data.status == "draft"' /tmp/smoke-camp02.json >/dev/null
jq -e '.data.id | (type == "number" or type == "string")' /tmp/smoke-camp02.json >/dev/null
```

**202 assertion for send/schedule:**
```bash
test "$code" = "202" || { echo "FAIL camp-07 send: got $code (expected 202)"; cat /tmp/smoke-camp07.json; exit 1; }
jq -e '.data.status == "sending"' /tmp/smoke-camp07.json >/dev/null
```

**409 assertion for conflict** (`backend/test/smoke/camp-05-delete.sh` lines 27-30):
```bash
test "$code" = "409" || { echo "FAIL camp-05 non-draft delete: got $code (expected 409)"; cat /tmp/smoke-camp05-409.json; exit 1; }
jq -e '.error.code == "CAMPAIGN_NOT_EDITABLE"' /tmp/smoke-camp05-409.json >/dev/null
```

**run-all runner pattern** (`backend/test/smoke/run-all-phase4.sh` lines 1-30) — create `run-all-phase5.sh` with same structure: sanity health check, then sequential `bash "$HERE/camp-XX.sh"` calls.

---

## Shared Patterns

### IORedis connection creation
**Source:** `backend/src/lib/redis.ts` lines 16-25
**Apply to:** `backend/src/lib/queue.ts`
```typescript
import { Redis as IORedis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';

export const redis = new IORedis(config.REDIS_URL, {
  lazyConnect: false,
});
redis.on('error', (err: Error) => logger.error({ err }, 'redis client error'));
```
Copy import+instantiation pattern; add `maxRetriesPerRequest: null`; remove `lazyConnect` (default is fine for queue).

### Error types
**Source:** `backend/src/util/errors.ts`
**Apply to:** `backend/src/services/campaignService.ts` (new functions)
```typescript
import { ConflictError, NotFoundError } from '../util/errors.js';
// ConflictError → 409; NotFoundError → 404; BadRequestError → 400
```

### Atomic `[count]` guard
**Source:** `backend/src/services/campaignService.ts` lines 223-228
**Apply to:** `triggerSend`, `scheduleCampaign` (no transaction wrapper needed — UPDATE is the only write)
```typescript
const [count] = await Campaign.update(
  { status: 'sending' },
  { where: { id: campaignId, createdBy: userId, status: { [Op.in]: ['draft', 'scheduled'] } } },
);
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_SENDABLE');
```

### Thin route handler (validate → parseInt → service → envelope)
**Source:** `backend/src/routes/campaigns.ts` lines 50-62 (GET /:id)
**Apply to:** POST /:id/send, POST /:id/schedule
```typescript
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0) throw new BadRequestError('INVALID_CAMPAIGN_ID');
    // ... service call ...
    res.status(202).json({ data: { ... } });
  } catch (err) {
    next(err);
  }
}
```

### Sequelize transaction wrapper
**Source:** `backend/src/services/campaignService.ts` lines 160-207 (updateCampaign) and 216-231 (deleteCampaign)
**Apply to:** `backend/src/services/sendWorker.ts` `processSendJob`
```typescript
await sequelize.transaction(async (t) => {
  // all DB reads and writes use { transaction: t }
});
// No try/catch around transaction — let errors propagate to BullMQ
```

### Smoke script boilerplate
**Source:** `backend/test/smoke/camp-02-create.sh` lines 1-14
**Apply to:** All scripts in `backend/test/smoke/05-send-queue/`
Same shebang, `set -euo pipefail`, `BASE`/`EMAIL`/`PASSWORD` env defaults, login block, token extraction.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/lib/queue.ts` (BullMQ Queue+Worker instantiation) | lib | event-driven | No BullMQ usage exists yet; redis.ts provides IORedis pattern only |

The Queue/Worker construction (`new Queue(...)`, `new Worker(...)`) and the delayed-job `queue.add(..., { delay })` API have no codebase analog — use RESEARCH.md Code Examples section directly.

---

## Metadata

**Analog search scope:** `backend/src/lib/`, `backend/src/services/`, `backend/src/routes/`, `backend/src/index.ts`, `shared/src/schemas/`, `backend/test/smoke/`
**Files scanned:** 10
**Pattern extraction date:** 2026-04-21
