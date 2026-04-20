---
phase: 2
slug: schema-migrations-seed
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract. Phase 2 is **pre-Vitest** (Phase 7 wires that up); validation here is deterministic shell + `psql` introspection covering DATA-01/02/03.

Every REQ-ID has an automated command the executor must run. The phase gate is the full `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed` round-trip exiting 0 plus a series of `psql` introspection queries with exact expected outputs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None yet — Vitest 2.1.9 pinned in root `resolutions` (Phase 1), installed in Phase 7 |
| **Config file** | N/A in Phase 2 |
| **Quick run command** | `yarn workspace @campaign/backend typecheck && yarn workspace @campaign/backend lint` |
| **Full suite command** | `yarn workspace @campaign/backend run db:migrate:undo:all && yarn workspace @campaign/backend run db:migrate && yarn workspace @campaign/backend run db:seed` (full round-trip) |
| **Estimated runtime** | ~10s (quick) / ~15–25s (full round-trip, local postgres) |

**Pre-req:** `docker compose up -d postgres` must have a healthy postgres container reachable at `DATABASE_URL`. Phase 2 adds the docker-compose.yml skeleton with postgres; Phase 10 extends.

---

## Sampling Rate

- **After every task commit:** `yarn workspace @campaign/backend typecheck && yarn workspace @campaign/backend lint` (under 10s)
- **After every plan wave:** Full round-trip `yarn db:migrate:undo:all && yarn db:migrate && yarn db:seed` + spot-check with at least one `psql` introspection query
- **Before `/gsd-verify-work`:** All introspection commands from the "Per-Task Verification Map" must pass against a clean re-migrated DB
- **Max feedback latency:** ~25s (full round-trip)

---

## Per-Task Verification Map

Task IDs are TBD until `gsd-planner` emits PLAN.md — this map shows the REQ-ID → verification-command mapping the planner must honor.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 02-A | 1 | DATA-02 (deps + infra) | V14 (config) | `.env.example` documents required vars; no hardcoded DATABASE_URL | smoke | `test -f docker-compose.yml && test -f .env.example && test -f backend/.env.example && grep -q "postgres" docker-compose.yml && grep -q "DATABASE_URL=" .env.example && cd backend && yarn install --immutable` exits 0 | ❌ W0 | ⬜ pending |
| TBD | 02-A | 1 | DATA-02 (deps) | V6 (crypto dep) | bcryptjs declared in backend deps at current version (seed user hash) | smoke | `grep -q '"bcryptjs"' backend/package.json && grep -q '"sequelize"' backend/package.json && grep -q '"pg"' backend/package.json && grep -q '"sequelize-cli"' backend/package.json` | ❌ W0 | ⬜ pending |
| TBD | 02-A | 1 | DATA-01 (config) | — | Sequelize CLI loads config via .sequelizerc → src/db/config.cjs | smoke | `test -f backend/.sequelizerc && test -f backend/src/db/config.cjs && grep -q "use_env_variable" backend/src/db/config.cjs && grep -q "DATABASE_URL" backend/src/db/config.cjs` | ❌ W0 | ⬜ pending |
| TBD | 02-B | 2 | DATA-01 (models) | V5 (enum integrity) | 4 model classes export from src/db/index.ts with correct ENUMs, underscored mapping, named-model through table | typecheck + runtime import | `yarn workspace @campaign/backend typecheck` exits 0 && `cd backend && yarn tsx -e "import('./src/db/index.ts').then(m => console.log(Object.keys(m).sort()))"` outputs `[ 'Campaign', 'CampaignRecipient', 'Recipient', 'User', 'sequelize' ]` | ❌ W0 | ⬜ pending |
| TBD | 02-B | 2 | DATA-01 (associations) | — | belongsToMany uses named CampaignRecipient model (not string), preserves access to `.status`, `.sent_at`, `.opened_at`, `.tracking_token` | typecheck | `yarn workspace @campaign/backend typecheck` exits 0 with a test-import line `CampaignRecipient.findByPk` existing | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (migration order) | V14 | pgcrypto migration runs FIRST; Users → Recipients → Campaigns → CampaignRecipients FK order | shell | `cd backend && yarn db:migrate:undo:all && yarn db:migrate` exits 0 && `ls src/migrations/*.cjs \| head -1` starts with `00000000000000-enable-pgcrypto` | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (pgcrypto) | V6 | pgcrypto extension enabled | psql | `psql "$DATABASE_URL" -tAc "SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'"` returns `1` | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (4-state enum) | V5, M4 | campaigns.status ENUM has exactly 4 labels in order; campaign_recipients.status has exactly 3 | psql | `psql "$DATABASE_URL" -tAc "SELECT t.typname \|\| ':' \|\| array_to_string(array_agg(e.enumlabel ORDER BY e.enumsortorder), ',') FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'enum_%' GROUP BY 1 ORDER BY 1"` outputs exactly `enum_campaign_recipients_status:pending,sent,failed` and `enum_campaigns_status:draft,scheduled,sending,sent` | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (tracking_token) | C17 | tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid() | psql | `psql "$DATABASE_URL" -c "\\d campaign_recipients"` output contains `tracking_token` + `uuid` + `not null` + `gen_random_uuid()` on the same column; UNIQUE index exists | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (composite PK) | — | campaign_recipients PRIMARY KEY is composite (campaign_id, recipient_id) | psql | `psql "$DATABASE_URL" -tAc "SELECT attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) JOIN pg_class c ON c.oid=i.indrelid WHERE i.indisprimary AND c.relname='campaign_recipients' ORDER BY array_position(i.indkey::int[], a.attnum)"` outputs exactly `campaign_id` then `recipient_id` | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (FK cascade) | M1 | campaign_recipients.campaign_id ON DELETE CASCADE; recipient_id ON DELETE CASCADE | psql | `psql "$DATABASE_URL" -c "\\d campaign_recipients"` output contains two lines with `ON UPDATE CASCADE ON DELETE CASCADE` (one for each FK) | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (indexes) | C8 | All documented indexes present: `(created_by, created_at DESC, id DESC)` on campaigns, `(campaign_id, status)` on campaign_recipients, UNIQUE tracking_token, UNIQUE users.email, UNIQUE recipients.email | psql | `psql "$DATABASE_URL" -tAc "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname"` output contains `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, `campaign_recipients_tracking_token_key`, `users_email_key`, `recipients_email_key` | ❌ W0 | ⬜ pending |
| TBD | 02-C | 3 | DATA-02 (round-trip) | — | Down + up round-trip works (`db:migrate:undo:all` then `db:migrate` both exit 0) with all ENUM types dropped in `down()` so re-up doesn't fail with "type already exists" | shell | `cd backend && yarn db:migrate:undo:all && yarn db:migrate && yarn db:migrate:undo:all && yarn db:migrate` — all four commands exit 0 sequentially | ❌ W0 | ⬜ pending |
| TBD | 02-D | 4 | DATA-03 (seed runs) | — | Seed inserts 1 user, 10 recipients, 3 campaigns; idempotent down | shell | `cd backend && yarn db:seed` exits 0 | ❌ W0 | ⬜ pending |
| TBD | 02-D | 4 | DATA-03 (row counts) | — | Exactly 1 user + 10 recipients + 3 campaigns after seed | psql | `psql "$DATABASE_URL" -tAc "SELECT (SELECT count(*) FROM users) \|\| '/' \|\| (SELECT count(*) FROM recipients) \|\| '/' \|\| (SELECT count(*) FROM campaigns)"` returns `1/10/3` | ❌ W0 | ⬜ pending |
| TBD | 02-D | 4 | DATA-03 (statuses) | — | Campaigns in draft, scheduled, sent | psql | `psql "$DATABASE_URL" -tAc "SELECT status \|\| ':' \|\| count(*) FROM campaigns GROUP BY status ORDER BY status"` outputs exactly `draft:1`, `scheduled:1`, `sent:1` (three lines) | ❌ W0 | ⬜ pending |
| TBD | 02-D | 4 | DATA-03 (meaningful stats) | — | Sent campaign has 4 sent (1 opened) + 1 failed recipient — yields demoable send_rate=80%, open_rate=25% | psql | `psql "$DATABASE_URL" -tAc "SELECT cr.status \|\| ':' \|\| (cr.opened_at IS NOT NULL)::text \|\| ':' \|\| count(*) FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id WHERE c.status='sent' GROUP BY 1 ORDER BY 1"` outputs exactly `failed:false:1`, `sent:false:3`, `sent:true:1` | ❌ W0 | ⬜ pending |
| TBD | 02-D | 4 | DATA-03 (password hash) | V6 | Demo user password stored as bcrypt hash ($2a$/$2b$/$2y$ prefix) | psql | `psql "$DATABASE_URL" -tAc "SELECT password_hash ~ '^\\\$2[aby]\\\$' FROM users WHERE email='demo@example.com'"` returns `t` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 2 is a schema phase — all Wave 0 items are file creation. No test-framework install (Phase 7).

- [ ] Root `docker-compose.yml` — postgres:16-alpine service with healthcheck + volume + env; Phase 10 extends with redis + api + web
- [ ] Root `.env.example` — `DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns`, `POSTGRES_USER/PASSWORD/DB` for compose
- [ ] `backend/.env.example` — backend-scoped copy of DATABASE_URL and related
- [ ] `backend/.sequelizerc` — CJS config mapping to `src/db/config.cjs`, `src/models`, `src/migrations`, `src/seeders`
- [ ] `backend/src/db/config.cjs` — env-aware Sequelize config (development/test/production) reading `DATABASE_URL` via `use_env_variable`
- [ ] `backend/src/db/index.ts` — runtime Sequelize instance + model barrel
- [ ] `backend/src/models/user.ts`, `recipient.ts`, `campaign.ts`, `campaignRecipient.ts`
- [ ] `backend/src/migrations/00000000000000-enable-pgcrypto.cjs`
- [ ] `backend/src/migrations/20260101000001-create-users.cjs`
- [ ] `backend/src/migrations/20260101000002-create-recipients.cjs`
- [ ] `backend/src/migrations/20260101000003-create-campaigns.cjs`
- [ ] `backend/src/migrations/20260101000004-create-campaign-recipients.cjs`
- [ ] `backend/src/migrations/20260101000005-create-indexes.cjs`
- [ ] `backend/src/seeders/20260101000000-demo-data.cjs`
- [ ] `backend/package.json` — add deps (sequelize, pg, pg-hstore, sequelize-cli, dotenv, bcryptjs) and scripts (db:migrate, db:migrate:undo[:all], db:seed[:undo], db:reset)
- [ ] `backend/tsconfig.json` — exclude `src/migrations/**/*.cjs` and `src/seeders/**/*.cjs` from typecheck

*No Vitest tests in Phase 2 — that's Phase 7.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `docker compose up -d postgres` produces a healthy container | DATA-02 (infra) | Healthcheck visibility + reviewer experience — verifying via automated polling adds brittleness | Run `docker compose up -d postgres && sleep 5 && docker compose ps postgres` — `STATE` should be `running (healthy)` |
| `\d campaigns` output is visually clean and matches spec (column types, NOT NULLs, defaults) | DATA-02 | Visual review catches off-by-one column typos that greps miss; cost-benefit doesn't justify full column-type grep matrix | Run `psql "$DATABASE_URL" -c "\\d campaigns"` and visually confirm: id BIGSERIAL PRIMARY KEY; name VARCHAR NOT NULL; subject VARCHAR NOT NULL; body TEXT NOT NULL; status enum_campaigns_status NOT NULL DEFAULT 'draft'::enum_campaigns_status; scheduled_at TIMESTAMPTZ (nullable); created_by BIGINT NOT NULL; created_at/updated_at TIMESTAMPTZ NOT NULL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s (full round-trip)
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills task IDs

**Approval:** pending (set to `approved YYYY-MM-DD` after planner fills Task IDs)
