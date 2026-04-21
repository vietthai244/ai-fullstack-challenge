# Phase 6: Open Tracking Pixel — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 2 (1 new, 1 edit)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/routes/track.ts` | route | request-response | `backend/src/routes/recipients.ts` | role-match |
| `backend/src/app.ts` | config | request-response | `backend/src/app.ts` (self) | exact |

---

## Pattern Assignments

### `backend/src/routes/track.ts` (route, request-response)

**Analog:** `backend/src/routes/recipients.ts` — closest role-match; also a thin router file with no service layer delegation. `backend/src/routes/campaigns.ts` is a secondary analog for Router export style.

**Imports pattern** (`backend/src/routes/recipients.ts` lines 6-10):
```typescript
import { Router, type Request, type Response, type NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as recipientService from '../services/recipientService.js';
```

For `track.ts`, omit `validate`, `authenticate`, and service import. Only need:
```typescript
import { Router } from 'express';
import { CampaignRecipient } from '../models/campaignRecipient.js';
```

**Router export pattern** (`backend/src/routes/recipients.ts` lines 12-13):
```typescript
export const recipientsRouter: Router = Router();
recipientsRouter.use(authenticate); // <- C7: every route below is guarded
```

For `track.ts`, omit the `.use(authenticate)` line entirely — pixel is public. Module-scoped PIXEL buffer MUST appear before the `Router()` call:
```typescript
const PIXEL = Buffer.from(
  '47494638396101000100800000ffffff00000021f9040100000000' +
  '2c00000000010001000002024c01003b',
  'hex'
);
// PIXEL.length === 43

export const trackRouter: Router = Router();
```

**Core handler pattern** — deviation from analog. Normal handlers use `next(err)` on catch. Track handler MUST swallow errors (oracle defense). Do NOT copy the `next(err)` pattern from campaigns/recipients. Use:
```typescript
trackRouter.get('/open/:trackingToken', async (req, res) => {
  try {
    await CampaignRecipient.update(
      { openedAt: new Date() },
      { where: { trackingToken: req.params.trackingToken, openedAt: null } }
    );
  } catch {
    // Swallow — oracle defense; caller must never know if token matched
  }
  res.set({
    'Content-Type':    'image/gif',
    'Content-Length':  String(PIXEL.length),
    'Cache-Control':   'no-store, no-cache, must-revalidate, private',
    'Pragma':          'no-cache',
    'Referrer-Policy': 'no-referrer',
  });
  res.status(200).end(PIXEL);
});
```

**Sequelize UPDATE pattern** (`backend/src/services/campaignService.ts` lines 224-228):
```typescript
const [count] = await Campaign.update(
  { updatedAt: new Date() },
  { where: { id: campaignId, createdBy: userId, status: 'draft' }, transaction: t },
);
if (count === 0) throw new ConflictError('CAMPAIGN_NOT_EDITABLE');
```

For `track.ts`, do NOT inspect `count` and do NOT throw. The pattern is the same `Model.update(values, { where })` shape but result is intentionally discarded:
```typescript
await CampaignRecipient.update(
  { openedAt: new Date() },
  { where: { trackingToken: req.params.trackingToken, openedAt: null } }
);
```

`CampaignRecipient` model columns confirmed (`backend/src/models/campaignRecipient.ts` lines 9, 13):
- `trackingToken: string` — UUID, unique, maps to column `tracking_token`
- `openedAt: Date | null` — maps to column `opened_at`; model has `underscored: true`

**Error handling anti-pattern (DO NOT copy from analog):**
```typescript
// campaigns.ts / recipients.ts — normal handlers:
} catch (err) {
  next(err);   // <-- DO NOT USE in track.ts
}
```
Using `next(err)` in the track handler would let `errorHandler` return a non-200 JSON response, breaking the oracle defense and the Content-Type contract.

---

### `backend/src/app.ts` (config edit — mount point)

**Analog:** `backend/src/app.ts` (self) — the file already has the exact insertion comment.

**Existing import block** (`backend/src/app.ts` lines 23-29):
```typescript
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { httpLogger } from './util/httpLogger.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { recipientsRouter } from './routes/recipients.js';
import { errorHandler } from './middleware/errorHandler.js';
```

Add one import line following the same `.js` extension convention:
```typescript
import { trackRouter } from './routes/track.js';
```

**Existing mount pattern** (`backend/src/app.ts` lines 49-56):
```typescript
// 5. Public: auth endpoints (/me inside has per-route authenticate)
app.use('/auth', authRouter);

// 6-7. Protected: campaigns + recipients (router-level authenticate)
app.use('/campaigns', campaignsRouter);
app.use('/recipients', recipientsRouter);

// 8. TAIL error handler (4-arg signature — Express 4 contract)
app.use(errorHandler);
```

Insert BEFORE `app.use(errorHandler)` — comment in `app.ts` line 19 already marks this point:
```typescript
// 8a. Public: tracking pixel (no authenticate — C17 oracle defense)
app.use('/track', trackRouter);  // PUBLIC — no authenticate; see C7 + Phase 6 note

// 9. TAIL error handler (4-arg signature — Express 4 contract)
app.use(errorHandler);
```

Also update the middleware-order comment block at lines 9-21 to include the new entry at position 7a or renumber step 8 → 9.

---

## Shared Patterns

### No-authenticate public mount
**Source:** `backend/src/app.ts` lines 49-50 (`/auth` router as reference — also public)
**Apply to:** `track.ts` router declaration and `app.ts` mount
```typescript
// /auth is public — same model for /track
app.use('/auth', authRouter);
// track mirrors this: no authenticate on the router itself
app.use('/track', trackRouter);
```

### Sequelize Model.update() return value
**Source:** `backend/src/services/campaignService.ts` line 224
**Apply to:** `track.ts` handler — but discard `[count]` destructure entirely
```typescript
// Analog captures count for guard logic:
const [count] = await Campaign.update(...);
// track.ts MUST NOT inspect count — discard:
await CampaignRecipient.update(...);
```

### Import path convention
**Source:** All route files — always use `.js` extension on relative imports
```typescript
import { CampaignRecipient } from '../models/campaignRecipient.js';
```

---

## No Analog Found

None. Both files have direct analogs in the codebase.

---

## Key Divergences from Analogs

| File | Normal analog pattern | track.ts deviation | Reason |
|---|---|---|---|
| `track.ts` error handling | `catch(err) { next(err) }` | `catch { /* swallow */ }` | Oracle defense — errorHandler must never intercept |
| `track.ts` response | `res.json({ data: ... })` | `res.set(headers); res.status(200).end(PIXEL)` | Binary GIF response, not JSON |
| `track.ts` auth | `router.use(authenticate)` | omitted | Public endpoint |
| `track.ts` buffer | N/A | `const PIXEL = Buffer.from(...)` at module scope | Allocated once, never inside handler |

---

## Metadata

**Analog search scope:** `backend/src/routes/`, `backend/src/services/`, `backend/src/models/`, `backend/src/app.ts`
**Files scanned:** 7
**Pattern extraction date:** 2026-04-21
