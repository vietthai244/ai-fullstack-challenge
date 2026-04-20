---
phase: 02-schema-migrations-seed
plan: 04
subsystem: backend
tags: [seed, bcrypt, pgcrypto, demo-data, phase-gate, sequelize-cli]

requires:
  - phase: 02-schema-migrations-seed
    provides: "Plan 02-03: 6 migrations applied, schema in place; Plan 02-02: models loadable; Plan 02-01: bcryptjs + sequelize-cli installed; src/db/config.cjs reads DATABASE_URL"
provides:
  - "backend/src/seeders/20260101000000-demo-data.cjs — idempotent demo seed: 1 user (bcrypt-hashed 'demo1234'), 10 recipients, 3 campaigns covering all 4 states (draft / scheduled / sent — sending state lives in Phase 5 worker)"
  - "Sent campaign with 4 sent + 1 failed recipient + 1 opened — produces meaningful demo stats (send_rate 80%, open_rate 25%)"
  - "db:seed + db:seed:undo + db:reset (extended) yarn scripts in backend/package.json"
  - "Phase 2 acceptance gate evidence — all 5 ROADMAP SC verified live against running postgres"
affects: [phase-03 (auth — demo user 'demo@example.com' / 'demo1234' is the canonical login), phase-04 (campaigns API — 3 demo campaigns exercise list + detail), phase-08 (frontend — demo login lands the user with seeded data)]

tech-stack:
  added: []
  patterns:
    - "Idempotent seed down() — bulkDelete by stable identifier (email, name) + raw SQL DELETE on junction. Never TRUNCATE."
    - "Seeder queries back inserted IDs (SELECT id FROM users WHERE email=...) for FK references — Sequelize 6 bulkInsert doesn't return IDs reliably across all dialect adapters"
    - "tracking_token omitted from seeder bulkInsert — relies on DB-side `DEFAULT gen_random_uuid()` to fire (verifies the pgcrypto + UUID default chain end-to-end)"
    - "Demo data shaped to exercise stats math: 1 sent campaign with 4 sent + 1 failed (send_rate=80%) + 1 opened of the sent (open_rate=25% per spec — opened/sent, NOT opened/total)"

key-files:
  created:
    - backend/src/seeders/20260101000000-demo-data.cjs
  modified:
    - backend/package.json (added db:seed + db:seed:undo scripts; extended db:reset to include seed)

key-decisions:
  - "Idempotent down() uses stable identifiers (email for users + recipients, name for campaigns) — `bulkDelete('campaigns', {}, {})` would nuke ALL campaigns including future test data, so we explicitly match the demo names"
  - "tracking_token NOT included in the seeder bulkInsert — relies on the DB-side `DEFAULT gen_random_uuid()` to fire. This verifies the pgcrypto + UUID default chain works end-to-end against real INSERTs (not just the migration DDL). Alternative (provide tracking_token explicitly in seed) would silently mask a broken default."
  - "bcrypt cost=10 — the standard. Hash for 'demo1234' verified against `^\\$2[aby]\\$` regex."
  - "Sent campaign timestamps offset into the past (yesterday for scheduled_at, ~hours ago for sent_at, ~minute ago for opened_at) — stats look 'realistic' to the reviewer rather than all-now timestamps."
  - "Plan 02-04 task 2 (acceptance gate) was a `checkpoint:human-verify` — orchestrator ran the full reset + 5-SC verification live and presented results to the human. Approved, phase closed."

patterns-established:
  - "Sequelize 6 raw query for ID retrieval after bulkInsert — `const [[row]] = await queryInterface.sequelize.query('SELECT id FROM ... LIMIT 1');`"
  - "Idempotent seeder down() — match by stable identifier; junction rows handled via FK CASCADE on parent delete"
  - "Demo data shaped to be stats-meaningful (not all zeros, not all 100%)"

requirements-completed: [DATA-03]

duration: ~12 min (Task 1 from agent + Task 2 acceptance gate from orchestrator)
completed: 2026-04-21
---

# Phase 2, Plan 04: Demo Seed + Phase 2 Acceptance Gate Summary

**Phase 2 closes. Schema is provisioned end-to-end: pgcrypto + 4 ENUM-using tables + tracking_token UUIDs + composite PK + FK CASCADEs + 5 indexes. Demo seed gives the reviewer a logged-in marketer with 3 campaigns showing every state and meaningful stats (send_rate 80%, open_rate 25%) before Phase 3 even ships auth.**

## Performance

- **Duration:** ~12 min total (Task 1 from agent: ~6 min; Task 2 acceptance gate from orchestrator: ~6 min after recovering from a shell-init quirk)
- **Tasks:** 2/2 (Task 1 = agent; Task 2 = orchestrator-driven checkpoint)
- **Files created:** 1 seeder; modified: 1 package.json (3 script additions/edits)

## Accomplishments

- Demo seed runs cleanly: `yarn db:seed` exits 0 → 1 user, 10 recipients, 3 campaigns, mixed-status junction rows.
- All 5 ROADMAP Phase 2 success criteria verified LIVE against postgres (not just statically reasoned about):
  - **SC-1** (round-trip migrate works + pgcrypto first): `pg_extension` returns `pgcrypto`; `db:reset` runs end-to-end.
  - **SC-2** (tracking_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid + composite PK + FK CASCADE on both FKs): `\d campaign_recipients` confirms.
  - **SC-3** (4-state + 3-state ENUMs DB-enforced): `pg_enum` query confirms exact label lists.
  - **SC-4** (all 5 indexes present): `pg_indexes` query confirms `idx_campaigns_created_by_created_at_id`, `idx_campaign_recipients_campaign_id_status`, plus 3 auto-unique indexes (tracking_token, users.email, recipients.email).
  - **SC-5** (seed produces 1/10/3 + bcrypt + meaningful stats): demo user password hash matches `^\$2[aby]\$`; sent-campaign distribution `sent:false:3 + sent:true:1 + failed:false:1` produces send_rate 80%, open_rate 25%.

## Task Commits

1. **Task 1: Demo data seeder + db:seed scripts** — `dc41145` (feat) — added `backend/src/seeders/20260101000000-demo-data.cjs` + 3 yarn scripts (db:seed, db:seed:undo, db:reset extended to include seed)
2. **Task 2: Phase 2 acceptance gate** — orchestrator-driven checkpoint:
   - Ran `db:migrate:undo:all` → `db:migrate` → `db:seed:all` from a clean state
   - Ran 6 psql introspection queries covering all 5 SC
   - Presented results to human; approval received
   - This SUMMARY + STATE/ROADMAP updates are the commit artifact

## Files Created

- `backend/src/seeders/20260101000000-demo-data.cjs` (~290 lines) — demo user + 10 recipients + 3 campaigns + 8 junction rows. Exhaustive bulkInsert calls. Idempotent down() via stable-key bulkDelete + raw SQL for junction.

## Files Modified

- `backend/package.json` — added `"db:seed": "sequelize db:seed:all"`, `"db:seed:undo": "sequelize db:seed:undo:all"`, extended `"db:reset"` to chain `&& yarn db:seed`

## Deviations

1. **Agent overload during Task 2** — Task 1 (seeder + scripts) committed cleanly from the agent. Task 2 (the human-verify checkpoint) wasn't started before agent overloaded. Recovery: orchestrator ran the full reset + 5-SC verification directly (the same commands the agent would have run), presented results to the human, approval received. No code or design deviation; just an orchestration follow-up.
2. **Shell-init `GVM_ROOT` quirk** — running yarn from a `cd`'d subshell tripped a gvm `cd` hook (not set in subshell env). Workaround: prefix sequelize-cli invocations with `GVM_ROOT=/Users/thalos/.gvm` or invoke `node /path/to/sequelize-cli/lib/sequelize` from repo root (no `cd` needed). Documented in STATE.md decisions. NOT a project issue; a developer-machine env quirk.

## Phase 2 Closing State

| Plan | REQ | Outcome |
|------|-----|---------|
| 02-01 | DATA-02 (infra) | docker-compose.yml + .env.example × 2 + sequelize-cli config + 6 backend deps |
| 02-02 | DATA-01 | 4 TS models + src/db/index.ts barrel; runtime smoke test PASS |
| 02-03 | DATA-02 | 6 .cjs migrations in dependency order; 4 db:* scripts; round-trip gate PASS |
| 02-04 | DATA-03 | demo seeder; db:seed scripts; Phase 2 acceptance gate PASS |

**Phase 2 closes:** schema and seed are production-shaped. Phase 3 (Authentication) is unblocked — bcryptjs is in deps, demo user exists, JWT_*_SECRET env vars will be added to .env.example by Phase 3 itself.

## Postgres Status

The seeded DB is **live** at `postgres://campaign:campaign@localhost:5432/campaigns` (homebrew postgres on host port 5432). The Plan 02-01 docker-compose postgres container is also running but on the same port — homebrew-pg is what's actually serving connections (this is the env quirk noted in Plan 02-03's deviations). Phase 10 will resolve cleanly: docker-compose's postgres + redis + api + web all live in their own network and bind only the web port to the host.

## Next Phase

Phase 3 — Authentication (split-token JWT + Redis denylist). Run `/gsd-plan-phase 3`.
