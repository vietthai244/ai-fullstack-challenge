// backend/test/status-guard.test.ts
// TEST-01: PATCH, DELETE, POST /send on a non-draft campaign must return 409
// with the documented error shape { error: { code, message } }.
//
// Seeds a 'sent' campaign — the most restrictive status (cannot PATCH, DELETE, or send).
// beforeAll runs after the shared beforeEach TRUNCATE from setup.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedSentCampaign } from './helpers/seed.js';

describe('TEST-01: status guards return 409 for non-draft campaigns', () => {
  const app = buildApp();
  let token: string;
  let campaignId: number;

  // beforeEach (not beforeAll) so data is created AFTER the global TRUNCATE in setup.ts.
  // Global beforeEach runs first (TRUNCATE), then this describe-level beforeEach creates fresh data.
  beforeEach(async () => {
    const user = await createTestUser('test01@example.com');
    token = makeToken(user);
    const campaign = await seedSentCampaign(user.id);
    campaignId = Number(campaign.id); // BIGINT coercion — pg returns string
  });

  it('PATCH /campaigns/:id on sent campaign → 409 CAMPAIGN_NOT_EDITABLE', async () => {
    const res = await request(app)
      .patch(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attempted Update' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_EDITABLE');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('DELETE /campaigns/:id on sent campaign → 409 CAMPAIGN_NOT_EDITABLE', async () => {
    const res = await request(app)
      .delete(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_EDITABLE');
  });

  it('POST /campaigns/:id/send on sent campaign → 409 CAMPAIGN_NOT_SENDABLE', async () => {
    const res = await request(app)
      .post(`/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_SENDABLE');
  });
});
