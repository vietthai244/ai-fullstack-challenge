// backend/test/send-atomicity.test.ts
// TEST-02: Two concurrent POST /campaigns/:id/send must produce exactly one 202 and one 409.
//
// Guards C11: Campaign.update WHERE status IN ('draft','scheduled') is the Postgres row-level lock.
// One request wins (rowCount=1 → 202), the other gets rowCount=0 → ConflictError (409).
//
// PREREQUISITE: Redis must be running at REDIS_URL (default: redis://localhost:6379).
// If Redis is unreachable, triggerSend() rolls the campaign back to 'draft' and both
// requests will return 500 — the test will fail with a clear error message.
// Start Redis: brew services start redis  (or: docker compose up -d redis)

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedDraftCampaign } from './helpers/seed.js';

describe('TEST-02: concurrent POST /send atomicity', () => {
  const app = buildApp();
  let token: string;
  let userId: number;

  // beforeEach (not beforeAll) so user is created AFTER the global TRUNCATE in setup.ts.
  // The draft campaign is seeded inside the test body so each test gets its own fresh campaign.
  beforeEach(async () => {
    const user = await createTestUser('test02@example.com');
    token = makeToken(user);
    userId = Number(user.id);
  });

  it('two parallel POST /send → exactly one 202 and one 409', async () => {
    // Seed a fresh draft campaign — TRUNCATE in beforeEach has already cleared state.
    const campaign = await seedDraftCampaign(userId);
    const campaignId = Number(campaign.id); // BIGINT coercion

    // Fire two concurrent requests — Promise.all does not guarantee ordering,
    // but Postgres UPDATE WHERE status IN (...) serializes via row-level locking.
    const [r1, r2] = await Promise.all([
      request(app)
        .post(`/campaigns/${campaignId}/send`)
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .post(`/campaigns/${campaignId}/send`)
        .set('Authorization', `Bearer ${token}`),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([202, 409]);

    // The 409 must carry the expected error code
    const conflictResponse = r1.status === 409 ? r1 : r2;
    expect(conflictResponse.body.error.code).toBe('CAMPAIGN_NOT_SENDABLE');
  });
});
