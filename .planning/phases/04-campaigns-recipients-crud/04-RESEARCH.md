# Phase 4: Campaigns & Recipients CRUD — Research

**Researched:** 2026-04-21
**Domain:** Sequelize v6 + PostgreSQL 16 — cursor pagination, raw-SQL aggregates, ON CONFLICT upsert, nested eager-load, migration ALTER TABLE
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Recipients are per-user. `recipients.user_id` FK + `UNIQUE(user_id, email)` replaces global `UNIQUE(email)`.
- **D-02:** Phase 4 ships migration `20260421xxxxxx-add-user-id-to-recipients.cjs` that adds `user_id BIGINT NOT NULL`, backfills from demo seed, drops old `UNIQUE(email)`, adds `UNIQUE(user_id, email)` + index on `recipients(user_id)`.
- **D-03:** Cross-user recipient access returns 404 (not 403).
- **D-04:** `GET /recipients` filters by `req.user.id`, uses same cursor-pagination shape as campaigns.
- **D-05:** `PATCH /campaigns/:id` accepts `{name?, subject?, body?, recipientEmails?}` — all optional, Zod refinement requires at least one field.
- **D-06:** If `recipientEmails` is present: full replace inside one Sequelize transaction — upsert recipients, insert new CampaignRecipient rows, delete removed ones.
- **D-07:** If `recipientEmails` is absent: text-only update, CampaignRecipient rows untouched.
- **D-08:** `status ≠ draft` returns 409 Conflict via atomic guard at service layer (not controller).
- **D-09:** Shared `computeCampaignStats(campaignId, { transaction? })` returns `{ total, sent, failed, opened, open_rate, send_rate }` via single SQL aggregate.
- **D-10:** `GET /campaigns/:id` eager-loads recipients (no N+1) + calls `computeCampaignStats` once.
- **D-11:** `GET /campaigns/:id/stats` calls same service fn. No divergence.
- **D-12:** `recipientEmails` is `string[]`, Zod validates each as email.
- **D-13:** POST/PATCH upsert: `ON CONFLICT (user_id, email) DO NOTHING RETURNING id`. Existing rows keep stored `name`.
- **D-14:** `POST /recipient` is the only endpoint to set/update `name` — `DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)`.
- **D-15:** Upsert must return `id` for every input email (both inserted and pre-existing). Use `DO UPDATE SET email = EXCLUDED.email RETURNING id` (no-op update trick) OR follow-up SELECT. Both valid.
- **D-16:** Cursor format: `base64url(JSON.stringify({ cAt: created_at_iso, cId: id_string }))`.
- **D-17:** Cursor query: `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with `replacements: { cAt, cId }`.
- **D-18:** Ownership scoping via `where: { user_id: req.user.id }` (never in cursor payload).
- **D-19:** Last page: `{ data: [...], nextCursor: null, hasMore: false }` — explicit, not undefined.
- **D-20:** Malformed cursor (bad base64, JSON parse fail, `isNaN(id)`, invalid ISO) → 400 `INVALID_CURSOR`. No silent fallback.
- **D-21:** `limit` default 20, max 100, Zod-validated as `.int().positive().max(100)`.
- **D-22:** Route files: replace Phase 3 stubs in `backend/src/routes/campaigns.ts` and `backend/src/routes/recipients.ts`.
- **D-23:** Service layer: `backend/src/services/campaignService.ts` + `backend/src/services/recipientService.ts`.
- **D-24:** Controllers thin — parse via `validate(schema, source)`, call service, `catch(err) { next(err) }`.
- **D-25:** Status guard: atomic `UPDATE campaigns SET ... WHERE id = :id AND user_id = :uid AND status = 'draft' RETURNING *`. Zero rows → throw `ConflictError('CAMPAIGN_NOT_EDITABLE')`.
- **D-26:** `@campaign/shared` gains: `CreateCampaignSchema`, `UpdateCampaignSchema`, `CampaignSchema`, `CampaignDetailSchema`, `CampaignListItemSchema`, `StatsSchema`, `CursorPageSchema`, `CreateRecipientSchema`, `RecipientSchema`, `RecipientListSchema`.
- **D-27:** After schema changes: `yarn workspace @campaign/shared build` to rebuild `dist/`.

### Claude's Discretion

- Upsert-returning-id method: no-op update trick vs. follow-up SELECT (planner picks; both valid).
- Cursor encode/decode helpers: inline vs. extracted (consider Phase 5 reuse in status endpoint).
- Index strategy beyond `recipients(user_id)` and Phase 2 indexes: add only if EXPLAIN reveals seq scan.

### Deferred Ideas (OUT OF SCOPE)

- Recipient object API with name on request body (`recipientEmails` stays as `string[]` for v1).
- Add/remove recipient deltas on PATCH (v1 does full replace only).
- Recipient search/filter (`?q=`) on `GET /recipients`.
- Stats caching / materialized view.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAMP-01 | `GET /campaigns` cursor pagination — `{data, nextCursor, hasMore}`, opaque cursor encodes `(created_at,id)` | Sequelize.literal + replacements pattern verified; C16 pitfall coverage documented |
| CAMP-02 | `POST /campaigns` — draft, upsert recipients, CampaignRecipient rows in pending inside tx | ON CONFLICT upsert pattern + sequelize.transaction verified |
| CAMP-03 | `GET /campaigns/:id` — eager-loaded recipients (no N+1) + inline stats | nested include chain pattern verified; C1 prevention documented |
| CAMP-04 | `PATCH /campaigns/:id` — 409 if status ≠ draft (atomic guard) | atomic UPDATE ... RETURNING pattern verified |
| CAMP-05 | `DELETE /campaigns/:id` — 409 if status ≠ draft; cascade to CampaignRecipient | Same atomic guard; existing CASCADE confirmed in migration 04 |
| CAMP-08 | `GET /campaigns/:id/stats` — `COUNT(*) FILTER` aggregate, NULLIF divide-by-zero | raw SQL aggregate pattern + NULLIF+ROUND verified |
| RECIP-01 | `POST /recipient` — upsert by email under user_id | DO UPDATE SET name = COALESCE pattern documented |
| RECIP-02 | `GET /recipients` — paginated list per user | Same cursor pagination pattern as campaigns |
</phase_requirements>

---

## Summary

Phase 4 builds eight REST endpoints on top of the Phase 3 auth layer. The key technical challenges — in order of risk — are:

1. **Cursor pagination correctness** (C16): composite `(created_at, id)` cursor prevents page-boundary duplicates on `created_at` ties. `Sequelize.literal` with named `:replacements` prevents SQL injection. The `id` tiebreaker is mandatory.

2. **Atomic status guard** (C10, C11): campaigns use a single `UPDATE ... WHERE status = 'draft' RETURNING *` pattern at the service layer. Zero affected rows means a concurrent request won the lock — throw `ConflictError`. This pattern is reused verbatim in Phase 5's send endpoint.

3. **Recipient upsert returning IDs** (D-15): `ON CONFLICT DO NOTHING` does not return existing rows. The no-op update trick (`DO UPDATE SET email = EXCLUDED.email`) forces Postgres to return every row regardless. This is the recommended single-query approach.

4. **Migration for `recipients.user_id`** (D-02): the existing table has a global `UNIQUE(email)` constraint. The migration must: add column, backfill, drop old constraint, add composite unique, add index. The `down()` must reverse cleanly.

5. **Stats aggregate SQL** (D-09, M3): `COUNT(*) FILTER (WHERE status = 'X')` avoids JS counting. `NULLIF(total, 0)` prevents divide-by-zero. `ROUND(... ::numeric, 2)` ensures two-decimal output.

**Primary recommendation:** Build services first (`campaignService.ts`, `recipientService.ts`, `computeCampaignStats`), then wire thin route handlers, then shared Zod schemas (build shared last with `yarn workspace @campaign/shared build`).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cursor encode/decode | API / Backend | — | Opaque to client; server owns format |
| Status guard enforcement | API / Backend (service layer) | — | Database atomicity required — cannot trust client state |
| Recipient upsert | API / Backend (service layer) | Database (UNIQUE constraint) | Business rule + DB constraint work together |
| Stats aggregation | Database | API (formatting) | `COUNT(*) FILTER` is a SQL operation; JS must not count |
| Input validation | API / Backend (middleware) | Shared (Zod schemas) | `validate(schema, source)` middleware at route boundary |
| Ownership scoping | API / Backend (service layer) | — | `WHERE user_id = req.user.id` on every query |
| CampaignRecipient link | Database (CASCADE) | API (tx management) | FK cascade handles delete; API manages create in tx |

---

## Standard Stack

### Core (all verified in `backend/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sequelize | 6.37.8 | ORM — models, queries, transactions | Locked by project — already installed [VERIFIED: npm view] |
| pg | ^8.20.0 | PostgreSQL driver | Required by Sequelize postgres dialect |
| zod | ^3.23.8 | Schema validation (via shared) | Locked by project; workspace-scoped |
| express | ^4.22.1 | HTTP framework | Locked by project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sequelize-cli | ^6.6.5 | Migration runner | `yarn workspace @campaign/backend db:migrate` |

### Alternatives Considered

None — stack is fully locked. No alternatives researched.

**Version verification:** All versions verified against `backend/package.json` and `npm view sequelize version` (6.37.8). [VERIFIED: npm view]

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP Request
    │
    ▼
authenticate middleware (req.user = {id, email})
    │
    ▼
validate(Schema, 'body'|'query'|'params') middleware
    │
    ├─ validation fail ─► ValidationError → errorHandler → 400
    │
    ▼
thin route handler (parse, call service, catch→next)
    │
    ▼
campaignService / recipientService
    │
    ├─ ownership check: WHERE user_id = req.user.id
    │
    ├─ atomic guard: UPDATE ... WHERE status='draft' RETURNING *
    │   └─ 0 rows ─► ConflictError → errorHandler → 409
    │
    ├─ sequelize.transaction() boundary (POST/PATCH/DELETE)
    │   ├─ upsert recipients (raw SQL ON CONFLICT)
    │   ├─ create/update campaign
    │   └─ insert/delete CampaignRecipient rows
    │
    ├─ computeCampaignStats(id) — single raw SQL SELECT
    │
    └─ result ─► res.json({ data: ... })

GET /campaigns list:
    cursor decode → WHERE (created_at, id) < (:cAt, :cId) →
    ORDER BY created_at DESC, id DESC → LIMIT limit+1 →
    if results.length > limit: pop last, set nextCursor, hasMore=true
    else: nextCursor=null, hasMore=false
```

### Recommended Project Structure

```
backend/src/
├── routes/
│   ├── campaigns.ts          # Replace Phase 3 stub — thin handlers only
│   └── recipients.ts         # Replace Phase 3 stub — thin handlers only
├── services/
│   ├── campaignService.ts    # All business rules, tx boundaries, status guards
│   ├── recipientService.ts   # List (paginated) + upsert by email
│   └── statsService.ts       # computeCampaignStats() — or inline in campaignService
├── migrations/
│   └── 20260421000001-add-user-id-to-recipients.cjs  # D-02
shared/src/schemas/
└── campaign.ts               # Extend: CreateCampaignSchema, UpdateCampaignSchema, etc.
```

---

## Sequelize v6 Code Patterns

### Pattern 1: Cursor Pagination with Composite Key

**What:** Fetch page of campaigns using `(created_at, id)` composite cursor.
**When to use:** All `GET /campaigns` and `GET /recipients` list endpoints.

```typescript
// Source: PITFALLS.md C16 + Context7 /sequelize/sequelize (verified Sequelize.literal + replacements)

import { Op, Sequelize } from 'sequelize';
import { Campaign } from '../db/index.js';

interface CursorPayload { cAt: string; cId: string }

function encodeCursor(createdAt: Date, id: number): string {
  const payload: CursorPayload = {
    cAt: createdAt.toISOString(),
    cId: String(id),   // BIGINT as string — avoids JS number precision loss
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestError('INVALID_CURSOR');
  }
  if (!payload.cAt || !payload.cId) throw new BadRequestError('INVALID_CURSOR');
  const d = new Date(payload.cAt);
  if (isNaN(d.getTime())) throw new BadRequestError('INVALID_CURSOR');  // C16 guard
  if (isNaN(Number(payload.cId))) throw new BadRequestError('INVALID_CURSOR');
  return payload;
}

export async function listCampaigns(userId: number, limit: number, cursor?: string) {
  const whereClause: Record<string, unknown> = { createdBy: userId };
  const replacements: Record<string, unknown> = {};
  let literalWhere = null;

  if (cursor) {
    const { cAt, cId } = decodeCursor(cursor);
    // C16: composite cursor — id tiebreaker prevents duplicates at created_at boundaries
    literalWhere = Sequelize.literal('(created_at, id) < (:cAt, :cId)');
    replacements.cAt = cAt;
    replacements.cId = cId;
  }

  const rows = await Campaign.findAll({
    where: literalWhere
      ? { ...whereClause, [Op.and]: [literalWhere] }
      : whereClause,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: limit + 1,   // fetch one extra to detect last page
    replacements,       // Sequelize passes these to the query — NOT string interpolation
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = data[data.length - 1];
  // m5: explicit null on last page — never undefined
  const nextCursor = hasMore && lastRow
    ? encodeCursor(lastRow.createdAt, lastRow.id)
    : null;

  return { data, nextCursor, hasMore };
}
```

**Critical notes:**
- `replacements` key on `findAll` is how Sequelize passes named params to `Sequelize.literal`. [VERIFIED: Context7 /sequelize/sequelize]
- `limit + 1` trick: if we get `limit+1` rows, there is a next page. Slice off the extra before returning.
- `id` in BIGINT is returned as a string by Postgres/Sequelize (confirmed in STATE.md Plan 03-04). `cId` must be stored/compared as string.

---

### Pattern 2: Atomic Status Guard (UPDATE ... RETURNING)

**What:** Prevent concurrent PATCH/DELETE/send on non-draft campaigns.
**When to use:** PATCH, DELETE (Phase 4); send endpoint (Phase 5 uses same pattern).

```typescript
// Source: PITFALLS.md C10, C11; CONTEXT.md D-25

import { sequelize, Campaign } from '../db/index.js';
import { ConflictError, NotFoundError } from '../util/errors.js';

export async function guardDraftCampaign(
  campaignId: number,
  userId: number,
  transaction?: Transaction,
): Promise<Campaign> {
  // First ensure the campaign exists and belongs to the user
  const campaign = await Campaign.findOne({
    where: { id: campaignId, createdBy: userId },
    transaction,
  });
  if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');

  // Atomic guard: UPDATE ... WHERE status='draft' RETURNING *
  // If another request already changed status, this UPDATE matches 0 rows → ConflictError
  // C11: this is the race-condition defense — not a sequential read+write
  const [count] = await Campaign.update(
    { updatedAt: new Date() },           // no-op field touch — forces RETURNING to fire
    {
      where: { id: campaignId, createdBy: userId, status: 'draft' },
      returning: true,
      transaction,
    },
  );
  if (count === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');
  return campaign;
}
```

**Alternative (preferred for PATCH — updates fields in one query):**
```typescript
// Use sequelize.query() for UPDATE ... WHERE status='draft' RETURNING *
// This is more natural when you need to update fields AND guard atomically.
const [results] = await sequelize.query<Campaign>(
  `UPDATE campaigns
   SET name = COALESCE(:name, name),
       subject = COALESCE(:subject, subject),
       body = COALESCE(:body, body),
       updated_at = NOW()
   WHERE id = :id AND created_by = :userId AND status = 'draft'
   RETURNING *`,
  {
    replacements: { id: campaignId, userId, name: input.name ?? null, subject: input.subject ?? null, body: input.body ?? null },
    type: QueryTypes.SELECT,  // RETURNING makes this return rows
    transaction,
  },
);
if (!results || results.length === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');
```

---

### Pattern 3: Recipient Upsert Returning IDs

**What:** INSERT ... ON CONFLICT DO UPDATE RETURNING id for all emails (new + existing).
**When to use:** POST /campaigns and PATCH /campaigns/:id when recipientEmails provided.

```typescript
// Source: CONTEXT.md D-15; verified against PostgreSQL ON CONFLICT syntax
// The "no-op update trick" — DO UPDATE SET email = EXCLUDED.email forces
// Postgres to return existing rows that would otherwise be suppressed by DO NOTHING.

import { sequelize } from '../db/index.js';
import { QueryTypes } from 'sequelize';

interface RecipientIdRow { id: string }  // BIGINT returned as string

export async function upsertRecipientsByEmail(
  userId: number,
  emails: string[],
  t: Transaction,
): Promise<string[]> {
  if (emails.length === 0) return [];

  // Build VALUES clause: ($1,$2), ($3,$4), ...
  // Use raw query because Sequelize bulkCreate with updateOnDuplicate doesn't
  // support returning=true reliably across all PG versions.
  const values = emails.map((_, i) => `(:userId, :email${i})`).join(', ');
  const replacements: Record<string, unknown> = { userId };
  emails.forEach((email, i) => { replacements[`email${i}`] = email; });

  const rows = await sequelize.query<RecipientIdRow>(
    `INSERT INTO recipients (user_id, email, created_at, updated_at)
     VALUES ${values}
     ON CONFLICT (user_id, email)
       DO UPDATE SET email = EXCLUDED.email   -- no-op: forces RETURNING to include existing rows
     RETURNING id`,
    { replacements, type: QueryTypes.SELECT, transaction: t },
  );
  return rows.map(r => r.id);
}
```

**Why not `Recipient.bulkCreate` with `updateOnDuplicate`?**
- `updateOnDuplicate: ['email']` + `conflictAttributes: ['user_id', 'email']` would work in theory [VERIFIED: Context7 bulkCreate docs], but it requires the composite unique constraint to already exist in the DB at query time AND Sequelize v6's `returning: true` support for bulkCreate on Postgres is not guaranteed for composite conflict targets.
- Raw `sequelize.query` with explicit `RETURNING id` is unambiguous. [ASSUMED: Sequelize bulkCreate returning with composite conflict targets may have edge cases in v6.37]

---

### Pattern 4: Nested Eager Load (No N+1)

**What:** Load Campaign with CampaignRecipient rows and their Recipient details in one query.
**When to use:** `GET /campaigns/:id` (CAMP-03).

```typescript
// Source: PITFALLS.md C1; Context7 /sequelize/sequelize findAll include

import { Campaign, CampaignRecipient, Recipient } from '../db/index.js';

export async function getCampaignDetail(campaignId: number, userId: number) {
  const campaign = await Campaign.findOne({
    where: { id: campaignId, createdBy: userId },
    include: [
      {
        model: CampaignRecipient,
        as: 'campaignRecipients',
        include: [
          {
            model: Recipient,
            as: 'recipient',
            attributes: ['id', 'email', 'name'],
          },
        ],
        attributes: ['status', 'sentAt', 'openedAt', 'trackingToken'],
      },
    ],
  });
  if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');
  return campaign;
}
```

**Why `hasMany CampaignRecipient` not `belongsToMany Recipient`?**
- `belongsToMany` with `through` hides the junction table columns (`status`, `sentAt`, `openedAt`).
- The `hasMany CampaignRecipient` + nested `belongsTo Recipient` pattern exposes all columns. [VERIFIED: existing model associations in `backend/src/models/campaign.ts`]

---

### Pattern 5: Stats Aggregate SQL

**What:** Single-query COUNT(*) FILTER aggregate with NULLIF divide-by-zero guard.
**When to use:** `GET /campaigns/:id/stats` (CAMP-08) + inline in `GET /campaigns/:id` (D-10, D-11).

```typescript
// Source: CONTEXT.md D-09; PITFALLS.md M3
// COUNT(*) FILTER (WHERE ...) is PostgreSQL 9.4+ syntax. [ASSUMED: PostgreSQL 16 — confirmed in CLAUDE.md]

import { sequelize } from '../db/index.js';
import { QueryTypes } from 'sequelize';
import type { Transaction } from 'sequelize';

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  opened: number;
  open_rate: number | null;
  send_rate: number | null;
}

export async function computeCampaignStats(
  campaignId: number,
  opts: { transaction?: Transaction } = {},
): Promise<CampaignStats> {
  const [row] = await sequelize.query<{
    total: string;
    sent: string;
    failed: string;
    opened: string;
    open_rate: string | null;
    send_rate: string | null;
  }>(
    `SELECT
       COUNT(*)                                  AS total,
       COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
       ROUND(
         COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::numeric
           / NULLIF(COUNT(*), 0),
         2
       )                                         AS open_rate,
       ROUND(
         (COUNT(*) FILTER (WHERE status = 'sent')
          + COUNT(*) FILTER (WHERE status = 'failed'))::numeric
           / NULLIF(COUNT(*), 0),
         2
       )                                         AS send_rate
     FROM campaign_recipients
     WHERE campaign_id = :campaignId`,
    {
      replacements: { campaignId },
      type: QueryTypes.SELECT,
      transaction: opts.transaction,
    },
  );

  // Postgres COUNT() returns strings; parse to numbers
  return {
    total: parseInt(row.total, 10),
    sent: parseInt(row.sent, 10),
    failed: parseInt(row.failed, 10),
    opened: parseInt(row.opened, 10),
    open_rate: row.open_rate !== null ? parseFloat(row.open_rate) : null,
    send_rate: row.send_rate !== null ? parseFloat(row.send_rate) : null,
  };
}
```

---

### Pattern 6: Transaction Boundary for POST /campaigns

**What:** Upsert recipients + create campaign + insert CampaignRecipient rows atomically.
**When to use:** POST /campaigns (CAMP-02).

```typescript
// Source: Context7 /sequelize/sequelize (transaction docs); CONTEXT.md specifics

export async function createCampaign(
  userId: number,
  input: { name: string; subject: string; body: string; recipientEmails: string[] },
) {
  return sequelize.transaction(async (t) => {
    // Step 1: Upsert all recipient emails, get back their IDs
    const recipientIds = await upsertRecipientsByEmail(userId, input.recipientEmails, t);

    // Step 2: Create campaign in draft status
    const campaign = await Campaign.create(
      { name: input.name, subject: input.subject, body: input.body, createdBy: userId },
      { transaction: t },
    );

    // Step 3: Bulk insert CampaignRecipient rows in pending status
    // gen_random_uuid() default fires at DB level — no need to supply trackingToken
    if (recipientIds.length > 0) {
      await CampaignRecipient.bulkCreate(
        recipientIds.map(rid => ({ campaignId: campaign.id, recipientId: Number(rid) })),
        { transaction: t, ignoreDuplicates: true },
      );
    }

    return campaign;
  });
}
```

---

### Pattern 7: Recipient Migration (ADD COLUMN + BACKFILL + CONSTRAINT SWAP)

**What:** Add `user_id` FK to existing `recipients` table, backfill, swap constraints.
**When to use:** New migration `20260421000001-add-user-id-to-recipients.cjs`.

```javascript
// Source: Sequelize CLI docs; PostgreSQL ALTER TABLE syntax; CONTEXT.md D-02
// [VERIFIED: existing migration patterns in backend/src/migrations/]

'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add user_id column — nullable first (backfill before NOT NULL)
    await queryInterface.addColumn('recipients', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,       // must be nullable until backfill runs
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // 2. Backfill: assign existing seed rows to the demo user
    // Phase 2 seeder creates exactly one user (id=1 or first user in table)
    // Use MIN(id) as the fallback demo user to avoid hardcoding id=1
    await queryInterface.sequelize.query(
      'UPDATE recipients SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL'
    );

    // 3. Enforce NOT NULL now that all rows have a value
    await queryInterface.changeColumn('recipients', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
    });

    // 4. Drop the old global UNIQUE(email) constraint
    // Constraint name in PG auto-named: recipients_email_key (from migration 02)
    await queryInterface.removeConstraint('recipients', 'recipients_email_key');

    // 5. Add composite UNIQUE(user_id, email) — per-user uniqueness (D-01)
    await queryInterface.addConstraint('recipients', {
      fields: ['user_id', 'email'],
      type: 'unique',
      name: 'recipients_user_id_email_key',
    });

    // 6. Add index on recipients(user_id) for list queries (D-02)
    await queryInterface.addIndex('recipients', {
      fields: ['user_id'],
      name: 'idx_recipients_user_id',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('recipients', 'idx_recipients_user_id');
    await queryInterface.removeConstraint('recipients', 'recipients_user_id_email_key');
    // Re-add global UNIQUE(email)
    await queryInterface.addConstraint('recipients', {
      fields: ['email'],
      type: 'unique',
      name: 'recipients_email_key',
    });
    await queryInterface.removeColumn('recipients', 'user_id');
  },
};
```

**CRITICAL: Constraint name to drop.** The existing migration `20260101000002-create-recipients.cjs` defines `email: { unique: true }` inline. Postgres auto-names this constraint `recipients_email_key`. [ASSUMED: Postgres auto-naming convention for inline unique constraint is `{table}_{column}_key` — verify with `\d recipients` in psql before shipping the migration].

---

### Pattern 8: Shared Zod Schemas

**What:** All new schemas for Phase 4 go in `shared/src/schemas/campaign.ts` and a new `shared/src/schemas/recipient.ts`.

```typescript
// shared/src/schemas/campaign.ts — extend the existing file

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  recipientEmails: z.array(z.string().email()).min(1),
});

export const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).optional(),
  recipientEmails: z.array(z.string().email()).optional(),
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided' },
);

export const CursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});

// shared/src/schemas/recipient.ts (new file)
export const CreateRecipientSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200).optional(),
});
```

**After changes:** `yarn workspace @campaign/shared build` — same as Phase 3 Plan 02 pattern.

---

### Anti-Patterns to Avoid

- **Anti-pattern: `Op.lt` on `created_at` alone** — any two campaigns with same `created_at` cause page-boundary duplication or skips. Always include `id` in `ORDER BY` and cursor (C16).
- **Anti-pattern: string interpolation in `Sequelize.literal`** — `Sequelize.literal(\`(created_at, id) < ('${cAt}', ${cId})\`)` is SQL injection. Always use `replacements` (C16).
- **Anti-pattern: silently falling back to page 1 on bad cursor** — throw `BadRequestError('INVALID_CURSOR')` (D-20).
- **Anti-pattern: status guard in route handler** — concurrent PATCH from two clients both pass a sequential read, both update. Guard must be the `UPDATE ... WHERE status='draft'` itself at the DB level (C10, C11).
- **Anti-pattern: JS counting stats** — `filter(r => r.status === 'sent').length` misses the point; SQL `COUNT(*) FILTER` is correct and uses the existing `idx_campaign_recipients_campaign_id_status` index (M3, C1).
- **Anti-pattern: `DO NOTHING` without the no-op update trick** — `DO NOTHING RETURNING id` returns nothing for conflicting rows. Always use `DO UPDATE SET email = EXCLUDED.email RETURNING id` when you need IDs back (D-15).
- **Anti-pattern: `user_id` in cursor payload** — client can forge another user's position. Own filter via `where: { createdBy: req.user.id }` always (D-18, C16).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Composite cursor pagination | Custom query builder | `Sequelize.literal` + `replacements` | Injection-safe; documented pattern |
| Stats counting | JS array filter + count | `COUNT(*) FILTER (WHERE ...)` in SQL | Uses existing index; no N+1 |
| Upsert-returning-ids | Two-round-trip SELECT + INSERT | `ON CONFLICT DO UPDATE SET email = EXCLUDED.email RETURNING id` | One query; atomic |
| Status guard | Sequential read+write in service | `UPDATE ... WHERE status='draft' RETURNING *` | Race-condition proof |
| Email validation | Custom regex | `z.string().email()` (Zod) | RFC-compliant; shared schema |
| Transaction management | Manual `BEGIN/COMMIT/ROLLBACK` | `sequelize.transaction(async t => ...)` | Auto-rollback on throw |

**Key insight:** Every "hard" problem in this phase (pagination, upsert, stats, status guard) has a well-known one-query SQL solution. Resist the temptation to use multiple queries with JS joining.

---

## Common Pitfalls

### Pitfall 1: C16 — Cursor Bugs (Multiple Modes)

**What goes wrong:** Four distinct failure modes: `Op.lt` on `created_at` alone (dupes at boundary), string interpolation (injection), bad cursor decoded to `NaN` → 500, `userId` in cursor (forgeable).
**Why it happens:** Cursor pagination is non-obvious; devs often grab the last item's `created_at` and use `WHERE created_at < ?` without considering ties.
**How to avoid:** Always `(created_at, id) < (:cAt, :cId)` with named replacements. `isNaN(d.getTime())` check after decode. `where: { createdBy: req.user.id }` is never in the cursor.
**Warning signs:** Sorting only by `created_at`; literal template string in `Sequelize.literal`; missing cursor validation.

### Pitfall 2: C10/C11 — Status Guard in Wrong Layer / Race Condition

**What goes wrong:** Service reads campaign, sees `status === 'draft'`, then proceeds. Between the read and the write, a concurrent request changes status. Both proceed.
**Why it happens:** Devs think "I'll check status before writing" is sufficient.
**How to avoid:** Make the status check part of the `UPDATE` `WHERE` clause. If zero rows updated, the campaign was already in a non-draft state (or didn't belong to the user). Throw `ConflictError`.
**Warning signs:** `if (campaign.status !== 'draft') throw ...` followed by a separate `.update()` call.

### Pitfall 3: C1 — N+1 on Campaign Detail

**What goes wrong:** `CampaignRecipient.findAll` then per-row `Recipient.findByPk`. 101 queries for 100 recipients.
**Why it happens:** Not specifying `include` on the parent query.
**How to avoid:** Nested `include` in the `Campaign.findOne` call — `include: [{ model: CampaignRecipient, as: 'campaignRecipients', include: [{ model: Recipient, as: 'recipient' }] }]`.
**Warning signs:** Loop over `campaign.campaignRecipients` calling `r.getRecipient()`.

### Pitfall 4: M3 — Stats Division by Zero

**What goes wrong:** `open_rate = opened / total` when `total = 0` → Postgres returns `null` or errors.
**Why it happens:** No empty-campaign guard.
**How to avoid:** `NULLIF(COUNT(*), 0)` in divisor. `open_rate` and `send_rate` are `null` when campaign has zero recipients.
**Warning signs:** Division without `NULLIF`; JS computing `opened / total` without a guard.

### Pitfall 5: D-15 — DO NOTHING Returns No IDs for Existing Rows

**What goes wrong:** `ON CONFLICT DO NOTHING RETURNING id` returns only newly-inserted rows. Existing rows are silently skipped.
**Why it happens:** `DO NOTHING` suppresses the conflicting row from the RETURNING clause.
**How to avoid:** `DO UPDATE SET email = EXCLUDED.email RETURNING id` (no-op update — email value doesn't change, but Postgres returns the row).
**Warning signs:** Testing only with new emails; not testing with emails already in `recipients`.

### Pitfall 6: Recipients Migration Constraint Name

**What goes wrong:** `removeConstraint('recipients', 'recipients_email_key')` fails if Postgres named the constraint differently.
**Why it happens:** Inline `unique: true` in Sequelize migration generates a Postgres auto-name that may vary.
**How to avoid:** Verify actual constraint name with `SELECT conname FROM pg_constraint WHERE conrelid = 'recipients'::regclass;` before committing the migration. Use `\d recipients` in psql. The expected auto-name is `recipients_email_key`.
**Warning signs:** Migration works locally but fails on a fresh `db:migrate`.

### Pitfall 7: Model `userId` Attribute Missing After Migration

**What goes wrong:** `Recipient.findAll({ where: { userId: req.user.id } })` returns zero results because the Sequelize model `RecipientAttributes` doesn't declare `userId`.
**Why it happens:** Phase 2 built the model before Phase 4 adds `user_id` to the DB. Model must be updated alongside the migration.
**How to avoid:** Update `backend/src/models/recipient.ts` to add `userId: number` attribute + FK definition. Add association `Recipient.belongsTo(models.User, { foreignKey: 'userId', as: 'user' })`.
**Warning signs:** Migration runs but queries with `userId` return empty arrays.

---

## Runtime State Inventory

> Phase 4 adds a structural migration and Recipient model change. Not a rename/refactor phase, but the migration touches existing data.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `recipients` table has seed rows with no `user_id` (seeded in Phase 2 with global `UNIQUE(email)`) | Migration backfill: `UPDATE recipients SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL` |
| Live service config | None — no external service config references recipient schema | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env vars in Phase 4 | None |
| Build artifacts | `shared/dist/` needs rebuild after schema additions (D-27) | `yarn workspace @campaign/shared build` |

**Migration round-trip test required:** `yarn workspace @campaign/backend db:migrate:undo:all && yarn workspace @campaign/backend db:migrate` must pass cleanly on a fresh DB before submitting.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Migration + queries | Local (homebrew 14) | 14.x | docker postgres 16 (Phase 10) |
| sequelize-cli | `yarn workspace @campaign/backend db:migrate` | Via hoisted .bin | ^6.6.5 | None — required |
| yarn 4 | Schema build, workspace commands | `/usr/local/bin/yarn` | 4.14.1 | None — corepack shim |

**Note:** Local dev uses homebrew Postgres 14. Migration SQL (`COUNT(*) FILTER`, `ON CONFLICT`) is supported in Postgres 9.4+. No compatibility risk. Docker Postgres 16 in Phase 10 is a superset.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination (`LIMIT x OFFSET y`) | Cursor pagination `(created_at, id)` | REQUIREMENTS.md — always | Consistent results under concurrent inserts; required by spec |
| JS-side stats counting | `COUNT(*) FILTER (WHERE ...)` aggregate SQL | REQUIREMENTS.md — always | Uses existing index; no application-layer counting |
| Separate INSERT + SELECT for upsert | `ON CONFLICT DO UPDATE RETURNING id` | Postgres 9.5+ (2015) | Single round-trip; atomic |
| Global `UNIQUE(email)` on recipients | `UNIQUE(user_id, email)` | Phase 4 migration | Per-user recipient scoping; enables multi-tenant safe design |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Postgres auto-names the inline `unique: true` constraint as `recipients_email_key` | Pattern 7 (Migration) | `removeConstraint` fails on the wrong name — migration down breaks; fix: verify constraint name before shipping |
| A2 | `Sequelize.bulkCreate` with composite conflict target + `returning: true` has edge cases in v6.37 | Pattern 3 (Upsert) | If bulkCreate works reliably, the raw-SQL approach is unnecessarily complex; safe either way — raw SQL is a subset of Postgres SQL |
| A3 | `COUNT(*) FILTER` is supported in the local homebrew Postgres 14 | Pattern 5 (Stats) | Low risk — syntax is Postgres 9.4+ and local dev already ran Phase 2 seed on this DB |

**If A1 is wrong:** run `SELECT conname FROM pg_constraint WHERE conrelid = 'recipients'::regclass AND contype = 'u';` on the local dev DB before writing the migration. The planner should include this verification step in Wave 0.

---

## Open Questions

1. **Cursor decode with `Sequelize.literal` + `replacements` placement**
   - What we know: `replacements` can be passed directly to `Model.findAll(options)` alongside a `Sequelize.literal` in the `where` clause.
   - What's unclear: Whether `replacements` at the `findAll` level is distinct from `replacements` needed for raw queries vs. whether they conflict when both are used.
   - Recommendation: Use the pattern from Pattern 1 (literal in `Op.and`, `replacements` on the findAll options). This is the documented path [VERIFIED: Context7 Sequelize raw queries]. If type errors appear, fall back to a raw `sequelize.query` for the paginated list.

2. **BIGINT ID string vs number in cursor**
   - What we know: Postgres/Sequelize returns BIGINT as string (confirmed STATE.md Plan 03-04). The `CampaignAttributes.id` TypeScript type is `number` but runtime value is string.
   - What's unclear: Whether `String(campaign.id)` always produces a stable string or if Sequelize coerces it.
   - Recommendation: Always use `String(id)` in `encodeCursor` and `Number(cId)` in the replacement (Postgres accepts numeric strings in `WHERE id = :cId`). Store `cId` as string in cursor to avoid float precision issues.

---

## Validation Architecture

> `workflow.nyquist_validation = true` in `.planning/config.json` — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (pinned via root `resolutions`) |
| Config file | `backend/vitest.config.ts` — does NOT exist yet (Wave 0 gap) |
| Quick run command | `yarn workspace @campaign/backend test` (currently echoes placeholder — Wave 0 installs real config) |
| Full suite command | `yarn workspace @campaign/backend test --run` |

**Note:** Phase 7 owns the formal Vitest+Supertest suite (TEST-01..04). Phase 4 uses smoke curl scripts (same pattern as Phase 3) for its acceptance gate. A `vitest.config.ts` stub for Phase 4 is NOT required — Phase 7 creates it. Phase 4 acceptance gate = structural grep + curl smoke.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAMP-01 | Cursor pagination returns no dupes/skips | smoke/curl | `bash backend/test/smoke/camp-01-list.sh` | ❌ Wave 0 |
| CAMP-02 | POST creates draft, upserts recipients, CampaignRecipient rows in pending | smoke/curl | `bash backend/test/smoke/camp-02-create.sh` | ❌ Wave 0 |
| CAMP-03 | GET /:id includes recipients + stats (no N+1 — verify log count) | smoke/curl | `bash backend/test/smoke/camp-03-detail.sh` | ❌ Wave 0 |
| CAMP-04 | PATCH on non-draft returns 409 | smoke/curl | `bash backend/test/smoke/camp-04-patch.sh` | ❌ Wave 0 |
| CAMP-05 | DELETE on non-draft returns 409 | smoke/curl | `bash backend/test/smoke/camp-05-delete.sh` | ❌ Wave 0 |
| CAMP-08 | /stats returns correct aggregate with NULLIF on zero recipients | smoke/curl | `bash backend/test/smoke/camp-08-stats.sh` | ❌ Wave 0 |
| RECIP-01 | POST /recipient upserts name via COALESCE | smoke/curl | `bash backend/test/smoke/recip-01-upsert.sh` | ❌ Wave 0 |
| RECIP-02 | GET /recipients returns paginated list per user | smoke/curl | `bash backend/test/smoke/recip-02-list.sh` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `yarn workspace @campaign/backend typecheck` (structural correctness)
- **Per wave merge:** `bash backend/test/smoke/run-all-phase4.sh` (all 8 curl scripts)
- **Phase gate:** All 8 smoke scripts green + typecheck pass before phase close

### Wave 0 Gaps

- [ ] `backend/test/smoke/camp-01-list.sh` — covers CAMP-01 pagination
- [ ] `backend/test/smoke/camp-02-create.sh` — covers CAMP-02 create
- [ ] `backend/test/smoke/camp-03-detail.sh` — covers CAMP-03 eager load + stats inline
- [ ] `backend/test/smoke/camp-04-patch.sh` — covers CAMP-04 409 guard
- [ ] `backend/test/smoke/camp-05-delete.sh` — covers CAMP-05 409 guard
- [ ] `backend/test/smoke/camp-08-stats.sh` — covers CAMP-08 aggregate
- [ ] `backend/test/smoke/recip-01-upsert.sh` — covers RECIP-01
- [ ] `backend/test/smoke/recip-02-list.sh` — covers RECIP-02
- [ ] `backend/test/smoke/run-all-phase4.sh` — orchestrator

*(Formal Vitest+Supertest tests for TEST-01..04 land in Phase 7, not Phase 4.)*

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 4 |
|-----------|------------------|
| No `sync()` in prod — migrations only | Migration `20260421xxxxxx-add-user-id-to-recipients.cjs` required (no model.sync) |
| Stats are always aggregate SQL | `computeCampaignStats` must use `COUNT(*) FILTER` — no JS counting |
| Cursor pagination not offset | `Sequelize.literal('(created_at, id) < (:cAt, :cId)')` with replacements |
| 409 on state machine violations | `ConflictError('CAMPAIGN_NOT_EDITABLE')` from service, not 400 |
| React Query owns server state; Redux owns client state | No impact — Phase 4 is backend only |
| `maxRetriesPerRequest: null` on BullMQ connections | Not applicable — BullMQ is Phase 5 |
| Yarn 4 flat workspaces (`nodeLinker: node-modules`) | Use `yarn workspace @campaign/shared build` for dist rebuild |
| `shared/` compiles to `dist/` | Run build after adding new schemas |
| JWT access in memory + refresh in httpOnly cookie | No impact — authenticate middleware already wired |

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — middleware handles it | `authenticate` from Phase 3 |
| V3 Session Management | No — Phase 3 owns | — |
| V4 Access Control | Yes — ownership checks | `where: { createdBy: req.user.id }` on every query; cross-user → 404 |
| V5 Input Validation | Yes — all endpoints | `validate(Schema, 'body'|'query')` middleware with Zod schemas |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cursor forgery (embed userId) | Elevation of Privilege | Ownership in `WHERE` clause, not cursor payload (D-18) |
| SQL injection via cursor value | Tampering | `Sequelize.literal` + `replacements` — never string interpolation (C16) |
| Cross-user campaign access | Information Disclosure | `WHERE createdBy = req.user.id` — 404 not 403 (AUTH-07 precedent) |
| PATCH/DELETE on non-owned campaign | Tampering | Ownership filter in atomic UPDATE WHERE clause |
| Malformed cursor → 500 | Denial of Service | `isNaN` + try/catch → `BadRequestError('INVALID_CURSOR')` (D-20) |

---

## Sources

### Primary (HIGH confidence)
- `backend/src/models/campaign.ts` — existing associations (`hasMany CampaignRecipient as campaignRecipients`, `belongsToMany Recipient`) [VERIFIED: codebase read]
- `backend/src/migrations/20260101000002-create-recipients.cjs` — existing schema shows `email: { unique: true }` (generates auto-constraint) [VERIFIED: codebase read]
- `backend/src/migrations/20260101000004-create-campaign-recipients.cjs` — existing CASCADE on `campaign_id` [VERIFIED: codebase read]
- `backend/src/middleware/{validate,authenticate,errorHandler}.ts` — middleware API surface [VERIFIED: codebase read]
- `backend/src/util/errors.ts` — error classes including `ConflictError`, `BadRequestError`, `NotFoundError` [VERIFIED: codebase read]
- Context7 `/sequelize/sequelize` — `bulkCreate`, `transaction`, `findAll` with `include`, `Sequelize.literal` with `replacements` [VERIFIED: ctx7 CLI]
- `.planning/research/PITFALLS.md` — C1, C10, C11, C16, M3, m5 [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- `.planning/phases/04-campaigns-recipients-crud/04-CONTEXT.md` — 27 locked decisions — D-01..D-27 [VERIFIED: codebase read]
- PostgreSQL 9.4+ `COUNT(*) FILTER (WHERE ...)` syntax — confirmed as standard SQL extension [CITED: https://www.postgresql.org/docs/current/sql-expressions.html#FILTER-CLAUSE — from training knowledge; ASSUMED for exact syntax]

### Tertiary (LOW confidence)
- Postgres auto-constraint naming convention `recipients_email_key` — training knowledge, not verified by querying this specific DB [ASSUMED: A1]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified against `backend/package.json` and npm registry
- Cursor Pagination Pattern: HIGH — C16 pitfall thoroughly documented; `Sequelize.literal` + `replacements` confirmed in Context7
- Upsert Returning IDs: MEDIUM-HIGH — no-op update trick is well-known PostgreSQL pattern; one edge case noted (Sequelize bulkCreate returning behavior, A2)
- Stats SQL: HIGH — `COUNT(*) FILTER` is ANSI SQL; PostgreSQL 9.4+ confirmed; NULLIF pattern standard
- Migration (ALTER TABLE): MEDIUM — constraint auto-name is ASSUMED (A1); must verify before committing
- Architecture Patterns: HIGH — follows existing Phase 3 conventions exactly (authService pattern, validate middleware, errorHandler)

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable stack — no fast-moving dependencies in Phase 4 scope)
