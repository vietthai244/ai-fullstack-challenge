# Phase 7: Backend Tests — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 12 new/modified files
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/vitest.config.ts` | config | — | None in codebase (no prior vitest config) | no-analog |
| `backend/test/globalSetup.ts` | config | batch | `backend/src/db/config.cjs` (env loading pattern) | partial |
| `backend/test/setup.ts` | middleware | request-response | `backend/src/middleware/errorHandler.ts` (beforeEach lifecycle) | partial |
| `backend/.env.test` | config | — | `backend/src/config/env.ts` (var names reference) | partial |
| `backend/test/helpers/auth.ts` | utility | request-response | `backend/src/lib/tokens.ts` + `backend/src/services/authService.ts` | role-match |
| `backend/test/helpers/seed.ts` | utility | CRUD | `backend/src/services/campaignService.ts` (createCampaign) | role-match |
| `backend/test/status-guard.test.ts` | test | request-response | `backend/test/smoke/camp-04-patch.sh` + `backend/test/smoke/camp-05-delete.sh` | partial |
| `backend/test/send-atomicity.test.ts` | test | CRUD | `backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh` | partial |
| `backend/test/stats.test.ts` | test | CRUD | `backend/test/smoke/camp-08-stats.sh` | partial |
| `backend/test/auth.test.ts` | test | request-response | `backend/test/smoke/auth-guard.sh` | partial |
| `backend/package.json` (scripts update) | config | — | `backend/package.json` line 11 | exact |
| `backend/tsconfig.json` or `tsconfig.test.json` | config | — | `backend/tsconfig.json` | exact |

---

## Pattern Assignments

### `backend/vitest.config.ts` (config)

**Analog:** No existing vitest.config in codebase — use RESEARCH.md Pattern 1 directly.

**Complete pattern** (from RESEARCH.md):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,   // Vitest 2.x syntax — NOT maxWorkers:1 (that's v4)
      },
    },
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
```

**Critical constraint:** `singleFork: true` is the Vitest **2.x** pool key. Root `package.json` lines 34-37 show `"resolutions": { "vitest": "2.1.9" }` — this syntax is correct and must not be changed to `maxWorkers: 1` (v4 migration syntax).

---

### `backend/test/globalSetup.ts` (config, batch)

**Analog:** `backend/src/db/config.cjs` (env loading pattern for DATABASE_URL_TEST, lines 18-22); `backend/src/config/env.ts` (var names + fail-fast pattern, lines 38-45).

**Env var names to set** (from `backend/src/config/env.ts` EnvSchema, lines 22-32):
```typescript
// All keys env.ts requires — must be set before any src/ import
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
// JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, REDIS_URL, ACCESS_TOKEN_TTL,
// REFRESH_TOKEN_TTL, BCRYPT_COST, PORT — all read from .env.test
```

**Core pattern** (from RESEARCH.md Pattern 2):
```typescript
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

export async function setup() {
  dotenv.config({ path: resolve(import.meta.dirname, '../.env.test') });
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST must be set — see backend/.env.test');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.NODE_ENV = 'test';
  execSync('yarn workspace @campaign/backend db:migrate', { stdio: 'inherit' });
}

export async function teardown() {
  // Leave DB for post-failure debugging — do NOT drop
}
```

**Key:** `dotenv.config()` must load `.env.test` BEFORE any `import` from `src/` fires `env.ts`'s `process.exit(1)`. `globalSetup` runs in a separate process before workers, so this is safe.

---

### `backend/test/setup.ts` (middleware, request-response)

**Analog:** `backend/src/middleware/errorHandler.ts` (file-level lifecycle structure); `backend/src/db/index.ts` (sequelize import pattern, lines 1-9).

**Sequelize import** (from `backend/src/db/index.ts` lines 1-9):
```typescript
// Import path for sequelize instance in tests:
import { sequelize } from '../src/db/index.js';
```

**Core pattern** (from RESEARCH.md Pattern 3):
```typescript
import { beforeEach, afterAll } from 'vitest';
import { sequelize } from '../src/db/index.js';

beforeEach(async () => {
  await sequelize.query(
    `TRUNCATE TABLE campaign_recipients, campaigns, recipients, users
     RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await sequelize.close();
});
```

**Table order:** `campaign_recipients` before `campaigns` before `recipients` before `users` — CASCADE handles FK ordering but explicit order prevents lock contention. Matches Phase 2 migration order (C3).

---

### `backend/.env.test` (config)

**Analog:** `backend/src/config/env.ts` EnvSchema (lines 22-36) — all required keys.

**Required vars** (every key in EnvSchema is mandatory for `process.exit(1)` guard):
```bash
NODE_ENV=test
DATABASE_URL_TEST=postgres://campaign:campaign@localhost:5432/campaigns_test
DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns_test
JWT_ACCESS_SECRET=test-access-secret-at-least-32-chars-aaaaaa
JWT_REFRESH_SECRET=test-refresh-secret-at-least-32-chars-bbbbb
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
BCRYPT_COST=4
PORT=3001
```

**Key constraints from `env.ts`:**
- `JWT_ACCESS_SECRET` min 32 chars (line 26)
- `JWT_REFRESH_SECRET` min 32 chars (line 27)
- `JWT_ACCESS_SECRET !== JWT_REFRESH_SECRET` (lines 33-36 refine)
- `BCRYPT_COST` in [4..15] (line 30) — use 4 (minimum) for test speed
- `PORT=3001` avoids clash with local dev server on 3000

---

### `backend/test/helpers/auth.ts` (utility, request-response)

**Analog:** `backend/src/lib/tokens.ts` (signAccess signature, lines 37-47); `backend/src/db/index.ts` (User model import pattern, line 6).

**signAccess signature** (from `backend/src/lib/tokens.ts` lines 37-47):
```typescript
// signAccess accepts { id: number | string; email: string }
export function signAccess(user: { id: number | string; email: string }): string {
  const payload: AccessPayload = { sub: String(user.id), email: user.email, type: 'access' };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: config.ACCESS_TOKEN_TTL });
}
```

**User model import** (from `backend/src/db/index.ts` line 6):
```typescript
import { User } from '../../src/db/index.js';
```

**Core helper pattern** (from RESEARCH.md Pattern 4):
```typescript
import { signAccess } from '../../src/lib/tokens.js';
import { User } from '../../src/db/index.js';

export async function createTestUser(email: string): Promise<User> {
  return User.create({
    email,
    passwordHash: '$2b$04$dummy.hash.not.verifiable',
    name: 'Test User',
  });
}

export function makeToken(user: User): string {
  return signAccess({ id: user.id, email: user.email });
}
```

**Why direct `User.create` not `authService.registerUser`:** Avoids bcrypt even at cost=4. Tests don't exercise login — only the JWT middleware. Direct insert with a dummy hash is faster and removes bcrypt as a test dependency.

---

### `backend/test/helpers/seed.ts` (utility, CRUD)

**Analog:** `backend/src/services/campaignService.ts` (createCampaign transaction pattern, lines 88-118; `CampaignRecipient.bulkCreate` pattern, lines 105-114).

**Campaign.create pattern** (from `backend/src/services/campaignService.ts` lines 95-103):
```typescript
const campaign = await Campaign.create({
  name: input.name,
  subject: input.subject,
  body: input.body,
  createdBy: userId,
}, { transaction: t });
```

**CampaignRecipient.bulkCreate pattern** (lines 105-114):
```typescript
await CampaignRecipient.bulkCreate(
  recipientIds.map((rid) => ({
    campaignId: campaign.id,
    recipientId: Number(rid),
    status: 'pending' as const,
  })),
  { transaction: t, ignoreDuplicates: true },
);
```

**Model imports** (from `backend/src/db/index.ts` line 42):
```typescript
import { sequelize, Campaign, Recipient, CampaignRecipient, User } from '../../src/db/index.js';
```

**Required seed functions:**
- `seedDraftCampaign(userId)` — creates Campaign with status='draft' + at least 1 CampaignRecipient
- `seedSentCampaign(userId)` — creates Campaign with status='sent' (bypasses service, direct model update)
- `seedCampaignWithRecipients(userId, distribution)` — seeds known recipient status distribution for TEST-03

**BIGINT coercion:** `Number(campaign.id)` when constructing URL paths (Pitfall 3 from RESEARCH.md — pg returns BIGINT as string).

---

### `backend/test/status-guard.test.ts` (test, request-response)

**Analog:** `backend/test/smoke/camp-04-patch.sh` + `backend/test/smoke/camp-05-delete.sh`; `backend/src/routes/campaigns.ts` (endpoint paths, lines 66-94).

**Route paths to exercise** (from `backend/src/routes/campaigns.ts`):
- PATCH `/:id` — line 66 — throws `ConflictError('CAMPAIGN_NOT_EDITABLE')` via `campaignService.updateCampaign`
- DELETE `/:id` — line 81 — throws `ConflictError('CAMPAIGN_NOT_EDITABLE')` via `campaignService.deleteCampaign`
- POST `/:id/send` — line 112 — throws `ConflictError('CAMPAIGN_NOT_SENDABLE')` via `campaignService.triggerSend`

**Error shape** (from `backend/src/middleware/errorHandler.ts` lines 29-34):
```typescript
// HttpError → { error: { code, message } }
res.status(err.status).json({ error: { code: err.code, message: err.message } });
```

**Error codes** (from `backend/src/services/campaignService.ts`):
- `updateCampaign` line 185: `ConflictError('CAMPAIGN_NOT_EDITABLE')`
- `deleteCampaign` line 228: `ConflictError('CAMPAIGN_NOT_EDITABLE')`
- `triggerSend` line 306: `ConflictError('CAMPAIGN_NOT_SENDABLE')`

**buildApp import** (from `backend/src/app.ts` line 29):
```typescript
import { buildApp } from '../src/app.js';
```

**Core test pattern** (from RESEARCH.md TEST-01 skeleton):
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedSentCampaign } from './helpers/seed.js';

describe('TEST-01: status guards', () => {
  let token: string;
  let campaignId: number;
  const app = buildApp();  // one instance per describe block

  beforeAll(async () => {
    const user = await createTestUser('guard@example.com');
    token = makeToken(user);
    const campaign = await seedSentCampaign(user.id);
    campaignId = Number(campaign.id);  // BIGINT coercion
  });

  it('PATCH → 409 CAMPAIGN_NOT_EDITABLE', async () => {
    const res = await request(app)
      .patch(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_EDITABLE');
  });
});
```

---

### `backend/test/send-atomicity.test.ts` (test, CRUD)

**Analog:** `backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh` (concurrent pattern, lines 26-51).

**Concurrent pattern from smoke** (lines 26-51): Two parallel curl calls + wait, then assert one 202 one 409.

**Supertest translation** (from RESEARCH.md Pattern 5):
```typescript
it('concurrent POST /send → exactly one 202 and one 409', async () => {
  const campaign = await seedDraftCampaign(user.id);
  const app = buildApp();

  const [r1, r2] = await Promise.all([
    request(app).post(`/campaigns/${Number(campaign.id)}/send`)
      .set('Authorization', `Bearer ${token}`),
    request(app).post(`/campaigns/${Number(campaign.id)}/send`)
      .set('Authorization', `Bearer ${token}`),
  ]);

  const statuses = [r1.status, r2.status].sort();
  expect(statuses).toEqual([202, 409]);
});
```

**Why this works:** `Campaign.update WHERE status IN ('draft','scheduled')` at `campaignService.ts` line 296 — Postgres serializes row-level lock. One rowCount=1 (202), one rowCount=0 → `ConflictError` (409).

**Redis dependency note:** This test exercises `triggerSend` which calls `sendQueue.add()` (`lib/queue.ts` line 26). Redis must be reachable at `REDIS_URL` in `.env.test` or the enqueue at line 308 will throw and roll back. If mocking queue: `vi.mock('../src/lib/queue.js', () => ({ sendQueue: { add: vi.fn().mockResolvedValue(undefined) } }))`.

---

### `backend/test/stats.test.ts` (test, CRUD)

**Analog:** `backend/test/smoke/camp-08-stats.sh` (stats assertion pattern, lines 27-51); `backend/src/services/campaignService.ts` `computeCampaignStats` (SQL output types, lines 240-287).

**Stats response shape** (from `backend/src/services/campaignService.ts` lines 279-286):
```typescript
// computeCampaignStats returns Stats type:
{
  total: number,   // parseInt
  sent: number,    // parseInt
  failed: number,  // parseInt
  opened: number,  // parseInt
  open_rate: number | null,   // parseFloat or null (NULLIF guard)
  send_rate: number | null,   // parseFloat or null (NULLIF guard)
}
```

**Divide-by-zero guard** (lines 257-264): `NULLIF(COUNT(*), 0)` — zero recipients → `open_rate: null, send_rate: null`.

**Direct bulkCreate seed pattern** (from RESEARCH.md Pattern 6):
```typescript
// Bypass service layer — direct model insert for known distribution
await CampaignRecipient.bulkCreate([
  { campaignId, recipientId: r1.id, status: 'sent', openedAt: new Date() },
  { campaignId, recipientId: r2.id, status: 'sent', openedAt: new Date() },
  { campaignId, recipientId: r3.id, status: 'sent', openedAt: null },
  { campaignId, recipientId: r4.id, status: 'sent', openedAt: null },
  { campaignId, recipientId: r5.id, status: 'sent', openedAt: null },
  { campaignId, recipientId: r6.id, status: 'failed' },
  { campaignId, recipientId: r7.id, status: 'failed' },
  { campaignId, recipientId: r8.id, status: 'failed' },
  { campaignId, recipientId: r9.id, status: 'pending' },
  { campaignId, recipientId: r10.id, status: 'pending' },
]);
// Expect: total=10, sent=5, failed=3, opened=2, send_rate=0.80, open_rate=0.20
```

**Stats endpoint** (from `backend/src/routes/campaigns.ts` lines 96-109):
```typescript
// GET /campaigns/:id/stats → { data: Stats }
// Response wrapped in { data: ... } envelope
expect(res.body.data).toMatchObject({ total: 10, ... });
```

---

### `backend/test/auth.test.ts` (test, request-response)

**Analog:** `backend/src/middleware/authenticate.ts` (error codes, lines 41-52); `backend/test/smoke/auth-guard.sh`.

**Error codes** (from `backend/src/middleware/authenticate.ts`):
- Missing header (line 41-43): `UnauthorizedError('MISSING_TOKEN')` → 401
- Bad token (line 49-51): `UnauthorizedError('INVALID_TOKEN')` → 401

**Cross-user 404** (from `backend/src/services/campaignService.ts` line 145):
```typescript
if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');
// getCampaignDetail WHERE id = campaignId AND createdBy = userId
// → userId mismatch = no row found = 404 (AUTH-07 enumeration defense)
```

**Core pattern** (from RESEARCH.md TEST-04 skeleton):
```typescript
it('401 on missing Authorization header', async () => {
  const res = await request(app).get('/campaigns');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('MISSING_TOKEN');
});

it('401 on tampered token', async () => {
  const res = await request(app)
    .get('/campaigns')
    .set('Authorization', 'Bearer not.a.valid.jwt');
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe('INVALID_TOKEN');
});

it('404 (not 403) cross-user campaign', async () => {
  // userA's token, userB's campaign → 404 per AUTH-07
  const res = await request(app)
    .get(`/campaigns/${Number(campaignB.id)}`)
    .set('Authorization', `Bearer ${tokenA}`);
  expect(res.status).toBe(404);
  // No .body.error.code assertion needed — just 404 is the contract
});
```

---

### `backend/package.json` (scripts update)

**Analog:** `backend/package.json` line 11 (exact).

**Current** (line 11):
```json
"test": "echo 'backend tests land in Phase 7' && exit 0"
```

**Replace with:**
```json
"test": "vitest run"
```

---

## Shared Patterns

### Supertest + buildApp usage
**Source:** `backend/src/app.ts` lines 29-60
**Apply to:** All four test files
```typescript
import request from 'supertest';
import { buildApp } from '../src/app.js';

// In describe block (not per-it):
const app = buildApp();

// In each test:
const res = await request(app)
  .METHOD('/path')
  .set('Authorization', `Bearer ${token}`)
  .send(body);
```
**Rule:** Call `buildApp()` once per `describe` block in `beforeAll` or at describe scope. Never call `.listen()`. Never call `buildApp()` per-request — it's side-effect-free but wasteful.

### Error response shape assertion
**Source:** `backend/src/middleware/errorHandler.ts` lines 29-34
**Apply to:** All 409 / 401 assertions in test files
```typescript
// All errors: { error: { code: string, message: string } }
expect(res.body.error.code).toBe('CAMPAIGN_NOT_EDITABLE');
expect(res.body.error.code).toBe('MISSING_TOKEN');
```

### BIGINT ID coercion
**Source:** `backend/src/routes/campaigns.ts` line 55 pattern
**Apply to:** All test files that construct URL paths with seeded IDs
```typescript
// pg returns BIGINT as string — coerce before URL construction
const campaignId = Number(campaign.id);
request(app).get(`/campaigns/${campaignId}/stats`)
```

### Token minting
**Source:** `backend/src/lib/tokens.ts` lines 37-47 (`signAccess`)
**Apply to:** All test files via `helpers/auth.ts`
```typescript
import { makeToken } from './helpers/auth.js';
// makeToken calls signAccess({ id: user.id, email: user.email }) directly
// No mock needed — real JWT with real secret from .env.test
const token = makeToken(user);
```

### Model imports in test helpers
**Source:** `backend/src/db/index.ts` lines 4-9
**Apply to:** `helpers/seed.ts`, `helpers/auth.ts`
```typescript
import { sequelize, Campaign, CampaignRecipient, Recipient, User } from '../../src/db/index.js';
```
**Note:** `db/index.ts` imports `dotenv/config` at line 2 and throws on missing `DATABASE_URL` at line 11. `globalSetup.ts` must set `process.env.DATABASE_URL` before any test file imports `db/index.ts`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/vitest.config.ts` | config | — | No prior test runner config in codebase; no frontend vitest.config yet either |

---

## Metadata

**Analog search scope:** `backend/src/` (all), `backend/test/smoke/` (all), root `package.json`, `backend/package.json`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-04-21
