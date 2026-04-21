// backend/test/setup.ts
//
// Runs inside the worker process.
// beforeEach: TRUNCATE all tables → clean slate per test (CLAUDE.md §1 + ROADMAP Phase 7 SC1).
// afterAll: close Sequelize pool so the process exits cleanly.

import { beforeEach, afterAll } from 'vitest';
import { sequelize } from '../src/db/index.js';

beforeEach(async () => {
  // TRUNCATE order: junction first, then tables with FKs, then root tables.
  // CASCADE handles FK ordering but explicit order prevents lock contention.
  // RESTART IDENTITY resets BIGSERIAL sequences so IDs stay at 1 per test.
  await sequelize.query(
    `TRUNCATE TABLE campaign_recipients, campaigns, recipients, users
     RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await sequelize.close();
});
