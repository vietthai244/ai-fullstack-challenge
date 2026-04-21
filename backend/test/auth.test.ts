// backend/test/auth.test.ts
// TEST-04: authenticate middleware boundaries.
//   - Missing Authorization header → 401 MISSING_TOKEN
//   - Tampered/invalid token → 401 INVALID_TOKEN
//   - Valid token for user A accessing user B's campaign → 404 (AUTH-07 enumeration defense)
//
// Tests use GET /campaigns (list) for 401 cases — doesn't require a campaign to exist.
// Cross-user test creates two users + seeds a campaign owned by B, accesses as A.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { createTestUser, makeToken } from './helpers/auth.js';
import { seedDraftCampaign } from './helpers/seed.js';

describe('TEST-04: authentication middleware', () => {
  const app = buildApp();

  it('401 MISSING_TOKEN on request with no Authorization header', async () => {
    const res = await request(app).get('/campaigns');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('401 INVALID_TOKEN on tampered/malformed token', async () => {
    const res = await request(app)
      .get('/campaigns')
      .set('Authorization', 'Bearer not.a.valid.jwt.token');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('401 INVALID_TOKEN on token signed with wrong secret', async () => {
    // A plausible-looking JWT but signed with a different secret
    const fakeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsImlhdCI6MTcwMDAwMDAwMH0.invalid_signature_here';
    const res = await request(app)
      .get('/campaigns')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('404 (not 403) when user A accesses user B campaign (AUTH-07 enumeration defense)', async () => {
    // Create two separate users
    const userA = await createTestUser('test04-a@example.com');
    const userB = await createTestUser('test04-b@example.com');
    const tokenA = makeToken(userA);

    // Seed a draft campaign owned by user B
    const campaignB = await seedDraftCampaign(Number(userB.id));
    const campaignIdB = Number(campaignB.id);

    // User A requests user B's campaign — must return 404, not 403
    const res = await request(app)
      .get(`/campaigns/${campaignIdB}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    // Do NOT assert error.code here — the 404 itself is the contract (AUTH-07)
    // Asserting CAMPAIGN_NOT_FOUND would couple the test to an internal code name
    // that may change; the status 404 is the public contract.
  });
});
