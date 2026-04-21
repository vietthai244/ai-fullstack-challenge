// backend/test/stats.test.ts
// TEST-03: GET /campaigns/:id/stats must return correct aggregate stats for a known
// recipient distribution. Verifies:
//   - Single COUNT(*) FILTER SQL path (no JS counting)
//   - NULLIF divide-by-zero guard (zero recipients → null rates)
//   - ROUND(…, 2) output (two decimal places)
//
// Stats response shape: { data: { total, sent, failed, opened, open_rate, send_rate } }

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedCampaignWithRecipients } from './helpers/seed.js';

describe('TEST-03: stats aggregation correctness', () => {
  const app = buildApp();
  let token: string;
  let userId: number;

  // beforeEach (not beforeAll) so user is created AFTER the global TRUNCATE in setup.ts.
  // Each test seeds its own campaign + recipients via seedCampaignWithRecipients.
  beforeEach(async () => {
    const user = await createTestUser('test03@example.com');
    token = makeToken(user);
    userId = Number(user.id);
  });

  it('known distribution: 5 sent (2 opened) + 3 failed + 2 pending', async () => {
    // Distribution: total=10, sent=5, failed=3, opened=2, open_rate=0.20, send_rate=0.80
    const campaign = await seedCampaignWithRecipients(userId, [
      { status: 'sent', openedAt: new Date() }, // opened
      { status: 'sent', openedAt: new Date() }, // opened
      { status: 'sent', openedAt: null },
      { status: 'sent', openedAt: null },
      { status: 'sent', openedAt: null },
      { status: 'failed' },
      { status: 'failed' },
      { status: 'failed' },
      { status: 'pending' },
      { status: 'pending' },
    ]);
    const campaignId = Number(campaign.id);

    const res = await request(app)
      .get(`/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toMatchObject({
      total: 10,
      sent: 5,
      failed: 3,
      opened: 2,
      open_rate: 0.2, // ROUND(2/10, 2) = 0.20 → parseFloat = 0.2
      send_rate: 0.8, // ROUND((5+3)/10, 2) = 0.80 → parseFloat = 0.8
    });
  });

  it('zero recipients → open_rate: null, send_rate: null (NULLIF guard)', async () => {
    // Use seedCampaignWithRecipients with an empty distribution for zero recipients.
    const campaign = await seedCampaignWithRecipients(userId, []);
    const campaignId = Number(campaign.id);

    const res = await request(app)
      .get(`/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total: 0,
      sent: 0,
      failed: 0,
      opened: 0,
      open_rate: null,
      send_rate: null,
    });
  });

  it('single sent + opened recipient → open_rate: 1, send_rate: 1', async () => {
    const campaign = await seedCampaignWithRecipients(userId, [
      { status: 'sent', openedAt: new Date() },
    ]);
    const campaignId = Number(campaign.id);

    const res = await request(app)
      .get(`/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total: 1,
      sent: 1,
      failed: 0,
      opened: 1,
      open_rate: 1,
      send_rate: 1,
    });
  });
});
