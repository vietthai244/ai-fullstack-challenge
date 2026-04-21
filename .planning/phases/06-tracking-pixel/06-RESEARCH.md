# Phase 6: Open Tracking Pixel — Research

**Researched:** 2026-04-21
**Domain:** Express 4 public route, Sequelize UPDATE, GIF89a binary response
**Confidence:** HIGH

---

## Summary

Phase 6 is a single-endpoint phase. The entire deliverable is one new router file
(`backend/src/routes/track.ts`) mounted at the app level in `app.ts`, plus a tiny
service function. No new dependencies. No new models. No migrations.

The two hard constraints are: (1) the route must **never** return anything other than
`200 + 43-byte GIF` — including for invalid tokens — and (2) it must be mounted
**outside** the protected router group so `authenticate` middleware is never inherited.
Both constraints are already documented in `app.ts` with a comment pointing to Phase 6.

The `CampaignRecipient` model has `trackingToken` (UUID) and `openedAt` (Date|null)
columns since Phase 2. The only database work is a single idempotent UPDATE.

**Primary recommendation:** One router file, one module-scoped Buffer, one
Sequelize UPDATE with `WHERE tracking_token = $1 AND opened_at IS NULL`, then always
send the GIF. Mount the router before `errorHandler` in `buildApp()` as the comment
in `app.ts` already specifies.

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to Phase 6? |
|-----------|---------------------|
| No `sync()` in prod | N/A — no schema changes |
| Stats via aggregate SQL | N/A — no stats in this route |
| BullMQ `maxRetriesPerRequest: null` | N/A — no queue work |
| Cursor pagination | N/A — no list endpoint |
| Tracking pixel always 200 | YES — core requirement |
| Use `tracking_token UUID` (not BIGINT) | YES — column already exists |
| Public router mounted separately from `authenticate` | YES — CLAUDE.md §7 + app.ts comment |
| Vitest 2.1.9 pinned | Applies if tests are written |
| React Query owns server state / Redux owns client state | N/A — backend only |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRACK-01 | `GET /track/open/:trackingToken` (public, no auth) returns 43-byte GIF89a, runs idempotent `UPDATE ... WHERE tracking_token = $1 AND opened_at IS NULL`, always 200 even for invalid tokens, headers: Content-Type image/gif, Cache-Control no-store/no-cache, Referrer-Policy no-referrer, pixel buffer module-scoped | Router mount pattern verified in `app.ts`; CampaignRecipient model confirmed to have `trackingToken` + `openedAt`; GIF bytes computed and verified at 43 bytes |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Serve GIF response | API / Backend | — | Express handles binary responses; no CDN needed at this scale |
| Record open event | Database / Storage | — | Single idempotent UPDATE on `campaign_recipients` |
| Public routing (no auth) | API / Backend | — | Separate Express Router, never inherits `authenticate` |
| Token unguessability | Database / Storage | — | UUID column with 122-bit entropy, set at row creation (Phase 2) |

---

## Standard Stack

### Core — No New Dependencies

All required tools are already installed in `@campaign/backend`:

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|------------------|
| express | ^4.22.1 | HTTP routing + binary response | YES [VERIFIED: backend/package.json] |
| sequelize | ^6.37.8 | DB UPDATE call | YES [VERIFIED: backend/package.json] |
| pg | ^8.20.0 | PostgreSQL driver | YES [VERIFIED: backend/package.json] |

`npm install` step: **none required** for Phase 6.

---

## Architecture Patterns

### System Architecture Diagram

```
Email client (or proxy)
       │
       │  GET /track/open/:trackingToken
       ▼
  nginx (Phase 10) ──/track/*──► Express app (buildApp)
                                       │
                               [trackRouter — PUBLIC, no authenticate]
                                       │
                               ┌───────┴────────┐
                               │                │
                        CampaignRecipient    always-200
                        UPDATE openedAt      GIF response
                        WHERE token=$1           │
                        AND openedAt IS NULL      │
                               │                │
                        (0 or 1 rows affected)   │
                               └───────┬────────┘
                                       │
                              res.status(200).end(PIXEL)
```

### Recommended File Structure

```
backend/src/
├── routes/
│   └── track.ts         # NEW — the entire phase deliverable
├── app.ts               # EDIT — add trackRouter mount (comment already present)
```

No new service file needed — the UPDATE is simple enough to live directly in the
route handler. If a `trackingService.ts` pattern is preferred for testability in
Phase 7, it is one function; either approach is valid.

### Pattern 1: Module-Scoped Pixel Buffer

**What:** Allocate the 43-byte GIF once at module load time, reuse for every request.
**When to use:** Always — per-request allocation would GC-pressure and violates the
success criterion (grep check: buffer declared outside handler).

```typescript
// Source: ARCHITECTURE.md §6 + verified hex computation
// Correct 43-byte 1×1 transparent GIF89a:
const PIXEL = Buffer.from(
  '47494638396101000100800000ffffff00000021f90401000000002c' +
  '00000000010001000002024c01003b',
  'hex'
);
// PIXEL.length === 43  (verified via node -e)
```

**GIF hex discrepancy note:** The `ARCHITECTURE.md` §6 example contains 44 bytes
(one extra `01` byte at offset 11). The correct 43-byte sequence is the one above.
[VERIFIED: node -e buffer length check — 43 bytes confirmed]

### Pattern 2: Sequelize UPDATE — idempotent first-open

**What:** `Model.update()` with `WHERE tracking_token = $1 AND opened_at IS NULL`.
**When to use:** Every pixel request, regardless of whether the token resolves.

```typescript
// Source: Sequelize 6 docs — Model.update() returns [affectedCount, rows]
await CampaignRecipient.update(
  { openedAt: new Date() },
  {
    where: {
      trackingToken: req.params.trackingToken,
      openedAt: null,           // Sequelize maps null → IS NULL in WHERE clause
    },
  }
);
// Intentionally do NOT inspect affectedCount — oracle defense
```

`openedAt: null` in Sequelize's `where` clause emits `WHERE opened_at IS NULL`
[VERIFIED: Sequelize 6 behavior — null in where generates IS NULL].

### Pattern 3: Public Router Mount in buildApp()

**What:** Create a separate Express `Router` for `/track`, never apply `authenticate`.
**When to use:** Any endpoint that must be public while other routes are protected.

```typescript
// backend/src/routes/track.ts
import { Router } from 'express';
import { CampaignRecipient } from '../models/campaignRecipient.js';

const PIXEL = Buffer.from(
  '47494638396101000100800000ffffff00000021f9040100000000' +
  '2c00000000010001000002024c01003b',
  'hex'
);

export const trackRouter: Router = Router();

trackRouter.get('/open/:trackingToken', async (req, res) => {
  try {
    await CampaignRecipient.update(
      { openedAt: new Date() },
      { where: { trackingToken: req.params.trackingToken, openedAt: null } }
    );
  } catch {
    // Swallow DB errors — oracle defense; caller must never know
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

```typescript
// backend/src/app.ts — insert BEFORE errorHandler, AFTER cookieParser
// app.ts already has a comment marking this exact insertion point
import { trackRouter } from './routes/track.js';

// Inside buildApp():
app.use('/track', trackRouter);   // PUBLIC — no authenticate
// ...
app.use(errorHandler);            // LAST
```

### Anti-Patterns to Avoid

- **`res.sendFile()` on a pixel.gif asset** — disk read per request, defeats module-scoped buffer criterion. Use hardcoded `Buffer`.
- **`res.status(404)` for unknown tokens** — oracle attack leak (C17). Always 200.
- **Mounting `trackRouter` inside `campaignsRouter`** — would inherit `authenticate`. Must be at app level.
- **`res.json()` or `res.send()` for GIF** — sets wrong Content-Type. Use `res.end(PIXEL)` after setting headers manually.
- **Throwing/next(err) on DB failure** — `errorHandler` would change the response shape, possibly returning non-200. Swallow inside try/catch, always send GIF.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID validation | custom regex | Sequelize WHERE + DB constraint | If token is malformed, UPDATE matches 0 rows — same as no-match; no error needed |
| Rate limiting on pixel | custom counter | none for v1 | Out of scope; proxy inflation documented in README (Phase 10) |
| GIF binary construction | GIF encoder library | hardcoded Buffer literal | 43 bytes — a library is overkill and adds a dependency |

---

## Common Pitfalls

### Pitfall 1: Buffer Allocated Inside Handler (C17 partial)
**What goes wrong:** Success criterion (grep) fails; minor GC pressure per request.
**Why it happens:** Putting `const PIXEL = Buffer.from(...)` inside the async handler function.
**How to avoid:** Declare at module scope, before `Router()` call.
**Warning signs:** `grep -n 'Buffer.from' routes/track.ts` shows the match is inside a function body.

### Pitfall 2: DB Error Propagates to errorHandler
**What goes wrong:** `errorHandler` catches, returns `{ error: { code } }` JSON with non-200 status — breaks oracle defense and Content-Type contract.
**Why it happens:** Forgetting to wrap the UPDATE in try/catch, relying on Express async error forwarding.
**How to avoid:** Explicit `try { await ... } catch { /* swallow */ }` in the handler; NEVER call `next(err)`.

### Pitfall 3: Content-Length Mismatch
**What goes wrong:** `curl -i` shows `Content-Length: 44` when buffer is 44 bytes — fails success criterion #1.
**Why it happens:** Using the ARCHITECTURE.md hex directly (it is 44 bytes, not 43).
**How to avoid:** Use the verified 43-byte hex from this research. Verify with `PIXEL.length === 43` assertion at module load or in a test.

### Pitfall 4: trackRouter Mounted After errorHandler
**What goes wrong:** The `/track` path never matches; Express skips it.
**Why it happens:** Incorrect ordering in `buildApp()`.
**How to avoid:** `app.ts` already has a comment; insert BEFORE `app.use(errorHandler)`.

### Pitfall 5: Sequelize `openedAt: null` vs `openedAt: { [Op.is]: null }`
**What goes wrong:** In some Sequelize 6 versions, `{ col: null }` in a WHERE generates `col = NULL` (always false) rather than `col IS NULL`.
**How to avoid:** Test the idempotency criterion (second call must NOT overwrite `opened_at`). Sequelize 6.37+ maps `null` → `IS NULL` correctly [ASSUMED — verify during implementation by checking UPDATE affected-row count in a smoke test].
**Safe alternative:** Use `{ openedAt: { [Op.is]: null as any } }` if behavior is uncertain.

---

## Code Examples

### Full route handler (verified pattern)

```typescript
// Source: ARCHITECTURE.md §6 (adapted with correct byte count)
// backend/src/routes/track.ts
import { Router } from 'express';
import { CampaignRecipient } from '../models/campaignRecipient.js';

// Module-scoped — allocated once, reused per request
const PIXEL = Buffer.from(
  '47494638396101000100800000ffffff00000021f9040100000000' +
  '2c00000000010001000002024c01003b',
  'hex'
);
// Invariant: PIXEL.length === 43

export const trackRouter: Router = Router();

trackRouter.get('/open/:trackingToken', async (req, res) => {
  try {
    await CampaignRecipient.update(
      { openedAt: new Date() },
      { where: { trackingToken: req.params.trackingToken, openedAt: null } }
    );
  } catch {
    // Intentionally swallowed — oracle defense; caller must never know
    // whether token matched, whether DB was reachable, etc.
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

### app.ts insertion (verified by reading current file)

```typescript
// Add to imports in app.ts:
import { trackRouter } from './routes/track.js';

// Add BEFORE errorHandler in buildApp():
// Position 6a (between recipients and errorHandler)
app.use('/track', trackRouter);  // PUBLIC — no authenticate; see C7 + Phase 6 note
```

The `app.ts` file already has a comment on line 19 stating:
> "Phase 6 will INSERT `app.use('/track', trackRouter)` BEFORE errorHandler..."

This comment provides the exact insertion point.

### Smoke test (curl commands for acceptance gate)

```bash
# Success criterion 1: valid token → 200 + GIF
VALID_TOKEN=$(psql $DATABASE_URL -t -c \
  "SELECT tracking_token FROM campaign_recipients LIMIT 1;" | xargs)
curl -i http://localhost:3000/track/open/$VALID_TOKEN

# Expected: HTTP/1.1 200, Content-Type: image/gif, Content-Length: 43

# Success criterion 2: invalid token → same 200 + GIF (oracle defense)
curl -i http://localhost:3000/track/open/00000000-0000-0000-0000-000000000000

# Success criterion 3: no auth header needed
curl -i http://localhost:3000/track/open/$VALID_TOKEN
# (no Authorization header — must succeed)

# Success criterion 4: idempotency
curl -s http://localhost:3000/track/open/$VALID_TOKEN > /dev/null
curl -s http://localhost:3000/track/open/$VALID_TOKEN > /dev/null
psql $DATABASE_URL -c \
  "SELECT opened_at FROM campaign_recipients WHERE tracking_token='$VALID_TOKEN';"
# opened_at should be set and NOT NULL; second curl did not overwrite

# Success criterion 5: grep for module-scope buffer
grep -n 'PIXEL\|Buffer.from' backend/src/routes/track.ts
# Buffer.from line should appear BEFORE the trackRouter = Router() line
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sequelize 6.37+ maps `{ col: null }` in WHERE to `col IS NULL` (not `col = NULL`) | Pitfall 5 + Code Examples | Idempotency criterion fails silently; second open overwrites `opened_at`. Mitigation: use `Op.is` explicitly, or verify via smoke test row count. |

---

## Open Questions

1. **`Op.is` vs plain `null` in Sequelize WHERE**
   - What we know: Sequelize 6 docs say null in where generates IS NULL, but behavior has historically varied
   - What's unclear: Exact behavior of `v6.37.8` (project's pinned version)
   - Recommendation: Use `{ openedAt: { [Op.is]: null as any } }` to be explicit; verify during implementation via smoke test

2. **Content-Length header vs Transfer-Encoding: chunked**
   - What we know: Express may omit Content-Length if the response is sent via `res.send()` with chunked encoding
   - What's unclear: Whether `res.end(PIXEL)` with explicit `Content-Length` set header bypasses Express's default chunked encoding
   - Recommendation: Use `res.end(PIXEL)` (not `res.send()`) after manually setting `Content-Length`; this bypasses Express's chunk wrapping

---

## Environment Availability

Step 2.6: SKIPPED — Phase 6 is purely backend code changes with no new external dependencies. PostgreSQL and Redis are already running from Phase 5 local dev setup.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (not yet installed — backend/package.json has `echo 'tests land in Phase 7'`) |
| Config file | None — Wave 0 gap for Phase 7 |
| Quick run command | `yarn workspace @campaign/backend test` |
| Full suite command | `yarn workspace @campaign/backend test` |

**Note:** Phase 6 has no test files — the backend test suite is Phase 7's deliverable.
Phase 6 validation relies on smoke scripts (curl commands above). The Vitest
infrastructure for Phase 7 will cover TRACK-01 as part of `test/track.test.ts`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRACK-01 | Valid token → 200 + GIF + headers | smoke (curl) | `./scripts/smoke/track-06.sh` | Wave 0 gap |
| TRACK-01 | Invalid token → same 200 + GIF | smoke (curl) | `./scripts/smoke/track-06.sh` | Wave 0 gap |
| TRACK-01 | No auth header → 200 (public) | smoke (curl) | `./scripts/smoke/track-06.sh` | Wave 0 gap |
| TRACK-01 | First call sets opened_at; second does not overwrite | smoke (psql check) | `./scripts/smoke/track-06-idempotent.sh` | Wave 0 gap |
| TRACK-01 | PIXEL buffer is module-scoped | grep check | `grep -n PIXEL backend/src/routes/track.ts` | Wave 0 gap |

### Wave 0 Gaps

- [ ] `scripts/smoke/track-06.sh` — curl smoke for criteria 1-3
- [ ] `scripts/smoke/track-06-idempotent.sh` — idempotency check (criteria 4)
- Vitest test file deferred to Phase 7 (`backend/src/test/track.test.ts`)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | intentionally public |
| V3 Session Management | no | no session involved |
| V4 Access Control | yes — inverted | route must NOT be gated; oracle defense |
| V5 Input Validation | partial | UUID param not validated (mismatches → 0 DB rows, safe) |
| V6 Cryptography | no | UUID entropy from `gen_random_uuid()` — DB-side |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token enumeration (BIGINT iteration) | Information Disclosure | UUID column (122-bit entropy) defeats enumeration |
| Oracle attack (404 vs 200 leaks token validity) | Information Disclosure | Always 200 + GIF regardless of DB result |
| Replay / double-open | Tampering | `WHERE opened_at IS NULL` — first-write-wins |
| Privacy (referrer leakage to email proxy) | Information Disclosure | `Referrer-Policy: no-referrer` |
| Cache poisoning | Spoofing | `Cache-Control: no-store, no-cache` prevents CDN/browser caching |

---

## Sources

### Primary (HIGH confidence)
- `backend/src/app.ts` — current middleware order, Phase 6 mount comment [VERIFIED: read]
- `backend/src/models/campaignRecipient.ts` — `trackingToken` UUID + `openedAt` columns confirmed [VERIFIED: read]
- `backend/package.json` — dependency versions confirmed [VERIFIED: read]
- `.planning/research/ARCHITECTURE.md` §6 — tracking pixel pattern (note: hex in §6 is 44 bytes, corrected in this research) [CITED: .planning/research/ARCHITECTURE.md]
- `.planning/research/PITFALLS.md` §C17 — oracle defense + idempotency requirements [CITED: .planning/research/PITFALLS.md]
- Node.js `Buffer.from(hex, 'hex').length` — 43-byte GIF computation [VERIFIED: node -e]

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` TRACK-01 — full requirement text [CITED: .planning/REQUIREMENTS.md]
- `.planning/ROADMAP.md` Phase 6 success criteria [CITED: .planning/ROADMAP.md]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing stack confirmed
- Architecture: HIGH — mount point already documented in app.ts; model columns verified
- Pitfalls: HIGH — C17 fully documented; byte count discrepancy verified via node
- GIF bytes: HIGH — computed and verified to be 43 bytes
- Sequelize null-in-WHERE: ASSUMED (A1) — needs smoke verification

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable domain; no fast-moving dependencies)
