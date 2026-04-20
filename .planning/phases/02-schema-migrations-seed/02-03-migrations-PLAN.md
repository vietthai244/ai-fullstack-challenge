---
phase: 02-schema-migrations-seed
plan: 03
type: execute
wave: 3
depends_on: ["02-01", "02-02"]
files_modified:
  - backend/src/migrations/00000000000000-enable-pgcrypto.cjs
  - backend/src/migrations/20260101000001-create-users.cjs
  - backend/src/migrations/20260101000002-create-recipients.cjs
  - backend/src/migrations/20260101000003-create-campaigns.cjs
  - backend/src/migrations/20260101000004-create-campaign-recipients.cjs
  - backend/src/migrations/20260101000005-create-indexes.cjs
  - backend/package.json
autonomous: true
requirements:
  - DATA-02
requirements_addressed:
  - DATA-02
tags:
  - backend
  - sequelize
  - migrations
  - postgres
  - schema

must_haves:
  truths:
    - "pgcrypto extension is enabled before any table that uses `gen_random_uuid()` — `00000000000000-enable-pgcrypto.cjs` lexically sorts first of all 6 migrations"
    - "Migration FK dependency order is: pgcrypto → users → recipients → campaigns → campaign_recipients → indexes (5 timestamped files 20260101000001..000005 after pgcrypto prefix)"
    - "`campaigns.status` is a native PostgreSQL ENUM with exactly 4 labels in this exact order: `draft,scheduled,sending,sent` — matches `@campaign/shared` CampaignStatusEnum (M4 locked day-one)"
    - "`campaign_recipients.status` is a native PostgreSQL ENUM with exactly 3 labels in this exact order: `pending,sent,failed`"
    - "`campaigns.created_by` has FK to `users(id)` with `ON UPDATE CASCADE ON DELETE CASCADE` (user delete cleans up their campaigns — M1)"
    - "`campaign_recipients.campaign_id` and `campaign_recipients.recipient_id` both have FKs with `ON UPDATE CASCADE ON DELETE CASCADE` (draft delete cleans junction rows)"
    - "`campaign_recipients` PRIMARY KEY is the composite `(campaign_id, recipient_id)` — emitted via `primaryKey: true` on both columns, NO separate addConstraint"
    - "`campaign_recipients.tracking_token` is `UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` — DB-side default (not DataTypes.UUIDV4), 122 bits of entropy (C17)"
    - "`users.email` and `recipients.email` each have a UNIQUE constraint (auto-indexed by Postgres); column width STRING(320) per RFC 5321"
    - "Explicit index `idx_campaigns_created_by_created_at_id` on `campaigns(created_by, created_at DESC, id DESC)` exists — covers CAMP-01 cursor pagination + ownership filter in one B-tree scan"
    - "Explicit index `idx_campaign_recipients_campaign_id_status` on `campaign_recipients(campaign_id, status)` exists — covers CAMP-08 stats aggregation"
    - "NO redundant `addIndex` on columns already covered by inline `unique: true` (users.email, recipients.email, campaign_recipients.tracking_token) — Pitfall 9"
    - "Every migration with an ENUM column drops the ENUM type in `down()` via `DROP TYPE IF EXISTS \"enum_<table>_<column>\"` — otherwise re-up fails with 'type already exists' (Pitfall 7)"
    - "`backend/package.json` adds scripts: `db:migrate`, `db:migrate:undo`, `db:migrate:undo:all`, `db:reset` — all invoking `sequelize` binary (db:seed scripts land in Plan 02-04)"
    - "Full round-trip `yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate` all 4 commands exit 0 — proves idempotency + ENUM drop correctness"
    - "All migration files use `.cjs` extension (Pitfall 6 — backend is `type: module`)"
    - "All migration column names are snake_case (`created_at`, `created_by`, `password_hash`, etc.) — migrations ARE the SQL; `underscored: true` in models handles the JS-side camelCase mapping"
  artifacts:
    - path: "backend/src/migrations/00000000000000-enable-pgcrypto.cjs"
      provides: "Enables pgcrypto extension (required for gen_random_uuid())"
      contains: "CREATE EXTENSION IF NOT EXISTS pgcrypto"
      min_lines: 12
    - path: "backend/src/migrations/20260101000001-create-users.cjs"
      provides: "users table: BIGSERIAL id, email UNIQUE, password_hash, name, timestamps"
      contains: "createTable('users'"
      min_lines: 25
    - path: "backend/src/migrations/20260101000002-create-recipients.cjs"
      provides: "recipients table: BIGSERIAL id, email UNIQUE, nullable name, timestamps"
      contains: "createTable('recipients'"
      min_lines: 20
    - path: "backend/src/migrations/20260101000003-create-campaigns.cjs"
      provides: "campaigns table: 4-state ENUM status DEFAULT 'draft', FK to users(id) CASCADE"
      contains: "ENUM('draft', 'scheduled', 'sending', 'sent')"
      min_lines: 35
    - path: "backend/src/migrations/20260101000004-create-campaign-recipients.cjs"
      provides: "junction table: composite PK, 3-state ENUM, tracking_token UUID default gen_random_uuid(), FK cascades"
      contains: "gen_random_uuid()"
      min_lines: 45
    - path: "backend/src/migrations/20260101000005-create-indexes.cjs"
      provides: "2 explicit composite indexes for pagination + stats"
      contains: "idx_campaigns_created_by_created_at_id"
      min_lines: 25
    - path: "backend/package.json"
      provides: "Adds 4 db:* scripts invoking sequelize CLI binary"
      contains: "\"db:migrate\""
  key_links:
    - from: "backend/src/migrations/00000000000000-enable-pgcrypto.cjs"
      to: "pgcrypto extension"
      via: "CREATE EXTENSION IF NOT EXISTS pgcrypto"
      pattern: "CREATE EXTENSION IF NOT EXISTS pgcrypto"
    - from: "backend/src/migrations/20260101000003-create-campaigns.cjs"
      to: "users(id)"
      via: "references: { model: 'users', key: 'id' } with ON DELETE CASCADE"
      pattern: "references.*model.*users.*key.*id"
    - from: "backend/src/migrations/20260101000004-create-campaign-recipients.cjs"
      to: "pgcrypto gen_random_uuid()"
      via: "Sequelize.literal('gen_random_uuid()') as tracking_token defaultValue"
      pattern: "Sequelize\\.literal\\('gen_random_uuid\\(\\)'\\)"
    - from: "backend/package.json"
      to: "backend/node_modules/.bin/sequelize"
      via: "db:migrate script: 'sequelize db:migrate'"
      pattern: "\"db:migrate\":\\s*\"sequelize db:migrate\""
---

<objective>
Implement DATA-02: six Sequelize CLI migration files (`.cjs`) that build the complete Phase 2 schema from a clean database — pgcrypto extension → users → recipients → campaigns → campaign_recipients → explicit composite indexes — plus the four `db:*` npm scripts in `backend/package.json` that expose the CLI as workspace commands. The schema mirrors the models from Plan 02-02 exactly: 4-state campaign ENUM (`draft|scheduled|sending|sent`), 3-state recipient ENUM (`pending|sent|failed`), composite PK `(campaign_id, recipient_id)` on the junction, `tracking_token UUID UNIQUE DEFAULT gen_random_uuid()` (pgcrypto), FK cascades on user→campaign and campaign/recipient→junction, and two explicit composite indexes that cover cursor pagination (Phase 4) + stats aggregation (Phase 4).

Purpose: Phase 2's **schema half** of DATA-02. The migrations are the durable contract — a reviewer runs `yarn db:migrate:undo:all && yarn db:migrate` and gets a byte-for-byte reproduction of the schema. Every downstream phase (Plan 02-04 seed; Phase 3 auth inserts; Phase 4 CRUD; Phase 5 worker; Phase 6 pixel; Phase 7 tests) talks to these tables. Getting ENUM labels, FK direction, CASCADE semantics, and the UUID default wired correctly here means no re-migration later (M4 forbids it in a single transaction).

Output: 6 `.cjs` migration files under `backend/src/migrations/` + 4 new scripts in `backend/package.json`. A clean round-trip (`migrate:undo:all → migrate → migrate:undo:all → migrate`, all 4 commands exit 0) proves idempotency + ENUM drop correctness; `psql` introspection proves ENUM labels, composite PK, FK cascades, tracking_token default, and all 5 expected indexes/unique constraints exist.
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
@backend/src/models/user.ts
@backend/src/models/recipient.ts
@backend/src/models/campaign.ts
@backend/src/models/campaignRecipient.ts
@CLAUDE.md

<interfaces>
<!-- Contracts this plan depends on / produces. -->

**From `@campaign/shared` (Phase 1 Plan 01-01, re-exported in Plan 01-04) — source of truth for the 4-state ENUM:**
```typescript
// shared/src/schemas/campaign.ts
import { z } from 'zod';
export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;
```
Migration `20260101000003-create-campaigns.cjs` MUST use the literal tuple `'draft', 'scheduled', 'sending', 'sent'` in exactly this order. Any drift breaks `Campaign.findAll({ where: { status: 'draft' } })` at runtime (Research Assumption A3).

**From Plan 02-01 (prerequisites already satisfied):**
- `backend/package.json` has `sequelize@^6.37.8`, `pg@^8.20.0`, `pg-hstore@^2.3.4`, `bcryptjs@^3.0.3`, `dotenv@^17.4.2` deps + `sequelize-cli@^6.6.5` devDep.
- `backend/node_modules/.bin/sequelize` binary exists.
- `backend/.sequelizerc` points sequelize-cli at `src/db/config.cjs`, `src/models`, `src/migrations`, `src/seeders`.
- `backend/src/db/config.cjs` loads dotenv, uses `use_env_variable: 'DATABASE_URL'`, sets `dialect: 'postgres'` + `define: { underscored: true, timestamps: true }`.
- `backend/tsconfig.json` excludes `src/migrations/**` and `src/seeders/**` — migrations don't need typecheck.
- `docker-compose.yml` (root) with postgres:16-alpine.
- `backend/.env.example` documents `DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns`.

**From Plan 02-02 (model ENUM labels — must mirror exactly in migrations):**
```typescript
// backend/src/models/campaign.ts — field excerpt
status: {
  type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent'),
  allowNull: false,
  defaultValue: 'draft',
},

// backend/src/models/campaignRecipient.ts — field excerpts
campaignId:    { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
recipientId:   { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
trackingToken: {
  type: DataTypes.UUID,
  allowNull: false,
  unique: true,
  defaultValue: Sequelize.literal('gen_random_uuid()'),
},
status: {
  type: DataTypes.ENUM('pending', 'sent', 'failed'),
  allowNull: false,
  defaultValue: 'pending',
},
```
Migrations must emit column types + defaults that match — models don't sync, they adopt what migrations created. Research Assumption A3 confirms a single `enum_<table>_<column>` PG type is shared between the model and the migration — there's no re-creation at model load time.

**Sequelize 6 migration API surface used in this plan:**
```js
// Migration module shape (CJS)
module.exports = {
  async up(queryInterface, Sequelize) { /* DDL */ },
  async down(queryInterface, Sequelize) { /* inverse DDL */ },
};

// queryInterface methods used:
queryInterface.createTable(name, columns)             // emits CREATE TABLE
queryInterface.dropTable(name)                        // emits DROP TABLE (does NOT drop ENUM types!)
queryInterface.addIndex(table, { name, fields })      // emits CREATE INDEX
queryInterface.removeIndex(table, indexName)          // emits DROP INDEX
queryInterface.sequelize.query(rawSql)                // for CREATE EXTENSION / DROP TYPE

// Sequelize namespace used:
Sequelize.BIGINT, STRING(n), TEXT, DATE, UUID, ENUM(...values)
Sequelize.fn('NOW')                                   // DEFAULT NOW() for timestamps
Sequelize.literal('gen_random_uuid()')                // raw SQL fragment for UUID default
```

**Research Assumption A4 (high-impact, unverified):** `Sequelize.literal('gen_random_uuid()')` as a column `defaultValue` renders as unquoted `DEFAULT gen_random_uuid()` in the emitted DDL. Post-migration `psql -c "\d campaign_recipients"` MUST show `default gen_random_uuid()` on the `tracking_token` column (no quotes around the function call). The Per-Task Verify for Task 2 greps for this exact pattern.

**Filename conventions (locked):**
- First file: `00000000000000-enable-pgcrypto.cjs` — numeric-zero prefix ensures lexical-first ordering regardless of later migration timestamps.
- Tables: `20260101000001-create-users.cjs`, `20260101000002-create-recipients.cjs`, `20260101000003-create-campaigns.cjs`, `20260101000004-create-campaign-recipients.cjs` — 4 sequential timestamps, strict FK dependency order.
- Indexes: `20260101000005-create-indexes.cjs` — runs last; adds the two explicit composite indexes on already-existing tables.

Research sidesteps: `02-RESEARCH.md` code samples use `20260422...` prefixes, but this plan locks `20260101...` per the planning context — only the DATE digits differ; every other byte is verbatim from the research.

**Locked decisions honored (from `.planning/PROJECT.md` §Key Decisions + `02-RESEARCH.md` §User Constraints):**
- Sequelize CLI migrations — not raw SQL, not Drizzle, not Prisma.
- `.cjs` extension for every file sequelize-cli loads (Pitfall 6).
- Snake-case columns in migrations (`underscored: true` handles JS-side camelCase mapping).
- 4-state campaign ENUM + 3-state recipient ENUM locked day 1 (M4).
- pgcrypto extension first migration (C3 + C17).
- `tracking_token UUID UNIQUE DEFAULT gen_random_uuid()` — DB-side default (C17).
- Explicit composite indexes for pagination + stats; NO duplicate index for inline `unique: true` columns (Pitfall 9).
- Down functions drop ENUM types explicitly (Pitfall 7).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: pgcrypto extension + users + recipients migrations</name>
  <files>backend/src/migrations/00000000000000-enable-pgcrypto.cjs, backend/src/migrations/20260101000001-create-users.cjs, backend/src/migrations/20260101000002-create-recipients.cjs</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 5 (Migration file shape) — the `00000000000000-enable-pgcrypto.cjs` example (lines 471-488) + `20260422000001-create-users.cjs` example (lines 490-525) — copy verbatim, only changing the date prefix
    - `02-RESEARCH.md` §Code Examples → Migration: create-recipients.cjs (lines 1234-1254) — copy verbatim, only changing the date prefix
    - `02-RESEARCH.md` §Common Pitfalls §Pitfall 1 (FK order / pgcrypto first) + §Pitfall 6 (.cjs extension) + §Pitfall 9 (inline unique vs addIndex)
    - `02-VALIDATION.md` row "Plan 02-C Wave 3 DATA-02 (migration order)" — expects `ls src/migrations/*.cjs | head -1` starts with `00000000000000-enable-pgcrypto`
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (pgcrypto)" — expects `SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'` returns `1`
    - `backend/src/models/user.ts` — column widths (`email STRING(320)`, `password_hash STRING(255)`, `name STRING(200)`) must match the migration
    - `backend/src/models/recipient.ts` — same widths; `name` is nullable
  </read_first>
  <action>
    **Pre-flight:** Ensure `docker compose up -d postgres` has a healthy postgres container — migrations need a live DB. `export DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns` or source `backend/.env` (copied from `backend/.env.example` in Plan 02-01).

    Create **`backend/src/migrations/00000000000000-enable-pgcrypto.cjs`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 5 first example):

    ```js
    'use strict';

    /** @type {import('sequelize-cli').Migration} */
    module.exports = {
      async up(queryInterface /* , Sequelize */) {
        await queryInterface.sequelize.query(
          'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
        );
      },

      async down(/* queryInterface */) {
        // Intentional no-op: pgcrypto may be shared with other tooling on this DB.
        // Safe to leave — `CREATE EXTENSION IF NOT EXISTS` is idempotent on re-up.
      },
    };
    ```

    Rationale for the no-op `down()`: per 02-RESEARCH.md §Pattern 5, dropping the extension via `DROP EXTENSION IF EXISTS pgcrypto` is unsafe — a shared dev DB may have other tooling (or future Phase 3 auth, Phase 5 worker) relying on it. The extension is idempotent to create, so leaving it on an undo doesn't break the re-up. Round-trip correctness is preserved.

    The `00000000000000-` numeric prefix is intentional — it sorts lexically before any `20260101...` timestamp, so even if a later migration accidentally gets a pre-2026 timestamp, pgcrypto still runs first (C3 / Pitfall 1 defense).

    Create **`backend/src/migrations/20260101000001-create-users.cjs`** with EXACTLY this content (adapted from 02-RESEARCH.md §Pattern 5 create-users example — only the filename's date prefix differs from the research):

    ```js
    'use strict';

    /** @type {import('sequelize-cli').Migration} */
    module.exports = {
      async up(queryInterface, Sequelize) {
        await queryInterface.createTable('users', {
          id: {
            type: Sequelize.BIGINT,
            autoIncrement: true,
            primaryKey: true,
          },
          email: {
            type: Sequelize.STRING(320),
            allowNull: false,
            unique: true,          // creates a UNIQUE constraint inline (Postgres auto-indexes unique constraints)
          },
          password_hash: {
            type: Sequelize.STRING(255),     // bcryptjs 2b hashes are 60 chars; 255 is safe for future algo migration
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING(200),
            allowNull: false,
          },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
      },

      async down(queryInterface /* , Sequelize */) {
        await queryInterface.dropTable('users');
      },
    };
    ```

    Key invariants:
    - Column names are snake_case (`password_hash`, `created_at`, `updated_at`) — matches `underscored: true` in `backend/src/models/user.ts`.
    - `email` at 320 chars (RFC 5321 max) + `name` at 200 chars + `password_hash` at 255 chars — match model widths.
    - `unique: true` inline on `email` → Postgres auto-creates a UNIQUE index `users_email_key` (Pitfall 9 — do NOT also `addIndex` later).
    - No ENUM column on users → `down()` does NOT need a `DROP TYPE`.

    Create **`backend/src/migrations/20260101000002-create-recipients.cjs`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Code Examples → Migration: create-recipients.cjs):

    ```js
    'use strict';

    /** @type {import('sequelize-cli').Migration} */
    module.exports = {
      async up(queryInterface, Sequelize) {
        await queryInterface.createTable('recipients', {
          id:    { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
          email: { type: Sequelize.STRING(320), allowNull: false, unique: true },
          name:  { type: Sequelize.STRING(200), allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
      },
      async down(queryInterface) {
        await queryInterface.dropTable('recipients');
      },
    };
    ```

    Differences vs. users: `name` is nullable (allowNull: true) — recipients may be imported with just an email; no `password_hash` (recipients don't log in). Same UNIQUE index + snake_case + no ENUM.

    **Verify locally before committing** by running:
    ```bash
    cd backend
    # Temporarily add db:migrate script (final scripts land in Task 3)
    npx sequelize db:migrate:undo:all  # wipe any previous state
    npx sequelize db:migrate            # run the 3 new migrations
    psql "$DATABASE_URL" -tAc "SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'"  # → 1
    psql "$DATABASE_URL" -c "\d users"       # shows id BIGINT PK, email UNIQUE, password_hash, name, timestamps
    psql "$DATABASE_URL" -c "\d recipients"  # shows id BIGINT PK, email UNIQUE, name (nullable), timestamps
    npx sequelize db:migrate:undo:all  # clean state for Task 2
    ```
    If the `npx sequelize` command complains about a missing config, confirm `backend/.sequelizerc` + `backend/src/db/config.cjs` exist from Plan 02-01 and `DATABASE_URL` is exported.
  </action>
  <verify>
    <automated>test -f backend/src/migrations/00000000000000-enable-pgcrypto.cjs && test -f backend/src/migrations/20260101000001-create-users.cjs && test -f backend/src/migrations/20260101000002-create-recipients.cjs && grep -q "CREATE EXTENSION IF NOT EXISTS pgcrypto" backend/src/migrations/00000000000000-enable-pgcrypto.cjs && grep -q "createTable('users'" backend/src/migrations/20260101000001-create-users.cjs && grep -q "password_hash" backend/src/migrations/20260101000001-create-users.cjs && grep -q "unique: true" backend/src/migrations/20260101000001-create-users.cjs && grep -q "createTable('recipients'" backend/src/migrations/20260101000002-create-recipients.cjs && grep -q "allowNull: true" backend/src/migrations/20260101000002-create-recipients.cjs && ls backend/src/migrations/*.cjs | head -1 | grep -q "00000000000000-enable-pgcrypto"</automated>
  </verify>
  <acceptance_criteria>
    - Three `.cjs` files exist at the exact paths listed above
    - `00000000000000-enable-pgcrypto.cjs` contains `CREATE EXTENSION IF NOT EXISTS pgcrypto` and sorts lexically first among all `backend/src/migrations/*.cjs`
    - `20260101000001-create-users.cjs` creates `users` table with BIGINT PK id, STRING(320) unique email, STRING(255) password_hash, STRING(200) name, timestamps
    - `20260101000002-create-recipients.cjs` creates `recipients` table with BIGINT PK id, STRING(320) unique email, STRING(200) nullable name, timestamps
    - All three files use `.cjs` extension (Pitfall 6)
    - All column names in migrations are snake_case (no `passwordHash`, `createdAt`, etc.)
    - No `addIndex` on `email` columns — inline `unique: true` handles it (Pitfall 9)
    - `down()` functions invert correctly: pgcrypto no-op, users/recipients drop their table
    - Post-migration psql introspection (if DB is up): `SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'` returns `1`; `\d users` + `\d recipients` show expected columns
  </acceptance_criteria>
  <done>3 migration files committed; pgcrypto + users + recipients up/down verified locally; next task creates campaigns + junction that depend on users + recipients + pgcrypto.</done>
</task>

<task type="auto">
  <name>Task 2: campaigns + campaign_recipients migrations (ENUMs, FK cascades, composite PK, tracking_token)</name>
  <files>backend/src/migrations/20260101000003-create-campaigns.cjs, backend/src/migrations/20260101000004-create-campaign-recipients.cjs</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 5 — `20260422000003-create-campaigns.cjs` example (lines 527-563) — copy verbatim, changing only the date prefix
    - `02-RESEARCH.md` §Pattern 5 — `20260422000004-create-campaign-recipients.cjs` example (lines 565-617) — copy verbatim, changing only the date prefix
    - `02-RESEARCH.md` §Common Pitfalls §Pitfall 3 (M1 FK cascade) + §Pitfall 4 (M4 4-state ENUM locked) + §Pitfall 5 (C17 tracking_token unguessability) + §Pitfall 7 (ENUM type drop on down)
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (4-state enum)" — expects exact ENUM labels: `enum_campaigns_status:draft,scheduled,sending,sent` and `enum_campaign_recipients_status:pending,sent,failed`
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (tracking_token)" — expects `\d campaign_recipients` shows `tracking_token uuid NOT NULL DEFAULT gen_random_uuid()` + UNIQUE index
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (composite PK)" — expects `SELECT attname FROM pg_index ... WHERE indisprimary ... relname='campaign_recipients'` returns exactly `campaign_id` then `recipient_id`
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (FK cascade)" — expects `\d campaign_recipients` shows two lines with `ON UPDATE CASCADE ON DELETE CASCADE`
    - `backend/src/models/campaign.ts` — confirm ENUM literals `'draft', 'scheduled', 'sending', 'sent'` in exact order; FK `createdBy` with CASCADE
    - `backend/src/models/campaignRecipient.ts` — confirm ENUM literals `'pending', 'sent', 'failed'`; composite PK via `primaryKey: true` on both columns; tracking_token UUID default via `Sequelize.literal('gen_random_uuid()')`
    - `shared/src/schemas/campaign.ts` — verify CampaignStatusEnum is `['draft', 'scheduled', 'sending', 'sent']`
  </read_first>
  <action>
    Create **`backend/src/migrations/20260101000003-create-campaigns.cjs`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 5 create-campaigns example, only date prefix differs):

    ```js
    'use strict';

    /** @type {import('sequelize-cli').Migration} */
    module.exports = {
      async up(queryInterface, Sequelize) {
        await queryInterface.createTable('campaigns', {
          id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
          name:    { type: Sequelize.STRING(255), allowNull: false },
          subject: { type: Sequelize.STRING(255), allowNull: false },
          body:    { type: Sequelize.TEXT,         allowNull: false },
          status: {
            type: Sequelize.ENUM('draft', 'scheduled', 'sending', 'sent'),
            allowNull: false,
            defaultValue: 'draft',
          },
          scheduled_at: { type: Sequelize.DATE, allowNull: true },
          created_by: {
            type: Sequelize.BIGINT,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',     // user delete cleans up their campaigns (M1)
          },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
      },

      async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('campaigns');
        // Drop the ENUM type Sequelize auto-created — otherwise re-up() fails with "type already exists" (Pitfall 7)
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_campaigns_status";');
      },
    };
    ```

    Critical invariants for campaigns:
    - **ENUM literal tuple is `'draft', 'scheduled', 'sending', 'sent'` — EXACT order, spelling, lowercase** — must match `@campaign/shared` CampaignStatusEnum verbatim (M4 — cannot ALTER TYPE inside a transaction; locked day-one).
    - `defaultValue: 'draft'` — new campaigns start in draft per CAMP-02.
    - `scheduled_at` is nullable — only set when CAMP-06 schedules the campaign.
    - FK `created_by` → `users(id)` with `onDelete: 'CASCADE'` (M1) — user deletion cleans up their campaigns atomically at the DB level, not via Sequelize hooks (which can be bypassed).
    - `down()` drops the auto-generated PG ENUM type `enum_campaigns_status` — without this, a fresh `migrate:undo:all && migrate` cycle fails (Pitfall 7 verified in round-trip test of Task 3).

    Create **`backend/src/migrations/20260101000004-create-campaign-recipients.cjs`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 5 create-campaign-recipients example, only date prefix differs):

    ```js
    'use strict';

    /** @type {import('sequelize-cli').Migration} */
    module.exports = {
      async up(queryInterface, Sequelize) {
        await queryInterface.createTable('campaign_recipients', {
          campaign_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,           // Part of composite PK
            references: { model: 'campaigns', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',        // DELETE CASCADE — draft-campaign delete wipes junction rows (M1)
          },
          recipient_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            primaryKey: true,           // Second half of composite PK
            references: { model: 'recipients', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',        // Deleting a recipient wipes their junction rows
          },
          tracking_token: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
            defaultValue: Sequelize.literal('gen_random_uuid()'),   // pgcrypto must be enabled — migration 00...pgcrypto runs first
          },
          status: {
            type: Sequelize.ENUM('pending', 'sent', 'failed'),
            allowNull: false,
            defaultValue: 'pending',
          },
          sent_at:   { type: Sequelize.DATE, allowNull: true },
          opened_at: { type: Sequelize.DATE, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        });
        // Note: `primaryKey: true` on both columns tells Sequelize to emit them as the composite PK.
        // No separate addConstraint('PRIMARY KEY') needed.
      },

      async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('campaign_recipients');
        // Drop auto-created ENUM type (Pitfall 7)
        await queryInterface.sequelize.query(
          'DROP TYPE IF EXISTS "enum_campaign_recipients_status";',
        );
      },
    };
    ```

    Critical invariants for campaign_recipients:
    - **Composite PK via `primaryKey: true` on BOTH `campaign_id` AND `recipient_id`** — Sequelize emits `PRIMARY KEY (campaign_id, recipient_id)` in the CREATE TABLE DDL. NO separate `addConstraint('PRIMARY KEY', ...)` — that would add a second PK and fail.
    - **`tracking_token` is UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()** — `Sequelize.literal('gen_random_uuid()')` renders as unquoted raw SQL in the default (Research Assumption A4). 122 bits of entropy defeats enumeration (C17). The DB-side default means any client (seeder, raw psql, future admin tool) that omits `tracking_token` still gets a UUID.
    - **ENUM tuple `'pending', 'sent', 'failed'` — 3 values, exact order, lowercase** — matches `backend/src/models/campaignRecipient.ts` `RecipientStatus` type.
    - **`inline unique: true` on `tracking_token`** — Postgres auto-creates `campaign_recipients_tracking_token_key` UNIQUE index. NO separate `addIndex('campaign_recipients', ['tracking_token'], { unique: true })` — that would duplicate (Pitfall 9).
    - **Both FKs CASCADE on UPDATE AND DELETE** — draft-campaign DELETE wipes junction rows; recipient DELETE does the same. Verification row "FK cascade" expects exactly two `ON UPDATE CASCADE ON DELETE CASCADE` lines in `\d campaign_recipients`.
    - **`down()` drops `enum_campaign_recipients_status` type** — without this, round-trip test fails.

    **Verify locally after both files written:**
    ```bash
    cd backend
    npx sequelize db:migrate            # runs all 4 migrations now (pgcrypto, users, recipients, campaigns, campaign_recipients)
    # ENUM labels:
    psql "$DATABASE_URL" -tAc "SELECT t.typname || ':' || array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ',') FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'enum_%' GROUP BY 1 ORDER BY 1"
    # Expected: enum_campaign_recipients_status:pending,sent,failed | enum_campaigns_status:draft,scheduled,sending,sent
    # Composite PK:
    psql "$DATABASE_URL" -tAc "SELECT attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) JOIN pg_class c ON c.oid=i.indrelid WHERE i.indisprimary AND c.relname='campaign_recipients' ORDER BY array_position(i.indkey::int[], a.attnum)"
    # Expected: campaign_id\nrecipient_id
    # Tracking token + FK cascades:
    psql "$DATABASE_URL" -c "\d campaign_recipients"  # visually confirm tracking_token uuid NOT NULL DEFAULT gen_random_uuid(); two FK lines with ON UPDATE CASCADE ON DELETE CASCADE
    npx sequelize db:migrate:undo:all   # clean state for Task 3's round-trip proof
    ```
    If `\d campaign_recipients` shows `default 'gen_random_uuid()'::text` (quoted), Research Assumption A4 is wrong — remediation is to use a raw SQL `DEFAULT gen_random_uuid()` fragment via `queryInterface.sequelize.query` instead of `Sequelize.literal`.
  </action>
  <verify>
    <automated>test -f backend/src/migrations/20260101000003-create-campaigns.cjs && test -f backend/src/migrations/20260101000004-create-campaign-recipients.cjs && grep -q "ENUM('draft', 'scheduled', 'sending', 'sent')" backend/src/migrations/20260101000003-create-campaigns.cjs && grep -q "references: { model: 'users', key: 'id' }" backend/src/migrations/20260101000003-create-campaigns.cjs && grep -q "onDelete: 'CASCADE'" backend/src/migrations/20260101000003-create-campaigns.cjs && grep -q "DROP TYPE IF EXISTS \"enum_campaigns_status\"" backend/src/migrations/20260101000003-create-campaigns.cjs && grep -q "ENUM('pending', 'sent', 'failed')" backend/src/migrations/20260101000004-create-campaign-recipients.cjs && grep -cq "primaryKey: true" backend/src/migrations/20260101000004-create-campaign-recipients.cjs && [ "$(grep -c "primaryKey: true" backend/src/migrations/20260101000004-create-campaign-recipients.cjs)" = "2" ] && grep -q "Sequelize.literal('gen_random_uuid()')" backend/src/migrations/20260101000004-create-campaign-recipients.cjs && grep -q "DROP TYPE IF EXISTS \"enum_campaign_recipients_status\"" backend/src/migrations/20260101000004-create-campaign-recipients.cjs && [ "$(grep -c "onDelete: 'CASCADE'" backend/src/migrations/20260101000004-create-campaign-recipients.cjs)" = "2" ]</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist at the exact paths listed above
    - `20260101000003-create-campaigns.cjs` — `status` column uses `Sequelize.ENUM('draft', 'scheduled', 'sending', 'sent')` LITERALLY (exact order, spelling) with `defaultValue: 'draft'`
    - `20260101000003-create-campaigns.cjs` — `created_by` FK with `references: { model: 'users', key: 'id' }`, `onUpdate: 'CASCADE'`, `onDelete: 'CASCADE'`
    - `20260101000003-create-campaigns.cjs` — `down()` calls `DROP TYPE IF EXISTS "enum_campaigns_status"` after dropping the table
    - `20260101000003-create-campaigns.cjs` — `scheduled_at` is nullable (`allowNull: true`), `body` is TEXT not STRING
    - `20260101000004-create-campaign-recipients.cjs` — EXACTLY 2 occurrences of `primaryKey: true` (one each on `campaign_id` and `recipient_id`)
    - `20260101000004-create-campaign-recipients.cjs` — `tracking_token` is UUID with `unique: true` and `defaultValue: Sequelize.literal('gen_random_uuid()')`
    - `20260101000004-create-campaign-recipients.cjs` — EXACTLY 2 `onDelete: 'CASCADE'` (on both FKs)
    - `20260101000004-create-campaign-recipients.cjs` — `status` uses `Sequelize.ENUM('pending', 'sent', 'failed')` with `defaultValue: 'pending'`
    - `20260101000004-create-campaign-recipients.cjs` — `down()` drops `enum_campaign_recipients_status` type
    - No `addIndex` calls for `email`, `tracking_token`, or any column already covered by inline `unique: true` (Pitfall 9 defense)
    - Post-migration psql (if DB is up): ENUM labels match exactly; composite PK returns `campaign_id` then `recipient_id`; `\d campaign_recipients` shows `tracking_token uuid NOT NULL DEFAULT gen_random_uuid()` (no quotes around function)
  </acceptance_criteria>
  <done>campaigns + campaign_recipients migrations committed; 4-state + 3-state ENUMs verified; composite PK + tracking_token + FK cascades in place; down functions drop ENUM types. Task 3 adds indexes + scripts + round-trip gate.</done>
</task>

<task type="auto">
  <name>Task 3: indexes migration + backend db:* scripts + full round-trip gate</name>
  <files>backend/src/migrations/20260101000005-create-indexes.cjs, backend/package.json</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 5 — `20260422000005-create-indexes.cjs` example (lines 619-657) — copy verbatim, only date prefix changes
    - `02-RESEARCH.md` §Pattern 6 (Indexes table) + §Pattern 8 (Backend `package.json` script additions)
    - `02-RESEARCH.md` §Common Pitfalls §Pitfall 9 (inline unique + duplicate addIndex) — this is why there are ONLY 2 `addIndex` calls (not 5 or 6)
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (indexes)" — expects 5 index names in the list: `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, `campaign_recipients_tracking_token_key`, `users_email_key`, `recipients_email_key`
    - `02-VALIDATION.md` row "Plan 02-C DATA-02 (round-trip)" — expects 4-command sequence `yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate` all exit 0
    - `backend/package.json` (existing from Plan 02-01) — current scripts: `build`, `dev`, `typecheck`, `lint`, `test` — preserve these
    - `.planning/research/ARCHITECTURE.md` §2 PostgreSQL Indexing — rationale for the exact index columns chosen
  </read_first>
  <action>
    Create **`backend/src/migrations/20260101000005-create-indexes.cjs`** with EXACTLY this content (adapted from 02-RESEARCH.md §Pattern 5 create-indexes example — only date prefix differs):

    ```js
    'use strict';

    /** @type {import('sequelize-cli').Migration} */
    module.exports = {
      async up(queryInterface /* , Sequelize */) {
        // Covers cursor pagination + ownership filter in a single B-tree scan (C8, C16)
        // Used by CAMP-01 `GET /campaigns` in Phase 4
        await queryInterface.addIndex('campaigns', {
          name: 'idx_campaigns_created_by_created_at_id',
          fields: [
            'created_by',
            { name: 'created_at', order: 'DESC' },
            { name: 'id',         order: 'DESC' },
          ],
        });

        // Covers stats aggregation `COUNT(*) FILTER (WHERE status = 'sent') ... WHERE campaign_id = ?` (C1, C8)
        // Used by CAMP-08 `GET /campaigns/:id/stats` in Phase 4
        await queryInterface.addIndex('campaign_recipients', {
          name: 'idx_campaign_recipients_campaign_id_status',
          fields: ['campaign_id', 'status'],
        });

        // Intentionally NO explicit addIndex for:
        //   - campaign_recipients.tracking_token     (auto-indexed by inline `unique: true` → campaign_recipients_tracking_token_key)
        //   - users.email                            (auto-indexed by inline `unique: true` → users_email_key)
        //   - recipients.email                       (auto-indexed by inline `unique: true` → recipients_email_key)
        //   - campaign_recipients(campaign_id, recipient_id)   (composite PRIMARY KEY is an index by definition)
        // Adding explicit addIndex for any of these duplicates the auto-index and breaks removeIndex on down (Pitfall 9).
      },

      async down(queryInterface /* , Sequelize */) {
        await queryInterface.removeIndex('campaign_recipients', 'idx_campaign_recipients_campaign_id_status');
        await queryInterface.removeIndex('campaigns', 'idx_campaigns_created_by_created_at_id');
      },
    };
    ```

    Index rationale (paste into future `docs/DECISIONS.md` — Phase 10):
    - `idx_campaigns_created_by_created_at_id` — CAMP-01 cursor pagination is `WHERE created_by = $1 AND (created_at, id) < ($cursor_at, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT ?`. The 3-column composite index covers the filter + sort + tiebreak in a single B-tree descending scan. Without it: seq scan + sort on large campaign tables.
    - `idx_campaign_recipients_campaign_id_status` — CAMP-08 stats is `SELECT status, COUNT(*) FILTER (...) FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status`. Composite `(campaign_id, status)` lets Postgres do an index-only scan for the aggregate. Without it: seq scan on every stats fetch.

    Update **`backend/package.json`** to add the 4 db:* scripts. The file currently has (from Plan 02-01):

    ```json
    "scripts": {
      "build": "echo 'backend build deferred to Phase 10' && exit 0",
      "dev": "tsx watch src/index.ts",
      "typecheck": "tsc -p tsconfig.json --noEmit",
      "lint": "eslint src",
      "test": "echo 'backend tests land in Phase 7' && exit 0"
    }
    ```

    Modify the `scripts` object to append these 4 entries (preserve all existing scripts unchanged):

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
      "db:reset": "yarn db:migrate:undo:all && yarn db:migrate"
    }
    ```

    Notes:
    - The `sequelize` binary resolves from `backend/node_modules/.bin/sequelize` (installed by `sequelize-cli@^6.6.5` devDep in Plan 02-01).
    - **`db:seed` and `db:seed:undo` scripts are NOT added here** — they land in Plan 02-04 Task 1. This plan's `db:reset` runs migrate-undo-all + migrate (no seed yet); Plan 02-04 UPDATES `db:reset` to also chain `&& yarn db:seed`.
    - All 4 scripts invoke the local `sequelize` binary via yarn workspace resolution — from the repo root, use `yarn workspace @campaign/backend db:migrate`; from `backend/`, use `yarn db:migrate`.

    **Full round-trip gate (the acceptance proof for DATA-02):**

    Run this exact 4-command sequence from the `backend/` directory after all 6 migration files exist and the scripts are in place:
    ```bash
    cd backend
    yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate
    ```

    Expected: all 4 commands exit 0. The second `undo:all` + `migrate` cycle catches:
    - Missing `DROP TYPE` on any ENUM migration's `down()` (would fail the second `migrate` with `type "enum_..." already exists` — Pitfall 7)
    - Any index that wasn't cleanly removed on undo (Pitfall 9)
    - Any FK dependency-order bug in the filename prefixes

    After round-trip, verify the complete index list via:
    ```bash
    psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname"
    ```
    Expected output contains ALL of:
    - `campaign_recipients_pkey`            (composite PK — auto)
    - `campaign_recipients_tracking_token_key`  (UNIQUE — auto from inline unique: true)
    - `campaigns_pkey`                      (auto PK)
    - `idx_campaign_recipients_campaign_id_status`  (explicit)
    - `idx_campaigns_created_by_created_at_id`      (explicit)
    - `recipients_email_key`                (UNIQUE — auto)
    - `recipients_pkey`                     (auto PK)
    - `users_email_key`                     (UNIQUE — auto)
    - `users_pkey`                          (auto PK)

    If any expected index is missing or there's a duplicate `tracking_token` index (sign of Pitfall 9), fix the relevant migration and re-run the round-trip.
  </action>
  <verify>
    <automated>test -f backend/src/migrations/20260101000005-create-indexes.cjs && grep -q "idx_campaigns_created_by_created_at_id" backend/src/migrations/20260101000005-create-indexes.cjs && grep -q "idx_campaign_recipients_campaign_id_status" backend/src/migrations/20260101000005-create-indexes.cjs && grep -q "created_by" backend/src/migrations/20260101000005-create-indexes.cjs && grep -q "order: 'DESC'" backend/src/migrations/20260101000005-create-indexes.cjs && grep -q "\"db:migrate\":\\s*\"sequelize db:migrate\"" backend/package.json && grep -q "\"db:migrate:undo\":\\s*\"sequelize db:migrate:undo\"" backend/package.json && grep -q "\"db:migrate:undo:all\":\\s*\"sequelize db:migrate:undo:all\"" backend/package.json && grep -q "\"db:reset\"" backend/package.json && cd backend && yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate && psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname" | grep -q idx_campaigns_created_by_created_at_id && psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname" | grep -q idx_campaign_recipients_campaign_id_status && psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname" | grep -q campaign_recipients_tracking_token_key && psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname" | grep -q users_email_key && psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname" | grep -q recipients_email_key</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/migrations/20260101000005-create-indexes.cjs` exists
    - Contains EXACTLY 2 `addIndex` calls:
      - `addIndex('campaigns', { name: 'idx_campaigns_created_by_created_at_id', fields: ['created_by', { name: 'created_at', order: 'DESC' }, { name: 'id', order: 'DESC' }] })`
      - `addIndex('campaign_recipients', { name: 'idx_campaign_recipients_campaign_id_status', fields: ['campaign_id', 'status'] })`
    - `down()` function has matching `removeIndex` for both explicit indexes
    - NO `addIndex` for `users.email`, `recipients.email`, `campaign_recipients.tracking_token`, or `(campaign_id, recipient_id)` — all covered by auto-indexes (Pitfall 9)
    - `backend/package.json` has all 4 new scripts: `db:migrate`, `db:migrate:undo`, `db:migrate:undo:all`, `db:reset`
    - `backend/package.json` does NOT yet include `db:seed` or `db:seed:undo` — those come in Plan 02-04
    - `db:reset` currently equals `yarn db:migrate:undo:all && yarn db:migrate` (NO seed yet)
    - Full round-trip: `cd backend && yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate` — all 4 commands exit 0
    - Post-round-trip `SELECT indexname FROM pg_indexes WHERE schemaname='public'` returns (at minimum): `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, `campaign_recipients_tracking_token_key`, `users_email_key`, `recipients_email_key` — plus the auto *_pkey entries for all 4 tables
    - `psql "$DATABASE_URL" -c "\d campaign_recipients"` visually confirms: composite PK on (campaign_id, recipient_id), two FK constraints each with `ON UPDATE CASCADE ON DELETE CASCADE`, `tracking_token uuid NOT NULL DEFAULT gen_random_uuid()`
    - `yarn workspace @campaign/backend typecheck` still exits 0 (tsconfig exclude keeps migrations invisible to tsc)
  </acceptance_criteria>
  <done>6th migration committed; 4 db:* scripts in package.json; full 4-command round-trip exits 0 against clean postgres; all 5 expected indexes present. DATA-02 success criteria 1-4 TRUE. Plan 02-04 (seed) is unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sequelize-cli → postgres | Migrations execute DDL as a privileged DB user (`campaign` in local dev). Developer/reviewer is trusted; migration content is reviewed and version-controlled. |
| application INSERT/UPDATE → postgres | Values are validated app-side (Phase 4 Zod) + DB-side (native ENUM, NOT NULL, UNIQUE, FK). DB constraints are the last-line safety net. |
| public HTTP `/track/open/:trackingToken` → postgres | Phase 6 consumes `campaign_recipients.tracking_token`. The UUID is unguessable; no data about campaign/recipient IDs leaks in the URL. |
| deleted user / deleted campaign → junction rows | FK cascades guarantee integrity atomically at DB level; no orphaned rows. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-03-01 | Configuration / DoS (V14 — migration ordering) | All 6 migration files | mitigate | Strict lexical filename ordering: `00000000000000-enable-pgcrypto.cjs` sorts first (zero prefix), then `20260101000001..000005` in FK dependency order (users → recipients → campaigns → campaign_recipients → indexes). pgcrypto is enabled before `gen_random_uuid()` is referenced (Pitfall 1 / C3). Verified by Task 3's round-trip gate. |
| T-02-03-02 | Denial of Service (V14 — re-up fails) | Migrations `down()` for ENUM columns | mitigate | Every migration with an ENUM column's `down()` explicitly drops the auto-generated PG type via `DROP TYPE IF EXISTS "enum_<table>_<column>"` (Pitfall 7). Task 3's 4-command round-trip catches any omission. |
| T-02-03-03 | Tampering (V5 — invalid enum values) | `campaigns.status` + `campaign_recipients.status` | mitigate | Native PostgreSQL ENUM types reject any value outside the locked tuple at INSERT/UPDATE time (DB-side belt for Zod's suspenders). 4 labels + 3 labels locked day 1 (M4). Post-migration psql introspection verifies exact labels in exact order. |
| T-02-03-04 | Denial of Service (M4 — ENUM schema evolution) | `campaigns.status` | mitigate | All 4 ENUM values declared in the first campaigns migration. Adding a value later via `ALTER TYPE … ADD VALUE` is not allowed inside a transaction and would require a non-transactional migration or full recreate. Locked day-one matches `@campaign/shared` CampaignStatusEnum. |
| T-02-03-05 | Tampering (M1 — FK integrity) | `campaigns.created_by` → `users(id)`; `campaign_recipients.campaign_id/recipient_id` | mitigate | All 3 FKs use `ON UPDATE CASCADE ON DELETE CASCADE` — deleting a user cleans their campaigns; deleting a draft campaign wipes its junction rows. DB-enforced atomically in one statement, not via Sequelize hooks (which can be bypassed). `\d campaign_recipients` introspection confirms two `ON UPDATE CASCADE ON DELETE CASCADE` lines. |
| T-02-03-06 | Spoofing / Information Disclosure (C17 — tracking_token unguessability) | `campaign_recipients.tracking_token` | mitigate | Column is `UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()`. 122 bits of entropy defeats URL enumeration (`/track/open/00000000-...` etc.). Random generation happens DB-side via pgcrypto — consistent across any INSERT path (seeder, raw psql, future admin tool). Phase 6 pixel route uses ONLY `tracking_token` in the URL — never `(campaign_id, recipient_id)`. |
| T-02-03-07 | Information Disclosure (V14 — Research Assumption A4) | `tracking_token` DEFAULT rendering | mitigate | If `Sequelize.literal('gen_random_uuid()')` were to render as a quoted string literal (A4 unverified), every INSERT omitting `tracking_token` would fail UNIQUE on repeated submissions. Task 2 post-migration verify asserts `\d campaign_recipients` shows `DEFAULT gen_random_uuid()` (unquoted function call). Remediation path documented in Task 2 action (fall back to raw SQL DEFAULT via `queryInterface.sequelize.query`). |
| T-02-03-08 | Integrity (C8 — missing indexes) | Query plans for CAMP-01 pagination + CAMP-08 stats | mitigate | Two explicit composite indexes: `(created_by, created_at DESC, id DESC)` on campaigns + `(campaign_id, status)` on campaign_recipients. Without these: sequential scans under moderate load. Task 3's post-round-trip `pg_indexes` query verifies both are present. |
| T-02-03-09 | Configuration drift (V14) | `backend/package.json` scripts | accept | `db:*` scripts are the canonical entry point; without them, reviewers would have to invoke the CLI binary directly. Low-impact if scripts drift (they're documentation); Task 3 verify greps each literal script definition. |

No V2/V3/V4/V6 threats surface at the migration layer — auth + crypto primitives are Phase 3 / Plan 02-04. No V8 threat (no PII stored yet — `password_hash` is a hash, not a plaintext, and no PII beyond `name` + `email`).
</threat_model>

<verification>
Plan 02-03 is the DATA-02 **schema half** (migrations + scripts). Post-plan state:

1. 6 `.cjs` migration files exist under `backend/src/migrations/`, lexical order is pgcrypto → users → recipients → campaigns → campaign_recipients → indexes.
2. `backend/package.json` has 4 new scripts: `db:migrate`, `db:migrate:undo`, `db:migrate:undo:all`, `db:reset` (seed scripts pending Plan 02-04).
3. `cd backend && yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate` — all 4 commands exit 0.
4. Post-round-trip psql introspection:
   - `SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'` returns `1`
   - ENUM labels: `enum_campaigns_status:draft,scheduled,sending,sent` + `enum_campaign_recipients_status:pending,sent,failed`
   - Composite PK on `campaign_recipients` is `(campaign_id, recipient_id)` in that order
   - `tracking_token` is UUID UNIQUE NOT NULL DEFAULT `gen_random_uuid()` (unquoted function call)
   - `\d campaign_recipients` shows 2 FKs with `ON UPDATE CASCADE ON DELETE CASCADE`
   - `pg_indexes` contains: `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, `campaign_recipients_tracking_token_key`, `users_email_key`, `recipients_email_key` (plus `*_pkey` auto-entries)
5. `yarn workspace @campaign/backend typecheck` still exits 0 (migrations excluded from tsc).

**DATA-02 ROADMAP success criteria status after Plan 02-03:**
- SC-1 (migrations create all tables + FK cascades + indexes) — TRUE
- SC-2 (tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()) — TRUE
- SC-3 (4-state + 3-state ENUMs) — TRUE
- SC-4 (composite PK + indexes enumerated) — TRUE
- SC-5 (seed script) — pending Plan 02-04

**NOT verified yet (Plan 02-04 owns):**
- Seed data (1 user / 10 recipients / 3 campaigns)
- Demo user bcrypt password hash
- Sent campaign stats (80% send_rate / 25% open_rate)
- `db:seed` / `db:seed:undo` scripts in package.json
- `db:reset` extended to chain seed

**Handoff to Plan 02-04:**
- Seeder (`backend/src/seeders/20260101000000-demo-data.cjs`) inserts via `queryInterface.bulkInsert` directly — does NOT import the TS model classes. FK column names in the seeder's INSERT payloads are snake_case (`password_hash`, `created_by`, `campaign_id`, `recipient_id`) matching these migration columns.
- Plan 02-04 UPDATES `backend/package.json` to add `db:seed` + `db:seed:undo` AND extends `db:reset` to `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed`.
- `tracking_token` is OMITTED from the seeder's bulkInsert payloads → relies on the `gen_random_uuid()` column default introduced here.
</verification>

<success_criteria>
- [ ] `backend/src/migrations/00000000000000-enable-pgcrypto.cjs` exists, up runs `CREATE EXTENSION IF NOT EXISTS pgcrypto`, down is a documented no-op
- [ ] `backend/src/migrations/20260101000001-create-users.cjs` — users table: BIGINT PK, STRING(320) unique email, STRING(255) password_hash, STRING(200) name, timestamps
- [ ] `backend/src/migrations/20260101000002-create-recipients.cjs` — recipients table: BIGINT PK, STRING(320) unique email, nullable STRING(200) name, timestamps
- [ ] `backend/src/migrations/20260101000003-create-campaigns.cjs` — 4-state ENUM DEFAULT 'draft', FK to users(id) ON UPDATE CASCADE ON DELETE CASCADE, down drops `enum_campaigns_status`
- [ ] `backend/src/migrations/20260101000004-create-campaign-recipients.cjs` — composite PK (both columns have `primaryKey: true`), tracking_token UUID UNIQUE DEFAULT `Sequelize.literal('gen_random_uuid()')`, 3-state ENUM, 2 FKs both CASCADE, down drops `enum_campaign_recipients_status`
- [ ] `backend/src/migrations/20260101000005-create-indexes.cjs` — exactly 2 `addIndex` calls for composite pagination + stats indexes; NO duplicate indexes on inline-unique columns
- [ ] Migration filenames sort lexically: `00000000000000-enable-pgcrypto` first; `20260101000001..000005` in FK dependency order
- [ ] `backend/package.json` adds `db:migrate`, `db:migrate:undo`, `db:migrate:undo:all`, `db:reset` (NOT `db:seed*` — those in Plan 02-04)
- [ ] `db:reset` here = `yarn db:migrate:undo:all && yarn db:migrate` (no seed; Plan 02-04 extends)
- [ ] Full round-trip `yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate` — all 4 commands exit 0
- [ ] `SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'` returns `1`
- [ ] ENUM labels introspect: `enum_campaigns_status:draft,scheduled,sending,sent` + `enum_campaign_recipients_status:pending,sent,failed` (exact order)
- [ ] Composite PK on `campaign_recipients` is `(campaign_id, recipient_id)` in that order
- [ ] `\d campaign_recipients` shows `tracking_token uuid NOT NULL DEFAULT gen_random_uuid()` + 2 FKs with `ON UPDATE CASCADE ON DELETE CASCADE`
- [ ] `pg_indexes` contains: `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, `campaign_recipients_tracking_token_key`, `users_email_key`, `recipients_email_key`
- [ ] All migration files use `.cjs` extension (Pitfall 6)
- [ ] All column names in migrations are snake_case
- [ ] `yarn workspace @campaign/backend typecheck` exits 0 (tsconfig exclude holds)
</success_criteria>

<output>
After completion, create `.planning/phases/02-schema-migrations-seed/02-03-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.

Handoff to Plan 02-04 (demo seed + phase gate):
- 6 migrations exist and round-trip cleanly; every table/ENUM/index/FK expected by DATA-02 is in place.
- Seeder (Plan 02-04 Task 1) uses `queryInterface.bulkInsert` against the 4 tables with snake_case column names matching these migrations.
- Seeder OMITS `tracking_token` — the `gen_random_uuid()` DB-side default (introduced by migration 000004) fires automatically on INSERT.
- Plan 02-04 UPDATES `backend/package.json`: adds `db:seed` + `db:seed:undo`, extends `db:reset` from `yarn db:migrate:undo:all && yarn db:migrate` to `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed`.
- Plan 02-04's phase gate runs the updated `yarn db:reset` and re-executes all `psql` introspection queries from 02-VALIDATION.md Plan 02-C + 02-D rows against the freshly-migrated-and-seeded DB.
</output>
