---
phase: 07-backend-tests
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - backend/vitest.config.ts
  - backend/tsconfig.test.json
  - backend/.env.test
  - backend/test/globalSetup.ts
  - backend/test/setup.ts
  - backend/test/helpers/auth.ts
  - backend/test/helpers/seed.ts
  - backend/package.json
  - backend/test/status-guard.test.ts
  - backend/test/send-atomicity.test.ts
  - backend/test/stats.test.ts
  - backend/test/auth.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the full Phase 7 backend test infrastructure: Vitest config, globalSetup, per-test setup, auth/seed helpers, and the four test suites (status-guard, send-atomicity, stats, auth).

The overall structure is solid. Vitest 2.1.9 is pinned correctly (C18). `singleFork` is correct syntax for Vitest 2.x. TRUNCATE strategy in `setup.ts` is sound. JWT secrets in `.env.test` are long enough. Seed helpers use transactions where they matter. The four test suites cover the required business rules.

Three warnings and three info-level findings follow.

---

## Warnings

### WR-01: `auth.test.ts` uses `beforeAll` but relies on per-test TRUNCATE from `setup.ts`

**File:** `backend/test/auth.test.ts:10`
**Issue:** The cross-user test at line 50 calls `createTestUser` and `seedDraftCampaign` inside the test body directly, with no `beforeEach` guard. The three 401 tests have no DB setup at all — that is fine. However the describe block imports `beforeAll` (unused) at line 10, which is misleading. More critically: all other test files use `beforeEach` so their seed data is created *after* the global `TRUNCATE`. `auth.test.ts` performs DB writes inside the `it()` body, which is also post-TRUNCATE and therefore correct — but only because `singleFork` serialises test files. If this file were ever run in parallel isolation the ordering guarantee disappears. The latent danger is that a future developer adds a `beforeAll` (because the import is already there) and creates data before the TRUNCATE fires.
**Fix:** Remove the unused `beforeAll` import. If cross-user setup is ever extracted, wrap it in a `beforeEach`, not a `beforeAll`, to match the rest of the suite.
```typescript
// auth.test.ts line 10 — remove beforeAll from import
import { describe, it, expect } from 'vitest';
```

---

### WR-02: `seedSentCampaign` is not wrapped in a transaction — partial seed possible on failure

**File:** `backend/test/helpers/seed.ts:52-75`
**Issue:** `seedSentCampaign` creates Recipient, Campaign, and CampaignRecipient in three separate awaited calls with no enclosing transaction. If the process crashes or a constraint fails after `Campaign.create` but before `CampaignRecipient.create`, the test DB is left with an orphaned campaign record. `seedDraftCampaign` and `seedCampaignWithRecipients` both correctly use `sequelize.transaction`. The inconsistency is a reliability risk: test failures become non-deterministic when the DB state is partially written.
**Fix:** Wrap `seedSentCampaign` in a transaction the same way the other two helpers do.
```typescript
export async function seedSentCampaign(userId: number | string): Promise<Campaign> {
  return sequelize.transaction(async (t) => {
    const recipient = await Recipient.create(
      {
        userId: Number(userId),
        email: `seed-sent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        name: 'Sent Recipient',
      },
      { transaction: t },
    );

    const campaign = await Campaign.create(
      {
        name: 'Sent Campaign',
        subject: 'Sent Subject',
        body: 'Sent body.',
        createdBy: Number(userId),
        status: 'sent',
      },
      { transaction: t },
    );

    await CampaignRecipient.create(
      {
        campaignId: Number(campaign.id),
        recipientId: Number(recipient.id),
        status: 'sent',
        sentAt: new Date(),
      },
      { transaction: t },
    );

    return campaign;
  });
}
```

---

### WR-03: `globalSetup.ts` password in `adminUrl` is URL-decoded from the connection string — breaks if password contains special characters

**File:** `backend/test/globalSetup.ts:30`
**Issue:** `parsed.username` and `parsed.password` from `new URL(testUrl)` are automatically percent-decoded by the WHATWG URL API. If the password ever contains characters like `@`, `#`, or `%XX` sequences, the decoded value is passed directly into the reconstructed `adminUrl` string, producing a malformed connection string. The current `.env.test` password (`campaign`) contains no special characters, so this does not fail today. However, the pattern is fragile.
**Fix:** Use `parsed.password` only to build a `pg.Client` config object rather than re-encoding it into a URL string, or encode it back with `encodeURIComponent`.
```typescript
const client = new pg.Client({
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 5432,
  user: parsed.username,
  password: parsed.password,  // Node pg client accepts raw string — no URL encoding needed
  database: 'postgres',
});
```

---

## Info

### IN-01: `vitest.config.ts` has no `environment` key — defaults to `node` (correct but implicit)

**File:** `backend/vitest.config.ts:6`
**Issue:** Vitest defaults to `node` environment when the key is absent. This is correct for a backend test suite, but the intent is not stated. Future developers adding frontend tests to the same workspace may not notice the implicit default and could add browser-targeting tests to this config by mistake.
**Fix:** Add `environment: 'node'` explicitly to make the intent clear.
```typescript
test: {
  environment: 'node',
  pool: 'forks',
  ...
}
```

---

### IN-02: `stats.test.ts` — open_rate/send_rate assertions use `0.2` and `0.8` but SQL `ROUND(..., 2)` returns `"0.20"` / `"0.80"` as strings from pg

**File:** `backend/test/stats.test.ts:56-57`
**Issue:** PostgreSQL `ROUND(x, 2)` returns a `numeric` type which the `pg` driver serialises as a string (e.g., `"0.20"`). If the API layer does not explicitly call `parseFloat()` or `Number()` before returning the JSON, the values will be strings in the response body and `toMatchObject({ open_rate: 0.2 })` will fail (string `"0.20"` !== number `0.2`). The comment on line 56 acknowledges `parseFloat`, implying the API does this conversion — but if that conversion is ever removed, the test silently changes from a type check to a loose equality assertion (Jest/Vitest `toMatchObject` does not coerce types). This is not a test-code bug per se, but a documentation gap that could mask a regression.
**Fix:** Add an explicit type assertion alongside the value check so that a string-typed response is caught immediately.
```typescript
expect(typeof res.body.data.open_rate).toBe('number');
expect(typeof res.body.data.send_rate).toBe('number');
expect(res.body.data).toMatchObject({
  open_rate: 0.2,
  send_rate: 0.8,
});
```

---

### IN-03: `package.json` — `@types/express` version `^5.0.6` but Express runtime is `^4.22.1`

**File:** `backend/package.json:37`
**Issue:** `@types/express@^5.x` type definitions target Express 5.x, which has breaking type changes (notably `Request`/`Response` generics and removed `NextFunction` overloads). Using v5 types against an Express 4 runtime can produce false-positive TypeScript errors or suppress real ones where the type signatures diverge.
**Fix:** Pin `@types/express` to `^4.17.x` to match the Express 4 runtime.
```json
"@types/express": "^4.17.21"
```

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
