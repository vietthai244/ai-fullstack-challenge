---
phase: 06-tracking-pixel
verified: 2026-04-21T14:10:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run bash backend/test/smoke/run-all-phase6.sh against a live stack"
    expected: "ALL SMOKE TESTS PASSED — Phase 6 acceptance gate green / TRACK-01 printed; both subscripts exit 0"
    why_human: "Requires docker compose up + db:migrate + db:seed + yarn dev. Cannot start services in static verification."
  - test: "Confirm first-open idempotency against live Postgres"
    expected: "opened_at is set after first GET /track/open/:token; second GET does not change it; Op.is null WHERE clause fires correctly"
    why_human: "Idempotency depends on DB UPDATE semantics at runtime — cannot verify without Postgres."
  - test: "Confirm Cache-Control and Referrer-Policy headers arrive at the HTTP client"
    expected: "Response headers include Cache-Control: no-store, no-cache, must-revalidate, private and Referrer-Policy: no-referrer"
    why_human: "Express .set() wiring to actual HTTP wire format requires a live HTTP request — curl -I check."
---

# Phase 6: Tracking Pixel Verification Report

**Phase Goal:** A public no-auth GET /track/open/:trackingToken endpoint serves a 43-byte transparent GIF89a in ~1ms and idempotently records the first open per recipient in Postgres without leaking token validity to the caller.
**Verified:** 2026-04-21T14:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /track/open/<valid-uuid> returns 200 with Content-Type: image/gif, Content-Length: 43, Cache-Control: no-store, no-cache, Referrer-Policy: no-referrer | VERIFIED (static) / needs live confirm | Handler sets all headers via res.set(); PIXEL.length confirmed 43 bytes at node runtime; live HTTP header delivery needs human |
| 2 | GET /track/open/<invalid-uuid-or-garbage> returns 200 with identical GIF — no 404, no body difference | VERIFIED | catch block swallows all DB errors; res.status(200).end(PIXEL) always executes; no early return or branching on token validity |
| 3 | Route succeeds with no Authorization header — it is public | VERIFIED | trackRouter mounted at app level via app.use('/track', trackRouter) at line 54 of app.ts, outside all authenticate-protected router groups; no authenticate import in track.ts |
| 4 | First call with a valid token sets opened_at; second call does not overwrite it | VERIFIED (logic) / needs live confirm | UPDATE WHERE tracking_token=$1 AND openedAt IS NULL uses Op.is (line 31 track.ts) — first call sets the field, second call matches zero rows; confirmed correct in source; live DB behavior needs human |
| 5 | PIXEL buffer is declared at module scope, before the Router() call | VERIFIED | Buffer.from at line 15; Router() at line 22 — module-scope confirmed by line numbers |

**Score:** 5/5 truths verified (3 fully static, 2 need live confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/routes/track.ts` | Public GET /open/:trackingToken handler with module-scoped PIXEL buffer | VERIFIED | File exists, 48 lines, substantive implementation; exports trackRouter |
| `backend/src/app.ts` | trackRouter mounted at /track BEFORE errorHandler | VERIFIED | Import at line 26; mount at line 54; errorHandler at line 57 — correct order |
| `backend/test/smoke/track-06.sh` | Smoke test for criteria 1-3 (200, headers, public) | VERIFIED | Exists, syntax OK, covers all 3 criteria |
| `backend/test/smoke/track-06-idempotent.sh` | Smoke test for criterion 4 (opened_at first-write-wins) | VERIFIED | Exists, syntax OK, fetches fresh token and compares timestamps |
| `backend/test/smoke/run-all-phase6.sh` | Phase 6 acceptance gate runner | VERIFIED | Exists, syntax OK, health-checks server then calls both subscripts |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| backend/src/app.ts | backend/src/routes/track.ts | import { trackRouter } from './routes/track.js' | WIRED | Line 26 in app.ts; mount at line 54 |
| backend/src/routes/track.ts | campaign_recipients.opened_at | CampaignRecipient.update WHERE trackingToken AND openedAt IS NULL | WIRED | CampaignRecipient.update call at lines 26-34; Op.is null guard confirmed at line 31 |
| backend/test/smoke/run-all.sh | backend/test/smoke/run-all-phase6.sh | bash "$HERE/run-all-phase6.sh" | WIRED | Line 37 in run-all.sh; TRACK-01 in summary block |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| backend/src/routes/track.ts | PIXEL (binary buffer) | Module-scoped Buffer.from() hex literal | Yes — 43-byte GIF89a verified at node runtime | FLOWING |
| backend/src/routes/track.ts | openedAt write | CampaignRecipient.update() with Op.is null | Writes to DB — parameterized via Sequelize ORM (no string interpolation) | FLOWING (static analysis) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| PIXEL buffer is exactly 43 bytes | node -e "const b=Buffer.from('47494638396101000100800000ffffff000000'+'21f9040100000000'+'2c00000000010001000002024c01003b','hex');console.log(b.length)" | 43 | PASS |
| Buffer.from precedes Router() by line number | grep -n 'Buffer.from\|Router()' track.ts | Buffer.from at 15, Router() at 22 | PASS |
| Op.is present (not plain null) | grep -c 'Op.is' track.ts | 1 | PASS |
| No active next(err) call | grep -n 'next(err)' track.ts (in comment only, line 38) | Comment only — no executable call | PASS |
| trackRouter before errorHandler in app.ts | grep -n 'trackRouter\|errorHandler' app.ts | trackRouter mount at 54, errorHandler at 57 | PASS |
| typecheck exits 0 | yarn workspace @campaign/backend typecheck | Done in 1.63s — no errors | PASS |
| Smoke scripts have valid bash syntax | bash -n on all 3 scripts | syntax OK | PASS |
| Commit ed27774 exists | git show ed27774 --oneline | feat(06-01): add public tracking pixel endpoint | PASS |
| Commit 3c2fb0b exists | git show 3c2fb0b --oneline | chore(06-01): add phase 6 smoke scripts and wire acceptance gate | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRACK-01 | 06-01-PLAN.md | GET /track/open/:trackingToken public, 43-byte GIF89a, always 200, idempotent opened_at, oracle defense | SATISFIED (static) | track.ts implements all 4 sub-criteria; live confirmation deferred to human smoke test |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| backend/src/routes/track.ts | 38 | "DO NOT call next(err)" in comment — grep-c returns 1 | Info | Not an active call; comment documents oracle-defense invariant; no behavioral impact |

No stub indicators found. No empty returns, no TODO/FIXME, no hardcoded empty state. The comment containing `next(err)` is documentation, not code.

### Human Verification Required

#### 1. Live smoke suite — all TRACK-01 criteria

**Test:** With docker compose postgres + redis up, db:migrate + db:seed complete, and yarn workspace @campaign/backend dev running on :3000:
```bash
bash backend/test/smoke/run-all-phase6.sh
```
**Expected:** Both subscripts print PASS; final banner shows "ALL SMOKE TESTS PASSED — Phase 6 acceptance gate green / TRACK-01"
**Why human:** Requires live Postgres + running Express server.

#### 2. Response headers on the wire

**Test:**
```bash
curl -si http://localhost:3000/track/open/00000000-0000-0000-0000-000000000000 | head -20
```
**Expected:** HTTP/1.1 200, Content-Type: image/gif, Content-Length: 43, Cache-Control: no-store, no-cache, must-revalidate, private, Referrer-Policy: no-referrer
**Why human:** Express .set() call verified in source; actual HTTP wire output requires a live request.

#### 3. Idempotent opened_at in Postgres

**Test:** Run track-06-idempotent.sh against a seeded DB with at least one unopened recipient row.
**Expected:** opened_at set after first request; unchanged after second request.
**Why human:** Op.is null WHERE clause semantics verified in source; Sequelize-to-SQL translation and actual DB update behavior requires a live Postgres connection.

### Gaps Summary

No gaps. All five must-have truths are satisfied by the static codebase:

1. All required files exist and are substantive (not stubs).
2. trackRouter is imported and mounted before errorHandler.
3. PIXEL buffer is 43 bytes, module-scoped, confirmed at runtime.
4. Op.is null guard correctly implements idempotent first-write-wins.
5. No authenticate middleware in track.ts; route is public at app level.
6. All smoke scripts have valid syntax and cover all 4 TRACK-01 criteria.
7. run-all.sh wires Phase 6 with TRACK-01 in summary.
8. typecheck exits 0.
9. Both task commits verified in git history.

Three behaviors require a live stack to confirm (response headers on the wire, DB write, idempotency), hence status is human_needed.

---

_Verified: 2026-04-21T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
