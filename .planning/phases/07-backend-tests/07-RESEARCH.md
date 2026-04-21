# Phase 7: Backend Tests — Research

**Researched:** 2026-04-21
**Domain:** Vitest 2.1.9 + Supertest + Postgres + Redis integration testing
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Status-guard 409 on PATCH/DELETE/POST /send for non-draft campaign | `ConflictError` thrown from service → errorHandler maps to `{ error: { code, message } }`; test seeds sent campaign, hits three endpoints, asserts 409 each time |
| TEST-02 | Concurrent-send atomicity: two parallel POST /send → exactly one 202, one 409 | `Campaign.update WHERE status IN ('draft','scheduled')` rowCount atomic guard in `triggerSend()` — proven by Promise.all + response status counting |
| TEST-03 | Stats aggregation correctness with known seed data | `computeCampaignStats` uses single COUNT(*) FILTER aggregate; test seeds known distribution of pending/sent/failed/opened rows and verifies exact numeric output |
| TEST-04 | Auth middleware: 401 missing token, 401 tampered token, 404 cross-user | `authenticate` throws `UnauthorizedError('MISSING_TOKEN' / 'INVALID_TOKEN')`; cross-user path hits `NotFoundError('CAMPAIGN_NOT_FOUND')` = 404 |
</phase_requirements>

---

## Summary

Phase 7 adds a Vitest 2.1.9 + Supertest integration test suite that exercises the four backend business rules that matter most: status-machine guards (TEST-01), concurrent-send atomicity (TEST-02), aggregate stats correctness (TEST-03), and auth boundary enforcement (TEST-04). All four tests hit real Postgres and real Redis — no mocking of Sequelize, no in-memory DB substitutes.

The codebase is well-structured for this phase. `buildApp()` is already a factory that returns an Express app without binding a port, which is the exact pattern Supertest requires. All business rules are in `campaignService.ts` and enforced server-side. The error hierarchy in `errors.ts` maps directly to stable HTTP status codes via `errorHandler.ts`. No structural changes to production code are needed.

The primary risk is infrastructure: Redis is not currently running locally (port 6379 unreachable), so either a local Redis must be started or the `lib/queue.ts` import must be isolated in test setup. The `db/index.ts` module reads `DATABASE_URL` at import time and will crash without it — tests need `NODE_ENV=test` + `DATABASE_URL_TEST` in a `.env.test` file. A test DB (`campaigns_test`) does not yet exist; creating and migrating it is a Wave 0 prerequisite.

**Primary recommendation:** One vitest.config.ts with `pool: 'forks', poolOptions: { forks: { singleFork: true } }`, one `globalSetup` file that creates the test DB + runs migrations, one `setupFiles` module that seeds env vars and adds the `beforeEach` TRUNCATE, and four focused test files (one per requirement).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP request fabrication | Test harness (Supertest) | — | `request(buildApp())` creates ephemeral server, no port binding |
| DB isolation between tests | Test setup (`beforeEach` TRUNCATE) | — | singleFork means all test files share one process; TRUNCATE resets state |
| DB schema bootstrap | `globalSetup` (migrations) | Wave 0 create-DB script | Migrations must run once before any test file executes |
| Auth token minting | `lib/tokens.ts` (signAccess) | — | Tests call `signAccess()` directly — no fake JWT library needed |
| BullMQ / Redis coupling | `lib/queue.ts` module | Test isolation via env | Queue module auto-connects to REDIS_URL; tests must either run Redis or not import queue |
| Stats correctness | `campaignService.computeCampaignStats` | DB seed in test | Service is pure SQL; test seeds exact counts and asserts exact output |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 2.1.9 (pinned via root resolutions) | Test runner | Locked by C18 — do not upgrade; Vite 5 compat |
| supertest | 7.2.2 (latest) | HTTP assertion layer over Express | De-facto standard for Express integration tests; Supertest auto-manages ephemeral port |
| @types/supertest | 7.2.0 (latest) | TypeScript types for supertest | Required for typed `.expect()` chains |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/coverage-v8 | 2.1.9 (pinned) | Coverage reports | Optional for this phase; pin to 2.1.9 |
| dotenv | already in backend deps | Load `.env.test` in globalSetup | Needed to feed DATABASE_URL_TEST to db/index.ts |

**Version verification:** [VERIFIED: npm registry]
- `vitest@latest` = 4.1.5 — root `resolutions` pins to 2.1.9 (C18)
- `supertest@latest` = 7.2.2 — CJS package with `main: index.js`; no named ESM export, but Vitest's transform pipeline handles the CommonJS interop transparently
- `@types/supertest@latest` = 7.2.0

**Installation:**
```bash
yarn workspace @campaign/backend add --dev vitest@2.1.9 supertest @types/supertest
```

---

## Architecture Patterns

### System Architecture Diagram

```
Test File (describe/it)
    │
    ├── beforeAll: signAccess(testUser) → store token
    ├── beforeEach: TRUNCATE ... RESTART IDENTITY CASCADE → seed helper
    │
    ▼
request(buildApp())   ← Supertest creates ephemeral Express server (no port bind)
    │
    ├── .set('Authorization', `Bearer ${token}`)
    ├── .send(body)
    ▼
Express App (buildApp)
    ├── campaignsRouter → authenticate → handler → campaignService
    │       └── Sequelize → real Postgres (campaigns_test DB)
    │
    └── BullMQ sendQueue.add() → real Redis (localhost:6379)
              (TEST-02 concurrent send only)
```

### Recommended Project Structure
```
backend/
├── src/
│   ├── ...existing sources...
├── test/
│   ├── globalSetup.ts        # create DB + run migrations once
│   ├── setup.ts              # beforeEach TRUNCATE + env bootstrap
│   ├── helpers/
│   │   ├── auth.ts           # makeToken(user), createTestUser()
│   │   └── seed.ts           # seedCampaign(), seedCampaignWithRecipients()
│   ├── status-guard.test.ts  # TEST-01
│   ├── send-atomicity.test.ts # TEST-02
│   ├── stats.test.ts         # TEST-03
│   └── auth.test.ts          # TEST-04
└── vitest.config.ts
```

### Pattern 1: vitest.config.ts — singleFork serialization

**What:** Forces all test files to run in a single forked process, sharing one Sequelize connection pool and one Redis connection. Prevents concurrent DB mutations from racing.
**When to use:** Any test suite that writes to a shared database (no per-test transaction rollback).

```typescript
// backend/vitest.config.ts
// Source: https://vitest.dev/config/ (Vitest 2.x — singleFork is poolOptions.forks sub-key)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,   // All test files run in one forked process — shared DB pool
      },
    },
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,   // Postgres + BullMQ can be slow
    hookTimeout: 30_000,
  },
});
```

**CRITICAL:** This is the Vitest **2.x** syntax for `singleFork`. In Vitest 4.x the migration guide shows this moves to `maxWorkers: 1` at the top level. Since the project pins 2.1.9, `poolOptions.forks.singleFork` is correct.
[VERIFIED: Context7 / vitest migration guide confirms this is the pre-v4 syntax]

### Pattern 2: globalSetup.ts — one-time DB + migration

**What:** Runs once before all workers start. Creates the test DB if it doesn't exist, runs Sequelize migrations.
**When to use:** Any integration test that needs a real DB schema.

```typescript
// backend/test/globalSetup.ts
import { execSync } from 'node:child_process';

export async function setup() {
  // Ensure DATABASE_URL_TEST is set — fail fast if missing
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST must be set — see backend/.env.test.example');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.NODE_ENV = 'test';

  // Create DB if not exists (idempotent — error on "already exists" is swallowed)
  // Then run migrations
  execSync('yarn workspace @campaign/backend db:migrate', { stdio: 'inherit' });
}

export async function teardown() {
  // Do NOT drop the DB — leave it for inspect post-failure debugging
}
```

**Alternative approach:** Create the DB with raw `pg` client before migration to avoid the "CREATE DATABASE" error. Either way, migrations run idempotently.

### Pattern 3: setup.ts — beforeEach TRUNCATE

**What:** Runs before every test (not just every file), truncates all tables, resets sequences. Ensures complete isolation between tests regardless of test ordering.
**When to use:** Every backend integration test suite.

```typescript
// backend/test/setup.ts
// Source: CLAUDE.md §1 + ROADMAP Phase 7 success criterion 1
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

**Why TRUNCATE over DELETE:** TRUNCATE … RESTART IDENTITY CASCADE resets the BIGSERIAL sequences so test data always starts at id=1. Without RESTART IDENTITY, long-running test sessions accumulate large IDs and BIGINT returned as string can cause subtle assertion drift.

### Pattern 4: Token minting in tests

**What:** Tests use the actual `signAccess()` function from `lib/tokens.ts` to mint real JWTs. No need to mock the auth middleware.
**When to use:** Any test that needs to call a protected endpoint.

```typescript
// backend/test/helpers/auth.ts
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

**Why:** This approach requires `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to be set in the test env. Set them to fixed 32-char test values in `.env.test`.

### Pattern 5: Concurrent-send test (TEST-02)

**What:** Fires two requests in parallel and asserts that the atomic DB guard produces exactly one 202 and one 409.

```typescript
// backend/test/send-atomicity.test.ts
it('concurrent POST /send → exactly one 202 and one 409', async () => {
  const campaign = await seedDraftCampaign(userA);
  const app = buildApp();

  const [r1, r2] = await Promise.all([
    request(app).post(`/campaigns/${campaign.id}/send`).set('Authorization', `Bearer ${tokenA}`),
    request(app).post(`/campaigns/${campaign.id}/send`).set('Authorization', `Bearer ${tokenA}`),
  ]);

  const statuses = [r1.status, r2.status].sort();
  expect(statuses).toEqual([202, 409]);
});
```

**Why this works:** Postgres's `UPDATE … WHERE status IN ('draft','scheduled')` is serialized within a transaction. One request wins the row lock; the other gets rowCount=0 and throws ConflictError. The BullMQ enqueue happens AFTER the atomic guard, so only one job is queued. [VERIFIED: campaignService.ts triggerSend()]

### Pattern 6: Stats seed and assertion (TEST-03)

**What:** Bypasses the service layer to directly insert known CampaignRecipient rows, then calls the stats endpoint and asserts exact values.

```typescript
// Known distribution: 5 sent (2 opened), 3 failed, 2 pending = 10 total
// Expected: total=10, sent=5, failed=3, opened=2, send_rate=0.80, open_rate=0.20
await CampaignRecipient.bulkCreate([
  // 5 rows with status='sent', 2 with openedAt set
  // 3 rows with status='failed'
  // 2 rows with status='pending'
], { transaction: t });

const res = await request(app)
  .get(`/campaigns/${campaign.id}/stats`)
  .set('Authorization', `Bearer ${token}`);

expect(res.status).toBe(200);
expect(res.body.data).toMatchObject({
  total: 10, sent: 5, failed: 3, opened: 2,
  open_rate: 0.20, send_rate: 0.80,
});
```

**Edge case — divide-by-zero:** Also seed a campaign with ZERO recipients and assert `open_rate: null, send_rate: null`. This exercises the `NULLIF` guard in `computeCampaignStats`.

### Pattern 7: env.ts startup check workaround

**What:** `backend/src/config/env.ts` calls `process.exit(1)` at module import if env vars are missing. Tests must set env vars BEFORE importing any backend module.
**When to use:** Always in `globalSetup.ts` — set `process.env.DATABASE_URL`, `JWT_ACCESS_SECRET`, etc. before any `import` from `src/`.

**How:** Use `.env.test` (loaded by `dotenv` before globalSetup runs) OR set vars explicitly at the top of `globalSetup.ts`.

```typescript
// .env.test (committed, no secrets)
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

**BCRYPT_COST=4:** Dramatically speeds up any test that uses `bcrypt.hash` (test user creation). Cost 4 is the minimum allowed by `env.ts`'s Zod schema.

### Anti-Patterns to Avoid

- **Importing `lib/queue.ts` without Redis:** `lib/queue.ts` creates two IORedis connections at import time. If Redis is not running, the import doesn't throw immediately but connection errors propagate asynchronously. For TEST-01, TEST-03, TEST-04 (which don't exercise queue), the import still happens via the module graph. Solution: either ensure Redis is available in the test env, or refactor `buildApp()` to lazy-init the queue (not recommended — changes production code). Simplest solution: run Redis locally during tests.
- **Using `sequelize.sync()` in test setup:** CLAUDE.md explicitly forbids this. Use migrations only (globalSetup runs `db:migrate`).
- **Port binding in tests:** Never call `buildApp().listen()` in tests. Always pass the Express app directly to `request(buildApp())`.
- **Global `beforeAll` for all test files:** Each test file should have its own `beforeAll` for user/token setup; only the TRUNCATE belongs in the shared `setupFiles` module.
- **Sharing `app` across concurrent requests:** `buildApp()` is side-effect-free (returns a new Express instance). Calling it once per test file (in `beforeAll`) is fine. Avoid calling it per-request.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP assertion | Custom fetch wrapper | `supertest` | Handles ephemeral port, response parsing, chaining |
| Token minting in tests | Hard-coded JWT strings | `signAccess()` from `lib/tokens.ts` | Reuses real signing logic; tests break if secret changes |
| DB cleanup between tests | DELETE FROM in each test | TRUNCATE … RESTART IDENTITY CASCADE in `beforeEach` | Resets sequences; cascades FK deletions atomically |
| Concurrent request simulation | setTimeout + manual state | `Promise.all` | Deterministic concurrency; pg serializes via row-level locking |
| Schema setup | `sequelize.sync()` in test | `db:migrate` in globalSetup | CLAUDE.md constraint; migration-tested schema matches prod |

---

## Common Pitfalls

### Pitfall 1: Redis Not Running (Queue Import Failure)
**What goes wrong:** `lib/queue.ts` creates IORedis connections at module load. If `redis://localhost:6379` is unreachable, connection errors fire asynchronously. Tests for status guards (TEST-01) don't exercise the queue but still import it via `buildApp()` → `campaigns.ts` → `campaignService.ts` → `lib/queue.ts`. IORedis retries indefinitely, causing test timeouts.
**Why it happens:** IORedis is designed for production resilience; it retries connection on failure. BullMQ's `maxRetriesPerRequest: null` amplifies this.
**How to avoid:** Start Redis before running tests. Add `REDIS_URL=redis://localhost:6379` to `.env.test` and document the prerequisite. Alternatively, for TEST-01/03/04 isolation, mock `lib/queue.ts` with `vi.mock('../lib/queue.js', () => ({ sendQueue: { add: vi.fn() }, sendWorker: { ... } }))` — but this is more complex and changes test semantics.
**Warning signs:** Tests hang for 30+ seconds with timeout errors, not assertion failures.

### Pitfall 2: env.ts process.exit(1) on Missing Vars
**What goes wrong:** `config/env.ts` calls `process.exit(1)` at the top level if any env var is missing or invalid. If `JWT_ACCESS_SECRET` is not set when `vitest.config.ts` loads, the entire process exits before any test runs.
**Why it happens:** `env.ts` imports `dotenv/config` which reads `backend/.env`, not `backend/.env.test`. Vitest doesn't load `.env.test` automatically.
**How to avoid:** Add `envFile: './test/.env.test'` or use `dotenv.config({ path: '.env.test' })` in `globalSetup.ts` BEFORE any src import.

### Pitfall 3: BIGINT Returned as String
**What goes wrong:** Sequelize + pg returns BIGINT columns as JavaScript strings (`"1"` not `1`). Seeded IDs used in URL paths like `/campaigns/${campaign.id}/send` must be coerced: `String(campaign.id)` or `Number(campaign.id)` depending on context.
**Why it happens:** Node's `pg` driver returns BIGINT as strings to avoid precision loss.
**How to avoid:** Seed helpers should use `Number(campaign.id)` when constructing URL paths. Stats assertions use `parseInt` (already done in `computeCampaignStats`).

### Pitfall 4: singleFork Not Enough for Concurrent Test
**What goes wrong:** TEST-02 fires two HTTP requests via `Promise.all`. Even with `singleFork`, both requests hit the same Postgres. If the test DB also has data from a previous test (wrong cleanup), the atomic guard may succeed for unexpected reasons.
**Why it happens:** TRUNCATE in `beforeEach` only runs sequentially between tests. Within a single test, state is whatever was seeded.
**How to avoid:** Seed helpers run inside each `beforeEach` / at the start of each test. Never share seeded rows across tests.

### Pitfall 5: Vitest 4.x Auto-Install (C18)
**What goes wrong:** Running `yarn add vitest` without pinning installs 4.x which breaks `poolOptions.forks.singleFork` syntax (it becomes `maxWorkers: 1` in v4).
**Why it happens:** Root `resolutions` pins Vitest globally, but running `yarn add vitest@latest` in `backend/` can override the resolution.
**How to avoid:** Always install `vitest@2.1.9` explicitly. Root `package.json` already has `"resolutions": { "vitest": "2.1.9" }`. [VERIFIED: root package.json]

### Pitfall 6: Backend tsconfig excludes test/ directory
**What goes wrong:** `backend/tsconfig.json` has `"include": ["src/**/*.ts"]` — test files under `backend/test/` are excluded from the TypeScript project. Vitest can still run them (it uses its own transpiler), but `tsc --noEmit` will not typecheck them.
**Why it happens:** `tsconfig.json` was set up for production compilation only.
**How to avoid:** Either create a `backend/tsconfig.test.json` that includes `test/**/*.ts`, or add `"test/**/*.ts"` to the main include. The planner should decide — for this phase, the simplest fix is a `tsconfig.test.json` extending the base that Vitest's config references.

---

## Code Examples

### vitest.config.ts (complete)
```typescript
// Source: C18 (PITFALLS.md) + Vitest 2.x docs [VERIFIED: Context7]
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    // Load .env.test BEFORE any src import fires env.ts process.exit
    env: {
      // Alternatively: load via dotenv in globalSetup
    },
  },
  resolve: {
    alias: {
      // Not needed if vitest can resolve .js extensions to .ts files
    },
  },
});
```

### TEST-01: status-guard (skeleton)
```typescript
// Source: REQUIREMENTS.md TEST-01, routes/campaigns.ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedSentCampaign } from './helpers/seed.js';

describe('TEST-01: status guards return 409 on non-draft campaign', () => {
  let token: string;
  let campaignId: number;
  const app = buildApp();

  beforeAll(async () => {
    const user = await createTestUser('guard@example.com');
    token = makeToken(user);
    const campaign = await seedSentCampaign(user.id);
    campaignId = Number(campaign.id);
  });

  it('PATCH /campaigns/:id → 409 with error shape', async () => {
    const res = await request(app)
      .patch(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_EDITABLE');
  });

  it('DELETE /campaigns/:id → 409 with error shape', async () => {
    const res = await request(app)
      .delete(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_EDITABLE');
  });

  it('POST /campaigns/:id/send → 409 with error shape', async () => {
    const res = await request(app)
      .post(`/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_SENDABLE');
  });
});
```

### TEST-04: auth boundary (skeleton)
```typescript
// Source: REQUIREMENTS.md TEST-04, middleware/authenticate.ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedDraftCampaign } from './helpers/seed.js';

describe('TEST-04: auth middleware boundaries', () => {
  const app = buildApp();

  it('401 on missing Authorization header', async () => {
    const res = await request(app).get('/campaigns');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('401 on tampered token (bad signature)', async () => {
    const res = await request(app)
      .get('/campaigns')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('404 (not 403) on valid token for wrong user campaign', async () => {
    const userA = await createTestUser('a@example.com');
    const userB = await createTestUser('b@example.com');
    const tokenA = makeToken(userA);
    const campaign = await seedDraftCampaign(userB.id);   // belongs to B

    const res = await request(app)
      .get(`/campaigns/${Number(campaign.id)}`)
      .set('Authorization', `Bearer ${tokenA}`);          // accessed as A
    expect(res.status).toBe(404);   // AUTH-07: enumeration defense
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `poolOptions.forks.singleFork` | `maxWorkers: 1` (top-level) | Vitest v4 | Pinned at 2.1.9 — use old syntax |
| Per-file `beforeAll` DB setup | `globalSetup` once + `setupFiles` TRUNCATE | Vitest 1.x+ | Cleaner lifecycle; globalSetup runs outside workers |
| `supertest` CJS require | `import request from 'supertest'` | supertest 6+ | Vitest transforms CJS to ESM; both syntaxes work |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Redis will be available at localhost:6379 during local test runs | Environment Availability | Queue import hangs; tests time out; need to mock queue or document Redis as prerequisite |
| A2 | `vi.mock` for `lib/queue.ts` is NOT needed if Redis is available | Architecture Patterns | If Redis is unavailable, need to add mock; changes test semantics slightly |

---

## Open Questions

1. **Redis availability during CI / local tests**
   - What we know: Redis is not currently running locally (port 6379 unreachable); no redis-cli installed
   - What's unclear: Will the reviewer's environment have Redis? Docker is not running locally either.
   - Recommendation: Document `redis-server` as a test prerequisite in README, OR mock `lib/queue.ts` in tests that don't exercise the queue. Mocking is more hermetic but adds complexity. Given Phase 10 will docker-compose everything, local Redis is a reasonable assumption; document the requirement.

2. **bcrypt timing in createTestUser**
   - What we know: `BCRYPT_COST=4` in `.env.test` makes bcrypt fast for test user creation
   - What's unclear: Phase 7 tests don't test login (auth endpoints) — they test the JWT middleware. So `createTestUser` can bypass `authService.registerUser` entirely and insert with a dummy hash directly via `User.create`. This is faster and avoids the bcrypt dependency entirely.
   - Recommendation: Use direct `User.create` with a dummy hash in test helpers. Do not call `registerUser` in test setup.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | All tests | Yes | 14.17 (Homebrew) | — |
| PostgreSQL `campaigns_test` DB | All tests | No (needs creation) | — | Wave 0: CREATE DATABASE + db:migrate |
| Redis | TEST-02 (queue enqueue), lib/queue.ts module import | No (port 6379 unreachable, no redis-cli) | — | Start redis-server locally, OR mock lib/queue.ts for non-queue tests |
| Node.js | Test runner | Yes | v22.14.0 | — |
| vitest | Test runner | Not installed (echo placeholder) | — | Wave 0: yarn add --dev vitest@2.1.9 |
| supertest | HTTP assertions | Not installed | — | Wave 0: yarn add --dev supertest @types/supertest |

**Missing dependencies with no fallback:**
- PostgreSQL `campaigns_test` database — must be created and migrated in Wave 0

**Missing dependencies with fallback:**
- Redis: run `redis-server` (Homebrew: `brew install redis && brew services start redis`) — OR mock `lib/queue.ts` in tests that don't use it

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `backend/vitest.config.ts` — Wave 0 gap |
| Quick run command | `yarn workspace @campaign/backend test --reporter=verbose` |
| Full suite command | `yarn workspace @campaign/backend test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | PATCH/DELETE/POST /send on non-draft → 409 | integration | `yarn workspace @campaign/backend test test/status-guard.test.ts` | ❌ Wave 0 |
| TEST-02 | Two concurrent POST /send → one 202, one 409 | integration | `yarn workspace @campaign/backend test test/send-atomicity.test.ts` | ❌ Wave 0 |
| TEST-03 | Seeded recipients → correct stats shape | integration | `yarn workspace @campaign/backend test test/stats.test.ts` | ❌ Wave 0 |
| TEST-04 | Missing/tampered token → 401, cross-user → 404 | integration | `yarn workspace @campaign/backend test test/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `yarn workspace @campaign/backend test` (all 4 files, ~10-15s)
- **Per wave merge:** Same — test suite is small enough to run fully every time
- **Phase gate:** All 4 test files green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/vitest.config.ts` — test runner config with singleFork
- [ ] `backend/test/globalSetup.ts` — DB creation + migration
- [ ] `backend/test/setup.ts` — beforeEach TRUNCATE + afterAll close
- [ ] `backend/test/helpers/auth.ts` — createTestUser, makeToken
- [ ] `backend/test/helpers/seed.ts` — seedDraftCampaign, seedSentCampaign, seedCampaignWithRecipients
- [ ] `backend/test/status-guard.test.ts` — TEST-01
- [ ] `backend/test/send-atomicity.test.ts` — TEST-02
- [ ] `backend/test/stats.test.ts` — TEST-03
- [ ] `backend/test/auth.test.ts` — TEST-04
- [ ] `.env.test` (or `.env.test.example`) — test env vars
- [ ] `package.json` update: replace `"test": "echo 'backend tests land in Phase 7' && exit 0"` with `"test": "vitest run"`
- [ ] Framework install: `yarn workspace @campaign/backend add --dev vitest@2.1.9 supertest @types/supertest`

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (TEST-04) | Tested directly: `authenticate` middleware, `signAccess` / `verifyAccess` |
| V3 Session Management | No | Refresh cookie is tested in auth routes — not re-tested here |
| V4 Access Control | Yes (TEST-04: cross-user 404) | AUTH-07 enumeration defense exercised |
| V5 Input Validation | Indirectly | Status-guard tests confirm 409 (not 400) for state violations |
| V6 Cryptography | No | JWT signing is production code tested via token; no new crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replay attack with stolen JWT | Spoofing | TEST-04 verifies tampered token → 401; short `ACCESS_TOKEN_TTL` |
| User ID enumeration via 403 | Information Disclosure | TEST-04 cross-user → 404 (not 403) asserted explicitly |
| Double-send race → data corruption | Tampering | TEST-02 concurrent send atomicity — Postgres UPDATE guard |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 7 |
|-----------|-------------------|
| Vitest 2.1.9 pinned (C18) | Must use `poolOptions.forks.singleFork` — NOT `maxWorkers: 1` (v4 syntax) |
| No `sequelize.sync()` outside isolated test setup | globalSetup MUST use `db:migrate`; setup.ts may NOT call `sync()` |
| Stats always aggregate SQL (§3) | Stats test verifies the SQL path — no JS counting |
| Backend split: `app.ts` exports `buildApp()`, `index.ts` calls `listen()` | Tests call `request(buildApp())` — never `listen()` |
| BullMQ `maxRetriesPerRequest: null` (C5) | Already in `lib/queue.ts`; test env must have Redis reachable or queue import hangs |
| Cross-user access = 404 not 403 (AUTH-07) | TEST-04 asserts 404 explicitly |
| Error shape: `{ error: { code, message } }` | All 409/401 assertions must verify `.body.error.code` |

---

## Sources

### Primary (HIGH confidence)
- `backend/src/app.ts` — `buildApp()` factory pattern confirmed [VERIFIED: codebase grep]
- `backend/src/services/campaignService.ts` — `triggerSend()` atomic guard, `computeCampaignStats` SQL [VERIFIED: codebase read]
- `backend/src/util/errors.ts` — error hierarchy + HTTP codes [VERIFIED: codebase read]
- `backend/src/middleware/errorHandler.ts` — `{ error: { code, message } }` shape [VERIFIED: codebase read]
- `backend/src/middleware/authenticate.ts` — MISSING_TOKEN / INVALID_TOKEN codes [VERIFIED: codebase read]
- `backend/src/lib/tokens.ts` — `signAccess()` usable in tests [VERIFIED: codebase read]
- `root/package.json` — `"resolutions": { "vitest": "2.1.9" }` confirmed [VERIFIED: codebase read]
- Context7 `/vitest-dev/vitest` — `poolOptions.forks.singleFork` is Vitest 2.x/3.x syntax (migration guide shows it changes in v4) [VERIFIED: Context7]
- Context7 `/forwardemail/supertest` — `request(app)` pattern for Express [VERIFIED: Context7]
- npm registry — `vitest@latest=4.1.5`, `supertest@latest=7.2.2`, `@types/supertest@latest=7.2.0` [VERIFIED: npm view]

### Secondary (MEDIUM confidence)
- `backend/src/db/config.cjs` — `DATABASE_URL_TEST` env var planned since Phase 2 [VERIFIED: codebase read]
- PITFALLS.md C18 — singleFork pool config requirement [CITED: .planning/research/PITFALLS.md]

### Tertiary (LOW confidence)
- None — all claims verified via codebase or official sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified npm versions, existing codebase imports
- Architecture: HIGH — app.ts factory confirmed, service layer fully readable
- Pitfalls: HIGH — 4 specific pitfalls grounded in actual code read
- Environment: HIGH — Postgres verified running; Redis verified NOT running

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable ecosystem; Vitest pinned, no moving targets)
