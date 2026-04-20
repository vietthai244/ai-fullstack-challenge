'use strict';

// Phase 2 Plan 04 — Demo seeder (DATA-03).
//
// Populates the freshly-migrated schema with a demo dataset for the Phase 10
// README walkthrough and for manual smoke testing of Phase 3-6 features:
//   - 1 demo user (demo@example.com / demo1234, bcrypt hashed cost=10)
//   - 10 recipients (Alice..Jack @example.com)
//   - 3 campaigns owned by the demo user:
//       * 1 draft   — empty (no junction rows; recipients attach via POST /campaigns in Phase 4)
//       * 1 scheduled — 3 pending junction rows (scheduled_at = now + 1 day)
//       * 1 sent    — 5 mixed junction rows (4 sent / 1 failed; 1 of the 4 sent has opened_at)
//
// The sent campaign distribution yields the demo stats CAMP-08 advertises:
//   send_rate = sent / total = 4 / 5 = 0.80
//   open_rate = opened / sent = 1 / 4 = 0.25
//
// Notes:
//   - bcryptjs is required via CommonJS (this file is .cjs because backend/ is "type: module").
//   - tracking_token is OMITTED from every campaign_recipients bulkInsert payload —
//     the gen_random_uuid() DB-side default (migration 000004) fires on every row.
//     This proves the pgcrypto + DEFAULT wiring from Plan 02-03 end-to-end.
//   - down() deletes by stable identifiers (email for users/recipients, name for
//     campaigns) — never wipes whole tables. Re-running db:seed:undo:all is safe
//     even if other rows (e.g. Phase 7 tests) live alongside the seed.

const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface /* , Sequelize */) {
    const now = new Date();

    // --- 1. Demo user ---
    const passwordHash = await bcrypt.hash('demo1234', 10);
    await queryInterface.bulkInsert('users', [{
      email: 'demo@example.com',
      password_hash: passwordHash,
      name: 'Demo Marketer',
      created_at: now,
      updated_at: now,
    }]);
    // Fetch the inserted user's id (BIGSERIAL auto-assigned).
    const [[demoUser]] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'demo@example.com' LIMIT 1;`,
    );
    const demoUserId = demoUser.id;

    // --- 2. Ten recipients ---
    const recipientNames = [
      ['alice@example.com',  'Alice Andrews'],
      ['bob@example.com',    'Bob Brennan'],
      ['carol@example.com',  'Carol Chen'],
      ['dave@example.com',   'Dave Dixon'],
      ['eve@example.com',    'Eve Edwards'],
      ['frank@example.com',  'Frank Foster'],
      ['grace@example.com',  'Grace Garcia'],
      ['henry@example.com',  'Henry Hayes'],
      ['ivy@example.com',    'Ivy Ito'],
      ['jack@example.com',   'Jack Jensen'],
    ];
    await queryInterface.bulkInsert('recipients', recipientNames.map(([email, name]) => ({
      email, name, created_at: now, updated_at: now,
    })));
    const [recipientRows] = await queryInterface.sequelize.query(
      `SELECT id, email FROM recipients WHERE email IN (${recipientNames.map(([e]) => `'${e}'`).join(',')}) ORDER BY id;`,
    );
    const recipientIds = recipientRows.map((r) => r.id);

    // --- 3. Three campaigns (draft / scheduled / sent) ---
    await queryInterface.bulkInsert('campaigns', [
      {
        name: 'Welcome campaign (DRAFT)',
        subject: 'Welcome to the newsletter',
        body: 'Thanks for subscribing — here are a few links to get started.',
        status: 'draft',
        scheduled_at: null,
        created_by: demoUserId,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'Product launch (SCHEDULED)',
        subject: 'Launching next Tuesday',
        body: 'We are excited to share our new feature at the launch event.',
        status: 'scheduled',
        scheduled_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),   // +1 day
        created_by: demoUserId,
        created_at: now,
        updated_at: now,
      },
      {
        name: 'Weekly digest (SENT)',
        subject: 'This week in review',
        body: 'Here is everything that happened this week.',
        status: 'sent',
        scheduled_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),    // -2 hours (already sent)
        created_by: demoUserId,
        created_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        updated_at: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      },
    ]);
    const [campaignRows] = await queryInterface.sequelize.query(
      `SELECT id, name, status FROM campaigns WHERE created_by = ${demoUserId} ORDER BY id;`,
    );
    const [, scheduled, sent] = campaignRows;
    // draft campaign id is intentionally unused — draft has zero junction rows per CAMP-02 spec.

    // --- 4. Junction rows ---
    // Draft: NO recipients yet (spec: POST /campaigns in Phase 4 wires up recipients;
    //                          Phase 2 seeds the "empty draft" state).
    // Scheduled: 3 recipients in pending status.
    // Sent: 5 recipients — 4 sent (one with opened_at), 1 failed.
    const junctionRows = [];

    // Scheduled campaign: 3 pending recipients (Alice, Bob, Carol).
    for (let i = 0; i < 3; i++) {
      junctionRows.push({
        campaign_id: scheduled.id,
        recipient_id: recipientIds[i],
        status: 'pending',
        sent_at: null,
        opened_at: null,
        // tracking_token intentionally OMITTED — let the gen_random_uuid() column default fire.
        created_at: now,
        updated_at: now,
      });
    }

    // Sent campaign: 5 recipients, mixed outcomes (Dave..Henry).
    const sentOutcomes = [
      { status: 'sent',   opened_at: new Date(now.getTime() - 30 * 60 * 1000) }, // Dave — sent and opened
      { status: 'sent',   opened_at: null },                                      // Eve — sent, not opened
      { status: 'sent',   opened_at: null },                                      // Frank — sent, not opened
      { status: 'sent',   opened_at: null },                                      // Grace — sent, not opened
      { status: 'failed', opened_at: null },                                      // Henry — failed
    ];
    for (let i = 0; i < 5; i++) {
      const outcome = sentOutcomes[i];
      junctionRows.push({
        campaign_id: sent.id,
        recipient_id: recipientIds[3 + i],
        status: outcome.status,
        sent_at: outcome.status === 'sent' ? new Date(now.getTime() - 90 * 60 * 1000) : null,
        opened_at: outcome.opened_at,
        created_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        updated_at: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      });
    }
    await queryInterface.bulkInsert('campaign_recipients', junctionRows);
    // NOTE: tracking_token is NOT in the insert payload — the gen_random_uuid() column default fills it.
  },

  async down(queryInterface /* , Sequelize */) {
    // Idempotent delete by stable keys — DO NOT truncate (would wipe test-created data too).
    // Order matters: junction first (FK), then campaigns (FK to users), then recipients + users.
    // Campaigns + recipients are deleted by stable seeded identifiers (campaign name, recipient
    // email, user email) so other rows present in the DB are preserved (V14).

    // 1. Junction rows for the 3 seeded campaigns. Use raw SQL to avoid any Op import quirk
    //    in CJS — the IN-list form via bulkDelete is also acceptable, but a join-by-name keeps
    //    this self-contained and explicit about which campaigns are targeted.
    await queryInterface.sequelize.query(`
      DELETE FROM campaign_recipients
      WHERE campaign_id IN (
        SELECT id FROM campaigns
        WHERE name IN (
          'Welcome campaign (DRAFT)',
          'Product launch (SCHEDULED)',
          'Weekly digest (SENT)'
        )
      );
    `);

    // 2. The 3 seeded campaigns. Sequelize 6 bulkDelete with an array value renders WHERE name IN (...).
    await queryInterface.bulkDelete(
      'campaigns',
      {
        name: [
          'Welcome campaign (DRAFT)',
          'Product launch (SCHEDULED)',
          'Weekly digest (SENT)',
        ],
      },
      {},
    );

    // 3. The 10 seeded recipients (by email — stable, unique).
    await queryInterface.bulkDelete(
      'recipients',
      {
        email: [
          'alice@example.com',
          'bob@example.com',
          'carol@example.com',
          'dave@example.com',
          'eve@example.com',
          'frank@example.com',
          'grace@example.com',
          'henry@example.com',
          'ivy@example.com',
          'jack@example.com',
        ],
      },
      {},
    );

    // 4. The 1 demo user (by email).
    await queryInterface.bulkDelete(
      'users',
      { email: 'demo@example.com' },
      {},
    );
  },
};
