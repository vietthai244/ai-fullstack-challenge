---
phase: 06-tracking-pixel
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - backend/src/routes/track.ts
  - backend/src/app.ts
  - backend/test/smoke/track-06.sh
  - backend/test/smoke/track-06-idempotent.sh
  - backend/test/smoke/run-all-phase6.sh
  - backend/test/smoke/run-all.sh
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 6 implements the tracking pixel endpoint (`GET /track/open/:trackingToken`) and its smoke tests. The core correctness requirements are met: always-200 response, 43-byte GIF89a payload, idempotent `openedAt` update via `Op.is: null` WHERE guard, and oracle-defense error swallowing. The `app.ts` middleware order is correct — the track router is public and mounted outside any authenticate scope.

Two warnings and two info items found. No critical issues.

---

## Warnings

### WR-01: Unvalidated path parameter passed directly to Sequelize query

**File:** `backend/src/routes/track.ts:30`
**Issue:** `req.params.trackingToken` is forwarded to `CampaignRecipient.update()` without any format validation. The column type is `DataTypes.UUID`, so Postgres will throw a `22P02 invalid_text_representation` error if the input is not a valid UUID. That error IS swallowed by the catch block, so it won't leak information — but it generates a DB-round-trip error on every malformed request (scanner probe, crawler, typo). More importantly, because the error is caught and swallowed, a path like `/track/open/../../../../etc` containing path traversal characters will silently reach the DB call rather than being rejected at the HTTP layer.

Path traversal is mitigated here by Express's router (the param is already decoded and bound), but a UUID format guard is the correct defensive layer regardless.

**Fix:**
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

trackRouter.get('/open/:trackingToken', async (req, res) => {
  const { trackingToken } = req.params;
  if (UUID_RE.test(trackingToken)) {   // only hit DB for valid UUIDs
    try {
      await CampaignRecipient.update(
        { openedAt: new Date() },
        { where: { trackingToken, openedAt: { [Op.is]: null as any } } }
      );
    } catch {
      // oracle defense — intentionally swallowed
    }
  }
  // always send the pixel regardless
  res.set({ ... });
  res.status(200).end(PIXEL);
});
```

---

### WR-02: SQL string interpolation in smoke test script

**File:** `backend/test/smoke/track-06-idempotent.sh:24`
**Issue:** The `$FRESH_TOKEN` variable is interpolated directly into a `psql` SQL string:
```bash
"SELECT opened_at FROM campaign_recipients WHERE tracking_token='$FRESH_TOKEN';"
```
This is SQL injection via shell variable interpolation. `$FRESH_TOKEN` is populated from a DB query in the same script, so it is a UUID in normal operation — but the pattern is unsafe. If `$FRESH_TOKEN` were ever empty or contained a quote (e.g., due to a seed data anomaly), it would produce a malformed or exploitable query. The `xargs` trim on line 13 does not sanitize SQL metacharacters.

**Fix:** Use a parameterized psql invocation:
```bash
SECOND_TS=$(psql "$DATABASE_URL" -t -c \
  "SELECT opened_at FROM campaign_recipients WHERE tracking_token = $1" \
  -- "$FRESH_TOKEN" 2>/dev/null | xargs)
```
Or use a single-quoted heredoc with `--set`:
```bash
SECOND_TS=$(psql "$DATABASE_URL" -t -v token="$FRESH_TOKEN" \
  -c "SELECT opened_at FROM campaign_recipients WHERE tracking_token = :'token';" \
  2>/dev/null | xargs)
```

---

## Info

### IN-01: `null as any` type suppression on `Op.is`

**File:** `backend/src/routes/track.ts:31`
**Issue:** `openedAt: { [Op.is]: null as any }` uses `as any` to satisfy the Sequelize TypeScript type for `Op.is`. This is a known Sequelize 6 / `sequelize-typescript` typing gap where `Op.is` expects `null | boolean` but the generic `WhereAttributeHash` doesn't expose it cleanly. The cast is correct and intentional but suppresses type checking at that expression.

**Fix:** Add an inline comment to make the suppression intentional and searchable:
```typescript
// Op.is requires `as any` — Sequelize 6 typing gap for IS NULL/TRUE/FALSE
openedAt: { [Op.is]: null as any },
```
Or import `WhereOperators` and cast more narrowly if the Sequelize version supports it.

---

### IN-02: `run-all.sh` prereqs comment omits `psql` requirement added in Phase 6

**File:** `backend/test/smoke/run-all.sh:4-9`
**Issue:** The `run-all.sh` prereqs comment (lines 4–9) lists only `jq` as a PATH dependency. Phase 6 smoke tests (`track-06.sh`, `track-06-idempotent.sh`) also require `psql` and `DATABASE_URL` — documented in `run-all-phase6.sh` but not in the top-level `run-all.sh`. A developer running `run-all.sh` cold without `psql` will get an opaque failure mid-run.

**Fix:** Add to the prereqs comment in `run-all.sh`:
```bash
#   4. `jq` + `psql` available on PATH; DATABASE_URL set in env (required by phase 6)
```

---

_Reviewed: 2026-04-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
