# Phase 2: Schema, Migrations & Seed — Research

**Researched:** 2026-04-20
**Domain:** Sequelize 6 + PostgreSQL 16 schema, class-based models, Sequelize CLI migrations (ENUMs, FKs, indexes, pgcrypto, tracking_token UUID), demo seeder
**Confidence:** HIGH

## Summary

Phase 2 lays the PostgreSQL schema contract that every downstream phase (Auth, CRUD, Send, Pixel, Tests) reads from. All schema shapes, index choices, state-machine ENUMs, FK cascade rules, and the `tracking_token` UUID column are already locked by PROJECT.md / REQUIREMENTS.md / research/ARCHITECTURE.md — research here is prescriptive, not exploratory. Focus: exact migration file contents, exact `Model.init()` call shapes, exact seed payload, and the ESM-compatibility workaround for Sequelize CLI (migrations must be `.cjs`).

Backend is currently an ESM module workspace (`"type": "module"` in `backend/package.json`) with a strict NodeNext tsconfig inherited from `tsconfig.base.json` (Phase 1 Plan 02). Phase 2 must add Sequelize / pg / bcryptjs runtime deps, sequelize-cli dev dep, a `.sequelizerc`, a CJS-shaped CLI config (`src/db/config.cjs`), five ordered migrations in `.cjs`, a seeder in `.cjs`, four TypeScript model classes in `src/models/*.ts`, a runtime Sequelize bootstrap in `src/db/index.ts`, and six new `db:*` scripts in `backend/package.json`. No routes, no middleware, no HTTP, no auth — those are Phase 3+.

**Primary recommendation:** Use `.cjs` for every file Sequelize CLI loads (`.sequelizerc`, `src/db/config.cjs`, all migrations, all seeders) — the backend is ESM so `.js` would collide with `"type": "module"`. Keep TypeScript for the model classes and the runtime `src/db/index.ts` (Sequelize instance + model registration + `associate()` wiring). Run Sequelize CLI via `yarn workspace @campaign/backend sequelize db:migrate`. Add a root `docker-compose.yml` with a single `postgres` service now (Phase 10 extends it with redis + api + web) so `yarn db:migrate` has something to talk to. Use `bcryptjs@3.0.3` (not the 2.4.3 pin in STACK.md — 3.x is ESM-native and has no breaking API changes vs 2.4.3 for `hash`/`hashSync`/`compare`/`compareSync`).

## User Constraints (from context)

> No CONTEXT.md exists for this phase (mode: yolo — discuss-phase skipped). Constraints are sourced from PROJECT.md §Key Decisions, REQUIREMENTS.md (DATA-01/02/03), ROADMAP.md §Phase 2, ARCHITECTURE.md §1-2, STACK.md, PITFALLS.md, and CLAUDE.md — all marked as **LOCKED** in CLAUDE.md: *"Do not re-open Key Decisions in PROJECT.md without explicit user instruction."*

### Locked Decisions

- **Sequelize v6 + PostgreSQL + `pg` driver** — NOT Prisma, NOT TypeORM (PROJECT.md §Key Decisions: "Sequelize CLI migrations — Matches 'PostgreSQL with Sequelize' spec; standard tooling")
- **Sequelize CLI** for migrations (not raw SQL, not a different migrator like umzug alone)
- **Class-based `Model.init()` + `static associate()` pattern** — NOT `sequelize-typescript` decorators (STACK.md §Sequelize)
- **`belongsToMany` through a NAMED Model instance** (`CampaignRecipient`) — NOT a string (STACK.md: preserves access to `.status`, `.sent_at`, `.tracking_token`)
- **`underscored: true`** on every model — auto-maps camelCase → snake_case at the SQL level
- **4-state campaign ENUM** `draft | scheduled | sending | sent` — non-negotiable day one (M4: PostgreSQL ENUM cannot be altered in a transaction)
- **3-state recipient ENUM** `pending | sent | failed` on `campaign_recipients.status`
- **`pgcrypto` extension enabled in the FIRST migration** — needed for `gen_random_uuid()` on `tracking_token`
- **`campaigns.id` = BIGSERIAL/BIGINT**, **`campaign_recipients` = composite PK `(campaign_id, recipient_id)`** + a separate `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` column for the public pixel URL (C17)
- **FK cascade**: `campaign_recipients.campaign_id ON DELETE CASCADE` (M1 — deleting a draft campaign cleans up junction rows)
- **Four documented indexes** (DATA-02): `(created_by, created_at DESC, id DESC)` on campaigns, `(campaign_id, status)` on campaign_recipients, `tracking_token` UNIQUE, UNIQUE on `users.email` + `recipients.email`
- **Never call `sequelize.sync()` in production** — migrations only (C2)
- **`.js` relative-import suffix required** in TypeScript models (NodeNext module resolution — Phase 1 Plan 03 lesson)
- **`@campaign/shared` as the Zod source of truth** — Phase 2 must align the Sequelize `status` ENUM values EXACTLY with `shared/src/schemas/campaign.ts::CampaignStatusEnum = z.enum(['draft','scheduled','sending','sent'])` (already exists from Phase 1 Plan 01)
- **Seed (DATA-03)**: 1 demo user, 10 recipients, 1 draft + 1 scheduled + 1 sent campaign (sent campaign has recipients in mixed `sent`/`failed` + one `opened_at` for meaningful stats)
- **Scope discipline**: Phase 2 delivers schema + models + seed + minimal local Postgres wiring ONLY. NO routes, NO auth, NO middleware, NO HTTP handlers, NO business logic. Those come in Phase 3-6.

### Claude's Discretion

- Exact index-naming convention (`idx_campaigns_created_by_created_at_id` vs `campaigns_created_by_created_at_id_idx` vs Sequelize's default `campaigns_created_by_created_at_id`) — recommend explicit `idx_…` names for grep-ability and self-documenting migrations
- Whether to split the "create indexes" concerns into one migration per table vs one aggregate indexes migration — recommend one aggregate `05-create-indexes.cjs` (easier to review in one place; all non-PK indexes in one up/down pair)
- How to structure the seed file — recommend `bulkInsert` with fixed emails / names for deterministic testing; rely on `DEFAULT gen_random_uuid()` for tracking_tokens (simpler than pre-computing)
- Whether to add a minimal `docker-compose.yml` now with only `postgres` (extended in Phase 10) vs have the developer run `docker run postgres:16-alpine` manually — **recommend the compose approach**: creates a `docker-compose.yml` in Phase 2 that Phase 10 extends. Less rework.
- Whether to add `ts-node` for running the Sequelize CLI config as TS — **explicitly NO**: config stays `.cjs` to avoid TS-runtime complexity. Models stay `.ts` for type safety.
- Exact log wiring in `src/db/index.ts` — recommend `logging: isDev ? (sql) => logger.debug({ sql }, 'sql') : false` (uses Phase 1 Plan 03 pino logger; silent in test/prod)
- Whether to also create `.env.example` now — **recommend YES**: Phase 3 and beyond need `DATABASE_URL`, `REDIS_URL`, `JWT_*_SECRET`. Declaring `DATABASE_URL` in Phase 2's `.env.example` (and referencing it from `src/db/config.cjs`) sets the pattern.

### Deferred Ideas (OUT OF SCOPE for Phase 2)

- Express app / routes / middleware (Phase 3+)
- JWT auth infrastructure (Phase 3)
- Redis / BullMQ / send worker (Phase 5)
- Full docker-compose with redis + api + web (Phase 10)
- Vitest test wiring (Phase 7)
- Migrations for v2 features (recipient CSV, segments, unsubscribe — all out-of-scope per REQUIREMENTS.md v2)
- Seed reset fixtures beyond the one walkthrough dataset (tests create their own fixtures in Phase 7)
- Partial indexes on campaign status (research says "add later only if 'all scheduled' queries become hot" — ARCHITECTURE §2)
- Connection pool tuning (Sequelize defaults are fine at this scope)
- Read-replica / master-slave config (single DB)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Sequelize models for `User`, `Campaign`, `Recipient`, `CampaignRecipient` with campaign status ENUM `draft\|scheduled\|sending\|sent` and recipient status ENUM `pending\|sent\|failed` | §Standard Stack, §Model Shapes (Pattern 3), §Runtime Bootstrap (Pattern 4) |
| DATA-02 | Sequelize migrations create all tables + FK cascades + the 4 documented indexes (+ pgcrypto extension first, + tracking_token UUID NOT NULL DEFAULT gen_random_uuid()) | §Migration Files (Pattern 5), §Indexes (Pattern 6), §pgcrypto ordering (Pitfall C3) |
| DATA-03 | Seed script creates one demo user, ten recipients, one draft + one scheduled + one sent campaign for walkthrough | §Seeder (Pattern 7), §Seed Payload |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Schema DDL (CREATE TABLE, CREATE INDEX, CREATE EXTENSION) | Database (PostgreSQL 16) | Sequelize CLI (migration runner) | DDL must live in the DB; Sequelize CLI is just the tool that applies it deterministically in dev/prod/test |
| Model metadata (attributes, associations, `underscored`, `tableName`) | Backend (Sequelize Model classes) | — | Class definitions are the application-side contract; the DB doesn't know about `underscored` or `belongsToMany` |
| ENUM value validation | Database (CHECK / ENUM type) | Application (Zod in Phase 4) | DB-level ENUM is the safety net; Zod at the HTTP boundary is the first line of defense. Both agree on exactly 4 + 3 states. |
| Tracking token generation | Database (`gen_random_uuid()` default) | — | Default runs on every INSERT that omits the column; no app-side code needed (UUID v4, 122 bits of entropy) |
| FK cascade on campaign delete | Database (`ON DELETE CASCADE`) | — | DB enforces — cannot be bypassed by any HTTP path that deletes a Campaign |
| Password hashing in seed | Backend (bcryptjs in seeder) | — | Seeder runs in Node, hashes once, stores the result. The DB only sees the hash. |
| Dev Postgres availability | Docker Compose (postgres service) | — | Local dev needs a running DB to run migrations; `docker-compose.yml` is the reviewer-friendly way to provide one |

## Standard Stack

### Core (added to `backend/package.json` dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize` | `^6.37.8` | ORM + model layer | [VERIFIED: `npm view sequelize version` → `6.37.8` on 2026-04-20; STACK.md pins `^6.37.3`; 6.37.8 is the latest 6.x patch and fully caret-compatible] Node engines `>=10.0.0` (OK, we're on 20+). |
| `pg` | `^8.20.0` | PostgreSQL driver | [VERIFIED: `npm view pg version` → `8.20.0`; STACK.md pins `^8.12.0`; 8.20.0 is the latest 8.x, caret-compatible] Node engines `>=16.0.0` (OK). Required peer of Sequelize for postgres dialect. |
| `pg-hstore` | `^2.3.4` | Serializer for PG hstore values — silent required peer dep of Sequelize when using `pg` | [VERIFIED: `npm view pg-hstore version` → `2.3.4` on 2026-04-20] **NOTE: STACK.md says `^2.4.3` but that version does NOT exist on npm — the actual latest is 2.3.4.** STACK.md has a typo; correct version is 2.3.4. |
| `bcryptjs` | `^3.0.3` | Password hashing (used in the seed for the demo user; Phase 3 auth reuses it) | [VERIFIED: `npm view bcryptjs version` → `3.0.3` released 2025-11-02] **Upgrade from STACK.md's pin of 2.4.3** — bcryptjs 3.x is ESM-native (matches our `"type": "module"` backend), ships TypeScript types, and has **identical API surface for `hash`/`hashSync`/`compare`/`compareSync`** — no code changes vs 2.4.3. The one cosmetic change is "Generate 2b hashes by default" vs the 2a format; existing 2a hashes still compare correctly, and all new seed hashes will be 2b (which is the modern default). [CITED: https://github.com/dcodeIO/bcrypt.js/releases v3.0.0 notes] |
| `dotenv` | `^17.4.2` | Loads `.env` into `process.env` — needed so the CLI config can read `DATABASE_URL` before sequelize-cli instantiates the connection | [VERIFIED: `npm view dotenv version` → `17.4.2`]. dotenv 17 dropped support for Node 12; we're on Node 20 (fine). |
| `@campaign/shared` | `workspace:*` | Already declared (Phase 1) — Phase 2 consumes `CampaignStatusEnum` as the source of truth for the ENUM values in model + migration | No change — already in `backend/package.json` |

### Supporting (added to `backend/package.json` devDependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sequelize-cli` | `^6.6.5` | Runs migrations + seeders; reads `.sequelizerc` + `src/db/config.cjs` | [VERIFIED: `npm view sequelize-cli version` → `6.6.5`; STACK.md pins `^6.6.2`; 6.6.5 is the latest 6.x, caret-compatible]. Binary exposed as `sequelize` in `.bin` — workspace scripts call `sequelize db:migrate`. |
| `@types/bcryptjs` | — | **NOT NEEDED** — bcryptjs 3.x ships its own TypeScript types (one of the v3 additions). Do NOT install `@types/bcryptjs` in Phase 2 (would shadow the bundled types). | [CITED: bcryptjs 3.0.0 release notes — "ships with types"] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sequelize v6 | Prisma, TypeORM, Drizzle | Rejected by PROJECT.md §Key Decisions — "Matches 'PostgreSQL with Sequelize' spec". Do not re-open. |
| Sequelize CLI | Umzug alone / knex migrations | Rejected: Sequelize CLI is the canonical tooling for Sequelize 6; using umzug directly adds complexity (manual runner script, no template generator). |
| Class-based `Model.init()` | `sequelize-typescript` decorators | Rejected by STACK.md — decorator lib lags behind core releases; class-based is future-proof. |
| TypeScript migrations via `ts-node` | Plain CJS migrations | **Rejected**: sequelize-cli loads migrations via `require()`; mixing `ts-node` into the CLI loader adds flakiness for one-off scripts. Models stay `.ts` (typechecked); migrations / seeders / CLI config are `.cjs` (executed as-is). Discussed at length: https://github.com/sequelize/cli/pull/905. |
| `bcryptjs@2.4.3` (STACK.md pin) | `bcryptjs@3.0.3` (latest) | **Upgrade recommended**. bcryptjs 3.x is ESM-native — drops the interop friction with our `"type": "module"` backend. API is unchanged; type defs are bundled. |
| Manual `docker run postgres` in README | `docker-compose.yml` with just `postgres` now | **Recommend compose now**. Phase 10 extends it with redis/api/web; Phase 2 infra task creates the skeleton. Cleaner handoff, less rework, reviewer-friendly. |
| `CHECK` constraint for status | PostgreSQL `ENUM` type | Sequelize's `DataTypes.ENUM` creates a native PG ENUM type (`enum_campaigns_status`). ARCHITECTURE §1 says "CHECK constraints" but a native ENUM is equivalent + is what Sequelize emits by default. Stay with native ENUM. **CAVEAT (M4):** ENUMs cannot be altered in a transaction — we get 4 states right from the start, no ALTER needed later. |
| `bcrypt` (native) | `bcryptjs` (pure JS) | Rejected by STACK.md — native `bcrypt` requires node-gyp + native build, breaks Docker multi-arch (`linux/arm64` vs `linux/amd64`). `bcryptjs` is 3x slower but has zero install pain. |

**Installation commands (run once from repo root):**
```bash
yarn workspace @campaign/backend add sequelize@^6.37.8 pg@^8.20.0 pg-hstore@^2.3.4 bcryptjs@^3.0.3 dotenv@^17.4.2
yarn workspace @campaign/backend add -D sequelize-cli@^6.6.5
```

**Version verification commands (re-run before locking in plan):**
```bash
npm view sequelize version          # Expect 6.37.8 (or newer 6.x)
npm view pg version                 # Expect 8.20.0 (or newer 8.x)
npm view pg-hstore version          # Expect 2.3.4 (STACK.md typo: 2.4.3 does NOT exist)
npm view bcryptjs version           # Expect 3.0.3
npm view dotenv version             # Expect 17.4.2
npm view sequelize-cli version      # Expect 6.6.5
```

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Developer / CI                                                        │
│   $ yarn workspace @campaign/backend db:migrate                       │
│                         │                                             │
│                         ▼                                             │
│   .sequelizerc → points to src/db/config.cjs + src/migrations/ + etc. │
│                         │                                             │
│                         ▼                                             │
│   sequelize-cli reads NODE_ENV → picks { development, test, production} key │
│                         │                                             │
│                         ▼                                             │
│   config.cjs reads DATABASE_URL from process.env (via dotenv)         │
│                         │                                             │
│                         ▼                                             │
│   Sequelize connects to PostgreSQL                                    │
│                         │                                             │
│                         ▼                                             │
│   Loads migrations in lexical order:                                  │
│     00000000000000-enable-pgcrypto.cjs                                │
│     20260422000001-create-users.cjs                                   │
│     20260422000002-create-recipients.cjs                              │
│     20260422000003-create-campaigns.cjs     ← FK → users              │
│     20260422000004-create-campaign-recipients.cjs  ← FKs → campaigns + recipients │
│     20260422000005-create-indexes.cjs                                 │
│                         │                                             │
│                         ▼                                             │
│   Applies each up() inside its own txn (PG allows DDL in txn —        │
│   EXCEPT CREATE TYPE for ENUMs, which is why we fix the 4 states upfront) │
│                         │                                             │
│                         ▼                                             │
│   Records migration name in SequelizeMeta table (auto-created)        │
└──────────────────────────────────────────────────────────────────────┘

Runtime (Phase 3+ will consume):
┌──────────────────────────────────────────────────────────────────────┐
│ backend/src/db/index.ts                                               │
│   1. Loads DATABASE_URL via dotenv                                    │
│   2. new Sequelize(DATABASE_URL, { dialect: 'postgres', logging })    │
│   3. Imports User, Recipient, Campaign, CampaignRecipient model classes│
│   4. For each: Model.init(attributes, { sequelize, ... })             │
│   5. For each: ModelClass.associate(models) ← wires belongsTo / hasMany / belongsToMany │
│   6. Exports { sequelize, User, Recipient, Campaign, CampaignRecipient } │
│                         │                                             │
│                         ▼                                             │
│   Phase 3 app.ts / routes / services import from './db/index.js'      │
└──────────────────────────────────────────────────────────────────────┘

Seed path:
┌──────────────────────────────────────────────────────────────────────┐
│ $ yarn workspace @campaign/backend db:seed                            │
│   → sequelize db:seed:all                                             │
│   → loads src/seeders/*.cjs in lexical order                          │
│   → each seeder calls queryInterface.bulkInsert('users', [...])       │
│   → tracking_tokens auto-filled by gen_random_uuid() column default   │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (after Phase 2)

```
backend/
├── .sequelizerc                       # NEW — CLI config (CJS path resolver)
├── .env.example                       # NEW — DATABASE_URL + future phase vars
├── package.json                       # MODIFIED — add deps + db:* scripts
├── tsconfig.json                      # MODIFIED — exclude migrations/seeders/**/*.cjs from typecheck
└── src/
    ├── db/                            # NEW directory
    │   ├── config.cjs                 # NEW — CLI-readable env config (CJS MUST)
    │   └── index.ts                   # NEW — runtime Sequelize instance + model registration
    ├── migrations/                    # NEW directory
    │   ├── 00000000000000-enable-pgcrypto.cjs
    │   ├── 20260422000001-create-users.cjs
    │   ├── 20260422000002-create-recipients.cjs
    │   ├── 20260422000003-create-campaigns.cjs
    │   ├── 20260422000004-create-campaign-recipients.cjs
    │   └── 20260422000005-create-indexes.cjs
    ├── seeders/                       # NEW directory
    │   └── 20260422000100-demo-data.cjs
    ├── models/                        # NEW directory
    │   ├── User.ts
    │   ├── Recipient.ts
    │   ├── Campaign.ts
    │   ├── CampaignRecipient.ts
    │   └── index.ts                   # re-exports (optional convenience — src/db/index.ts is the real wiring)
    ├── util/                          # EXISTING (Phase 1)
    │   ├── logger.ts
    │   └── httpLogger.ts
    └── index.ts                       # EXISTING — Phase 1 describePhase1() stub (NOT TOUCHED — Phase 3 replaces it)

# Root-level additions:
docker-compose.yml                     # NEW — postgres service only (extended in Phase 10)
.env.example                           # NEW at root — referenced by docker-compose + backend
```

### Pattern 1: `.sequelizerc` (CLI config resolver, CJS)

**What:** Tells sequelize-cli where to find the config, models, migrations, and seeders directories.
**Location:** `backend/.sequelizerc` (NOT at repo root — CLI is workspace-scoped).
**File extension:** **Must be `.cjs`-compatible content but named `.sequelizerc`** — this file is loaded by sequelize-cli's bootstrap, which uses `require()` internally. Since `backend/package.json` has `"type": "module"`, an unextensioned file named `.sequelizerc` is treated as CJS by sequelize-cli's loader (verified against sequelize/cli source). If issues arise, rename to `.sequelizerc.cjs`.

**Example:**
```js
// backend/.sequelizerc
// CJS module — sequelize-cli loads this with require()
const path = require('node:path');

module.exports = {
  config:          path.resolve(__dirname, 'src', 'db', 'config.cjs'),
  'models-path':   path.resolve(__dirname, 'src', 'models'),
  'migrations-path': path.resolve(__dirname, 'src', 'migrations'),
  'seeders-path':  path.resolve(__dirname, 'src', 'seeders'),
};
```

Key points:
- Paths are absolute (via `path.resolve(__dirname, ...)`) — deterministic regardless of invoking CWD.
- `config` points to `.cjs`, NOT `.json` — enables env-variable-driven config (otherwise would need separate config JSON per env, cluttering the repo).
- `models-path` is still pointed at the TS models dir — sequelize-cli uses this ONLY for the `model:generate` command (which we don't use — we hand-write models). The runtime Sequelize instance in `src/db/index.ts` imports models explicitly, not via auto-scan.

### Pattern 2: `src/db/config.cjs` (environment-aware CLI config)

**What:** sequelize-cli picks `development` / `test` / `production` based on `NODE_ENV`. Each key returns connection config.
**Why `.cjs`**: `backend/package.json` has `"type": "module"`, so plain `.js` would be ESM. sequelize-cli uses `require()` internally — the `.cjs` extension forces CJS interpretation.

**Example:**
```js
// backend/src/db/config.cjs
// Loaded by sequelize-cli — must be CJS (backend is "type": "module")
require('dotenv').config(); // reads backend/.env if present

const base = {
  dialect: 'postgres',
  use_env_variable: 'DATABASE_URL',   // sequelize-cli special key — reads process.env.DATABASE_URL
  dialectOptions: {
    // Local dev / docker: no SSL. Production (hosted PG) may require { ssl: { require: true, rejectUnauthorized: false } }
    ssl: false,
  },
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: {
    ...base,
    logging: console.log,           // CLI output for dev
  },
  test: {
    ...base,
    use_env_variable: 'DATABASE_URL_TEST',  // separate test DB — Phase 7 will populate
    logging: false,
  },
  production: {
    ...base,
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  },
};
```

Key points:
- `use_env_variable: 'DATABASE_URL'` is the canonical Sequelize CLI pattern when the connection is a single URL (not split host/port/user/pass).
- `NODE_ENV=test` at Phase 7 will swap to `DATABASE_URL_TEST` — Phase 2 creates the `.env.example` scaffold for this but doesn't enforce it yet.
- `define.underscored + define.timestamps` sets workspace-wide defaults; model classes can still override per-model.
- `logging` is controlled here for CLI runs. Runtime Sequelize instance in `src/db/index.ts` sets its OWN logging (pino).

### Pattern 3: `src/models/Campaign.ts` — canonical model shape

**What:** Class-based Sequelize model with `Model.init()` + `static associate()` — the locked pattern per STACK.md.
**When to use:** Every model in Phase 2. All four models follow this shape.

**Example (Campaign — the most illustrative):**
```typescript
// backend/src/models/Campaign.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';
import type { CampaignStatus } from '@campaign/shared';

// Attributes actually stored in the DB (camelCase in TS; underscored: true converts to snake_case SQL)
export interface CampaignAttributes {
  id: number;                     // BIGSERIAL — Sequelize's DataTypes.BIGINT + autoIncrement: true
  name: string;
  subject: string;
  body: string;
  status: CampaignStatus;         // 'draft' | 'scheduled' | 'sending' | 'sent'
  scheduledAt: Date | null;       // TIMESTAMPTZ, nullable
  createdBy: number;              // BIGINT FK → users.id
  createdAt: Date;
  updatedAt: Date;
}

// Attributes accepted on create (id/createdAt/updatedAt auto-generated; scheduledAt nullable)
export type CampaignCreationAttributes = Optional<
  CampaignAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'scheduledAt' | 'status'
>;

export class Campaign
  extends Model<CampaignAttributes, CampaignCreationAttributes>
  implements CampaignAttributes {
  declare id: number;
  declare name: string;
  declare subject: string;
  declare body: string;
  declare status: CampaignStatus;
  declare scheduledAt: Date | null;
  declare createdBy: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Campaign {
    Campaign.init(
      {
        id: {
          type: DataTypes.BIGINT,
          autoIncrement: true,
          primaryKey: true,
        },
        name:    { type: DataTypes.STRING(255), allowNull: false },
        subject: { type: DataTypes.STRING(255), allowNull: false },
        body:    { type: DataTypes.TEXT,         allowNull: false },
        status: {
          type: DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent'),
          allowNull: false,
          defaultValue: 'draft',
        },
        scheduledAt: { type: DataTypes.DATE,     allowNull: true },
        createdBy:   { type: DataTypes.BIGINT,   allowNull: false },
        createdAt:   { type: DataTypes.DATE,     allowNull: false },
        updatedAt:   { type: DataTypes.DATE,     allowNull: false },
      },
      {
        sequelize,
        tableName: 'campaigns',
        modelName: 'Campaign',
        underscored: true,
        timestamps: true,
      },
    );
    return Campaign;
  }

  static associate(models: {
    User: typeof import('./User.js').User;
    Recipient: typeof import('./Recipient.js').Recipient;
    CampaignRecipient: typeof import('./CampaignRecipient.js').CampaignRecipient;
  }): void {
    Campaign.belongsTo(models.User, {
      foreignKey: 'createdBy',    // TS attr; underscored: true renders as 'created_by' in SQL
      as: 'creator',
      onDelete: 'CASCADE',        // If a user is deleted, their campaigns go too (v2 consideration — aligns with "single-user" scope)
    });
    Campaign.belongsToMany(models.Recipient, {
      through: models.CampaignRecipient,   // NAMED MODEL — not a string (STACK.md, PITFALLS M1 companion)
      foreignKey: 'campaignId',
      otherKey: 'recipientId',
      as: 'recipients',
    });
    Campaign.hasMany(models.CampaignRecipient, {
      foreignKey: 'campaignId',
      as: 'campaignRecipients',
      onDelete: 'CASCADE',
    });
  }
}
```

Key points:
- **`declare`** on every instance field — suppresses TS "property has no initializer" errors without emitting actual class fields (which would shadow Sequelize's getters/setters). This is the canonical Sequelize 6 + TypeScript 4.x+ pattern.
- **`Optional<..., 'id' | 'createdAt' | 'updatedAt' | 'scheduledAt' | 'status'>`** — creation attrs omit auto-generated and defaulted columns.
- **`underscored: true`** — `createdBy` → `created_by`, `scheduledAt` → `scheduled_at`, `createdAt` → `created_at`, `updatedAt` → `updated_at` in SQL.
- **`as: 'creator'`** on `belongsTo(User)` — standard alias to avoid SQL column name collision and to make `Campaign.findOne({ include: [{ model: User, as: 'creator' }] })` explicit.
- **`through: models.CampaignRecipient` (the Model class, not the string 'CampaignRecipient')** — non-negotiable per STACK.md. Enables `campaign.getRecipients()` to eager-load the junction row data (status, sent_at, tracking_token).

### Pattern 4: `src/db/index.ts` — runtime Sequelize bootstrap

**What:** Single file that creates the Sequelize instance, runs `Model.initModel(sequelize)` for each, then calls `associate()` for each — in the correct order (all inits first, all associates second).

**Example:**
```typescript
// backend/src/db/index.ts
import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { logger } from '../util/logger.js';
import { User } from '../models/User.js';
import { Recipient } from '../models/Recipient.js';
import { Campaign } from '../models/Campaign.js';
import { CampaignRecipient } from '../models/CampaignRecipient.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — see .env.example');
}

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  define: { underscored: true, timestamps: true },
  logging: isTest
    ? false
    : isDev
      ? (sql) => logger.debug({ sql }, 'sequelize')
      : false,    // prod: silent by default; opt-in via LOG_LEVEL=debug + explicit logger config
});

// Init order is irrelevant (Sequelize doesn't validate FKs until associate); any order works.
User.initModel(sequelize);
Recipient.initModel(sequelize);
Campaign.initModel(sequelize);
CampaignRecipient.initModel(sequelize);

// Associate: every model gets the full models registry so it can reference siblings.
const models = { User, Recipient, Campaign, CampaignRecipient };
User.associate(models);
Recipient.associate(models);
Campaign.associate(models);
CampaignRecipient.associate(models);

export { User, Recipient, Campaign, CampaignRecipient };
```

Key points:
- **Explicit imports** — no `readdirSync` / dynamic model loading. Simpler, typecheck-friendly, no circular-import surprises.
- **`Model.initModel(sequelize)`** (not the raw `Model.init`) — wraps the class-side init call and returns the class, enabling the associate loop.
- **Logging wiring** — dev uses Phase 1's pino logger at `debug` level; test is silent (Phase 7 test setup will override if needed); prod is silent by default.
- **`throw` on missing `DATABASE_URL`** — m2 mitigation (startup-time env check). Phase 3 auth adds `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` checks; Phase 2 adds only the DB one.
- **No `await sequelize.authenticate()` here** — defer to Phase 3's `buildApp()` so Phase 2 can be imported by seeders/tests without immediately opening a connection.

### Pattern 5: Migration file shape (CJS)

**What:** sequelize-cli loads migration files as CJS. Each exports an object with `up(queryInterface, Sequelize)` and `down(queryInterface, Sequelize)`.

**Naming convention:** `YYYYMMDDHHMMSS-action-target.cjs` — sequelize-cli uses lexical order. Use a distinct first-migration prefix (`00000000000000-`) for the pgcrypto extension so it ALWAYS runs first, even if a later migration's timestamp is earlier.

**Example — `00000000000000-enable-pgcrypto.cjs`:**
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

**Example — `20260422000001-create-users.cjs`:**
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
        type: Sequelize.STRING(255),     // bcryptjs 2b hashes are 60 chars; 255 is safe
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

**Example — `20260422000003-create-campaigns.cjs` (ENUM + FK):**
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
        onDelete: 'CASCADE',     // user delete cleans up their campaigns
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('campaigns');
    // Drop the ENUM type Sequelize auto-created — otherwise re-up() fails with "type already exists"
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_campaigns_status";');
  },
};
```

**Example — `20260422000004-create-campaign-recipients.cjs` (composite PK + tracking_token):**
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
    // Drop auto-created ENUM type
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_campaign_recipients_status";',
    );
  },
};
```

**Example — `20260422000005-create-indexes.cjs`:**
```js
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface /* , Sequelize */) {
    // Covers cursor pagination + ownership filter in a single B-tree scan (C8, C16)
    await queryInterface.addIndex('campaigns', {
      name: 'idx_campaigns_created_by_created_at_id',
      fields: [
        'created_by',
        { name: 'created_at', order: 'DESC' },
        { name: 'id',         order: 'DESC' },
      ],
    });

    // Covers stats aggregation `GROUP BY status WHERE campaign_id = ?` (C1, C8)
    await queryInterface.addIndex('campaign_recipients', {
      name: 'idx_campaign_recipients_campaign_id_status',
      fields: ['campaign_id', 'status'],
    });

    // Covers tracking pixel lookup — unique + also backs the UNIQUE constraint
    // (Sequelize emitted a UNIQUE constraint inline in create-campaign-recipients,
    //  which Postgres auto-indexes; this addIndex with { unique: true } would be redundant.
    //  Instead, keep the inline `unique: true` on the column and OMIT an explicit index here.
    //  Removed to avoid "index already exists" — see note below.)

    // users.email + recipients.email UNIQUE are also auto-indexed from inline `unique: true`
    // on the column definitions — NO explicit addIndex needed.
  },

  async down(queryInterface /* , Sequelize */) {
    await queryInterface.removeIndex('campaign_recipients', 'idx_campaign_recipients_campaign_id_status');
    await queryInterface.removeIndex('campaigns', 'idx_campaigns_created_by_created_at_id');
  },
};
```

Key points for migrations:
- **File extension `.cjs`** — forced by `backend/package.json` having `"type": "module"`. CJS is what sequelize-cli's loader expects. [VERIFIED: https://github.com/sequelize/cli/pull/905 and https://github.com/sequelize/cli/issues/1156]
- **Snake-case column names in migrations** — migrations ARE the SQL. `underscored: true` on models handles the JS-side camelCase mapping. Never use camelCase column names in migrations when models have `underscored: true` (would break at runtime).
- **Inline `unique: true` on columns auto-creates an index** — do NOT also call `addIndex({ unique: true })` on the same column or `db:migrate:undo` will try to drop an index Sequelize didn't create separately.
- **`Sequelize.literal('gen_random_uuid()')`** — the canonical pattern for Postgres-side UUID default. `DataTypes.UUIDV4` would generate UUIDs in Node (doesn't use pgcrypto); we want the DB-side default so INSERTs that omit `tracking_token` still get a UUID.
- **`down()` must DROP TYPE for ENUMs** — Sequelize auto-creates a named type (`enum_<table>_<column>`) for every ENUM column. `dropTable` does NOT drop the type. Without the `DROP TYPE`, a subsequent `db:migrate:undo:all && db:migrate` sequence fails with `type "enum_campaigns_status" already exists`.
- **Migration filename ordering**: first migration uses `00000000000000-` prefix so pgcrypto runs before everything else; subsequent migrations use `20260422HHMMSS-` timestamps in FK dependency order (users → recipients → campaigns → campaign_recipients → indexes).

### Pattern 6: Indexes — exactly 4 documented (+ 2 inline uniques)

| Index | Table | Columns | Why |
|-------|-------|---------|-----|
| `idx_campaigns_created_by_created_at_id` | campaigns | `(created_by, created_at DESC, id DESC)` | Covers cursor pagination AND ownership filter in one B-tree scan (CAMP-01 in Phase 4) |
| `idx_campaign_recipients_campaign_id_status` | campaign_recipients | `(campaign_id, status)` | Covers stats aggregation `COUNT(*) FILTER (WHERE status = 'sent') GROUP BY ... WHERE campaign_id = ?` (CAMP-08) |
| `<auto via UNIQUE>` | campaign_recipients | `tracking_token` | Auto-generated by the inline `unique: true` on the column; backs the pixel `WHERE tracking_token = $1` lookup (TRACK-01) |
| `<composite PK>` | campaign_recipients | `(campaign_id, recipient_id)` | Composite PRIMARY KEY is an index by definition; covers the worker update path (QUEUE-02) |
| `<auto via UNIQUE>` | users | `email` | Auto-indexed from `unique: true` on the column |
| `<auto via UNIQUE>` | recipients | `email` | Auto-indexed from `unique: true` on the column |

**DECISION: do NOT add `addIndex('campaign_recipients', ['recipient_id'])`** — ARCHITECTURE §2 notes this is covered by the composite PK's second component; but for "all campaigns this recipient is in" queries it would help. Deferred: no route in v1 needs that query, and C8 warns against "indexes as afterthought". Leave out. (If Phase 4 `GET /recipients/:id/campaigns` ever lands — it won't in v1 — add it then.)

### Pattern 7: Seeder file shape (CJS)

**What:** One seeder creates all demo data in order. Uses `queryInterface.bulkInsert` for each table.

**File:** `backend/src/seeders/20260422000100-demo-data.cjs`

**Example (prescriptive, full):**
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
    // PostgreSQL supports RETURNING in bulkInsert with { returning: ['id'] } in options.
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
    // Draft: NO recipients yet (spec says "created in draft"; recipients get attached via POST /campaigns in Phase 4)
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
    //       If testing needs known UUIDs, populate them here explicitly.
  },

  async down(queryInterface /* , Sequelize */) {
    // Idempotent delete by stable keys — DO NOT truncate (would wipe test-created data too)
    await queryInterface.bulkDelete('campaign_recipients', null, {});
    await queryInterface.bulkDelete('campaigns', { created_by: null } /* deletes all — no-op matcher */, {});
    await queryInterface.bulkDelete('campaigns', {}, {});
    await queryInterface.bulkDelete('recipients', {}, {});
    await queryInterface.bulkDelete('users', { email: 'demo@example.com' }, {});
  },
};
```

Key points:
- **Scheduled campaign has recipients in `pending`** — realistic pre-send state. Sent campaign has `sent`/`failed` + one `opened_at` — makes stats meaningful (5 total, 4 sent, 1 failed, 1 opened → send_rate 80%, open_rate 25%).
- **Draft campaign has NO recipients** — matches the spec: `POST /campaigns` in Phase 4 creates the draft WITH `recipientEmails[]`; Phase 2 just models the "empty draft" state.
- **`tracking_token` omitted from insert** — relies on `DEFAULT gen_random_uuid()`. This is the simpler path and tests the column default end-to-end.
- **`SELECT … RETURNING`-style id retrieval** — sequelize-cli's `bulkInsert` does not return inserted IDs by default; query after. Alternative: enable `returning: true` option (Postgres-only). The SELECT-after approach is portable and deterministic.
- **`bcrypt.hash(..., 10)`** — cost factor 10 is the bcryptjs default and fine for a demo. Phase 3 auth uses the same cost.
- **Down function deletes by stable key** (demo user email) rather than TRUNCATE — preserves any tests that seeded their own users alongside.

### Pattern 8: Backend `package.json` script additions

Add these scripts to `backend/package.json`:
```json
{
  "scripts": {
    // ... existing (build, dev, typecheck, lint, test) ...
    "db:migrate":             "sequelize db:migrate",
    "db:migrate:undo":        "sequelize db:migrate:undo",
    "db:migrate:undo:all":    "sequelize db:migrate:undo:all",
    "db:seed":                "sequelize db:seed:all",
    "db:seed:undo":           "sequelize db:seed:undo:all",
    "db:reset":               "yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed"
  }
}
```

Key points:
- Commands invoked as `yarn workspace @campaign/backend db:migrate` (from repo root) or `yarn db:migrate` (from `backend/`).
- `sequelize` binary resolves from `backend/node_modules/.bin/sequelize` (installed via `sequelize-cli` devDep).
- `db:reset` is developer-DX: wipe and reseed in one shot. Handy in dev; never in prod.

### Pattern 9: `docker-compose.yml` (root, Phase 2 skeleton — Phase 10 extends)

**What:** Single-service compose with only `postgres` so `yarn db:migrate` has something to talk to. Phase 10 adds `redis`, `api`, `web`.

**Example:**
```yaml
# docker-compose.yml (repo root)
# Phase 2: postgres only. Phase 10 extends with redis + api + web.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: campaign
      POSTGRES_PASSWORD: campaign
      POSTGRES_DB: campaigns
    ports:
      - "5432:5432"       # Phase 2 exposes to host so `yarn db:migrate` from host works.
                          # Phase 10 may close this if api runs inside compose (still OK to leave open for psql).
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 10
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

**Corresponding `.env.example` at repo root (and at `backend/.env.example`):**
```bash
# .env.example (repo root)
# Phase 2: database only. Phase 3 adds JWT_*_SECRET; Phase 5 adds REDIS_URL.
DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns
NODE_ENV=development
LOG_LEVEL=debug
```

Key points:
- Port 5432 exposed to host — developer runs `yarn workspace @campaign/backend db:migrate` from host machine; Sequelize connects to `localhost:5432`.
- Phase 10 inside-Docker variant uses host `postgres` (service name), not `localhost` (C15).
- `pgcrypto` is built into postgres:16 core but NOT auto-enabled — the first migration's `CREATE EXTENSION IF NOT EXISTS pgcrypto` is still required.
- `pgdata` named volume — data persists across `docker compose down`. Use `docker compose down -v` to wipe.

### Pattern 10: TypeScript config exclusion

Update `backend/tsconfig.json` to exclude migrations/seeders from typechecking (they are CJS):
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2022"],
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],     // Only .ts files — .cjs migrations/seeders are invisible to tsc
  "exclude": ["src/migrations/**", "src/seeders/**", "src/db/config.cjs"]
}
```

Key points:
- `include: ["src/**/*.ts"]` (restricted to .ts) naturally excludes .cjs files — but the explicit `exclude` is belt-and-suspenders for tsc's discovery.
- Migrations/seeders/config are NOT typechecked by Node's runtime either; sequelize-cli uses require() on them.
- Model files (`src/models/*.ts`) and `src/db/index.ts` ARE typechecked.

### Anti-Patterns to Avoid

- **Calling `sequelize.sync()` in `src/db/index.ts`** (C2) — migration-first, period. `sync()` has silent destructive edge cases on ENUM changes.
- **Using a string in `belongsToMany(Through: 'CampaignRecipient')`** (STACK.md) — loses access to junction fields. Must pass the Model class.
- **Auto-loading models via `fs.readdirSync(__dirname)`** — fragile at TS-compile boundary, risks loading `.js` compiled artifacts alongside `.ts` sources. Use explicit imports.
- **Camel-case column names in migrations when models use `underscored: true`** — runtime mismatch between `Campaign.create({ createdBy: 1 })` (JS) → `INSERT ... ("created_by")` (SQL) vs the migration's `createdBy` column (which would need quoting). Always snake_case in migrations.
- **Forgetting `DROP TYPE` in migration `down()` for ENUM columns** — re-running `migrate:undo:all && migrate` then fails with `type "enum_..." already exists`.
- **Adding `addIndex` for a column that already has `unique: true` inline** — Postgres already has the auto-created index from the unique constraint; the explicit addIndex creates a duplicate that `removeIndex` fails to find on down-migration.
- **Embedding the `tracking_token` value into the seed INSERT** — works but verbose; relying on the `DEFAULT gen_random_uuid()` column default is simpler and confirms pgcrypto is enabled.
- **Seeding the draft campaign WITH recipients** — the spec says the draft is empty until `POST /campaigns` wires up recipients in Phase 4. Seeding recipients into the draft would muddy the walkthrough.
- **Using `TRUNCATE … RESTART IDENTITY CASCADE` in seed's `down()`** — nukes ID sequences and would wipe test-created rows too. Use targeted `bulkDelete` by stable keys (emails).
- **Running Sequelize CLI from the repo root** — `.sequelizerc` lives in `backend/`. Always invoke via `yarn workspace @campaign/backend db:migrate` or `cd backend && yarn db:migrate`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migrations | Raw SQL files + a bash runner | Sequelize CLI (installed) | Dependency graph, up/down symmetry, `SequelizeMeta` tracking — already solved. |
| Password hashing | Custom HMAC / salt scheme | `bcryptjs@^3.0.3` `hash()` / `compare()` | Constant-time compare, salt handling, cost factor — get them wrong and auth breaks. |
| UUID generation | `crypto.randomUUID()` in Node at INSERT time | `gen_random_uuid()` as column default in DB | DB-side default handles INSERTs from ANY client (seeder, future admin tools, raw psql), not just Node code. |
| ENUM validation | Application-layer string checks only | PostgreSQL native ENUM type (Sequelize emits this) | DB rejects invalid values as a safety net — belt for Zod's suspenders. |
| FK cascade semantics | Manual `beforeDestroy` hooks in Sequelize | `onDelete: 'CASCADE'` in the FK constraint | DB enforces atomically in a single statement; hooks run in app code + can be bypassed. |
| Composite PK tracking | A synthetic `id` column + unique `(campaign_id, recipient_id)` | Native composite `PRIMARY KEY (campaign_id, recipient_id)` | Zero ambiguity, one less index to maintain. |
| Demo-data idempotency | A bespoke "check if exists before insert" script | sequelize-cli `db:seed` + down-function delete-by-stable-key | CLI handles the state tracking. |

**Key insight:** Sequelize CLI + PostgreSQL together already solve every schema-layer primitive Phase 2 needs. Phase 2's job is to assemble them correctly (FK order, pgcrypto first, tracking_token UUID, four indexes) — not to invent anything new.

## Runtime State Inventory

**This phase is pure greenfield** (no existing schema on disk, no running DB with data). The usual runtime-state concerns — stored data, live-service configs, OS-registered state — do not apply.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — fresh PostgreSQL instance created by Phase 2's docker-compose | None; migrations build from empty. |
| Live service config | None — no external services register against "campaign schema" yet | None. |
| OS-registered state | None — no scheduled tasks, no pm2, no systemd | None. |
| Secrets/env vars | `DATABASE_URL` introduced for the first time in `.env.example`. Phase 3 adds `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`; Phase 5 adds `REDIS_URL`. | `.env.example` must list `DATABASE_URL`; README (Phase 10) documents the setup command. |
| Build artifacts / installed packages | `shared/dist/` already maintained by Phase 1 postinstall. Phase 2 adds `backend/node_modules/sequelize`, `.../pg`, `.../bcryptjs`, `.../sequelize-cli`. Yarn's `postinstall` rebuilds shared; no additional build step required. | Run `yarn install` once new deps land; postinstall keeps `shared/dist/` fresh. |

**If someone later renames `CampaignStatusEnum` values:** it would ripple through (a) `shared/src/schemas/campaign.ts`, (b) Sequelize model `DataTypes.ENUM(...)`, (c) migration `Sequelize.ENUM(...)`, (d) the PG ENUM type itself (which CANNOT be altered in a transaction — M4). Resolution would require a non-transactional migration OR a full recreate. Lock the 4 states now; don't change them.

## Common Pitfalls

### Pitfall 1 (C3): Migration FK Order Failure

**What goes wrong:** `20260422000004-create-campaign-recipients.cjs` runs before `20260422000003-create-campaigns.cjs` or `20260422000002-create-recipients.cjs` → Postgres rejects FK: `relation "campaigns" does not exist`.

**Why it happens:** Filenames sorted lexically — any typo in the timestamp prefix can reorder. Worse: if pgcrypto isn't first, the `gen_random_uuid()` default fails with `function gen_random_uuid() does not exist`.

**How to avoid:** Strict numeric prefix convention: `00000000000000-` for pgcrypto (always first), then `20260422000001-` through `20260422000005-` for each subsequent. Run `yarn db:migrate:undo:all && yarn db:migrate` before submission to verify the full round-trip.

**Warning signs:** `ERROR: relation "users" does not exist` during `db:migrate` is the #1 sign.

### Pitfall 2 (C8): Missing Indexes on FK Columns

**What goes wrong:** Postgres does NOT auto-create indexes on FK columns. `WHERE campaign_id = $1` on a 1M-row `campaign_recipients` = full sequential scan. Evaluator specifically asks about indexing rationale.

**How to avoid:** Explicit `addIndex` in `05-create-indexes.cjs`:
- `(created_by, created_at DESC, id DESC)` on campaigns — covers cursor + ownership
- `(campaign_id, status)` on campaign_recipients — covers stats
- UNIQUE `(tracking_token)` — auto from inline `unique: true`
- Composite PK `(campaign_id, recipient_id)` — auto from `primaryKey: true` on both columns
- UNIQUE email on users / recipients — auto from inline `unique: true`

Document each in `docs/DECISIONS.md` (Phase 10): the evaluator will ask.

**Warning signs:** No `addIndex` calls anywhere in migrations / no index-only `idx_*` entries when running `\di+` in psql.

### Pitfall 3 (M1): Missing FK Cascade

**What goes wrong:** Deleting a draft campaign leaves orphaned `campaign_recipients` rows → integrity violation on `DELETE FROM campaigns WHERE id = $1`.

**How to avoid:** `onDelete: 'CASCADE'` on the `campaign_id` FK in `create-campaign-recipients.cjs`. Sequelize emits `REFERENCES campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE`.

**Warning signs:** `ERROR: update or delete on table "campaigns" violates foreign key constraint` during delete tests.

### Pitfall 4 (M4): 4-State ENUM Locked Day One

**What goes wrong:** Start with `['draft', 'sent']` (simpler!), add `sending` and `scheduled` later → PostgreSQL refuses to `ALTER TYPE enum_campaigns_status ADD VALUE 'sending'` inside a transaction. Requires a separate non-txn migration or full recreate.

**How to avoid:** Lock all 4 values in the very first campaigns migration. `@campaign/shared`'s `CampaignStatusEnum` already has all 4 from Phase 1 — mirror exactly.

**Warning signs:** Any migration trying to do `ALTER TYPE … ADD VALUE` inside a Sequelize transaction.

### Pitfall 5 (C17 schema-half): Tracking Token Unguessability

**What goes wrong:** Using the BIGINT composite PK in the public pixel URL → attacker iterates `/track/open/(1,1)..(1,N)` and falsely flips `opened_at`.

**How to avoid:** Separate `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` column. 122 bits of entropy. Internal joins still use `(campaign_id, recipient_id)` — no perf cost.

**Warning signs:** Phase 6 pixel route uses `campaign_id` + `recipient_id` from URL, not `tracking_token`.

### Pitfall 6: Sequelize CLI + ESM Interop

**What goes wrong:** `backend/package.json` has `"type": "module"`. A migration named `20260422000001-create-users.js` is treated as ESM → sequelize-cli's `require()` loader throws `ERR_REQUIRE_ESM`.

**How to avoid:** Use `.cjs` extension for every file sequelize-cli loads: `.sequelizerc` content (CJS shape), `src/db/config.cjs`, `src/migrations/*.cjs`, `src/seeders/*.cjs`. Verified via https://github.com/sequelize/cli/issues/1156 and https://github.com/sequelize/cli/pull/905.

**Warning signs:** `Error [ERR_REQUIRE_ESM]: require() of ES Module ... /src/migrations/xxx.js`.

### Pitfall 7: ENUM Type Not Dropped on Migration Undo

**What goes wrong:** `db:migrate:undo` → `dropTable('campaigns')` succeeds. `db:migrate` (re-up) → `CREATE TYPE "enum_campaigns_status"` fails with `type "enum_campaigns_status" already exists` because `dropTable` doesn't drop the ENUM type.

**How to avoid:** Every migration with an ENUM column has, in its `down()`:
```js
await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_<tablename>_<columnname>";');
```

**Warning signs:** Fresh roundtrip `migrate:undo:all && migrate` fails on the re-up.

### Pitfall 8: DATABASE_URL Missing — Cryptic Error

**What goes wrong:** Developer runs `yarn db:migrate` without `.env` → sequelize-cli fails with `ConnectionError [SequelizeConnectionError]: getaddrinfo ENOTFOUND undefined`.

**How to avoid:** `.env.example` + README. `src/db/index.ts` throws a clear error at import: `DATABASE_URL is not set — see .env.example`. Wire `dotenv/config` at the top of both `src/db/index.ts` and `src/db/config.cjs`.

**Warning signs:** Any `getaddrinfo ENOTFOUND undefined` error.

### Pitfall 9: Inline `unique: true` + Duplicate `addIndex`

**What goes wrong:** Column has `unique: true` inline (creates a UNIQUE constraint + auto-index). Then `addIndex('table', ['col'], { unique: true })` tries to create a SECOND unique index on the same column → `ERROR: relation "..._unique" already exists` on the up migration OR `removeIndex` fails on the down because Sequelize named it differently.

**How to avoid:** Pick ONE strategy per column. For columns that need only a UNIQUE index (no composite), use inline `unique: true` and OMIT the `addIndex`. For composite indexes, use `addIndex` with `name: 'idx_...'` and no inline `unique`.

### Pitfall 10: Seed's SELECT-by-name Assumes Empty Start

**What goes wrong:** Seed does `SELECT id FROM users WHERE email = 'demo@example.com'` expecting exactly 1 row — but what if the seed was already run once? `bulkInsert` would fail the second time (UNIQUE constraint); the SELECT would find the old row. Idempotency is not automatic.

**How to avoid:** Two options: (a) rely on sequelize-cli's `SequelizeMeta`-style seed tracking (the `--seed` flag + `_SequelizeData` table) — run seeds with `db:seed:undo:all && db:seed` to force replay; (b) make the seed explicitly idempotent with `ON CONFLICT` upserts. Phase 2 uses (a): `db:reset` script chains undo-all + migrate + seed. Document this in README.

## Code Examples

All verified against Sequelize 6 docs (https://sequelize.org/docs/v6/) and cross-referenced with ARCHITECTURE.md §1-2 and STACK.md §Sequelize.

### User model (full)
```typescript
// backend/src/models/User.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

export interface UserAttributes {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
export type UserCreationAttributes = Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare email: string;
  declare passwordHash: string;
  declare name: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof User {
    User.init(
      {
        id:            { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        email:         { type: DataTypes.STRING(320), allowNull: false, unique: true },
        passwordHash:  { type: DataTypes.STRING(255), allowNull: false },
        name:          { type: DataTypes.STRING(200), allowNull: false },
        createdAt:     { type: DataTypes.DATE, allowNull: false },
        updatedAt:     { type: DataTypes.DATE, allowNull: false },
      },
      {
        sequelize, tableName: 'users', modelName: 'User',
        underscored: true, timestamps: true,
      },
    );
    return User;
  }

  static associate(models: { Campaign: typeof import('./Campaign.js').Campaign }): void {
    User.hasMany(models.Campaign, { foreignKey: 'createdBy', as: 'campaigns' });
  }
}
```

### Recipient model
```typescript
// backend/src/models/Recipient.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

export interface RecipientAttributes {
  id: number;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type RecipientCreationAttributes = Optional<
  RecipientAttributes, 'id' | 'createdAt' | 'updatedAt' | 'name'
>;

export class Recipient
  extends Model<RecipientAttributes, RecipientCreationAttributes>
  implements RecipientAttributes {
  declare id: number;
  declare email: string;
  declare name: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Recipient {
    Recipient.init(
      {
        id:        { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        email:     { type: DataTypes.STRING(320), allowNull: false, unique: true },
        name:      { type: DataTypes.STRING(200), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      },
      {
        sequelize, tableName: 'recipients', modelName: 'Recipient',
        underscored: true, timestamps: true,
      },
    );
    return Recipient;
  }

  static associate(models: {
    Campaign: typeof import('./Campaign.js').Campaign;
    CampaignRecipient: typeof import('./CampaignRecipient.js').CampaignRecipient;
  }): void {
    Recipient.belongsToMany(models.Campaign, {
      through: models.CampaignRecipient,
      foreignKey: 'recipientId',
      otherKey: 'campaignId',
      as: 'campaigns',
    });
    Recipient.hasMany(models.CampaignRecipient, { foreignKey: 'recipientId', as: 'campaignRecipients' });
  }
}
```

### CampaignRecipient model (junction, most complex)
```typescript
// backend/src/models/CampaignRecipient.ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

export type RecipientStatus = 'pending' | 'sent' | 'failed';

export interface CampaignRecipientAttributes {
  campaignId: number;
  recipientId: number;
  trackingToken: string;
  status: RecipientStatus;
  sentAt: Date | null;
  openedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type CampaignRecipientCreationAttributes = Optional<
  CampaignRecipientAttributes,
  'trackingToken' | 'status' | 'sentAt' | 'openedAt' | 'createdAt' | 'updatedAt'
>;

export class CampaignRecipient
  extends Model<CampaignRecipientAttributes, CampaignRecipientCreationAttributes>
  implements CampaignRecipientAttributes {
  declare campaignId: number;
  declare recipientId: number;
  declare trackingToken: string;
  declare status: RecipientStatus;
  declare sentAt: Date | null;
  declare openedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof CampaignRecipient {
    CampaignRecipient.init(
      {
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
        sentAt:    { type: DataTypes.DATE, allowNull: true },
        openedAt:  { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      },
      {
        sequelize, tableName: 'campaign_recipients', modelName: 'CampaignRecipient',
        underscored: true, timestamps: true,
      },
    );
    return CampaignRecipient;
  }

  static associate(models: {
    Campaign: typeof import('./Campaign.js').Campaign;
    Recipient: typeof import('./Recipient.js').Recipient;
  }): void {
    CampaignRecipient.belongsTo(models.Campaign, { foreignKey: 'campaignId', as: 'campaign' });
    CampaignRecipient.belongsTo(models.Recipient, { foreignKey: 'recipientId', as: 'recipient' });
  }
}
```

### Migration: create-recipients.cjs (simpler than users — shows nullable name)
```js
// backend/src/migrations/20260422000002-create-recipients.cjs
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

## Files to Be Created (seeding planner's files_modified arrays)

Grouped by logical task:

**Task A: Backend runtime deps & config**
- `backend/package.json` (MODIFY) — add sequelize, pg, pg-hstore, bcryptjs, dotenv deps + sequelize-cli devDep + 6 new `db:*` scripts
- `backend/.sequelizerc` (CREATE) — CJS path resolver
- `backend/src/db/config.cjs` (CREATE) — dev/test/prod config via DATABASE_URL
- `backend/.env.example` (CREATE) — DATABASE_URL placeholder
- `.env.example` (CREATE at repo root) — DATABASE_URL + NODE_ENV + LOG_LEVEL
- `backend/tsconfig.json` (MODIFY) — add exclude for migrations/seeders/db/config.cjs
- `.gitignore` (MODIFY) — add `.env`, `.env.local` (Phase 1 already has these — verify)

**Task B: Sequelize model layer**
- `backend/src/models/User.ts` (CREATE)
- `backend/src/models/Recipient.ts` (CREATE)
- `backend/src/models/Campaign.ts` (CREATE)
- `backend/src/models/CampaignRecipient.ts` (CREATE)
- `backend/src/db/index.ts` (CREATE) — runtime bootstrap + init + associate + barrel export

**Task C: Sequelize migrations (6 files)**
- `backend/src/migrations/00000000000000-enable-pgcrypto.cjs` (CREATE)
- `backend/src/migrations/20260422000001-create-users.cjs` (CREATE)
- `backend/src/migrations/20260422000002-create-recipients.cjs` (CREATE)
- `backend/src/migrations/20260422000003-create-campaigns.cjs` (CREATE)
- `backend/src/migrations/20260422000004-create-campaign-recipients.cjs` (CREATE)
- `backend/src/migrations/20260422000005-create-indexes.cjs` (CREATE)

**Task D: Demo seed**
- `backend/src/seeders/20260422000100-demo-data.cjs` (CREATE)

**Task E: Local Postgres infra**
- `docker-compose.yml` (CREATE at repo root, Phase 2 skeleton with postgres only)

**Optional: per-task convenience**
- `backend/src/models/index.ts` (CREATE, optional) — re-exports from `./User.js`, `./Recipient.js`, `./Campaign.js`, `./CampaignRecipient.js`. Low value since `src/db/index.ts` does the wiring; skip.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bcryptjs@^2.4.3` (2017 release) | `bcryptjs@^3.0.3` (2025-11) | Feb 2025 (3.0.0) → Nov 2025 (3.0.3) | ESM-native default (matches our `"type": "module"`); types ship in-package; API unchanged. Adopt for Phase 2. |
| `@types/bcryptjs` separate install | Types bundled | bcryptjs 3.0.0 | Do NOT install `@types/bcryptjs` — it would shadow the bundled types. |
| `sequelize.sync({ force: true })` on boot | Sequelize CLI migrations | ~2017 (Sequelize 4+ canonical) | Non-destructive; version-controlled; reviewable. Locked in CLAUDE.md / C2. |
| `CHECK (status IN (...))` constraint | `DataTypes.ENUM(...)` native PG enum | Sequelize 6 default | Native enum type is slightly more efficient and more introspectable in psql. Can't be altered in a txn (M4) — lock values upfront. |
| `crypto.randomUUID()` in Node at insert | `gen_random_uuid()` DB-side default via pgcrypto | PG 13+ (pgcrypto shipped in core; UUIDs get better stats) | DB-side default works from any client, not just Node. Required for the "seeder omits tracking_token" pattern to work. |
| Flat `yarn sequelize db:migrate` at repo root | Workspace-scoped `yarn workspace @campaign/backend db:migrate` | Yarn 4 workspaces locked in Phase 1 | Matches monorepo discipline; `.sequelizerc` lives in `backend/`. |

**Deprecated / outdated patterns to avoid:**
- `sequelize-typescript` decorator library — lags behind Sequelize core, documented risk (STACK.md).
- Single-JSON `config/database.json` for sequelize-cli — works but can't read env vars natively; the `.cjs` + `use_env_variable` pattern is the modern replacement.
- Using the string form of `through: 'CampaignRecipient'` — loses type safety and attribute access on the junction.
- Legacy `DataTypes.UUIDV4` with client-side UUID generation — works but the `gen_random_uuid()` DB-side default is universally superior.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `underscored: true` auto-maps `createdAt` → `created_at` AND all FK attrs (e.g., `createdBy` → `created_by`) at the SQL level for INSERTs/SELECTs | §Standard Stack, §Model Shapes | Migrations would have wrong column names. **Mitigation:** Migrations use explicit snake_case column names (`created_at`, `created_by`) — the model's `underscored: true` only needs to convert on the JS side to match. If `underscored` did NOT map timestamps, `timestamps: true` in the init options would still emit `createdAt` in queries — run a smoke `Campaign.create(...)` after Phase 2 to verify. Community docs consistently cite this behavior since Sequelize 5. [ASSUMED — informed by Sequelize 6 community patterns; not verified in this research session against the official API reference] |
| A2 | sequelize-cli 6.6.5 correctly loads `.sequelizerc` (no `.cjs` extension) from a workspace whose `package.json` has `"type": "module"` | §Pattern 1 | If `.sequelizerc` is itself ESM-parsed, the CLI fails on bootstrap. **Mitigation:** Rename to `.sequelizerc.cjs` if issues surface during Phase 2 plan. [ASSUMED — sequelize-cli's loader chain for `.sequelizerc` is not explicitly documented for ESM packages; the `.cjs` extensions on migrations are confirmed but `.sequelizerc` itself is edge-case] |
| A3 | `DataTypes.ENUM(...)` in `Model.init` matches the exact type emitted by `Sequelize.ENUM(...)` in a migration — i.e., same underlying PG `enum_<table>_<column>` type | §Pattern 5 (migrations) / §Pattern 3 (models) | Model and migration could create two independent ENUM types, making `findAll({ where: { status: 'draft' } })` fail at runtime. **Mitigation:** Models are initialized on an already-migrated DB — they adopt the existing type, not re-create. Verified by canonical Sequelize docs. [ASSUMED — documented but not re-verified this session] |
| A4 | `Sequelize.literal('gen_random_uuid()')` as a column default in a Sequelize 6 migration renders correctly as `DEFAULT gen_random_uuid()` in the emitted `CREATE TABLE` DDL | §Pattern 5 (create-campaign-recipients) | Default could render as a string literal `'gen_random_uuid()'`, making UUIDs fail. **Mitigation:** Verify by running `\d campaign_recipients` in psql post-migrate; the `Default:` column must show `gen_random_uuid()` (no quotes). [ASSUMED — Sequelize docs recommend `literal()` for this exact case; widely used in community; not verified this session] |
| A5 | bcryptjs 3.x is safe to use in a `"type": "module"` backend despite being used ONLY in a `.cjs` seeder | §Standard Stack | `require('bcryptjs')` from a CJS seeder might fail if bcryptjs 3.x's ESM default export doesn't have a CJS wrapper. **Mitigation:** bcryptjs 3.0.0 release notes explicitly say "ESM by default with a UMD fallback" — UMD covers CJS `require()`. Verify during Phase 2 execution by running the seeder once. [ASSUMED based on release notes — not runtime-verified in this research session] |
| A6 | `backend/tsconfig.json` excluding `src/migrations/**` and `src/seeders/**` does not break `yarn typecheck` on other `.ts` files in `src/` | §Pattern 10 | Unlikely — `exclude` only tells tsc what NOT to compile, not what to ignore as missing. Empty exclusion works fine. [ASSUMED — standard tsc behavior; trivially verified during Phase 2 exec] |

**Risk summary:** A1 and A4 are the highest-impact assumptions. Both are behaviors that have been stable since Sequelize 5 and are referenced throughout community examples and STACK.md / ARCHITECTURE.md — but neither was re-verified against the current Sequelize 6.37.8 source in this session. If either proves wrong during Phase 2 execution, remediation is straightforward (rename attrs to snake_case at the JS level / use a raw SQL `DEFAULT gen_random_uuid()` fragment).

## Open Questions (RESOLVED)

| # | Question | Resolution |
|---|----------|------------|
| Q1 | `.cjs` vs `.js` for migrations/seeders given backend's `"type": "module"`? | **RESOLVED — use `.cjs`**. Sequelize CLI uses `require()`; `.js` files under an ESM package are parsed as ESM and fail to `require()`. `.cjs` forces CJS interpretation. Alternative (`package.json` override in migrations/) is messier and would shadow the parent's type. [VERIFIED: https://github.com/sequelize/cli/issues/1156 + https://github.com/sequelize/cli/pull/905] |
| Q2 | Write migrations as `.ts` via `sequelize-cli-typescript` loader? | **RESOLVED — NO**. Adds ts-node complexity for a 4-8hr project. Migrations are one-off scripts; TS safety has low ROI there. Models stay `.ts` (typecheck + IDE + refactor safety); migrations/seeders/config stay `.cjs`. |
| Q3 | Bundle `tracking_token` values explicitly in the seeder, or rely on `DEFAULT gen_random_uuid()`? | **RESOLVED — rely on column default**. Simpler seed, confirms pgcrypto is working end-to-end, tokens are not referenced by any other test fixture (Phase 7 tests create their own). |
| Q4 | Local Postgres: bare `docker run` in README, or minimal `docker-compose.yml` now? | **RESOLVED — minimal compose now (postgres only)**. Phase 10 extends with redis + api + web. Reviewer-friendly, less rework, aligns with FOUND-02 direction. |
| Q5 | Upgrade bcryptjs from STACK.md's pin of 2.4.3 to the current 3.0.3? | **RESOLVED — YES, upgrade**. bcryptjs 3.x is ESM-native (matches our backend), ships types, has unchanged API surface. 2.4.3 is 9 years old. No compatibility risk. |
| Q6 | Should `pg-hstore` version be `^2.4.3` per STACK.md? | **RESOLVED — NO, use `^2.3.4`**. STACK.md has a typo: `2.4.3` doesn't exist on npm. Latest published is `2.3.4` (2020-11). Not a Phase 2 regression — STACK.md was wrong. |
| Q7 | Install `@types/bcryptjs`? | **RESOLVED — NO**. bcryptjs 3.x ships its own types. Installing `@types/bcryptjs` would shadow them (older, less accurate). |
| Q8 | Separate migrations per table, or one aggregate indexes migration? | **RESOLVED — aggregate `05-create-indexes.cjs`**. Easier to review; all non-PK indexes in one up/down pair; consistent with spec's "indexes explained in DECISIONS.md". |
| Q9 | Should the seed populate `tracking_token` explicitly for deterministic testing? | **RESOLVED — NO for Phase 2**. Tests in Phase 7 create their own fixtures with controlled tokens. The demo seed's purpose is walkthrough, not test determinism. |
| Q10 | Include `onDelete: 'CASCADE'` on `users → campaigns`? | **RESOLVED — YES**. Single-user model; deleting the user removes their campaigns as a natural side-effect. Out-of-scope for v1 (no DELETE user endpoint), but structurally correct. |
| Q11 | Should the draft seed campaign include recipients? | **RESOLVED — NO**. The spec `POST /campaigns` flow creates drafts WITH recipients in Phase 4; the seed draft is intentionally empty to demonstrate the empty-draft state. |
| Q12 | Add `addIndex('campaign_recipients', ['recipient_id'])`? | **RESOLVED — NO (defer)**. Covered by composite PK's second component for most queries; "all campaigns this recipient is in" query does not exist in v1. Add later if Phase 9+ needs it. |
| Q13 | Should `src/db/index.ts` call `await sequelize.authenticate()` on import? | **RESOLVED — NO**. Import-time side effects break test isolation. Phase 3's `buildApp()` will call authenticate() during server startup instead. |
| Q14 | `.env` vs `.env.local` for the developer's actual DATABASE_URL? | **RESOLVED — `.env`**. Standard Node convention. `.gitignore` already includes `.env` (Phase 1). `.env.example` is committed with placeholders. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Backend runtime + sequelize-cli | ✓ | v22.14.0 (Phase 1 pinned `>=20.11.0`) | — |
| Docker | Running Postgres locally | ✓ | 27.4.0 | Developer installs Postgres 16 natively via `brew install postgresql@16`; `DATABASE_URL` points to `localhost:5432`. |
| `psql` (client) | Manual schema verification (`\d`, `\di+`) | ✓ | 14.17 (homebrew) | Can use `docker compose exec postgres psql` instead — PG client 14 is forward-compatible with server 16 for inspection. |
| PostgreSQL 16 server | Migration target | ✗ (not yet) | — | Phase 2 adds `docker-compose.yml` with `postgres:16-alpine`; `yarn db:migrate` connects via port 5432. |
| Yarn 4.14.1 | Workspace script runner | ✓ (via corepack shim `/usr/local/bin/yarn`) | 4.14.1 per committed binary | Homebrew's `/opt/homebrew/bin/yarn` (1.22.19) shadows corepack — same known issue from Phase 1 Plan 02. Dev must invoke `/usr/local/bin/yarn` directly OR put it first in PATH. README (Phase 10) documents. |

**Missing dependencies with no fallback:**
- None — all required tooling is present or installable via the compose file that Phase 2 creates.

**Missing dependencies with fallback:**
- PostgreSQL 16 server: **Phase 2 adds `docker-compose.yml` to provide this**. Alternative fallback is native `brew install postgresql@16 && brew services start postgresql@16` — documented in README but not required.

## Validation Architecture

Phase 2 is still pre-Vitest (test framework lands in Phase 7). Validation is deterministic shell + psql introspection.

### Test Framework (deferred)

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (pinned in root resolutions from Phase 1) — NOT installed in Phase 2 |
| Config file | None yet — `backend/vitest.config.ts` lands in Phase 7 |
| Quick run command | N/A — Phase 2 validation is shell-based |
| Full suite command | N/A |

### Phase Requirements → Validation Map

| Req ID | Behavior | Validation Type | Automated Command | Artifact Exists? |
|--------|----------|-----------------|-------------------|------------------|
| DATA-01 | 4 model classes exported from `src/db/index.ts` with correct attribute shapes and associations | static typecheck | `yarn workspace @campaign/backend typecheck` | ✅ created in Phase 2 |
| DATA-01 | Sequelize instance loads all 4 models at import time without error | runtime import proof | `cd backend && yarn tsx -e "import('./src/db/index.ts').then(m => console.log(Object.keys(m).sort()))"` — expects `["Campaign","CampaignRecipient","Recipient","User","sequelize"]` | ✅ |
| DATA-02 | Full migration round-trip succeeds from empty DB | shell | `cd backend && yarn db:migrate:undo:all && yarn db:migrate` — exit 0 | ✅ (after Phase 2 completes) |
| DATA-02 | pgcrypto enabled first | psql introspection | `psql $DATABASE_URL -c "SELECT extname FROM pg_extension WHERE extname='pgcrypto';"` — 1 row | ✅ |
| DATA-02 | 4-state ENUM + 3-state ENUM exist | psql introspection | `psql $DATABASE_URL -c "SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'enum_%' GROUP BY 1;"` — shows `enum_campaigns_status` with 4 labels + `enum_campaign_recipients_status` with 3 | ✅ |
| DATA-02 | tracking_token column shape correct | psql introspection | `psql $DATABASE_URL -c "\d campaign_recipients"` — look for `tracking_token | uuid | ... not null default gen_random_uuid()` + `UNIQUE, btree (tracking_token)` | ✅ |
| DATA-02 | Composite PK on campaign_recipients | psql introspection | `psql $DATABASE_URL -c "\d campaign_recipients"` — PK is `"campaign_recipients_pkey" PRIMARY KEY, btree (campaign_id, recipient_id)` | ✅ |
| DATA-02 | FK cascade on campaign_recipients.campaign_id | psql introspection | `psql $DATABASE_URL -c "\d campaign_recipients"` — shows `FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE` | ✅ |
| DATA-02 | All 4 documented indexes present | psql introspection | `psql $DATABASE_URL -c "\di+"` — must show `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, plus auto-indexes for UNIQUE on `users.email`, `recipients.email`, `campaign_recipients.tracking_token` | ✅ |
| DATA-03 | Seed runs cleanly | shell | `cd backend && yarn db:seed` — exit 0 | ✅ |
| DATA-03 | 1 user + 10 recipients + 3 campaigns exist | psql introspection | `psql $DATABASE_URL -c "SELECT (SELECT count(*) FROM users) AS u, (SELECT count(*) FROM recipients) AS r, (SELECT count(*) FROM campaigns) AS c;"` — `u=1, r=10, c=3` | ✅ |
| DATA-03 | Campaign statuses present | psql introspection | `psql $DATABASE_URL -c "SELECT status, count(*) FROM campaigns GROUP BY status ORDER BY 1;"` — `draft=1, scheduled=1, sent=1` | ✅ |
| DATA-03 | Sent campaign has mixed recipient statuses + one opened | psql introspection | `psql $DATABASE_URL -c "SELECT cr.status, (cr.opened_at IS NOT NULL) AS opened, count(*) FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE c.status='sent' GROUP BY 1,2 ORDER BY 1,2;"` — shows `sent, false, 3` + `sent, true, 1` + `failed, false, 1` | ✅ |
| DATA-03 | Demo user password hash is bcrypt | psql introspection | `psql $DATABASE_URL -c "SELECT password_hash LIKE '\$2%\$%' AS is_bcrypt FROM users WHERE email='demo@example.com';"` — `t` | ✅ |

### Sampling Rate

- **Per task commit:** `yarn workspace @campaign/backend typecheck && yarn workspace @campaign/backend lint` (under 10s)
- **Per wave merge:** Full migration+seed round-trip: `yarn db:reset` (wipes + migrates + seeds — under 15s on local PG)
- **Phase gate:** All psql introspection commands exit 0 + the full shell round-trip `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed` exits 0

### Wave 0 Gaps

- [ ] `docker-compose.yml` at repo root — must exist and `docker compose up -d postgres` must succeed before any migration command runs
- [ ] `.env.example` at repo root + `backend/.env.example` — must document `DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns`
- [ ] Developer creates `backend/.env` from `backend/.env.example` before first `yarn db:migrate`
- [ ] No Vitest / test framework wiring — Phase 7 handles; Phase 2 is shell+psql validation only

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | indirectly (Phase 3) | Password hash COLUMN defined here (bcrypt-compatible `VARCHAR(255)`); actual hash/verify logic in Phase 3 |
| V3 Session Management | no | — (Phase 3) |
| V4 Access Control | no | — (Phase 3+) |
| V5 Input Validation | partially | DB-level CHECK via ENUM types rejects invalid status values; full input validation at HTTP boundary is Phase 4 (Zod) |
| V6 Cryptography | yes | `bcryptjs` for password hashing in seed (cost=10); `gen_random_uuid()` for tracking_token unguessability (pgcrypto provides UUID v4, 122 bits entropy). **Never hand-rolled.** |
| V8 Data Protection | indirectly | `password_hash` column type is `VARCHAR(255)` — never `TEXT` or `JSON` (avoids accidental query logging of full rows in dev). `tracking_token UUID` prevents enumeration attacks on the future pixel endpoint (C17). |
| V14 Configuration | yes | `.env.example` documents required env vars; `.env` is gitignored (Phase 1 already); `DATABASE_URL` must not be hardcoded. |

### Known Threat Patterns for Sequelize + PostgreSQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via un-parameterized query | Tampering | Sequelize ORM parameterizes by default (`findAll({ where: { id: userInput } })`). Migrations use literal DDL (no user input) — safe. |
| Enumeration attack on public endpoint using BIGINT IDs | Information Disclosure | `tracking_token UUID UNIQUE` on campaign_recipients; pixel endpoint (Phase 6) uses the UUID, not the composite PK (C17). |
| ORM-level N+1 query explosion | DoS / performance | Not applicable yet — Phase 2 has no query paths. Phase 4 applies `include:` for eager loading. |
| FK orphan rows from cascading delete misconfig | Tampering / integrity | `ON DELETE CASCADE` on `campaign_recipients.campaign_id` — deleting a campaign atomically wipes junction rows (M1). |
| ENUM value manipulation (e.g., status='archived') | Tampering | Native PG ENUM rejects values outside the 4 allowed labels. DB-level safety net behind Zod (Phase 4) and service-layer guards (Phase 4-5). |
| Password hash column too short | Cryptographic weakness | `VARCHAR(255)` for `password_hash` — bcryptjs emits exactly 60 chars; 255 accommodates any future algorithm migration. |
| Env var leakage (DATABASE_URL in logs) | Information Disclosure | `src/db/index.ts` logs `{ sql }` at `debug` level only (silent in prod). `process.env.DATABASE_URL` is never logged. Phase 3 will add `redact` config to pino. |

## Sources

### Primary (HIGH confidence)
- **PROJECT.md** §Key Decisions — Sequelize CLI + PostgreSQL locked
- **REQUIREMENTS.md** — DATA-01, DATA-02, DATA-03 locked exactly
- **ROADMAP.md §Phase 2** — 5 success criteria locked
- **.planning/research/STACK.md** §Backend — Sequelize 6 + pg + pg-hstore versions + `belongsToMany` named-model pattern + `underscored: true` convention
- **.planning/research/ARCHITECTURE.md** §1 Database Schema + §2 PostgreSQL Indexing — exact SQL patterns + stats aggregation + index definitions
- **.planning/research/PITFALLS.md** — C3 (migration FK order), C8 (no auto-index), M1 (cascade), M4 (4-state ENUM), C17 (tracking_token)
- **.planning/phases/01-*/01-0{1,2,3,4}-SUMMARY.md** — confirms Phase 1 delivered: Yarn 4 + `@campaign/shared` dist emission + backend ESM `"type": "module"` + pino logger + `CampaignStatusEnum = z.enum(['draft','scheduled','sending','sent'])` exactly
- **CLAUDE.md** — 8 core constraints; locked decisions; PITFALLS highlights
- **shared/src/schemas/campaign.ts** (on-disk, verified 2026-04-20) — `CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent'])` — Phase 2 mirrors EXACTLY
- **npm registry** (verified 2026-04-20):
  - `sequelize@6.37.8`
  - `pg@8.20.0`
  - `pg-hstore@2.3.4` (STACK.md typo: 2.4.3 does not exist)
  - `bcryptjs@3.0.3`
  - `dotenv@17.4.2`
  - `sequelize-cli@6.6.5`

### Secondary (MEDIUM confidence)
- **Sequelize 6 official docs** (https://sequelize.org/docs/v6/) — Model.init() + underscored pattern + ENUM DataType + migration QueryInterface
- **sequelize-cli GitHub** (https://github.com/sequelize/cli — issues #861, #1156, PR #905) — ESM + `.cjs` migration pattern verified
- **bcryptjs 3.0.0 release notes** (https://github.com/dcodeIO/bcrypt.js/releases) — ESM-default + types bundled
- **Alex Rusin blog** (https://blog.alexrusin.com/database-indexes-with-sequelize/) — addIndex syntax examples
- **GitHub Issue sequelize/sequelize#11173** — addIndex with fn + ORDER DESC syntax

### Tertiary (LOW confidence / assumed)
- Training knowledge of `underscored: true` behavior for timestamp + FK columns (Assumption A1)
- `.sequelizerc` (no extension) being parsed as CJS under a `"type": "module"` package (Assumption A2)
- `Sequelize.literal('gen_random_uuid()')` rendering correctly as DDL default (Assumption A4) — widely cited but not re-verified this session

## Metadata

**Confidence breakdown:**
- Standard stack (versions, libraries): **HIGH** — all 6 packages npm-verified against the registry on 2026-04-20
- Architecture patterns (model init, associations, migrations, seeder): **HIGH** — locked by ARCHITECTURE.md + STACK.md + PITFALLS.md + Phase 1 lessons; every non-trivial choice has a cited source
- Pitfalls (FK order, pgcrypto, ENUM undo, ESM/CJS): **HIGH** — documented in PITFALLS.md and cross-referenced with upstream GitHub issues
- Seed shape: **HIGH** — DATA-03 spec is prescriptive; stats math verified (5 total / 4 sent / 1 failed / 1 opened → send_rate=80%, open_rate=25%)
- Infra (docker-compose postgres-only): **MEDIUM** — Phase 10 extends with redis + api + web; Phase 2 subset is straightforward
- Underscored FK auto-mapping edge cases (A1): **MEDIUM** — widely cited but not re-verified against Sequelize 6.37.8 source this session. Plan verification should include an explicit `Campaign.create({ createdBy: id })` smoke test.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — Sequelize 6 and PostgreSQL 16 are both in long-term maintenance; versions won't drift meaningfully)
**Phase requirements covered:** DATA-01, DATA-02, DATA-03 (100%)
