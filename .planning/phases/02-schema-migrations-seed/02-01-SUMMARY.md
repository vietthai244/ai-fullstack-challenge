---
phase: 02-schema-migrations-seed
plan: 01
subsystem: backend
tags: [docker, postgres, sequelize-cli, dotenv, bcryptjs, infra]

requires:
  - phase: 01-monorepo-foundation-shared-schemas
    provides: "Yarn 4 monorepo with @campaign/backend workspace, root tsconfig.base, ESLint flat config, pino logger module"
provides:
  - "docker-compose.yml at repo root — postgres-only service (Phase 10 extends with redis + api + web)"
  - ".env.example at repo root + backend/.env.example documenting DATABASE_URL + POSTGRES_USER/PASSWORD/DB"
  - "Sequelize CLI configuration (.sequelizerc + src/db/config.cjs) ready to discover migrations + seeders + models"
  - "Backend deps: sequelize, pg, pg-hstore@2.3.4, bcryptjs@3.0.3, dotenv; sequelize-cli devDep"
  - "tsconfig.json + eslint.config excludes for .cjs migrations + seeders so they don't break typecheck/lint"
affects: [phase-02 02-02 (models), 02-03 (migrations), 02-04 (seed); phase-03 (auth — bcryptjs + DATABASE_URL ready); phase-10 (compose extension)]

tech-stack:
  added: [sequelize@^6.37.8, pg@^8.20.0, pg-hstore@^2.3.4, bcryptjs@^3.0.3, dotenv@^17.4.2, sequelize-cli@^6.6.5 (dev)]
  patterns:
    - "Sequelize CLI config in .sequelizerc → src/db/config.cjs (CJS mandatory because sequelize-cli uses require)"
    - "Env-aware Sequelize config: use_env_variable: 'DATABASE_URL' (no hardcoding, V14 mitigation)"
    - "tsconfig + eslint excludes for src/migrations/** and src/seeders/** so .cjs files don't trip TS/ESLint rules"

key-files:
  created:
    - docker-compose.yml
    - .env.example
    - backend/.env.example
    - backend/.sequelizerc
    - backend/src/db/config.cjs
  modified:
    - backend/package.json (added 5 prod deps + 1 dev dep)
    - backend/tsconfig.json (added exclude entries)
    - eslint.config.mjs (added .cjs / migrations / seeders ignores — fix commit)
    - yarn.lock (regenerated from new deps)

key-decisions:
  - "docker-compose.yml at repo root in Phase 2 (not Phase 10) because Phase 2 needs postgres reachable for Plans 02-03/04 acceptance gates. Phase 10 extends the same file with redis + api + web."
  - "pg-hstore pinned to ^2.3.4 (NOT the ^2.4.3 listed in early STACK.md — that version doesn't exist on npm)."
  - "bcryptjs upgraded to ^3.0.3 (was ^2.4.3 in STACK.md). v3 is ESM-native, identical API, 9 years newer."
  - "config.cjs uses use_env_variable: 'DATABASE_URL' (sequelize-cli special key) — never hardcoded. .env.example documents required vars; .env is gitignored (Phase 1)."
  - "Test environment uses DATABASE_URL_TEST (deferred to Phase 7 when Vitest lands) so test runs never touch dev DB."
  - "tsconfig + eslint excludes: src/migrations/**, src/seeders/**, src/db/config.cjs — these are .cjs and shouldn't be typechecked or linted as TS."

patterns-established:
  - "Sequelize CLI config layering: .sequelizerc maps everything to src/db/config.cjs which exports development/test/production configs"
  - "Env-driven DATABASE_URL pattern (sequelize-cli's use_env_variable) — same URL string usable by Sequelize CLI AND runtime models in src/db/index.ts"
  - "Phase-2-then-Phase-10 docker-compose extension (rather than two separate compose files)"

requirements-completed: [DATA-02-infra]

duration: ~9 min
completed: 2026-04-21
---

# Phase 2, Plan 01: Infra + Deps + Sequelize CLI Config Summary

**Backend is now Sequelize-aware: docker-compose can stand up postgres, dependencies install cleanly with the correct versions, and the CLI knows where to look for migrations/seeders/models — without breaking the existing typecheck/lint pipeline.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 3/3 + 1 follow-up fix commit
- **Files created:** 5; modified: 4

## Accomplishments

- `docker compose up -d postgres` will work (once Docker daemon is running) — healthcheck via `pg_isready`, persistent volume `pgdata`, port 5432 bound to host. Phase 10 will extend with redis + api + web in the same file.
- `yarn workspace @campaign/backend typecheck` and root `yarn lint` still exit 0 — the new .cjs files (sequelize-cli config + future migrations/seeders) are excluded from TS + ESLint scopes so they don't break existing checks.
- yarn.lock cleanly captures the 6 new deps (5 prod + 1 dev) — no PnP regressions, no version drift.
- Sequelize CLI is wired and discoverable via `yarn workspace @campaign/backend sequelize --version` (the CLI binary is in node_modules from sequelize-cli devDep).

## Task Commits

1. **Task 1: docker-compose + .env templates** — `2d0b88e` (feat) — `docker-compose.yml` (postgres-only) + `.env.example` (root) + `backend/.env.example`
2. **Task 2: Backend Sequelize/pg/bcryptjs/dotenv deps** — `bf6aa74` (feat) — added 5 prod deps + 1 dev dep, ran `yarn install`, committed updated `yarn.lock`
3. **Task 3: sequelize-cli config + tsconfig excludes** — `a3d8a53` (feat) — `.sequelizerc`, `src/db/config.cjs` (env-aware development/test/production), `backend/tsconfig.json` exclude entries
4. **Follow-up fix: ESLint exclude .cjs + migrations/seeders** — `4110258` (fix) — extended `eslint.config.mjs` ignores so `yarn lint` cleanly ignores the new file types

## Files Created

- `docker-compose.yml` — postgres:16-alpine, healthcheck, volume, port mapping
- `.env.example` — DATABASE_URL + POSTGRES_USER/PASSWORD/DB + NODE_ENV/LOG_LEVEL stubs
- `backend/.env.example` — backend-scoped copy
- `backend/.sequelizerc` — CJS, maps config/models-path/migrations-path/seeders-path
- `backend/src/db/config.cjs` — environment-aware Sequelize config; `use_env_variable: 'DATABASE_URL'` (V14 mitigation: no hardcoded URLs)

## Files Modified

- `backend/package.json` — added sequelize/pg/pg-hstore@2.3.4/bcryptjs@3.0.3/dotenv prod deps; sequelize-cli@6.6.5 devDep
- `backend/tsconfig.json` — `exclude: ["src/migrations/**", "src/seeders/**", "src/db/config.cjs"]` so .cjs files are out of TS scope
- `eslint.config.mjs` — added .cjs + migrations + seeders to ignore list (fix commit)
- `yarn.lock` — regenerated from `yarn install` (NOT --immutable, since new deps were added)

## Deviations

1. **bcryptjs version bumped to ^3.0.3** (research recommended) instead of STACK.md's stale ^2.4.3 — v3 is ESM-native with identical API, 9 years newer. Documented in Plan 02-RESEARCH.md.
2. **pg-hstore version corrected to ^2.3.4** — STACK.md's ^2.4.3 was a typo / non-existent version on npm.
3. **dotenv version is ^17.4.2** (current latest, was unspecified in STACK.md) — Yarn picked the latest stable.
4. **ESLint follow-up commit needed** because the original ESLint flat config from Phase 1 didn't ignore .cjs files; lint started failing on the new sequelize-cli config + future migrations/seeders. Resolution: small Task-level fix commit added migrations/, seeders/, and *.cjs to the ignores. Documented in this SUMMARY rather than re-running the planner.

## Phase 2 Progress

Plan 02-01 completes the infra + config layer of Phase 2. Plan 02-02 (Sequelize models — DATA-01) is unblocked. The remaining 3 plans are sequential:
- Plan 02-02: Sequelize models (next)
- Plan 02-03: Migrations (depends on 02-02 — model ENUM + tracking_token shapes inform migration column definitions)
- Plan 02-04: Demo seed + Phase 2 acceptance gate (depends on 02-03 — seed inserts into the migrated schema)

## Handoff to Plan 02-02

- `src/db/config.cjs` exposes development/test/production configs reading DATABASE_URL from env. Plan 02-02's `src/db/index.ts` uses the SAME DATABASE_URL via `new Sequelize(process.env.DATABASE_URL, { ... })` for runtime — same connection contract.
- `bcryptjs` is in deps for Plan 02-04's seed (demo user password hash).
- `tsconfig.json` excludes are in place — Plan 02-02 writes models as `.ts` (typechecked); Plans 02-03/04 write migrations + seeders as `.cjs` (excluded from typecheck).

## Manual Step Required Before Plan 02-03

`docker compose up -d postgres` (Plan 02-03's migration round-trip needs a running postgres). Docker Desktop is starting in the background — should be ready by the time Plan 02-03 needs it.
