---
phase: 02-schema-migrations-seed
verified: 2026-04-21T00:00:00Z
status: passed
score: 5/5 success criteria verified live
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
observations:
  - kind: doc-lag
    file: .planning/REQUIREMENTS.md
    line: 28
    issue: "DATA-03 still rendered as `[ ]` (unchecked) in v1 list, despite seeder shipped (commit dc41145) and all live SC-5 sub-tests passing (1/10/3, 80%/25% stats, bcrypt regex match)"
    severity: minor
    impact: "Cosmetic only — implementation is complete; traceability tracker is stale"
  - kind: doc-lag
    file: .planning/REQUIREMENTS.md
    line: 154
    issue: "Traceability table marks DATA-03 as 'Pending' instead of 'Complete (Plan 02-04)'"
    severity: minor
    impact: "Cosmetic only — does not affect Phase 2 deliverables"
  - kind: doc-lag
    file: .planning/STATE.md
    line: 13-14
    issue: "STATE.md shows completed_plans: 6 / percent: 60 — should be 8 / 80% after Phase 2's 4/4 plans complete (last_activity also stops at Plan 02-03; Plan 02-04 not reflected)"
    severity: minor
    impact: "Cosmetic only — ROADMAP.md correctly marks Phase 2 Complete (line 17, line 204); STATE.md drifted"
  - kind: env-quirk
    file: backend/.env (gitignored)
    issue: "Live DB at localhost:5432 is the homebrew Postgres 14, not the docker-compose container — both bound to :5432, homebrew shadows. Documented in Plan 02-03 deviations and Plan 02-04 SUMMARY. Resolves cleanly in Phase 10 (separate docker network, only web port bound)"
    severity: info
    impact: "Does not affect Phase 2 contract — schema + seed verified live; Phase 10 acceptance gate runs against docker postgres in clean volume"
---

# Phase 2: Schema, Migrations & Seed — Verification Report

**Phase Goal:** PostgreSQL schema deployed via Sequelize migrations with correct FK ordering, indexes, tracking tokens, and a seeder that creates a demo user plus one campaign in each of `draft`, `scheduled`, `sent` states.

**Verified:** 2026-04-21
**Status:** PASSED — all 5 ROADMAP success criteria pass live; all 3 REQ-IDs (DATA-01, DATA-02, DATA-03) complete; all six stub-vector mitigations (C3, C8, C17, M1, M4, plus ENUM-down-drop hygiene) intact; scope discipline holds.
**Re-verification:** No — initial verification.

---

## Verdict

**PASS with minor observations** — Phase 2 delivers exactly what it promised. All five ROADMAP Phase 2 success criteria verified against the live, seeded postgres at `postgres://campaign:campaign@localhost:5432/campaigns`. All three REQ-IDs are functionally complete in code. Three documentation-lag observations (REQUIREMENTS.md DATA-03 status, STATE.md plan counter) are cosmetic and do not affect downstream phases.

**Recommendation:** **Close phase.** Phase 3 (Authentication) is unblocked.

---

## ROADMAP Success Criteria — Live Verification

| # | Success Criterion | Status | Live Evidence |
|---|---|---|---|
| **SC-1** | Round-trip migrate works + pgcrypto first | ✓ PASS | `pg_extension.extname='pgcrypto'` returns `pgcrypto`; pgcrypto migration is `00000000000000-enable-pgcrypto.cjs` (lexically first); round-trip exit 0 verified in Plan 02-03 acceptance gate (4-cmd cycle) and Plan 02-04 acceptance gate (`db:reset` end-to-end) |
| **SC-2** | tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid() + composite PK + FK CASCADE on both FKs | ✓ PASS | `\d campaign_recipients` confirms: `tracking_token uuid not null default gen_random_uuid()` (unquoted function call); `PRIMARY KEY, btree (campaign_id, recipient_id)`; both FKs `ON UPDATE CASCADE ON DELETE CASCADE`; `campaign_recipients_tracking_token_key UNIQUE CONSTRAINT btree (tracking_token)` |
| **SC-3** | 4-state + 3-state ENUMs DB-enforced | ✓ PASS | `pg_enum` introspection returns exactly `enum_campaign_recipients_status:pending,sent,failed` and `enum_campaigns_status:draft,scheduled,sending,sent` (4 + 3 in spec order). Matches `shared/src/schemas/campaign.ts:3` `CampaignStatusEnum` verbatim — M4 satisfied. |
| **SC-4** | All 5 indexes (2 explicit + 3 unique-auto) | ✓ PASS | `pg_indexes` lists all 5: `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, `campaign_recipients_tracking_token_key`, `users_email_key`, `recipients_email_key` (plus 4 PKs + SequelizeMeta_pkey, totaling 10 — none missing, no duplicates per Pitfall 9) |
| **SC-5** | Seed produces 1/10/3 + bcrypt + meaningful stats | ✓ PASS | Row counts `1/10/3`; campaign distribution `draft:1`, `scheduled:1`, `sent:1`; sent-campaign mix `sent:false:3 + sent:true:1 + failed:false:1` (= send_rate 4/5 = 80%, open_rate 1/4 = 25%); demo user password hash matches `^\$2[aby]\$` regex (returns `t`) |

---

## REQ-ID Coverage

| REQ-ID | Description | Status | Source Plan | Evidence |
|---|---|---|---|---|
| **DATA-01** | 4 Sequelize models with 4-state campaign ENUM + 3-state recipient ENUM | ✓ COMPLETE | Plan 02-02 | `backend/src/models/{user,recipient,campaign,campaignRecipient}.ts` — 4 class-based Model.init() exports with correct ENUMs (`campaign.ts:47` 4-state, `campaignRecipient.ts:45` 3-state); `belongsToMany` uses named CampaignRecipient model class (preserves junction-column access); `tracking_token` defaultValue is `Sequelize.literal('gen_random_uuid()')` (DB-side); composite PK via `primaryKey: true` × 2; runtime smoke test in Plan 02-02 confirms 5 exports load cleanly |
| **DATA-02** | Migrations create all tables, FK cascades, indexes, pgcrypto | ✓ COMPLETE | Plan 02-01 (infra) + Plan 02-03 (migrations) | 6 .cjs migrations in strict FK order (pgcrypto → users → recipients → campaigns → campaign_recipients → indexes); `00000000000000-` prefix forces pgcrypto first (C3 mitigation); both ENUM-creating migrations carry `DROP TYPE IF EXISTS` in `down()` (verified — see ENUM hygiene table below); 2 explicit composite indexes + 3 auto-unique indexes; round-trip 4-command gate exit 0 (Plan 02-03) |
| **DATA-03** | Seed creates 1 user + 10 recipients + 1 draft + 1 scheduled + 1 sent campaign | ✓ COMPLETE | Plan 02-04 | `backend/src/seeders/20260101000000-demo-data.cjs` — bcrypt cost=10 hash for `demo@example.com` / `demo1234`; 10 named recipients (Alice..Jack); 3 campaigns (Welcome=draft / Product launch=scheduled / Weekly digest=sent); 8 junction rows on the sent campaign (3 pending on scheduled + 5 on sent: 4 sent / 1 failed / 1 opened); `tracking_token` omitted from bulkInsert payloads (proves DB-side default fires); idempotent down() via stable identifiers; live SC-5 verification matches |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `docker-compose.yml` | postgres-only service with healthcheck (Phase 2) | ✓ VERIFIED | postgres:16-alpine, healthcheck via pg_isready, named volume `pgdata`, port 5432 bound, env from POSTGRES_USER/PASSWORD/DB |
| `.env.example` (root) | DATABASE_URL + POSTGRES_USER/PASSWORD/DB | ✓ VERIFIED | All vars documented; phase-3/5 follow-ups noted in comments |
| `backend/.env.example` | backend-scoped DATABASE_URL | ✓ VERIFIED | Mirrors root; deferred vars (JWT_*, REDIS_URL, DATABASE_URL_TEST) noted |
| `backend/.sequelizerc` | maps to src/db/config.cjs + models/migrations/seeders paths | ✓ VERIFIED | All 4 paths resolved via `path.resolve(__dirname, ...)` |
| `backend/src/db/config.cjs` | env-aware development/test/production using `use_env_variable: 'DATABASE_URL'` | ✓ VERIFIED | All 3 envs present; test reads DATABASE_URL_TEST (Phase 7); production sets SSL |
| `backend/src/db/index.ts` | runtime Sequelize + Init-then-Associate barrel | ✓ VERIFIED | Throws on missing DATABASE_URL (V14 fail-fast); all 4 init() before any associate(); env-aware logging via pino debug |
| `backend/src/models/user.ts` | User model | ✓ VERIFIED | BIGINT/autoIncrement id, STRING(320) UNIQUE email, STRING(255) password_hash, hasMany Campaign |
| `backend/src/models/recipient.ts` | Recipient model | ✓ VERIFIED | BIGINT id, STRING(320) UNIQUE email, nullable name, belongsToMany Campaign through named CampaignRecipient |
| `backend/src/models/campaign.ts` | Campaign model with 4-state ENUM | ✓ VERIFIED | ENUM('draft','scheduled','sending','sent') with default 'draft'; createdBy FK with CASCADE; named-model belongsToMany |
| `backend/src/models/campaignRecipient.ts` | Junction model with composite PK + tracking_token | ✓ VERIFIED | Both FKs `primaryKey: true`; tracking_token DataTypes.UUID with `Sequelize.literal('gen_random_uuid()')`; 3-state ENUM with default 'pending' |
| `backend/src/migrations/00000000000000-enable-pgcrypto.cjs` | pgcrypto extension first | ✓ VERIFIED | `CREATE EXTENSION IF NOT EXISTS pgcrypto`; documented no-op down(); zero-prefix forces lexical first sort |
| `backend/src/migrations/20260101000001-create-users.cjs` | users table | ✓ VERIFIED | BIGSERIAL id, STRING(320) UNIQUE email, STRING(255) password_hash, NOT NULL name, timestamps DEFAULT NOW() |
| `backend/src/migrations/20260101000002-create-recipients.cjs` | recipients table | ✓ VERIFIED | Same shape minus password_hash; nullable name |
| `backend/src/migrations/20260101000003-create-campaigns.cjs` | campaigns table with 4-state ENUM + FK CASCADE to users | ✓ VERIFIED | ENUM emitted as native PG type; created_by FK ON UPDATE/DELETE CASCADE; down() drops `enum_campaigns_status` |
| `backend/src/migrations/20260101000004-create-campaign-recipients.cjs` | junction table with composite PK + tracking_token + 2 FK CASCADE | ✓ VERIFIED | Both FKs primaryKey + ON UPDATE/DELETE CASCADE; tracking_token UUID UNIQUE DEFAULT gen_random_uuid(); 3-state ENUM; down() drops `enum_campaign_recipients_status` |
| `backend/src/migrations/20260101000005-create-indexes.cjs` | 2 explicit composite indexes | ✓ VERIFIED | `idx_campaigns_created_by_created_at_id` (created_by, created_at DESC, id DESC); `idx_campaign_recipients_campaign_id_status` (campaign_id, status); explicit removeIndex on down() |
| `backend/src/seeders/20260101000000-demo-data.cjs` | demo user + 10 recipients + 3 campaigns + junction rows | ✓ VERIFIED | Idempotent down() via stable keys; bcrypt cost=10; tracking_token omitted (verifies DB default); meaningful stats distribution |
| `backend/package.json` | deps + db:* scripts | ✓ VERIFIED | sequelize@^6.37.8, pg@^8.20.0, pg-hstore@^2.3.4, bcryptjs@^3.0.3, dotenv@^17.4.2, sequelize-cli@^6.6.5 (dev); 6 db:* scripts (migrate / migrate:undo / migrate:undo:all / seed / seed:undo / reset chained with seed) |
| `backend/tsconfig.json` | excludes for migrations + seeders + config.cjs | ✓ VERIFIED | `exclude: ["src/migrations/**", "src/seeders/**", "src/db/config.cjs"]` — .cjs out of TS scope |

---

## ENUM-down-drop Guarantees

Both ENUM-creating migrations must drop their auto-generated ENUM type in `down()` (Pitfall 7), or round-trip migrate fails with "type already exists" on re-up.

| Migration | DROP TYPE present | Verified |
|---|---|---|
| `20260101000003-create-campaigns.cjs` | `DROP TYPE IF EXISTS "enum_campaigns_status";` (line 32) | ✓ PASS |
| `20260101000004-create-campaign-recipients.cjs` | `DROP TYPE IF EXISTS "enum_campaign_recipients_status";` (line 47) | ✓ PASS |

Round-trip exit 0 confirmed in Plan 02-03 (4-cmd cycle) and Plan 02-04 (`db:reset` from clean state) — neither hit "type already exists".

---

## Mitigations Intact

| Pitfall | Mitigation | Status | Evidence |
|---|---|---|---|
| **C3** | pgcrypto migration runs FIRST in lexical sort | ✓ PASS | `00000000000000-enable-pgcrypto.cjs` is the first file in `ls backend/src/migrations/` |
| **C8** | Explicit indexes added — no auto-FK-index reliance | ✓ PASS | `idx_campaigns_created_by_created_at_id` + `idx_campaign_recipients_campaign_id_status` present in `pg_indexes` |
| **M1** | FK cascade on both campaign_recipients FKs | ✓ PASS | `\d campaign_recipients` shows both FKs `ON UPDATE CASCADE ON DELETE CASCADE`; `campaigns.created_by` also CASCADE in migration 000003 |
| **M4** | 4-state ENUM matches `shared/src/schemas/campaign.ts` | ✓ PASS | `CampaignStatusEnum = z.enum(['draft','scheduled','sending','sent'])` (line 3) matches migration ENUM literals + `pg_enum` row order verbatim |
| **C17** | tracking_token UUID UNIQUE NOT NULL DB-side default | ✓ PASS | `\d campaign_recipients` shows `tracking_token uuid not null default gen_random_uuid()` (unquoted — Research Assumption A4 verified); UNIQUE constraint present |

---

## Scope Discipline

Forbidden runtime deps must NOT appear in any `package.json`. Allowed for Phase 2: sequelize, pg, pg-hstore, bcryptjs, dotenv, sequelize-cli (dev).

| Workspace | package.json | Forbidden Deps Found | Status |
|---|---|---|---|
| root | `package.json` | none in dependencies/devDependencies; `vitest@2.1.9` only in `resolutions:` (Phase 1 pin for Phase 7) | ✓ CLEAN |
| backend | `backend/package.json` | none — only sequelize/pg/pg-hstore/bcryptjs/dotenv/pino/pino-http/@campaign/shared (prod) + sequelize-cli/tsx/typescript/@types/node/pino-pretty (dev) | ✓ CLEAN |
| frontend | `frontend/package.json` | none — empty stub (React/Vite/Tailwind defer to Phase 8) | ✓ CLEAN |
| shared | `shared/package.json` | none — only zod (prod) + typescript (dev) | ✓ CLEAN |

---

## Commit Trail Sanity

| Check | Expected | Actual | Status |
|---|---|---|---|
| Phase 2 commit count | ≥ 10 | 16 | ✓ PASS |
| ROADMAP Phase 2 row | marked Complete | line 17 `[x] **Phase 2: ...** (completed 2026-04-20)`; line 204 `Complete \| 2026-04-20` | ✓ PASS |
| All 4 plan SUMMARY.md files present | 4 | 4 (02-01 through 02-04 SUMMARY.md) | ✓ PASS |
| STATE.md `completed_plans` counter | 8 (4 Phase 1 + 4 Phase 2) | **6** — drifted (last_activity stops at Plan 02-03) | ⚠️ DOC LAG |
| REQUIREMENTS.md DATA-03 status | Complete | **Pending** (line 154); checkbox still `[ ]` (line 28) | ⚠️ DOC LAG |
| REQUIREMENTS.md DATA-01, DATA-02 status | Complete | both Complete (line 152-153) | ✓ PASS |

The two doc-lag items are bookkeeping; they do not affect the Phase 2 schema-and-seed contract or the readiness of Phase 3 to start.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| pgcrypto enabled (SC-1) | `psql ... -tAc "SELECT extname FROM pg_extension WHERE extname='pgcrypto'"` | `pgcrypto` | ✓ PASS |
| campaign_recipients schema (SC-2) | `psql ... -c "\d campaign_recipients"` | composite PK on (campaign_id, recipient_id); tracking_token uuid not null default gen_random_uuid(); both FKs ON UPDATE/DELETE CASCADE; UNIQUE constraint on tracking_token | ✓ PASS |
| ENUM definitions (SC-3) | pg_enum introspection | `enum_campaign_recipients_status:pending,sent,failed` + `enum_campaigns_status:draft,scheduled,sending,sent` | ✓ PASS |
| All 5 indexes present (SC-4) | `psql ... -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public'"` | All 5 expected indexes present (plus 4 PKs + SequelizeMeta_pkey) | ✓ PASS |
| Seed row counts (SC-5a) | `psql ... -tAc "SELECT count users || '/' || count recipients || '/' || count campaigns"` | `1/10/3` | ✓ PASS |
| Campaign status distribution (SC-5b) | `psql ... GROUP BY status ORDER BY status` | `draft:1`, `scheduled:1`, `sent:1` | ✓ PASS |
| Sent-campaign stats distribution (SC-5c) | `psql ... cr JOIN c WHERE status='sent' GROUP BY status, opened` | `sent:false:3`, `sent:true:1`, `failed:false:1` (= send_rate 80% / open_rate 25%) | ✓ PASS |
| bcrypt password hash regex (SC-5d) | `psql ... -tAc "SELECT password_hash ~ '^\$2[aby]\$' FROM users WHERE email='demo@example.com'"` | `t` | ✓ PASS |

All 8 spot-checks PASS. No SKIP, no FAIL.

---

## Anti-Patterns Found

None. All Phase 2 files reviewed:
- No TODO/FIXME/PLACEHOLDER comments in shipping code
- No empty handlers / `return null` stubs in models, migrations, or seeder
- No hardcoded empty data in production code paths (the seeder's empty-junction state for the draft campaign is intentional and documented per CAMP-02 spec)
- All migrations have functional up() and down() (pgcrypto down() is an explicit, documented no-op)
- All ENUM-creating migrations drop their type in down() (Pitfall 7 hygiene)

---

## Human Verification Required

None. All 5 ROADMAP success criteria + all 3 REQ-IDs verifiable via `psql` introspection (no UI, no real-time behavior, no external service). The orchestrator already ran the human-approved acceptance gate (Plan 02-04 Task 2) — this verification re-ran the same psql queries against the still-live, still-seeded DB and got identical results.

---

## Gaps Summary

**No blocking gaps.** Three minor observations (all doc-lag, none blocking Phase 3):

1. **REQUIREMENTS.md DATA-03** still shows `[ ]` and "Pending" despite implementation being complete — the seeder ships, and live SC-5 PASS confirms it works. Suggest tickbox + traceability flip during Phase 3 prelude.

2. **STATE.md `completed_plans: 6` / `percent: 60`** stops at Plan 02-03 — should be 8 / 80% after Plan 02-04. `last_activity` line and `stopped_at` block also need updating. ROADMAP.md is correctly current; STATE.md drifted.

3. **Live DB is homebrew Postgres, not docker-compose container** (both bound to :5432, homebrew shadows). Documented as known env quirk in Plan 02-03 deviations + Plan 02-04 SUMMARY. Phase 10 acceptance gate will run against the docker container in a clean volume — no impact on Phase 2 contract.

---

## Recommendation

**Close phase.** Phase 2 ships exactly what was promised. Phase 3 (Authentication) is unblocked — bcryptjs is installed, demo user exists at `demo@example.com` / `demo1234`, JWT secrets will be added by Phase 3 itself.

Optional cleanup pass before /gsd-plan-phase 3:
- Tick `[ ] DATA-03` → `[x]` in REQUIREMENTS.md line 28
- Update REQUIREMENTS.md line 154 traceability: `Pending` → `Complete (Plan 02-04)`
- Refresh STATE.md frontmatter: `completed_plans: 8`, `percent: 80`, `last_updated`, `stopped_at`, `last_activity`

These are bookkeeping-only and not part of the Phase 2 verification contract.

---

*Verified: 2026-04-21*
*Verifier: Claude (gsd-verifier)*
