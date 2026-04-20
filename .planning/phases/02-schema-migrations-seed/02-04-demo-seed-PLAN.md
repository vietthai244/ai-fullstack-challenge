---
phase: 02-schema-migrations-seed
plan: 04
type: execute
wave: 4
depends_on: ["02-03"]
files_modified:
  - backend/src/seeders/20260101000000-demo-data.cjs
  - backend/package.json
autonomous: true
requirements:
  - DATA-03
requirements_addressed:
  - DATA-01
  - DATA-02
  - DATA-03
tags:
  - backend
  - sequelize
  - seed
  - bcrypt
  - phase-gate

must_haves:
  truths:
    - "`backend/src/seeders/20260101000000-demo-data.cjs` exists and is a CJS module (Pitfall 6 — backend is `type: module`)"
    - "Seeder inserts EXACTLY 1 user (demo@example.com, bcrypt-hashed `demo1234` password, name `Demo Marketer`)"
    - "Seeder inserts EXACTLY 10 recipients with realistic names + emails (Alice..Jack)"
    - "Seeder inserts EXACTLY 3 campaigns owned by the demo user: 1 draft, 1 scheduled (scheduled_at = now + 1 day), 1 sent (scheduled_at = ~2 hours ago)"
    - "Seeder creates junction rows: scheduled campaign → 3 pending recipients; sent campaign → 4 sent (1 with opened_at) + 1 failed; draft campaign → NO recipients (matches CAMP-02 spec — recipients attach via POST /campaigns in Phase 4)"
    - "Seeder OMITS `tracking_token` from the bulkInsert payload — relies on the `gen_random_uuid()` DB-side default from migration 000004"
    - "Demo user password is hashed via `bcryptjs.hash('demo1234', 10)` — stored hash matches `^\\$2[aby]\\$` regex (V6)"
    - "Seeder's `down()` function is IDEMPOTENT: deletes rows by stable identifiers (email for users/recipients, campaign name for campaigns) — NOT `TRUNCATE` (V14 — would wipe test-created rows)"
    - "`backend/package.json` adds 2 scripts: `db:seed` (→ `sequelize db:seed:all`), `db:seed:undo` (→ `sequelize db:seed:undo:all`)"
    - "`backend/package.json` UPDATES `db:reset` to: `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed` (was migrate-only in Plan 02-03)"
    - "Seeder uses `require('bcryptjs')` (CJS) — NOT `import bcrypt from 'bcryptjs'` (would fail in a .cjs file)"
    - "After `yarn db:reset` against a clean DB: row counts are exactly `1/10/3` (users/recipients/campaigns)"
    - "Sent campaign stats: 4 sent + 1 failed (total 5); 1 opened of 4 sent → send_rate = 80%, open_rate = 25% (opens-per-sent, per spec)"
    - "Scheduled campaign status distribution: exactly 3 pending junction rows, 0 sent, 0 failed"
    - "Full phase gate passes: `cd backend && yarn db:reset` exits 0 + all 02-VALIDATION.md Per-Task rows for Plan 02-C and 02-D green against the freshly re-migrated-and-seeded DB"
  artifacts:
    - path: "backend/src/seeders/20260101000000-demo-data.cjs"
      provides: "Demo data for walkthrough: 1 user / 10 recipients / 3 campaigns (draft/scheduled/sent) + realistic junction rows"
      contains: "bcrypt.hash('demo1234'"
      min_lines: 80
    - path: "backend/package.json"
      provides: "Adds db:seed + db:seed:undo scripts; updates db:reset to chain seed"
      contains: "\"db:seed\""
  key_links:
    - from: "backend/src/seeders/20260101000000-demo-data.cjs"
      to: "bcryptjs"
      via: "require('bcryptjs').hash('demo1234', 10)"
      pattern: "require\\(['\"]bcryptjs['\"]\\)"
    - from: "backend/src/seeders/20260101000000-demo-data.cjs"
      to: "campaign_recipients.tracking_token (gen_random_uuid default)"
      via: "tracking_token OMITTED from bulkInsert payload"
      pattern: "bulkInsert\\(['\"]campaign_recipients['\"]"
    - from: "backend/package.json"
      to: "sequelize db:seed:all"
      via: "db:seed script: 'sequelize db:seed:all'"
      pattern: "\"db:seed\":\\s*\"sequelize db:seed:all\""
    - from: "backend/package.json"
      to: "yarn db:seed"
      via: "db:reset chains: && yarn db:seed"
      pattern: "\"db:reset\":\\s*\".*yarn db:seed\""
---

<objective>
Implement DATA-03: a single Sequelize CLI seeder (`backend/src/seeders/20260101000000-demo-data.cjs`) that populates the freshly-migrated schema with a demo dataset suitable for the Phase 10 README walkthrough — 1 demo user (bcrypt-hashed `demo1234` password), 10 recipients, and 3 campaigns (1 draft empty, 1 scheduled with 3 pending junction rows, 1 sent with 5 junction rows yielding demoable 80% send_rate / 25% open_rate) — plus the two `db:seed*` scripts in `backend/package.json` and an updated `db:reset` that chains migrate → seed. The seeder's `down()` is idempotent via stable-key deletes; it relies on the `gen_random_uuid()` DB-side default for `tracking_token` (proves the pgcrypto + DEFAULT wiring from Plan 02-03 end-to-end).

This plan also runs the **Phase 2 acceptance gate**: from a clean database, `yarn db:reset` + re-execution of every Per-Task Verification Map row from `02-VALIDATION.md` Plan 02-C and 02-D must all pass, confirming DATA-01 (models, verified at Plan 02-02 import time but re-checked against the live DB here), DATA-02 (schema, re-verified), and DATA-03 (seed, verified for the first time) simultaneously.

Purpose: Phase 10's README demo login uses `demo@example.com` / `demo1234`. Phase 4's `GET /campaigns` renders the 3 seeded campaigns. Phase 4's `GET /campaigns/:id/stats` on the sent campaign returns `{ total: 5, sent: 4, failed: 1, opened: 1, send_rate: 0.8, open_rate: 0.25 }` — the seed data IS the fixture that makes the stats endpoint demoable. Getting the row counts and status distribution exactly right here is what makes the end-to-end walkthrough meaningful vs. theoretical.

Output: 1 seeder `.cjs` file + 2 new package.json scripts + 1 updated `db:reset`. Phase 2 acceptance gate closes all 5 ROADMAP Phase 2 success criteria and unblocks Phase 3 (auth).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/02-schema-migrations-seed/02-RESEARCH.md
@.planning/phases/02-schema-migrations-seed/02-VALIDATION.md
@.planning/phases/02-schema-migrations-seed/02-01-infra-deps-cli-config-PLAN.md
@.planning/phases/02-schema-migrations-seed/02-02-sequelize-models-PLAN.md
@.planning/phases/02-schema-migrations-seed/02-03-migrations-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Contracts this plan consumes / produces. -->

**From Plan 02-03 (schema this seeder writes into):**

All 4 tables exist with snake_case columns matching the seeder's `bulkInsert` payloads:

```sql
-- From 20260101000001-create-users.cjs
users:
  id BIGSERIAL PRIMARY KEY
  email VARCHAR(320) NOT NULL UNIQUE
  password_hash VARCHAR(255) NOT NULL
  name VARCHAR(200) NOT NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- From 20260101000002-create-recipients.cjs
recipients:
  id BIGSERIAL PRIMARY KEY
  email VARCHAR(320) NOT NULL UNIQUE
  name VARCHAR(200) NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- From 20260101000003-create-campaigns.cjs
campaigns:
  id BIGSERIAL PRIMARY KEY
  name VARCHAR(255) NOT NULL
  subject VARCHAR(255) NOT NULL
  body TEXT NOT NULL
  status enum_campaigns_status NOT NULL DEFAULT 'draft'  -- values: draft, scheduled, sending, sent
  scheduled_at TIMESTAMPTZ NULL
  created_by BIGINT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- From 20260101000004-create-campaign-recipients.cjs
campaign_recipients:
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE
  recipient_id BIGINT NOT NULL REFERENCES recipients(id) ON UPDATE CASCADE ON DELETE CASCADE
  tracking_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()    -- ← seeder OMITS this, relies on default
  status enum_campaign_recipients_status NOT NULL DEFAULT 'pending' -- values: pending, sent, failed
  sent_at TIMESTAMPTZ NULL
  opened_at TIMESTAMPTZ NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  PRIMARY KEY (campaign_id, recipient_id)
```

**From Plan 02-01 (bcryptjs dep + sequelize-cli binary already installed):**
- `bcryptjs@^3.0.3` is in `backend/package.json` dependencies — the seeder's `require('bcryptjs')` resolves from `backend/node_modules/bcryptjs`.
- `sequelize-cli@^6.6.5` devDep — the `sequelize db:seed:all` binary at `backend/node_modules/.bin/sequelize` runs seeders from `backend/src/seeders/*.cjs` (path from `backend/.sequelizerc`).
- bcryptjs 3.x ships its own CJS-compatible build (Research Assumption A5) — `require('bcryptjs')` returns an object with `.hash(password, saltRounds)` + `.compare(password, hash)` methods. NO `@types/bcryptjs` install (would shadow bundled types).

**From Plan 02-03 (scripts baseline — this plan EXTENDS):**

Current `backend/package.json` scripts (from Plan 02-03):
```json
{
  "scripts": {
    "build": "echo 'backend build deferred to Phase 10' && exit 0",
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "echo 'backend tests land in Phase 7' && exit 0",
    "db:migrate": "sequelize db:migrate",
    "db:migrate:undo": "sequelize db:migrate:undo",
    "db:migrate:undo:all": "sequelize db:migrate:undo:all",
    "db:reset": "yarn db:migrate:undo:all && yarn db:migrate"
  }
}
```

After Plan 02-04, `scripts` will also include:
- `"db:seed": "sequelize db:seed:all"`
- `"db:seed:undo": "sequelize db:seed:undo:all"`

AND `db:reset` will be UPDATED to: `"yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed"` (chain seed at the end).

**Sequelize CLI seeder API surface used:**
```js
module.exports = {
  async up(queryInterface, Sequelize) { /* insertions */ },
  async down(queryInterface, Sequelize) { /* idempotent deletes */ },
};

// queryInterface methods:
queryInterface.bulkInsert(tableName, rowsArray)              // INSERT ... VALUES (...), (...)
queryInterface.bulkDelete(tableName, whereClause)            // DELETE WHERE ... (object → =, null → all)
queryInterface.sequelize.query(rawSql)                       // escape hatch for SELECT after insert
```

**Sent-campaign stats derivation (locked math that drives seed row distribution):**

Per CAMP-08 spec + REQUIREMENTS.md:
- `total = COUNT(*)` over campaign_recipients for the campaign
- `sent = COUNT(*) FILTER (WHERE status='sent')`
- `failed = COUNT(*) FILTER (WHERE status='failed')`
- `opened = COUNT(*) FILTER (WHERE opened_at IS NOT NULL)`
- `send_rate = sent / total`
- `open_rate = opened / sent` (per 02-VALIDATION.md Per-Task row, opens-per-SENT — not opens-per-total)

Target demo values: `send_rate = 0.8` (4 sent / 5 total), `open_rate = 0.25` (1 opened / 4 sent). This pins the seed distribution:
- 4 × `status='sent'` + 1 × `status='failed'` = 5 total junction rows on the sent campaign
- Exactly 1 of the 4 sent rows has `opened_at IS NOT NULL`

Changing any of these counts changes the demoed percentages.

**Locked decisions honored (from `.planning/PROJECT.md` + `02-RESEARCH.md` §User Constraints):**
- bcryptjs cost factor 10 — standard; Phase 3 auth uses the same factor (compare correctness).
- `tracking_token` OMITTED from seeder INSERT payloads — confirms the `gen_random_uuid()` DB-side default works end-to-end (the reason we enabled pgcrypto in migration 000000).
- `down()` deletes by stable key (email) — NOT TRUNCATE (Pitfall 2 avoidance; preserves any Phase-7 test data seeded alongside).
- Demo user email is `demo@example.com` + password `demo1234` — Phase 10 README documents these for reviewer login (UI-02).
- Draft campaign has NO recipients — matches CAMP-02 spec ("created in draft, recipients attach via POST /campaigns" in Phase 4).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write demo-data seeder + add db:seed scripts + update db:reset to chain seed</name>
  <files>backend/src/seeders/20260101000000-demo-data.cjs, backend/package.json</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 7 (Seeder file shape) lines 680-833 — copy verbatim, only the filename timestamp changes (research uses `20260422000100`, this plan uses `20260101000000` per planning context)
    - `02-RESEARCH.md` §Pattern 8 (Backend package.json script additions) — the 2 new scripts + updated `db:reset`
    - `02-RESEARCH.md` §Common Pitfalls §Pitfall 10 (Seed's SELECT-by-name assumes empty start) — rationale for using sequelize-cli's SequelizeData tracking via `db:seed:undo:all && db:seed`
    - `02-VALIDATION.md` Per-Task rows for Plan 02-D (rows at VALIDATION.md lines 60-64):
      - DATA-03 (seed runs): `yarn db:seed` exits 0
      - DATA-03 (row counts): `1/10/3` (users/recipients/campaigns)
      - DATA-03 (statuses): `draft:1`, `scheduled:1`, `sent:1`
      - DATA-03 (meaningful stats): `failed:false:1`, `sent:false:3`, `sent:true:1`
      - DATA-03 (password hash): `password_hash ~ '^\\$2[aby]\\$'` returns `t`
    - `backend/src/models/campaign.ts` — confirm 4-state ENUM literals match what the seeder inserts as `status` strings
    - `backend/src/models/campaignRecipient.ts` — confirm 3-state ENUM literals + tracking_token Sequelize.literal pattern (seeder relies on DB default so doesn't set this)
    - `backend/package.json` current state (from Plan 02-03) — has 4 db:* scripts; Plan 02-04 adds 2 more + updates `db:reset`
  </read_first>
  <action>
    **Pre-flight:** Postgres must be running (`docker compose up -d postgres` — healthy) and the schema must be in place (Plan 02-03 migrations applied). If starting from a fresh shell: `cd backend && yarn db:reset` (with Plan 02-03's current reset, which doesn't yet chain seed).

    Create **`backend/src/seeders/20260101000000-demo-data.cjs`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 7 Seeder file shape — only the filename differs; the research file is `20260422000100-demo-data.cjs`):

    ```js
    'use strict';

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
        const recipientIds = recipientRows.map(r => r.id);

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
        const [draft, scheduled, sent] = campaignRows;

        // --- 4. Junction rows ---
        // Draft: NO recipients yet (spec: POST /campaigns in Phase 4 wires up recipients; Phase 2 seeds the "empty draft" state)
        // Scheduled: 3 recipients in pending
        // Sent: 5 recipients — 4 sent (one with opened_at), 1 failed
        const junctionRows = [];
        // Scheduled campaign: 3 pending recipients (Alice, Bob, Carol)
        for (let i = 0; i < 3; i++) {
          junctionRows.push({
            campaign_id: scheduled.id,
            recipient_id: recipientIds[i],
            status: 'pending',
            sent_at: null,
            opened_at: null,
            // tracking_token intentionally OMITTED — let the gen_random_uuid() column default fire
            created_at: now,
            updated_at: now,
          });
        }
        // Sent campaign: 5 recipients, mixed outcomes (Dave..Henry)
        const sentOutcomes = [
          { status: 'sent',   opened_at: new Date(now.getTime() - 30 * 60 * 1000) },  // Dave — sent and opened
          { status: 'sent',   opened_at: null },                                       // Eve — sent, not opened
          { status: 'sent',   opened_at: null },                                       // Frank — sent, not opened
          { status: 'sent',   opened_at: null },                                       // Grace — sent, not opened
          { status: 'failed', opened_at: null },                                       // Henry — failed
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
        // NOTE: tracking_token is NOT in the insert payload — relies on the gen_random_uuid() column default.
      },

      async down(queryInterface /* , Sequelize */) {
        // Idempotent delete by stable keys — DO NOT truncate (would wipe test-created data too).
        // Order matters: junction first (FK), then campaigns (FK to users), then recipients + users.
        // Campaigns + recipients are deleted by the seeded emails/names to avoid nuking other-developer test data.
        await queryInterface.bulkDelete(
          'campaign_recipients',
          {
            recipient_id: {
              // Delete junction rows whose recipient was seeded (matches our 10 emails).
              [Symbol.for('sequelize.Op.in') /* placeholder; see note below */]: null,
            },
          },
          {},
        );
        // Simpler + safer: delete ALL junction rows created for this seed's campaigns (join via campaign name).
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
        await queryInterface.bulkDelete(
          'users',
          { email: 'demo@example.com' },
          {},
        );
      },
    };
    ```

    **Deviation note from 02-RESEARCH.md §Pattern 7 `down()`:** The research's down function has a less-precise `bulkDelete('campaigns', {}, {})` that would nuke ALL campaigns in the DB. This plan's down uses `name: [...]` match-set filters to target ONLY the 3 seed campaigns + 10 seed recipient emails + 1 demo user email. The junction delete uses a raw SQL `DELETE ... WHERE campaign_id IN (SELECT id FROM campaigns WHERE name IN (...))` because FK CASCADE on campaign delete would also work — but explicit deletion is order-safe regardless. Research §Pattern 7 code sample is prescriptive about what to insert; the `down()` is tightened here to meet V14 idempotency without nuking test data.

    Update **`backend/package.json`** scripts — add 2 new entries AND update `db:reset`. The scripts block (from Plan 02-03) currently ends with:

    ```json
    "db:migrate:undo:all": "sequelize db:migrate:undo:all",
    "db:reset": "yarn db:migrate:undo:all && yarn db:migrate"
    ```

    Replace that final `db:reset` entry AND append 2 seed entries so the block reads:

    ```json
    "db:migrate:undo:all": "sequelize db:migrate:undo:all",
    "db:seed": "sequelize db:seed:all",
    "db:seed:undo": "sequelize db:seed:undo:all",
    "db:reset": "yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed"
    ```

    Final `backend/package.json` scripts section expected to be (for grep gates):
    ```json
    "scripts": {
      "build": "echo 'backend build deferred to Phase 10' && exit 0",
      "dev": "tsx watch src/index.ts",
      "typecheck": "tsc -p tsconfig.json --noEmit",
      "lint": "eslint src",
      "test": "echo 'backend tests land in Phase 7' && exit 0",
      "db:migrate": "sequelize db:migrate",
      "db:migrate:undo": "sequelize db:migrate:undo",
      "db:migrate:undo:all": "sequelize db:migrate:undo:all",
      "db:seed": "sequelize db:seed:all",
      "db:seed:undo": "sequelize db:seed:undo:all",
      "db:reset": "yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed"
    }
    ```

    **Verify locally** by running from a clean state:
    ```bash
    cd backend
    yarn db:migrate:undo:all
    yarn db:migrate
    yarn db:seed

    # Row counts:
    psql "$DATABASE_URL" -tAc "SELECT (SELECT count(*) FROM users) || '/' || (SELECT count(*) FROM recipients) || '/' || (SELECT count(*) FROM campaigns)"
    # Expected: 1/10/3

    # Campaign status distribution:
    psql "$DATABASE_URL" -tAc "SELECT status || ':' || count(*) FROM campaigns GROUP BY status ORDER BY status"
    # Expected: draft:1\nscheduled:1\nsent:1

    # Sent campaign stats math:
    psql "$DATABASE_URL" -tAc "SELECT cr.status || ':' || (cr.opened_at IS NOT NULL)::text || ':' || count(*) FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE c.status='sent' GROUP BY 1 ORDER BY 1"
    # Expected: failed:false:1\nsent:false:3\nsent:true:1

    # Password hash is bcrypt:
    psql "$DATABASE_URL" -tAc "SELECT password_hash ~ '^\\\$2[aby]\\\$' FROM users WHERE email='demo@example.com'"
    # Expected: t

    # tracking_token was filled by the DB default (not null):
    psql "$DATABASE_URL" -tAc "SELECT count(*) FROM campaign_recipients WHERE tracking_token IS NOT NULL"
    # Expected: 8 (3 scheduled pending + 5 sent mixed)
    ```

    If any row count or distribution is off, fix the seeder's counts (NOT the migration — schema is locked from Plan 02-03).
  </action>
  <verify>
    <automated>test -f backend/src/seeders/20260101000000-demo-data.cjs && grep -q "require('bcryptjs')" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "bcrypt.hash('demo1234', 10)" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "email: 'demo@example.com'" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "bulkInsert('users'" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "bulkInsert('recipients'" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "bulkInsert('campaigns'" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "bulkInsert('campaign_recipients'" backend/src/seeders/20260101000000-demo-data.cjs && ! grep -q "tracking_token:" backend/src/seeders/20260101000000-demo-data.cjs && ! grep -q "TRUNCATE" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "bulkDelete" backend/src/seeders/20260101000000-demo-data.cjs && grep -q "\"db:seed\":\\s*\"sequelize db:seed:all\"" backend/package.json && grep -q "\"db:seed:undo\":\\s*\"sequelize db:seed:undo:all\"" backend/package.json && grep -q "yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed" backend/package.json && cd backend && yarn db:seed && [ "$(psql "$DATABASE_URL" -tAc "SELECT (SELECT count(*) FROM users) || '/' || (SELECT count(*) FROM recipients) || '/' || (SELECT count(*) FROM campaigns)" | tr -d '[:space:]')" = "1/10/3" ] && [ "$(psql "$DATABASE_URL" -tAc "SELECT password_hash ~ '^\\\$2[aby]\\\$' FROM users WHERE email='demo@example.com'" | tr -d '[:space:]')" = "t" ]</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/seeders/20260101000000-demo-data.cjs` exists as a `.cjs` file (Pitfall 6)
    - Seeder imports bcryptjs via `const bcrypt = require('bcryptjs')` — NOT `import` (CJS context)
    - `bcrypt.hash('demo1234', 10)` — password hashed with cost factor 10
    - Demo user: exactly 1, `email: 'demo@example.com'`, `name: 'Demo Marketer'`
    - 10 recipients: exactly 10, all with `@example.com` domains, 1 nullable name field usage
    - 3 campaigns: exactly 3, `status` values in `['draft', 'scheduled', 'sent']` exactly once each
    - Scheduled campaign: `scheduled_at` = now + 24h (future); sent campaign: `scheduled_at` = now - 2h (past)
    - Draft campaign has ZERO `campaign_recipients` rows
    - Scheduled campaign has 3 `campaign_recipients` rows all `status: 'pending'`
    - Sent campaign has 5 `campaign_recipients` rows: 4 `status: 'sent'` (1 with `opened_at` non-null) + 1 `status: 'failed'`
    - `tracking_token` is OMITTED from ALL `bulkInsert('campaign_recipients', ...)` payloads (relies on DB default)
    - `down()` does NOT contain `TRUNCATE`; uses `bulkDelete` with stable-key where-clauses
    - `backend/package.json` scripts block has `db:seed: "sequelize db:seed:all"`, `db:seed:undo: "sequelize db:seed:undo:all"`, AND updated `db:reset: "yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed"`
    - `cd backend && yarn db:seed` exits 0 against a freshly migrated DB
    - Post-seed: row counts introspection returns `1/10/3`; password hash matches `^\$2[aby]\$`; tracking_token is non-null on all 8 junction rows (3 scheduled + 5 sent)
    - All `campaign_recipients.tracking_token` values are distinct UUIDs (unique constraint upheld)
  </acceptance_criteria>
  <done>Seeder + db:seed* scripts + updated db:reset committed; fresh `yarn db:seed` against clean postgres produces exactly 1/10/3 rows with demo-viable stats distribution + bcrypt password hash + DB-defaulted tracking tokens.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Phase 2 acceptance gate (fresh db:reset + re-verify all DATA-01/02/03 checks)</name>
  <files>(no file changes — verification + gate task)</files>
  <what-built>
    All of Phase 2 DATA-01 (models from Plan 02-02), DATA-02 (schema from Plan 02-03), and DATA-03 (seed from Plan 02-04 Task 1) now exist. This task runs the full Phase 2 acceptance gate: re-execute `yarn db:reset` from a wiped DB and re-run every automated Per-Task Verification Map row from `02-VALIDATION.md` (Plan 02-C + 02-D rows) to prove the entire phase works end-to-end from a cold start.
  </what-built>
  <read_first>
    - `02-VALIDATION.md` §Per-Task Verification Map — ALL rows for Plan 02-C (Wave 3) and Plan 02-D (Wave 4)
    - `02-VALIDATION.md` §Manual-Only Verifications — `docker compose up -d postgres` produces healthy container + `\d campaigns` visual review
    - `ROADMAP.md` Phase 2 success criteria 1-5 — close all of them here
    - `02-VALIDATION.md` §Validation Sign-Off checklist
  </read_first>
  <how-to-verify>
    **Pre-flight:** Shut down any leftover postgres + restart clean to catch drift:
    ```bash
    # From repo root
    docker compose down postgres 2>/dev/null || true
    docker compose up -d postgres
    # Wait for health (compose healthcheck uses pg_isready)
    until docker compose ps postgres 2>/dev/null | grep -q "healthy"; do sleep 1; done
    export DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns   # or source backend/.env
    ```

    **Step 1 — Fresh full-stack reset:**
    ```bash
    cd backend
    rm -rf node_modules/.cache 2>/dev/null || true   # belt-and-suspenders vs any CLI caching
    yarn db:reset   # = migrate:undo:all && migrate && seed
    ```
    Expected: exits 0 with SequelizeMeta entries for all 6 migrations + SequelizeData entry for the 1 seeder.

    **Step 2 — Re-execute ALL Per-Task Verification Map rows from `02-VALIDATION.md` (verbatim):**

    Plan 02-C (Wave 3) DATA-02 rows:
    ```bash
    # pgcrypto:
    [ "$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'" | tr -d '[:space:]')" = "1" ] || echo FAIL-pgcrypto

    # 4-state + 3-state ENUM labels:
    psql "$DATABASE_URL" -tAc "SELECT t.typname || ':' || array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ',') FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'enum_%' GROUP BY 1 ORDER BY 1"
    # Must output exactly:
    #   enum_campaign_recipients_status:pending,sent,failed
    #   enum_campaigns_status:draft,scheduled,sending,sent

    # tracking_token: UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()
    psql "$DATABASE_URL" -c "\d campaign_recipients" | grep tracking_token
    # Must contain: tracking_token | uuid | not null | gen_random_uuid()

    # Composite PK:
    psql "$DATABASE_URL" -tAc "SELECT attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) JOIN pg_class c ON c.oid=i.indrelid WHERE i.indisprimary AND c.relname='campaign_recipients' ORDER BY array_position(i.indkey::int[], a.attnum)"
    # Must output: campaign_id\nrecipient_id

    # FK cascades (2 lines with ON UPDATE CASCADE ON DELETE CASCADE):
    psql "$DATABASE_URL" -c "\d campaign_recipients" | grep -c "ON UPDATE CASCADE ON DELETE CASCADE"
    # Must output: 2

    # Index list contains all 5 expected names:
    psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname"
    # Must include: idx_campaigns_created_by_created_at_id, idx_campaign_recipients_campaign_id_status,
    #               campaign_recipients_tracking_token_key, users_email_key, recipients_email_key

    # Round-trip still clean (extra safety — wipes + reapplies everything):
    yarn db:reset  # full migrate:undo:all + migrate + seed — second run from mid-gate; must exit 0
    ```

    Plan 02-D (Wave 4) DATA-03 rows:
    ```bash
    # Row counts:
    [ "$(psql "$DATABASE_URL" -tAc "SELECT (SELECT count(*) FROM users) || '/' || (SELECT count(*) FROM recipients) || '/' || (SELECT count(*) FROM campaigns)" | tr -d '[:space:]')" = "1/10/3" ] || echo FAIL-rowcounts

    # Campaign status distribution (exactly 3 lines: draft:1, scheduled:1, sent:1):
    psql "$DATABASE_URL" -tAc "SELECT status || ':' || count(*) FROM campaigns GROUP BY status ORDER BY status"

    # Sent campaign stats (exactly 3 lines: failed:false:1, sent:false:3, sent:true:1 → yields 80% send_rate, 25% open_rate):
    psql "$DATABASE_URL" -tAc "SELECT cr.status || ':' || (cr.opened_at IS NOT NULL)::text || ':' || count(*) FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE c.status='sent' GROUP BY 1 ORDER BY 1"

    # bcrypt password hash:
    [ "$(psql "$DATABASE_URL" -tAc "SELECT password_hash ~ '^\\\$2[aby]\\\$' FROM users WHERE email='demo@example.com'" | tr -d '[:space:]')" = "t" ] || echo FAIL-bcrypt

    # tracking_token DB default worked on all junction rows:
    [ "$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM campaign_recipients WHERE tracking_token IS NOT NULL" | tr -d '[:space:]')" = "8" ] || echo FAIL-tokens
    ```

    **Step 3 — Typecheck smoke:**
    ```bash
    yarn workspace @campaign/backend typecheck   # must still exit 0; tsconfig excludes migrations/seeders
    ```

    **Step 4 — Visual review of campaigns table schema** (per 02-VALIDATION.md §Manual-Only):
    ```bash
    psql "$DATABASE_URL" -c "\d campaigns"
    ```
    Visually confirm:
    - `id` BIGINT auto-increment PRIMARY KEY
    - `name` VARCHAR(255) NOT NULL
    - `subject` VARCHAR(255) NOT NULL
    - `body` TEXT NOT NULL
    - `status` enum_campaigns_status NOT NULL DEFAULT 'draft'::enum_campaigns_status
    - `scheduled_at` TIMESTAMPTZ (nullable — no NOT NULL)
    - `created_by` BIGINT NOT NULL with FK to `users(id)` ON UPDATE CASCADE ON DELETE CASCADE
    - `created_at` + `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()
    - Index `idx_campaigns_created_by_created_at_id` btree `(created_by, created_at DESC, id DESC)`

    **Step 5 — ROADMAP Phase 2 success criteria checklist (tick all 5 TRUE):**
    - [ ] SC-1: Sequelize models + migrations for User, Campaign, Recipient, CampaignRecipient — TRUE (DATA-01 + DATA-02)
    - [ ] SC-2: Campaigns ENUM is 4-state, recipients ENUM is 3-state, both locked day 1 — TRUE
    - [ ] SC-3: `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` present on campaign_recipients — TRUE
    - [ ] SC-4: Named composite indexes for pagination + stats present; composite PK `(campaign_id, recipient_id)` present — TRUE
    - [ ] SC-5: Seed creates 1 user + 10 recipients + 3 campaigns (draft + scheduled + sent) — TRUE

    If ANY check fails, report the failing row + the actual vs. expected output, and return to the relevant plan for remediation (Plan 02-03 for schema issues, this plan Task 1 for seed issues).
  </how-to-verify>
  <resume-signal>Type "approved" once all Per-Task rows are green, ROADMAP Phase 2 success criteria 1-5 are all TRUE, and typecheck still exits 0. If any row fails, report the row name + actual-vs-expected output and describe which plan needs remediation.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| seed source → postgres | Seeder INSERTs demo rows under full DB privileges. Seeder file is version-controlled and reviewed; no user input crosses this boundary. |
| bcryptjs → password_hash column | Demo password `demo1234` is a PLAINTEXT string embedded in the seeder source for the demo account only. The DB stores ONLY the bcrypt hash (one-way). |
| `tracking_token` default → public URL space | Phase 6 pixel route exposes `tracking_token` in a public URL. DB-side `gen_random_uuid()` default guarantees 122 bits of entropy per seeded junction row. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-04-01 | Information Disclosure (V6 — password handling) | Demo user password | mitigate | Password `demo1234` is embedded as plaintext in the SEEDER SOURCE (a demo credential, not a real user credential). The DATABASE stores ONLY `bcrypt.hash('demo1234', 10)` — a ~60-char one-way hash prefixed with `$2a$`/`$2b$`/`$2y$`. Task 1 verify asserts the regex `^\$2[aby]\$` matches. Phase 10 README documents `demo/demo1234` as the demo login credential — a demo account exposed by design for reviewer walkthrough. |
| T-02-04-02 | Information Disclosure (V6 — weak hash factor) | bcrypt cost factor | accept | Cost factor 10 is the bcryptjs default + industry standard for ~100ms hash time. Adequate for Phase 2 demo + Phase 3 auth (which uses the same cost). Higher factors (12+) trade demo UX for marginal security on an explicitly-public demo credential. |
| T-02-04-03 | Tampering (V14 — non-idempotent down) | Seeder `down()` | mitigate | Down function uses `bulkDelete` with stable-key match-sets (email for users/recipients, campaign name for the 3 seeded campaigns) — NOT `TRUNCATE` or `DELETE FROM <table>` without WHERE. Re-running `db:seed:undo:all` is safe regardless of whether previous seeds ran fully or partially. Phase 7 tests can seed their own rows alongside without being wiped by `db:seed:undo:all`. |
| T-02-04-04 | Integrity (V14 — partial seed on failure) | Seeder `up()` | accept | If `bulkInsert` on campaigns fails mid-run, partial users + recipients rows would remain. sequelize-cli runs each seeder file in an implicit transaction ONLY when the dialect supports it; Postgres does. `queryInterface.bulkInsert` inside `up()` runs within the CLI's internal transaction, so a mid-`up` failure rolls back all inserts up to that point (Research observation; not explicitly verified but standard for Sequelize 6 + Postgres). |
| T-02-04-05 | Spoofing / Information Disclosure (C17 — seeded tracking_tokens) | `campaign_recipients.tracking_token` on seeded rows | mitigate | Seeder OMITS `tracking_token` from `bulkInsert` payload entirely — relies on the `gen_random_uuid()` DB-side default installed by migration 000004. Every seeded junction row gets a fresh 122-bit random UUID. Task 1 verify asserts all 8 tokens are non-null + (by the UNIQUE constraint) distinct. This closes C17 end-to-end: the public pixel URL (Phase 6) uses these tokens, and they were never guessable, never pre-computed, never embedded in source. |
| T-02-04-06 | DoS (V14 — row-count drift) | Seed row counts | mitigate | Task 1 verify asserts `COUNT(users)/COUNT(recipients)/COUNT(campaigns) = 1/10/3` exactly. Exact counts pin the demo stats distribution (send_rate=80%, open_rate=25%) — any drift would break Phase 4 CAMP-08's demoability. Row-count introspection in the gate catches accidental duplicate inserts. |
| T-02-04-07 | Configuration drift (V14 — db:reset script) | `backend/package.json` | mitigate | `db:reset` now = `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed`. Chains ALL 3 steps so a developer running `yarn db:reset` always gets a fully-populated DB in one command. Task 1 grep gate asserts the literal chain. |

No V2/V3/V4/V5/V8 threats apply directly — auth/token flows are Phase 3 + 5; Zod validation is Phase 4; PII handling is minimal at Phase 2 (names + emails for a demo account).
</threat_model>

<verification>
Plan 02-04 closes Phase 2. Post-plan state:

1. `backend/src/seeders/20260101000000-demo-data.cjs` exists, is `.cjs`, uses `require('bcryptjs')` + `bcrypt.hash('demo1234', 10)`.
2. `backend/package.json` has 2 new scripts (`db:seed`, `db:seed:undo`) and an updated `db:reset` that chains seed.
3. `cd backend && yarn db:reset` against a clean postgres produces:
   - Exactly 1 user (demo@example.com, bcrypt-hashed password)
   - Exactly 10 recipients (Alice..Jack @example.com)
   - Exactly 3 campaigns (draft + scheduled + sent) owned by the demo user
   - 8 junction rows with `tracking_token` auto-filled by DB default
   - Sent campaign stats yield 80% send_rate / 25% open_rate
4. All 02-VALIDATION.md Per-Task Verification Map rows for Plan 02-C + 02-D are green against the freshly-reset DB.
5. `yarn workspace @campaign/backend typecheck` exits 0 (tsconfig still excludes `src/seeders/**`).
6. ROADMAP Phase 2 success criteria 1-5: ALL TRUE.

**Phase 2 closure — all 3 requirements delivered:**
- DATA-01 (models) — delivered in Plan 02-02; reconfirmed alive in this plan by typecheck + seed-using-migrations-matching-model-shape
- DATA-02 (schema) — delivered in Plan 02-03; reconfirmed alive via full `db:reset` + all psql introspection queries
- DATA-03 (seed) — delivered in Plan 02-04 Task 1; confirmed alive via row count + stats + bcrypt queries

**Phase 3 unblocked:** Phase 3 auth (AUTH-01..07) can import `User` from `backend/src/db/index.ts`, hash new-user passwords with the same bcryptjs + cost-10 pattern, and rely on the pre-seeded demo user for manual smoke testing of login flows.
</verification>

<success_criteria>
- [ ] `backend/src/seeders/20260101000000-demo-data.cjs` exists as a CJS file
- [ ] Seeder uses `require('bcryptjs')` (not `import`); hashes `demo1234` with cost factor 10
- [ ] Demo user created with `email: 'demo@example.com'` + `name: 'Demo Marketer'`
- [ ] 10 recipients created with realistic names (Alice..Jack) + `@example.com` emails
- [ ] 3 campaigns created owned by the demo user: 1 draft (empty), 1 scheduled (+1d, 3 pending junction rows), 1 sent (-2h, 5 mixed junction rows)
- [ ] Draft campaign has ZERO junction rows
- [ ] Scheduled campaign has 3 junction rows, all `status='pending'`
- [ ] Sent campaign has 5 junction rows: 4 `status='sent'` (exactly 1 with `opened_at` non-null) + 1 `status='failed'`
- [ ] Seeder OMITS `tracking_token` from ALL `campaign_recipients` bulkInsert payloads — relies on DB default
- [ ] Seeder `down()` does NOT use `TRUNCATE`; uses `bulkDelete` with stable-key filters (email + campaign name)
- [ ] `backend/package.json` has `db:seed` + `db:seed:undo` scripts; `db:reset` is now `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed`
- [ ] `cd backend && yarn db:reset` exits 0 against a clean postgres
- [ ] Row counts introspection returns `1/10/3`
- [ ] Campaign status distribution introspection returns exactly 3 lines: `draft:1`, `scheduled:1`, `sent:1`
- [ ] Sent campaign recipients distribution returns exactly 3 lines: `failed:false:1`, `sent:false:3`, `sent:true:1` (→ send_rate 80%, open_rate 25%)
- [ ] `password_hash ~ '^\$2[aby]\$'` on demo user returns `t`
- [ ] All 8 seeded junction rows have non-null, distinct `tracking_token` UUIDs (DB default fired correctly)
- [ ] All Per-Task Verification Map rows from `02-VALIDATION.md` Plan 02-C + 02-D pass
- [ ] `yarn workspace @campaign/backend typecheck` exits 0
- [ ] ROADMAP Phase 2 success criteria 1-5 all TRUE
- [ ] Task 2 checkpoint received explicit "approved" signal from human verifier
</success_criteria>

<output>
After completion, create `.planning/phases/02-schema-migrations-seed/02-04-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.

Handoff to Phase 3 (Auth — AUTH-01..07):
- `User` model + underlying `users` table are schema-stable; `password_hash VARCHAR(255)` accommodates bcryptjs 3.x hashes (60 chars) + future algo migration.
- `bcryptjs@^3.0.3` is installed in `backend/package.json`; Phase 3 auth routes use the same `bcrypt.hash(password, 10)` + `bcrypt.compare(plain, hash)` pair for `POST /auth/register` and `POST /auth/login`.
- Demo user `demo@example.com` / `demo1234` is pre-seeded for manual smoke testing of Phase 3 login flows + Phase 10 README walkthrough (UI-02 landing form).
- Phase 3's `buildApp()` can now call `await sequelize.authenticate()` at startup — connection string is proven working by this plan's repeated `db:reset` cycles.
- `AUTH-07` (users only access their own campaigns) is SCHEMA-enforceable: the `campaigns.created_by` FK is already in place; Phase 3 just adds the `WHERE created_by = $currentUser` clause to every campaign query and returns 404 (not 403) on mismatch.
</output>
