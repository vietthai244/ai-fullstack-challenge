---
phase: 02-schema-migrations-seed
plan: 02
type: execute
wave: 2
depends_on: ["02-01"]
files_modified:
  - backend/src/models/user.ts
  - backend/src/models/recipient.ts
  - backend/src/models/campaign.ts
  - backend/src/models/campaignRecipient.ts
  - backend/src/db/index.ts
autonomous: true
requirements:
  - DATA-01
requirements_addressed:
  - DATA-01
tags:
  - backend
  - sequelize
  - models
  - typescript

must_haves:
  truths:
    - "`backend/src/models/user.ts` exports a `User` class extending `Model<UserAttributes, UserCreationAttributes>` with static `initModel(sequelize)` and `associate(models)` methods, `underscored: true`, `tableName: 'users'`, `modelName: 'User'`"
    - "`backend/src/models/recipient.ts` exports a `Recipient` class with nullable `name`, `underscored: true`, `tableName: 'recipients'`"
    - "`backend/src/models/campaign.ts` exports a `Campaign` class with `status: ENUM('draft','scheduled','sending','sent')` matching `@campaign/shared` CampaignStatusEnum exactly, default `'draft'`, `createdBy` BIGINT FK, `scheduledAt` nullable DATE"
    - "`backend/src/models/campaignRecipient.ts` exports a `CampaignRecipient` class with composite PK (`campaignId`, `recipientId`), `trackingToken: UUID unique default Sequelize.literal('gen_random_uuid()')`, `status: ENUM('pending','sent','failed')`, nullable `sentAt`/`openedAt`"
    - "`Campaign.associate` uses `belongsToMany(models.Recipient, { through: models.CampaignRecipient, ... })` — **NAMED MODEL class, not the string 'CampaignRecipient'**"
    - "`Campaign.associate` uses `hasMany(models.CampaignRecipient, { foreignKey: 'campaignId', onDelete: 'CASCADE' })` so accessing the junction rows is typed"
    - "`Campaign.associate` uses `belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator', onDelete: 'CASCADE' })`"
    - "`Recipient.associate` uses `belongsToMany(models.Campaign, { through: models.CampaignRecipient, foreignKey: 'recipientId', otherKey: 'campaignId' })`"
    - "`CampaignRecipient.associate` uses `belongsTo(models.Campaign, { foreignKey: 'campaignId' })` and `belongsTo(models.Recipient, { foreignKey: 'recipientId' })`"
    - "`User.associate` uses `hasMany(models.Campaign, { foreignKey: 'createdBy', as: 'campaigns' })`"
    - "`backend/src/db/index.ts` throws `'DATABASE_URL is not set — see .env.example'` when `process.env.DATABASE_URL` is missing"
    - "`backend/src/db/index.ts` calls `User.initModel(sequelize)` + Recipient/Campaign/CampaignRecipient analogues BEFORE calling any `associate(models)` — init-all-first, associate-all-second"
    - "`backend/src/db/index.ts` exports named `sequelize`, `User`, `Recipient`, `Campaign`, `CampaignRecipient` — no default export"
    - "`yarn workspace @campaign/backend typecheck` exits 0 after all 5 files land"
    - "Relative imports use `.js` suffix (NodeNext — Phase 1 lesson): e.g., `from './user.js'`"
    - "Campaign model imports `type CampaignStatus` from `@campaign/shared` (NOT a local duplicate)"
  artifacts:
    - path: "backend/src/models/user.ts"
      provides: "User model class"
      contains: "static initModel"
      min_lines: 35
    - path: "backend/src/models/recipient.ts"
      provides: "Recipient model class"
      contains: "static initModel"
      min_lines: 35
    - path: "backend/src/models/campaign.ts"
      provides: "Campaign model class with 4-state ENUM + FK"
      contains: "ENUM('draft', 'scheduled', 'sending', 'sent')"
      min_lines: 50
    - path: "backend/src/models/campaignRecipient.ts"
      provides: "CampaignRecipient junction with composite PK + tracking_token UUID + 3-state ENUM"
      contains: "gen_random_uuid()"
      min_lines: 50
    - path: "backend/src/db/index.ts"
      provides: "Runtime Sequelize bootstrap — creates instance, initModels, wires associate(), exports barrel"
      contains: "DATABASE_URL is not set"
      min_lines: 25
  key_links:
    - from: "backend/src/db/index.ts"
      to: "backend/src/models/user.ts"
      via: "import { User } from '../models/user.js'"
      pattern: "from ['\"]\\.\\./models/user\\.js['\"]"
    - from: "backend/src/db/index.ts"
      to: "backend/src/models/campaign.ts"
      via: "import { Campaign } from '../models/campaign.js'"
      pattern: "from ['\"]\\.\\./models/campaign\\.js['\"]"
    - from: "backend/src/db/index.ts"
      to: "backend/src/models/campaignRecipient.ts"
      via: "import { CampaignRecipient } from '../models/campaignRecipient.js'"
      pattern: "from ['\"]\\.\\./models/campaignRecipient\\.js['\"]"
    - from: "backend/src/models/campaign.ts"
      to: "@campaign/shared"
      via: "import type { CampaignStatus } from '@campaign/shared'"
      pattern: "CampaignStatus.*@campaign/shared"
    - from: "backend/src/models/campaign.ts"
      to: "models.CampaignRecipient (the class)"
      via: "through: models.CampaignRecipient"
      pattern: "through:\\s*models\\.CampaignRecipient"
---

<objective>
Implement DATA-01: the four Sequelize class-based models (`User`, `Recipient`, `Campaign`, `CampaignRecipient`) in TypeScript and the runtime Sequelize bootstrap (`backend/src/db/index.ts`) that creates the Sequelize instance, registers each model via `initModel(sequelize)`, wires bi-directional associations via `associate(models)`, and exports the complete barrel. The 4-state campaign ENUM mirrors `@campaign/shared`'s `CampaignStatusEnum` exactly (`draft|scheduled|sending|sent`); the 3-state recipient ENUM is `pending|sent|failed`; the junction uses a composite PK plus the `tracking_token` UUID column that backs Phase 6's pixel lookup.

Purpose: Phase 3 (auth services) + Phase 4 (CRUD) + Phase 5 (worker) + Phase 6 (pixel route) all consume these model classes. Getting the contract right once — proper typing, named-Model `through:`, `underscored: true` convention, `.js` NodeNext suffix — means no downstream phase has to rework the model layer.

Output: 5 TypeScript files (4 models + 1 bootstrap) that typecheck cleanly and would instantiate a live Sequelize connection on import (deferred — `authenticate()` is called by Phase 3's `buildApp()`, not here).
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
@shared/src/schemas/campaign.ts
@CLAUDE.md

<interfaces>
<!-- Phase 1 + Plan 02-01 outputs consumed here: -->

**From `@campaign/shared` (Phase 1 Plan 01-01, re-exported in Plan 01-04):**
```typescript
// shared/src/schemas/campaign.ts — source of truth
import { z } from 'zod';
export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;
```
This plan imports `type CampaignStatus` in `campaign.ts` — the model's `status` field is typed against this exact string union. DO NOT redefine the enum locally; the shared package is the single source of truth (M4 + M7).

**From Plan 02-01:**
- `backend/src/db/config.cjs` — sequelize-cli reads from there at CLI time; runtime `src/db/index.ts` loads `DATABASE_URL` directly via dotenv.
- `backend/package.json` — has `sequelize@^6.37.8`, `pg@^8.20.0`, `dotenv@^17.4.2` runtime deps available.
- `backend/tsconfig.json` — now `include: ["src/**/*.ts"]`; all 5 files in this plan ARE typechecked.

**Sequelize 6 API surface used:**
```typescript
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';

// DataTypes.* — BIGINT, STRING(n), TEXT, ENUM(...values), DATE, UUID
// Sequelize.literal(sql) — embeds raw SQL (used for 'gen_random_uuid()' default)
// Model class with `declare fieldName: T` for TS 4+ — suppresses "has no initializer" errors
// Model.init(attrs, { sequelize, tableName, modelName, underscored, timestamps })
// Optional<T, K> — type helper: marks K keys as optional for CreationAttributes
```

**Phase 1 backend/src/index.ts (current state, Plan 01-04):**
```typescript
// File exists with describePhase1() scaffold. This plan does NOT modify it.
// Phase 3 will replace src/index.ts with the real Express buildApp() entry.
// Plan 02-02 only creates files under src/models/ and src/db/ — src/index.ts is untouched.
```

**NodeNext import discipline (locked in Phase 1):**
- Relative imports MUST use `.js` suffix for TS source files: `from './user.js'`, NOT `from './user'`.
- Package imports are bare: `from 'sequelize'`, `from '@campaign/shared'`.
- TypeScript compiler resolves `'./user.js'` → `./user.ts` at compile time; Node runtime at `dist` sees real `.js` after compilation.

**Logger from Phase 1 Plan 01-03 (available for import):**
- `backend/src/util/logger.ts` exports a pino `logger` instance with `.info/.debug/.error/.warn` methods, env-aware (silent in test, pretty in dev, JSON in prod). Import as: `import { logger } from '../util/logger.js'`.

**Locked decisions for this plan (from 02-RESEARCH.md §User Constraints §Locked Decisions):**
- Class-based `Model.init()` + `static associate()` — NOT sequelize-typescript decorators
- `through: models.CampaignRecipient` (NAMED MODEL class, NOT the string) — preserves junction field access (.status, .sentAt, .trackingToken, .openedAt)
- `underscored: true` on every model — camelCase TS attrs → snake_case SQL columns
- 4-state campaign ENUM + 3-state recipient ENUM exact values locked Day 1
- `tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()` — DB-side default (pgcrypto enabled by migration in Plan 02-03)
- No `sequelize.sync()` anywhere — migrations only (C2)
- No `await sequelize.authenticate()` in `src/db/index.ts` — defer to Phase 3's `buildApp()` (avoids import-time side effects that break test isolation)

**Model shape convention (from 02-RESEARCH.md §Pattern 3 / §Code Examples):**
Every model file follows this template:
1. Define `<Model>Attributes` interface — every column as a TS type
2. Define `<Model>CreationAttributes = Optional<Attributes, 'id' | 'createdAt' | 'updatedAt' | <optionals>>`
3. Export `class <Model> extends Model<Attributes, CreationAttributes> implements Attributes` with `declare` on every field
4. `static initModel(sequelize: Sequelize): typeof <Model>` — calls `<Model>.init(...)` and returns class
5. `static associate(models: { ... }): void` — wires belongsTo/hasMany/belongsToMany

**Filename casing convention (chosen for this plan):** lowercase filenames (`user.ts`, `recipient.ts`, `campaign.ts`, `campaignRecipient.ts`) per the 02-VALIDATION.md verify commands. Class names remain PascalCase inside the file. Research §Recommended Project Structure uses PascalCase filenames in one diagram and 02-VALIDATION.md uses lowercase; we pick lowercase to match the validation commands exactly.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create User + Recipient model classes</name>
  <files>backend/src/models/user.ts, backend/src/models/recipient.ts</files>
  <read_first>
    - `02-RESEARCH.md` §Code Examples — User model (full) — copy verbatim
    - `02-RESEARCH.md` §Code Examples — Recipient model — copy verbatim
    - `02-RESEARCH.md` §Pattern 3 — the generic model shape rationale (declare pattern, Optional<> helper)
    - `02-RESEARCH.md` §Anti-Patterns to Avoid — no fs.readdirSync model loading; no string `through:`
    - `02-VALIDATION.md` row "Plan 02-B DATA-01 (models)" — validates model class exports
  </read_first>
  <action>
    Create **`backend/src/models/user.ts`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Code Examples → User model (full), with the filename casing note — relative imports to `./campaign.js` use lowercase):

    ```typescript
    // backend/src/models/user.ts
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

      static associate(models: { Campaign: typeof import('./campaign.js').Campaign }): void {
        User.hasMany(models.Campaign, { foreignKey: 'createdBy', as: 'campaigns' });
      }
    }
    ```

    Notes on adaptations from 02-RESEARCH.md (which uses `./Campaign.js`):
    - `import('./campaign.js').Campaign` — lowercase filename matches the files this plan creates.
    - `passwordHash` typed `STRING(255)` accommodates bcryptjs 3.x 60-char hashes + any future algorithm migration.
    - `email` at `STRING(320)` matches RFC 5321 max email length.

    Create **`backend/src/models/recipient.ts`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Code Examples → Recipient model):

    ```typescript
    // backend/src/models/recipient.ts
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
        Campaign: typeof import('./campaign.js').Campaign;
        CampaignRecipient: typeof import('./campaignRecipient.js').CampaignRecipient;
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

    Rationale for the `hasMany(models.CampaignRecipient)` in addition to `belongsToMany`: the junction model is itself a first-class entity (it has `tracking_token`, `status`, `sent_at`, `opened_at`). The `hasMany` association gives explicit typed access to junction rows (`recipient.getCampaignRecipients()`) without paying the `belongsToMany` cross-table SQL cost.

    Do NOT add top-level side effects, console.log, or import anything from `src/db/index.ts` (would create a circular import — `db/index.ts` imports FROM `models/`, never the reverse).
  </action>
  <verify>
    <automated>test -f backend/src/models/user.ts && test -f backend/src/models/recipient.ts && grep -q "class User extends Model" backend/src/models/user.ts && grep -q "class Recipient extends Model" backend/src/models/recipient.ts && grep -q "tableName: 'users'" backend/src/models/user.ts && grep -q "tableName: 'recipients'" backend/src/models/recipient.ts && grep -q "underscored: true" backend/src/models/user.ts && grep -q "underscored: true" backend/src/models/recipient.ts && grep -q "static initModel" backend/src/models/user.ts && grep -q "static associate" backend/src/models/user.ts && grep -q "belongsToMany(models.Campaign" backend/src/models/recipient.ts && grep -q "through: models.CampaignRecipient" backend/src/models/recipient.ts && yarn workspace @campaign/backend typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist and match the interface + class + initModel + associate shape above
    - `user.ts` — `hasMany(Campaign, foreignKey: 'createdBy', as: 'campaigns')`
    - `recipient.ts` — `belongsToMany(Campaign, through: models.CampaignRecipient, foreignKey: 'recipientId', otherKey: 'campaignId')` AND `hasMany(CampaignRecipient, foreignKey: 'recipientId')`
    - Both use `tableName` in lowercase plural: `'users'`, `'recipients'`
    - Both set `underscored: true, timestamps: true`
    - Both use `unique: true` inline on the `email` column
    - Relative import in both uses `.js` suffix (NodeNext)
    - `through:` uses the MODEL CLASS (`models.CampaignRecipient`), NOT a string
    - No top-level side effects, no `console.log`, no import from `src/db/index.js`
    - `yarn workspace @campaign/backend typecheck` exits 0 AFTER this task (will still fail between tasks because `campaign.js` and `campaignRecipient.js` don't yet exist — but typecheck of just these two files AGAINST the import() type targets is lazy and should pass because TS treats unresolved dynamic imports as `any` unless explicitly resolved at usage time; if typecheck fails here due to missing siblings, Task 2 will close the gap)
  </acceptance_criteria>
  <done>user.ts + recipient.ts committed; structural grep gates pass; typecheck may tolerate the missing campaign/campaignRecipient siblings until Task 2 lands — confirm at end of Task 2.</done>
</task>

<task type="auto">
  <name>Task 2: Create Campaign + CampaignRecipient model classes</name>
  <files>backend/src/models/campaign.ts, backend/src/models/campaignRecipient.ts</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 3 (Campaign — the most illustrative) — copy verbatim
    - `02-RESEARCH.md` §Code Examples — CampaignRecipient model (junction, most complex) — copy verbatim
    - `02-RESEARCH.md` §User Constraints §Locked Decisions — `CampaignStatusEnum` mirror exactly; `through: NAMED MODEL not string`
    - `02-RESEARCH.md` §Pitfall 5 — tracking_token unguessability rationale (UUID default via pgcrypto)
    - `shared/src/schemas/campaign.ts` — confirm the 4 enum values (source of truth for CampaignStatus type)
    - `02-VALIDATION.md` row "Plan 02-B DATA-01 (associations)" — typecheck + runtime import proof command
  </read_first>
  <action>
    Create **`backend/src/models/campaign.ts`** with EXACTLY this content (adapted from 02-RESEARCH.md §Pattern 3 — lowercase relative imports):

    ```typescript
    // backend/src/models/campaign.ts
    import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';
    import type { CampaignStatus } from '@campaign/shared';

    export interface CampaignAttributes {
      id: number;                     // BIGSERIAL — DataTypes.BIGINT + autoIncrement: true
      name: string;
      subject: string;
      body: string;
      status: CampaignStatus;         // 'draft' | 'scheduled' | 'sending' | 'sent' — from @campaign/shared
      scheduledAt: Date | null;       // TIMESTAMPTZ, nullable
      createdBy: number;              // BIGINT FK → users.id
      createdAt: Date;
      updatedAt: Date;
    }

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
        User: typeof import('./user.js').User;
        Recipient: typeof import('./recipient.js').Recipient;
        CampaignRecipient: typeof import('./campaignRecipient.js').CampaignRecipient;
      }): void {
        Campaign.belongsTo(models.User, {
          foreignKey: 'createdBy',    // TS attr; underscored: true renders as 'created_by' in SQL
          as: 'creator',
          onDelete: 'CASCADE',        // If a user is deleted, their campaigns go too (aligns with single-user scope)
        });
        Campaign.belongsToMany(models.Recipient, {
          through: models.CampaignRecipient,   // NAMED MODEL — not a string (STACK.md + PITFALLS M1 companion)
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

    Critical: the 4 ENUM literals (`'draft', 'scheduled', 'sending', 'sent'`) MUST appear in that exact order and spelling — must match `@campaign/shared`'s `CampaignStatusEnum` (M4: Postgres ENUM values cannot be altered in a transaction; we lock them day 1).

    Create **`backend/src/models/campaignRecipient.ts`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Code Examples → CampaignRecipient model, adapted for lowercase imports):

    ```typescript
    // backend/src/models/campaignRecipient.ts
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
        Campaign: typeof import('./campaign.js').Campaign;
        Recipient: typeof import('./recipient.js').Recipient;
      }): void {
        CampaignRecipient.belongsTo(models.Campaign, { foreignKey: 'campaignId', as: 'campaign' });
        CampaignRecipient.belongsTo(models.Recipient, { foreignKey: 'recipientId', as: 'recipient' });
      }
    }
    ```

    Notes on the junction:
    - `primaryKey: true` on BOTH `campaignId` AND `recipientId` tells Sequelize to emit them as a composite PRIMARY KEY in the migration-generated DDL — we mirror that in the migration (Plan 02-03).
    - `trackingToken` uses `Sequelize.literal('gen_random_uuid()')` as the `defaultValue` — renders as `DEFAULT gen_random_uuid()` in the DDL (Research Assumption A4 — widely cited pattern).
    - The 3-state ENUM (`'pending', 'sent', 'failed'`) matches the locked spec; NOT 4 values here.
    - `export type RecipientStatus` — local type declaration (no shared dep needed; this enum is backend-only for now; Phase 4 may promote it to `@campaign/shared`).
  </action>
  <verify>
    <automated>test -f backend/src/models/campaign.ts && test -f backend/src/models/campaignRecipient.ts && grep -q "import type { CampaignStatus } from '@campaign/shared'" backend/src/models/campaign.ts && grep -q "ENUM('draft', 'scheduled', 'sending', 'sent')" backend/src/models/campaign.ts && grep -q "ENUM('pending', 'sent', 'failed')" backend/src/models/campaignRecipient.ts && grep -q "through: models.CampaignRecipient" backend/src/models/campaign.ts && grep -q "Sequelize.literal('gen_random_uuid()')" backend/src/models/campaignRecipient.ts && grep -q "onDelete: 'CASCADE'" backend/src/models/campaign.ts && grep -q "primaryKey: true" backend/src/models/campaignRecipient.ts && yarn workspace @campaign/backend typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `campaign.ts` exists, imports `type CampaignStatus` from `@campaign/shared` (NOT redefined locally)
    - `campaign.ts` uses `DataTypes.ENUM('draft', 'scheduled', 'sending', 'sent')` literally — exact order, exact spelling, lowercase
    - `campaign.ts` `associate()` uses `through: models.CampaignRecipient` (the class, not the string)
    - `campaign.ts` `belongsTo(User, { onDelete: 'CASCADE', as: 'creator' })`
    - `campaignRecipient.ts` exists, uses `DataTypes.ENUM('pending', 'sent', 'failed')`
    - `campaignRecipient.ts` has `primaryKey: true` on both `campaignId` AND `recipientId`
    - `campaignRecipient.ts` uses `Sequelize.literal('gen_random_uuid()')` as the trackingToken default
    - `tableName: 'campaign_recipients'` (snake_case) in `campaignRecipient.ts`
    - `tableName: 'campaigns'` in `campaign.ts`
    - Both models use `underscored: true, timestamps: true`
    - `yarn workspace @campaign/backend typecheck` exits 0 — all 4 model files + Phase 1 entry point + util/ all compile together
  </acceptance_criteria>
  <done>campaign.ts + campaignRecipient.ts committed; all 4 model files in place; full backend typecheck exits 0.</done>
</task>

<task type="auto">
  <name>Task 3: Create src/db/index.ts runtime bootstrap + runtime-import smoke test</name>
  <files>backend/src/db/index.ts</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 4 (`src/db/index.ts`) — copy verbatim
    - `02-RESEARCH.md` §Pitfall 8 (DATABASE_URL missing throw) — keeps the exact error message
    - `02-RESEARCH.md` §Anti-Patterns to Avoid — no `sequelize.sync()`, no `await authenticate()` on import, no `fs.readdirSync` model loading
    - `02-VALIDATION.md` row "Plan 02-B DATA-01 (models)" — `yarn tsx -e "import('./src/db/index.ts').then(m => console.log(Object.keys(m).sort()))"` expects `["Campaign","CampaignRecipient","Recipient","User","sequelize"]`
    - `02-VALIDATION.md` row "Plan 02-B DATA-01 (associations)" — typecheck + CampaignRecipient.findByPk test-import
    - Phase 1 Plan 01-03 SUMMARY — `backend/src/util/logger.ts` exports `logger`
  </read_first>
  <action>
    Create **`backend/src/db/index.ts`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 4, with lowercase model imports and a typed logging callback):

    ```typescript
    // backend/src/db/index.ts
    import 'dotenv/config';
    import { Sequelize } from 'sequelize';
    import { logger } from '../util/logger.js';
    import { User } from '../models/user.js';
    import { Recipient } from '../models/recipient.js';
    import { Campaign } from '../models/campaign.js';
    import { CampaignRecipient } from '../models/campaignRecipient.js';

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
          ? (sql: string) => logger.debug({ sql }, 'sequelize')
          : false,
    });

    // Init all models first (order irrelevant — Sequelize doesn't validate FKs until associate).
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

    Key invariants this file enforces:
    1. **Throws on missing `DATABASE_URL`** — C-Pitfall-8; Phase 3 `buildApp()` can catch and report; CLI invocations hit this path via `require('dotenv').config()` in `config.cjs` + the fresh import here.
    2. **No `await sequelize.authenticate()` at import time** — allows seeders (which run in a Node process) and tests (Phase 7) to import this module without opening a connection prematurely. Phase 3's `buildApp()` will call `await sequelize.authenticate()` during startup.
    3. **No `sequelize.sync()` anywhere** — migrations only (C2).
    4. **Init-all first, associate-all second** — Sequelize requires all models registered before associations can reference siblings by identity.
    5. **Explicit imports, no dynamic/readdir model loading** — typecheck-friendly, zero circular-import risk.
    6. **Logging wiring** — dev uses Phase 1 pino `logger.debug({ sql }, 'sequelize')`; test silent; prod silent by default.
    7. **Type annotation on the `sql` parameter** — avoids an implicit-`any` warning under Phase 1's strict tsconfig.

    Runtime-import smoke proof (executed as part of verify, not committed as a script):
    ```bash
    # Set a dummy DATABASE_URL so the import doesn't throw. No DB connection is opened
    # because src/db/index.ts does NOT call authenticate() — only `new Sequelize(url, opts)`.
    DATABASE_URL=postgres://x:y@localhost:5432/z yarn workspace @campaign/backend exec tsx -e "import('./src/db/index.ts').then(m => { const keys = Object.keys(m).sort(); console.log(keys.join(',')); if (keys.join(',') !== 'Campaign,CampaignRecipient,Recipient,User,sequelize') { process.exit(1); } })"
    ```

    If the smoke throws on `Sequelize` connection attempts (it shouldn't — `new Sequelize()` is lazy), verify no `authenticate()` / `query()` / `sync()` call is accidentally in the file.
  </action>
  <verify>
    <automated>test -f backend/src/db/index.ts && grep -q "import 'dotenv/config'" backend/src/db/index.ts && grep -q "DATABASE_URL is not set" backend/src/db/index.ts && grep -q "User.initModel(sequelize)" backend/src/db/index.ts && grep -q "Recipient.initModel(sequelize)" backend/src/db/index.ts && grep -q "Campaign.initModel(sequelize)" backend/src/db/index.ts && grep -q "CampaignRecipient.initModel(sequelize)" backend/src/db/index.ts && grep -q "User.associate(models)" backend/src/db/index.ts && grep -q "export { User, Recipient, Campaign, CampaignRecipient }" backend/src/db/index.ts && ! grep -q "sequelize\.sync" backend/src/db/index.ts && ! grep -q "await sequelize\.authenticate" backend/src/db/index.ts && yarn workspace @campaign/backend typecheck && DATABASE_URL=postgres://x:y@localhost:5432/z yarn workspace @campaign/backend exec tsx -e "import('./src/db/index.ts').then(m => { const keys = Object.keys(m).sort(); if (keys.join(',') !== 'Campaign,CampaignRecipient,Recipient,User,sequelize') { console.error('keys:', keys.join(',')); process.exit(1); } console.log('OK'); })"</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/db/index.ts` exists, imports dotenv, throws on missing DATABASE_URL with the exact literal `"DATABASE_URL is not set — see .env.example"` (em-dash included)
    - File imports all 4 models via `.js` suffix (NodeNext)
    - All 4 `initModel(sequelize)` calls land BEFORE any `associate(models)` call
    - All 4 `associate(models)` calls use the same `models` record (`{ User, Recipient, Campaign, CampaignRecipient }`)
    - Exports: `sequelize` (named), `User`, `Recipient`, `Campaign`, `CampaignRecipient` — alphabetized output is `["Campaign", "CampaignRecipient", "Recipient", "User", "sequelize"]`
    - NO `sequelize.sync()` call anywhere in file (C2 compliance)
    - NO `await sequelize.authenticate()` at import time (import-time side-effect hygiene)
    - `yarn workspace @campaign/backend typecheck` exits 0 — 4 model files + bootstrap + Phase 1 entry all compile
    - Runtime-import smoke test exits 0 and prints `OK` (proves the 4 models + sequelize are reachable, `associate()` doesn't throw on sibling resolution)
  </acceptance_criteria>
  <done>src/db/index.ts committed; DATA-01 complete — 4 typed model classes + runtime bootstrap verified via typecheck + dynamic import smoke. Plan 02-03 (migrations) is unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend source (TS) → runtime Sequelize | Models define the application-side contract; DB enforces via migrations (Plan 02-03). Mismatch = runtime error at query time. |
| `@campaign/shared` → backend | `CampaignStatus` type is the single source of truth for the 4-state enum; backend must mirror exactly, not redefine. |
| Import-time resolution → external env | `src/db/index.ts` throws on missing `DATABASE_URL` — gate against silent misconfig at startup. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-02-01 | Tampering (V5 input validation) | `Campaign.status` column | mitigate | DB-level native ENUM (`draft|scheduled|sending|sent`) rejects any other value at INSERT/UPDATE time — belt for Zod's suspenders (Phase 4). Model `DataTypes.ENUM(...)` also rejects on app side. |
| T-02-02-02 | Tampering (V5) | `CampaignRecipient.status` column | mitigate | Same native ENUM pattern with 3 values (`pending|sent|failed`). |
| T-02-02-03 | Information Disclosure (V8 data protection) | `password_hash` column type sizing | mitigate | `STRING(255)` (not `TEXT`, not `JSON`) — prevents accidental full-row JSON dumps from leaking hash shape details; accommodates 60-char bcrypt output plus any future algo migration. |
| T-02-02-04 | Information Disclosure (V6 crypto) | `tracking_token` exposure | mitigate | UUID generated by pgcrypto `gen_random_uuid()` at DB level (enabled by Plan 02-03's first migration); 122 bits of entropy. App never sets tracking_token manually — default handles it. Public pixel URL (Phase 6) uses the UUID, never the BIGINT composite PK (C17). |
| T-02-02-05 | Integrity (M1 FK cascade) | `Campaign.creator` FK | mitigate | `Campaign.belongsTo(User, { onDelete: 'CASCADE' })` — user deletion cascades to their campaigns; DB enforces atomically (not a hook that can be bypassed). |
| T-02-02-06 | Tampering via junction misconfig | `belongsToMany.through` | mitigate | Uses NAMED Model class (`models.CampaignRecipient`), NOT string `'CampaignRecipient'`. Preserves type-safe access to junction fields (status, sentAt, trackingToken). Research §Anti-Patterns explicitly forbids the string form. |
| T-02-02-07 | DoS (V5) | `sequelize.sync()` in prod | mitigate | `src/db/index.ts` does NOT call `sync()` — migrations only (C2). Verify grep enforces absence. |
| T-02-02-08 | Information Disclosure (V14) | `logger.debug({ sql }, 'sequelize')` in dev | accept | SQL statements logged at `debug` level in development only (filtered out in test + prod per Plan 01-03's env-aware logger). Dev environment is trusted. No connection string leakage (only the statement text). |

No V2/V3/V4 threats here — those are Phase 3's auth surface. No V6 seed-hash threat — that's Plan 02-04's responsibility.
</threat_model>

<verification>
Plan 02-02 is the DATA-01 deliverable (4 models + runtime bootstrap). Post-plan state:

1. `yarn workspace @campaign/backend typecheck` exits 0 — all 4 models + bootstrap compile.
2. Dynamic-import smoke (`tsx -e "import('./src/db/index.ts').then(...)"` with a dummy DATABASE_URL) prints the 5 expected keys (`Campaign, CampaignRecipient, Recipient, User, sequelize`).
3. No `sync()` call anywhere under `backend/src/` (grep gate).
4. No `authenticate()` awaited at import time (grep gate).

**NOT verified yet (Plan 02-03 owns these):**
- DDL execution — actual CREATE TABLE, pgcrypto extension, indexes, FKs (migrations)
- Round-trip `yarn db:migrate:undo:all && yarn db:migrate` (migrations + package.json scripts)
- Postgres ENUM types present (`enum_campaigns_status`, `enum_campaign_recipients_status`)

**NOT verified yet (Plan 02-04 owns):**
- Seed execution + row counts (1 user / 10 recipients / 3 campaigns)
- bcrypt hash in users.password_hash
- Mixed-status junction rows on the sent campaign

**Handoff contract:** Plan 02-03 imports the 4 model ENUM literal lists directly into its migrations (copy of `['draft','scheduled','sending','sent']` + `['pending','sent','failed']`) — DB-level ENUM types must match model-level ENUM `DataTypes.ENUM` exactly (Research Assumption A3). Plan 02-04 uses the runtime `src/db/index.ts` indirectly — the seeder file is .cjs and uses `queryInterface.bulkInsert` directly, not the model classes, per 02-RESEARCH.md §Pattern 7.
</verification>

<success_criteria>
- [ ] `backend/src/models/user.ts` — User class with initModel + associate(hasMany Campaign); matches shape
- [ ] `backend/src/models/recipient.ts` — Recipient class; belongsToMany Campaign via CampaignRecipient (named model); hasMany CampaignRecipient
- [ ] `backend/src/models/campaign.ts` — Campaign class with 4-state ENUM matching `@campaign/shared` exactly; belongsTo User(CASCADE); belongsToMany Recipient via CampaignRecipient (named model); hasMany CampaignRecipient(CASCADE)
- [ ] `backend/src/models/campaignRecipient.ts` — junction with composite PK (both fields `primaryKey: true`), `trackingToken: UUID unique default Sequelize.literal('gen_random_uuid()')`, 3-state ENUM; belongsTo Campaign; belongsTo Recipient
- [ ] `backend/src/db/index.ts` — runtime bootstrap: throws on missing DATABASE_URL with the exact message; inits all 4 models first then associates all 4; exports named sequelize + all 4 classes
- [ ] Relative imports use `.js` suffix (NodeNext discipline from Phase 1)
- [ ] All models use `underscored: true, timestamps: true`
- [ ] NO `sequelize.sync()` anywhere
- [ ] NO `await sequelize.authenticate()` at import time
- [ ] `yarn workspace @campaign/backend typecheck` exits 0
- [ ] Runtime-import smoke exits 0 with the expected 5 keys
- [ ] `through:` uses MODEL CLASS everywhere, not strings
- [ ] `Campaign.status` ENUM literal list matches `@campaign/shared` CampaignStatusEnum exactly
</success_criteria>

<output>
After completion, create `.planning/phases/02-schema-migrations-seed/02-02-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.

Handoff to Plan 02-03 (migrations):
- Migrations reference the same ENUM literal lists — copy verbatim from `campaign.ts` and `campaignRecipient.ts` into the migration files.
- The `tracking_token UUID DEFAULT gen_random_uuid()` pattern in `campaignRecipient.ts` MUST be mirrored in the migration's `Sequelize.literal('gen_random_uuid()')` column default — these two must agree.
- FK columns in migrations use snake_case (`created_by`, `campaign_id`, `recipient_id`) because `underscored: true` auto-converts on the JS side (Research Assumption A1).
</output>
