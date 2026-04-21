# Phase 4: Campaigns & Recipients CRUD - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 9
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/services/campaignService.ts` | service | CRUD + transaction | `backend/src/services/authService.ts` | role-match |
| `backend/src/services/recipientService.ts` | service | CRUD | `backend/src/services/authService.ts` | role-match |
| `backend/src/routes/campaigns.ts` | route/controller | request-response | `backend/src/routes/auth.ts` | exact |
| `backend/src/routes/recipients.ts` | route/controller | request-response | `backend/src/routes/auth.ts` | exact |
| `shared/src/schemas/campaign.ts` | schema | transform | `shared/src/schemas/auth.ts` | exact |
| `shared/src/schemas/recipient.ts` | schema | transform | `shared/src/schemas/auth.ts` | exact |
| `backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs` | migration | batch | `backend/src/migrations/20260101000004-create-campaign-recipients.cjs` | role-match |
| `backend/src/db/index.ts` | config | — | self (UPDATE only) | exact |
| `backend/src/models/recipient.ts` | model | — | `backend/src/models/campaign.ts` | exact |

---

## Pattern Assignments

### `backend/src/services/campaignService.ts` (service, CRUD + transaction)

**Analog:** `backend/src/services/authService.ts`

**Imports pattern** (`authService.ts` lines 19-23):
```typescript
import bcrypt from 'bcryptjs';
import { User } from '../db/index.js';
import { config } from '../config/env.js';
import { ConflictError, UnauthorizedError } from '../util/errors.js';
```

For `campaignService.ts`, map as:
```typescript
import { QueryTypes, Op } from 'sequelize';
import { sequelize, Campaign, Recipient, CampaignRecipient } from '../db/index.js';
import { ConflictError, NotFoundError, BadRequestError } from '../util/errors.js';
import type { Transaction } from 'sequelize';
```

**Core service function shape** (`authService.ts` lines 32-56 — registerUser):
```typescript
export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<User> {
  try {
    // ... operation
    return user;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'SequelizeUniqueConstraintError'
    ) {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED');
    }
    throw err;
  }
}
```

Apply same named-export async function pattern. Error catch maps Sequelize errors to domain errors.

**Atomic status guard pattern** (from RESEARCH.md Pattern 2 — verified against codebase):
```typescript
// Use sequelize.query() for UPDATE ... WHERE status='draft' RETURNING *
// Zero rows → campaign already non-draft OR not owned by user
const [results] = await sequelize.query<{ id: string }>(
  `UPDATE campaigns
   SET name = COALESCE(:name, name),
       subject = COALESCE(:subject, subject),
       body = COALESCE(:body, body),
       updated_at = NOW()
   WHERE id = :id AND created_by = :userId AND status = 'draft'
   RETURNING *`,
  {
    replacements: { id: campaignId, userId, name: input.name ?? null, subject: input.subject ?? null, body: input.body ?? null },
    type: QueryTypes.SELECT,
    transaction,
  },
);
if (!results || results.length === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');
```

**Transaction boundary pattern** (from RESEARCH.md Pattern 6):
```typescript
return sequelize.transaction(async (t) => {
  // Step 1: upsert recipients → get IDs
  // Step 2: Campaign.create({ ... }, { transaction: t })
  // Step 3: CampaignRecipient.bulkCreate([...], { transaction: t, ignoreDuplicates: true })
  return campaign;
});
```

**Cursor pagination pattern** (from RESEARCH.md Pattern 1):
```typescript
interface CursorPayload { cAt: string; cId: string }

function encodeCursor(createdAt: Date, id: number): string {
  return Buffer.from(JSON.stringify({ cAt: createdAt.toISOString(), cId: String(id) })).toString('base64url');
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
  if (isNaN(d.getTime())) throw new BadRequestError('INVALID_CURSOR');
  if (isNaN(Number(payload.cId))) throw new BadRequestError('INVALID_CURSOR');
  return payload;
}

// findAll with composite cursor:
const rows = await Campaign.findAll({
  where: literalWhere
    ? { createdBy: userId, [Op.and]: [Sequelize.literal('(created_at, id) < (:cAt, :cId)')] }
    : { createdBy: userId },
  order: [['createdAt', 'DESC'], ['id', 'DESC']],
  limit: limit + 1,
  replacements: { cAt, cId },   // passed at findAll level, not inside literal
});
const hasMore = rows.length > limit;
const data = hasMore ? rows.slice(0, limit) : rows;
const nextCursor = hasMore && data.length > 0
  ? encodeCursor(data[data.length - 1].createdAt, data[data.length - 1].id)
  : null;
return { data, nextCursor, hasMore };
```

**Recipient upsert returning IDs** (from RESEARCH.md Pattern 3 — no-op update trick):
```typescript
const values = emails.map((_, i) => `(:userId, :email${i}, NOW(), NOW())`).join(', ');
const replacements: Record<string, unknown> = { userId };
emails.forEach((email, i) => { replacements[`email${i}`] = email; });

const rows = await sequelize.query<{ id: string }>(
  `INSERT INTO recipients (user_id, email, created_at, updated_at)
   VALUES ${values}
   ON CONFLICT (user_id, email)
     DO UPDATE SET email = EXCLUDED.email
   RETURNING id`,
  { replacements, type: QueryTypes.SELECT, transaction: t },
);
return rows.map(r => r.id);
```

**Stats aggregate** (from RESEARCH.md Pattern 5):
```typescript
const [row] = await sequelize.query<{ total: string; sent: string; failed: string; opened: string; open_rate: string | null; send_rate: string | null }>(
  `SELECT
     COUNT(*)                                    AS total,
     COUNT(*) FILTER (WHERE status = 'sent')     AS sent,
     COUNT(*) FILTER (WHERE status = 'failed')   AS failed,
     COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
     ROUND(COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 2) AS open_rate,
     ROUND((COUNT(*) FILTER (WHERE status = 'sent') + COUNT(*) FILTER (WHERE status = 'failed'))::numeric / NULLIF(COUNT(*), 0), 2) AS send_rate
   FROM campaign_recipients
   WHERE campaign_id = :campaignId`,
  { replacements: { campaignId }, type: QueryTypes.SELECT, transaction: opts?.transaction },
);
return {
  total:     parseInt(row.total, 10),
  sent:      parseInt(row.sent, 10),
  failed:    parseInt(row.failed, 10),
  opened:    parseInt(row.opened, 10),
  open_rate:  row.open_rate  !== null ? parseFloat(row.open_rate)  : null,
  send_rate:  row.send_rate  !== null ? parseFloat(row.send_rate)  : null,
};
```

**Nested eager load** (from RESEARCH.md Pattern 4 — confirmed by `campaign.ts` associations at lines 83-88):
```typescript
const campaign = await Campaign.findOne({
  where: { id: campaignId, createdBy: userId },
  include: [{
    model: CampaignRecipient,
    as: 'campaignRecipients',           // alias from Campaign.hasMany line 83
    include: [{
      model: Recipient,
      as: 'recipient',                  // alias from CampaignRecipient.belongsTo line 67
      attributes: ['id', 'email', 'name'],
    }],
    attributes: ['status', 'sentAt', 'openedAt', 'trackingToken'],
  }],
});
if (!campaign) throw new NotFoundError('CAMPAIGN_NOT_FOUND');
```

---

### `backend/src/services/recipientService.ts` (service, CRUD)

**Analog:** `backend/src/services/authService.ts`

**Imports pattern:**
```typescript
import { QueryTypes, Op } from 'sequelize';
import { sequelize, Recipient } from '../db/index.js';
import { NotFoundError, BadRequestError } from '../util/errors.js';
import type { Transaction } from 'sequelize';
```

**List with cursor pattern:** Same `encodeCursor`/`decodeCursor` helpers as `campaignService.ts`. Ownership filter `where: { userId: req.user.id }`. Column is `user_id` → Sequelize attr `userId` (underscored: true).

**POST /recipient upsert (RECIP-01 — name-preserving):**
```typescript
// D-14: DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name)
// Only overwrites name when explicitly provided
await sequelize.query(
  `INSERT INTO recipients (user_id, email, name, created_at, updated_at)
   VALUES (:userId, :email, :name, NOW(), NOW())
   ON CONFLICT (user_id, email)
     DO UPDATE SET name = COALESCE(EXCLUDED.name, recipients.name),
                   updated_at = NOW()
   RETURNING id, email, name, created_at, updated_at`,
  {
    replacements: { userId, email: input.email, name: input.name ?? null },
    type: QueryTypes.SELECT,
  },
);
```

---

### `backend/src/routes/campaigns.ts` (route, request-response) — REPLACE STUB

**Analog:** `backend/src/routes/auth.ts`

**Imports pattern** (`auth.ts` lines 25-39):
```typescript
import { Router, type Request, type Response, type NextFunction } from 'express';
import { RegisterSchema, LoginSchema } from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as authService from '../services/authService.js';
```

For `campaigns.ts`, map as:
```typescript
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  CreateCampaignSchema, UpdateCampaignSchema, CursorPageQuerySchema,
} from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as campaignService from '../services/campaignService.js';
```

**Router export + router-level authenticate** (`campaigns.ts` stub lines 24-25 — keep this):
```typescript
export const campaignsRouter: Router = Router();
campaignsRouter.use(authenticate);   // C7: every sub-route guarded
```

**Thin handler pattern** (`auth.ts` lines 61-74):
```typescript
authRouter.post(
  '/register',
  validate(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.registerUser(req.body);
      res.status(201).json({
        data: { id: user.id, email: user.email, name: user.name },
      });
    } catch (err) {
      next(err);
    }
  },
);
```

Apply identically for each campaign endpoint:
- `GET /` → `validate(CursorPageQuerySchema, 'query')` → `campaignService.listCampaigns(req.user!.id, ...)` → `res.json({ data, nextCursor, hasMore })`
- `POST /` → `validate(CreateCampaignSchema)` → `campaignService.createCampaign(req.user!.id, req.body)` → `res.status(201).json({ data: campaign })`
- `GET /:id` → no body validate, params validate → `campaignService.getCampaignDetail(id, userId)` → `res.json({ data: { ...campaign, stats } })`
- `PATCH /:id` → `validate(UpdateCampaignSchema)` → `campaignService.updateCampaign(id, userId, req.body)` → `res.json({ data })`
- `DELETE /:id` → `campaignService.deleteCampaign(id, userId)` → `res.json({ data: { ok: true } })`
- `GET /:id/stats` → `campaignService.computeCampaignStats(id, userId)` → `res.json({ data: stats })`

**Error forward** (all handlers end with):
```typescript
} catch (err) {
  next(err);
}
```

---

### `backend/src/routes/recipients.ts` (route, request-response) — REPLACE STUB

**Analog:** `backend/src/routes/auth.ts`

**Same pattern as campaigns.ts.** Key differences:
```typescript
import { CreateRecipientSchema, CursorPageQuerySchema } from '@campaign/shared';
import * as recipientService from '../services/recipientService.js';

export const recipientsRouter: Router = Router();
recipientsRouter.use(authenticate);
```

Endpoints:
- `POST /` → `validate(CreateRecipientSchema)` → `recipientService.upsertRecipient(req.user!.id, req.body)` → `res.json({ data: recipient })`
- `GET /` → `validate(CursorPageQuerySchema, 'query')` → `recipientService.listRecipients(req.user!.id, ...)` → `res.json({ data, nextCursor, hasMore })`

---

### `shared/src/schemas/campaign.ts` (schema, transform) — EXTEND EXISTING

**Analog:** `shared/src/schemas/auth.ts`

**Existing content** (`campaign.ts` lines 1-4 — keep):
```typescript
import { z } from 'zod';

export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;
```

**Schema pattern** (`auth.ts` lines 1-41 — copy structure):
```typescript
// Each schema: z.object({...}) + export type = z.infer<typeof Schema>
export const RegisterSchema = z.object({ ... });
export type RegisterInput = z.infer<typeof RegisterSchema>;
```

**New schemas to add** (from D-26):
```typescript
export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  recipientEmails: z.array(z.string().email()).min(1),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().min(1).max(255).optional(),
  body: z.string().min(1).optional(),
  recipientEmails: z.array(z.string().email()).optional(),
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided' },
);
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

export const CursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().optional(),
});
export type CursorPageQuery = z.infer<typeof CursorPageQuerySchema>;

export const StatsSchema = z.object({
  total: z.number(),
  sent: z.number(),
  failed: z.number(),
  opened: z.number(),
  open_rate: z.number().nullable(),
  send_rate: z.number().nullable(),
});
export type CampaignStats = z.infer<typeof StatsSchema>;

// Response schemas (for frontend type safety)
export const CampaignSchema = z.object({
  id: z.string(),           // BIGINT returned as string from Postgres
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  status: CampaignStatusEnum,
  scheduledAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignListItem = z.infer<typeof CampaignSchema>;
```

---

### `shared/src/schemas/recipient.ts` (schema, transform) — NEW FILE

**Analog:** `shared/src/schemas/auth.ts`

**Pattern** (copy auth.ts style — named exports + inferred types):
```typescript
import { z } from 'zod';

export const CreateRecipientSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200).optional(),
});
export type CreateRecipientInput = z.infer<typeof CreateRecipientSchema>;

export const RecipientSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Recipient = z.infer<typeof RecipientSchema>;
```

**After creating this file, update** `shared/src/schemas/index.ts`:
```typescript
export * from './auth.js';
export * from './campaign.js';
export * from './recipient.js';   // ADD THIS LINE
```

Then run: `yarn workspace @campaign/shared build`

---

### `backend/src/migrations/20260421000001-add-user-id-to-recipients.cjs` (migration, batch) — NEW

**Analog:** `backend/src/migrations/20260101000004-create-campaign-recipients.cjs`

**File header + module.exports shape** (lines 1-4, 42-50):
```javascript
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ...steps
  },
  async down(queryInterface, Sequelize) {
    // ...reversal
    // Drop ENUM type if any: await queryInterface.sequelize.query('DROP TYPE IF EXISTS ...')
  },
};
```

**FK column definition pattern** (lines 9-15 of migration-04):
```javascript
recipient_id: {
  type: Sequelize.BIGINT,
  allowNull: false,
  references: { model: 'recipients', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE',
},
```

**Full up() sequence for this migration** (D-02):
1. `queryInterface.addColumn('recipients', 'user_id', { type: Sequelize.BIGINT, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' })`
2. `queryInterface.sequelize.query('UPDATE recipients SET user_id = (SELECT MIN(id) FROM users) WHERE user_id IS NULL')`
3. `queryInterface.changeColumn('recipients', 'user_id', { type: Sequelize.BIGINT, allowNull: false })`
4. `queryInterface.removeConstraint('recipients', 'recipients_email_key')` — VERIFY constraint name first with `SELECT conname FROM pg_constraint WHERE conrelid = 'recipients'::regclass AND contype = 'u';`
5. `queryInterface.addConstraint('recipients', { fields: ['user_id', 'email'], type: 'unique', name: 'recipients_user_id_email_key' })`
6. `queryInterface.addIndex('recipients', { fields: ['user_id'], name: 'idx_recipients_user_id' })`

**down() reversal sequence:**
1. Remove index `idx_recipients_user_id`
2. Remove constraint `recipients_user_id_email_key`
3. Re-add constraint `recipients_email_key` on `['email']`
4. Remove column `user_id`

---

### `backend/src/db/index.ts` (config) — UPDATE MODEL ASSOCIATIONS ONLY

**Current state** (lines 29-41 — read the full file above):
```typescript
User.initModel(sequelize);
Recipient.initModel(sequelize);
Campaign.initModel(sequelize);
CampaignRecipient.initModel(sequelize);

const models = { User, Recipient, Campaign, CampaignRecipient };
User.associate(models);
Recipient.associate(models);
Campaign.associate(models);
CampaignRecipient.associate(models);

export { User, Recipient, Campaign, CampaignRecipient };
```

**No changes to `db/index.ts` itself.** The association registry already passes all four models. Changes land in `recipient.ts` model file only (add `userId` attr + `belongsTo User`).

---

### `backend/src/models/recipient.ts` (model) — UPDATE

**Current state** (lines 1-53 — read above). Two changes needed:

**Change 1 — Add `userId` to interface and class** (after line 8 `name: string | null`):
```typescript
export interface RecipientAttributes {
  id: number;
  email: string;
  name: string | null;
  userId: number;          // ADD — FK → users.id (underscored: true → user_id in SQL)
  createdAt: Date;
  updatedAt: Date;
}
export type RecipientCreationAttributes = Optional<
  RecipientAttributes, 'id' | 'createdAt' | 'updatedAt' | 'name'
  // userId is NOT optional — required after migration
>;
```

**Change 2 — Add column to init** (after the `name` field in `Recipient.init`):
```typescript
userId: {
  type: DataTypes.BIGINT,
  allowNull: false,
  // No unique: true here — composite unique enforced by DB constraint only
},
```

**Change 3 — Add association in `associate()`** (models parameter gains `User`):
```typescript
static associate(models: {
  User: typeof import('./user.js').User;     // ADD
  Campaign: typeof import('./campaign.js').Campaign;
  CampaignRecipient: typeof import('./campaignRecipient.js').CampaignRecipient;
}): void {
  Recipient.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user',
    onDelete: 'CASCADE',
  });
  // Existing associations below unchanged
  Recipient.belongsToMany(models.Campaign, { ... });
  Recipient.hasMany(models.CampaignRecipient, { ... });
}
```

**Change 4 — Update `db/index.ts` models registry** to include `User` in `Recipient.associate` call — it already receives `{ User, Recipient, Campaign, CampaignRecipient }` so no change needed there. The `associate` signature just needs to accept `User`.

---

## Shared Patterns

### Authentication Guard
**Source:** `backend/src/middleware/authenticate.ts` lines 34-53
**Apply to:** `campaigns.ts` router (already in stub line 25), `recipients.ts` router
```typescript
// Mount at router level — every sub-route is guarded by default (C7)
campaignsRouter.use(authenticate);
recipientsRouter.use(authenticate);
```

### Error Forward (Thin Controller)
**Source:** `backend/src/routes/auth.ts` — every handler (lines 64-73, 83-101, etc.)
**Apply to:** All route handlers in campaigns.ts and recipients.ts
```typescript
async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ... service call
  } catch (err) {
    next(err);   // errorHandler tail formats as { error: { code, message } }
  }
},
```

### Zod Validate Middleware
**Source:** `backend/src/middleware/validate.ts` — `validate(schema, source)` (lines 15-29)
**Apply to:** All POST/PATCH body handlers, GET list query handlers
```typescript
// Body:  validate(CreateCampaignSchema)           defaults source='body'
// Query: validate(CursorPageQuerySchema, 'query')
// Params: validate(ParamsSchema, 'params')         for /:id routes
```

### Response Envelope
**Source:** `backend/src/routes/auth.ts` — all handlers
**Apply to:** All success responses
```typescript
res.status(201).json({ data: result });  // creation
res.json({ data: result });              // reads
res.json({ data: { ok: true } });        // delete confirmation
res.json({ data, nextCursor, hasMore }); // list with pagination
```

### Error Classes
**Source:** `backend/src/util/errors.ts` lines 20-57
**Apply to:** Service layer — throw the appropriate class; controller forwards via `next(err)`
```typescript
throw new NotFoundError('CAMPAIGN_NOT_FOUND');     // 404 — ownership miss
throw new ConflictError('CAMPAIGN_NOT_EDITABLE');  // 409 — status guard
throw new BadRequestError('INVALID_CURSOR');       // 400 — cursor decode fail
throw new ValidationError('...');                  // 400 — schema fail (thrown by validate middleware)
```

### Ownership Scoping (Never in Cursor)
**Source:** CONTEXT.md D-18; RESEARCH.md anti-patterns
**Apply to:** Every Sequelize query in campaignService and recipientService
```typescript
// CORRECT — ownership in WHERE, never in cursor payload
Campaign.findAll({ where: { createdBy: req.user!.id, ... } });
Recipient.findAll({ where: { userId: req.user!.id, ... } });

// WRONG — never encode userId in cursor
// cursor = base64url({ cAt, cId, userId })  ← DO NOT DO THIS
```

### BIGINT ID as String
**Source:** `backend/src/models/campaign.ts` lines 38-41; STATE.md Plan 03-04 confirmation
**Apply to:** All cursor encode/decode; all raw SQL RETURNING id parsing
```typescript
// Postgres/Sequelize returns BIGINT as string at runtime
// Always String(id) in encodeCursor; Number(cId) for Sequelize replacements
const cId = String(campaign.id);           // encode: safe from float precision
const replacement = { cId: Number(cId) }; // query replacement: Postgres accepts numeric strings
```

---

## No Analog Found

All files have analogs. No entries needed.

---

## Metadata

**Analog search scope:** `backend/src/services/`, `backend/src/routes/`, `backend/src/models/`, `backend/src/migrations/`, `backend/src/middleware/`, `backend/src/util/`, `shared/src/schemas/`, `backend/src/db/`
**Files scanned:** 14
**Pattern extraction date:** 2026-04-21
