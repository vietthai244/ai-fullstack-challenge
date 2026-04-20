---
phase: 02-schema-migrations-seed
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docker-compose.yml
  - .env.example
  - backend/.env.example
  - backend/package.json
  - backend/.sequelizerc
  - backend/src/db/config.cjs
  - backend/tsconfig.json
autonomous: true
requirements:
  - DATA-02
requirements_addressed:
  - DATA-02
tags:
  - backend
  - infra
  - sequelize
  - docker
  - config

must_haves:
  truths:
    - "`docker-compose.yml` exists at repo root declaring a single `postgres` service using `postgres:16-alpine` with healthcheck + named volume `pgdata`"
    - "Root `.env.example` documents `DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns` + `POSTGRES_USER/PASSWORD/DB` + `NODE_ENV=development` + `LOG_LEVEL=debug`"
    - "`backend/.env.example` documents `DATABASE_URL` for workspace-scoped use"
    - "`backend/package.json` declares `sequelize@^6.37.8`, `pg@^8.20.0`, `pg-hstore@^2.3.4`, `bcryptjs@^3.0.3`, `dotenv@^17.4.2` as deps and `sequelize-cli@^6.6.5` as devDep — NOT pg-hstore@^2.4.3 (doesn't exist on npm)"
    - "`backend/.sequelizerc` exports absolute paths to `src/db/config.cjs`, `src/models`, `src/migrations`, `src/seeders` via `path.resolve(__dirname, ...)`"
    - "`backend/src/db/config.cjs` loads dotenv, exports `{ development, test, production }` each using `use_env_variable: 'DATABASE_URL'` (test uses `DATABASE_URL_TEST`), `dialect: 'postgres'`, `define: { underscored: true, timestamps: true }`"
    - "`backend/tsconfig.json` has `include: ['src/**/*.ts']` and `exclude: ['src/migrations/**', 'src/seeders/**', 'src/db/config.cjs']` — migrations/seeders invisible to tsc"
    - "`yarn install --immutable` from repo root succeeds and produces `backend/node_modules/.bin/sequelize` binary"
    - "`yarn workspace @campaign/backend typecheck` still exits 0 (Phase 1 entry point + tsconfig changes don't regress)"
    - "`docker compose config` parses the compose file without error"
  artifacts:
    - path: "docker-compose.yml"
      provides: "Root compose file — postgres-only skeleton (Phase 10 extends with redis+api+web)"
      contains: "postgres:16-alpine"
      min_lines: 15
    - path: ".env.example"
      provides: "Root env template documenting DATABASE_URL + compose POSTGRES_* + NODE_ENV + LOG_LEVEL"
      contains: "DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns"
      min_lines: 5
    - path: "backend/.env.example"
      provides: "Backend workspace env template — DATABASE_URL"
      contains: "DATABASE_URL="
      min_lines: 3
    - path: "backend/package.json"
      provides: "Adds sequelize+pg+pg-hstore+bcryptjs+dotenv deps, sequelize-cli devDep"
      contains: "\"sequelize\""
    - path: "backend/.sequelizerc"
      provides: "CJS path resolver for sequelize-cli — points to config.cjs + models + migrations + seeders"
      contains: "path.resolve"
      min_lines: 8
    - path: "backend/src/db/config.cjs"
      provides: "Env-aware Sequelize CLI config — dev/test/prod, use_env_variable: DATABASE_URL"
      contains: "use_env_variable"
      min_lines: 20
    - path: "backend/tsconfig.json"
      provides: "Updated to exclude CJS migrations/seeders from typecheck"
      contains: "src/migrations"
  key_links:
    - from: "backend/.sequelizerc"
      to: "backend/src/db/config.cjs"
      via: "config: path.resolve(__dirname, 'src', 'db', 'config.cjs')"
      pattern: "config.cjs"
    - from: "backend/src/db/config.cjs"
      to: "process.env.DATABASE_URL"
      via: "use_env_variable: 'DATABASE_URL'"
      pattern: "use_env_variable"
    - from: "docker-compose.yml"
      to: "postgres:16-alpine"
      via: "image: postgres:16-alpine"
      pattern: "postgres:16-alpine"
---

<objective>
Lay the Phase 2 infrastructure and tooling foundation: a root `docker-compose.yml` with a postgres service (Phase 10 extends), root + backend `.env.example` files documenting `DATABASE_URL`, new backend runtime dependencies (`sequelize`, `pg`, `pg-hstore@2.3.4`, `bcryptjs@3.0.3`, `dotenv`) and dev dependency (`sequelize-cli`), a Sequelize CLI path resolver (`backend/.sequelizerc`), an env-aware CJS CLI config (`backend/src/db/config.cjs`), and an update to `backend/tsconfig.json` that excludes CJS migrations/seeders from typecheck.

Purpose: Every downstream task in Phase 2 (models, migrations, seed) depends on the CLI knowing where to read its config and the workspace having runtime access to Sequelize + pg. Phase 10 extends the compose file with redis + api + web; Phase 2 just needs postgres for `yarn db:migrate`.

Output: A backend workspace that `yarn install --immutable` completes cleanly on, exposes a `sequelize` binary in `backend/node_modules/.bin/`, and a repo-root postgres container recipe that reviewers / developers spin up with `docker compose up -d postgres`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/02-schema-migrations-seed/02-RESEARCH.md
@.planning/phases/02-schema-migrations-seed/02-VALIDATION.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-02-SUMMARY.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-04-SUMMARY.md
@CLAUDE.md

<interfaces>
<!-- Existing Phase 1 artifacts consumed here: -->

`backend/package.json` (BEFORE — current state from Phase 1):
```json
{
  "name": "@campaign/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "echo 'backend build deferred to Phase 10' && exit 0",
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "echo 'backend tests land in Phase 7' && exit 0"
  },
  "dependencies": {
    "@campaign/shared": "workspace:*",
    "pino": "^10.3.1",
    "pino-http": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "pino-pretty": "^13.1.3",
    "tsx": "^4.21.0",
    "typescript": "^5.8.3"
  }
}
```

`backend/tsconfig.json` (BEFORE):
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["ES2022"],
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

Yarn 4 workspace discipline (from Phase 1):
- Use `yarn workspace @campaign/backend add <pkg>@<range>` from repo root (not `cd backend && yarn add`) — matches monorepo hygiene established in Plan 01-02.
- `nodeLinker: node-modules` is set in `.yarnrc.yml` — deps are hoisted; `backend/node_modules/.bin/sequelize` is the binary that `db:*` scripts (added in Plan 02-03) will call.
- `"type": "module"` on `backend/package.json` means any `.js` under `backend/src/` is ESM. Files Sequelize CLI loads (`src/db/config.cjs`, migrations, seeders) MUST be `.cjs` to force CJS interpretation (C-Pitfall-6 in 02-RESEARCH.md §Common Pitfalls).
- `.sequelizerc` itself has no extension but its content IS CJS — sequelize-cli's loader uses `require()` internally. If issues arise at run-time in a later plan, rename to `.sequelizerc.cjs`. Research Assumption A2 calls this out.

Phase 1 guardrails still in force:
- `.gitignore` already excludes `.env`, `.env.local`, `.env.*.local` (Plan 01-01).
- `.prettierignore` already excludes `.planning` and `.docs` (Plan 01-02).
- Yarn 4 corepack shim lives at `/usr/local/bin/yarn@4.14.1`; if developer PATH has homebrew classic yarn, use the absolute path.

Phase 2 version pins (npm-verified in 02-RESEARCH.md on 2026-04-20):
- `sequelize@^6.37.8`
- `pg@^8.20.0`
- `pg-hstore@^2.3.4`  ← NOT 2.4.3; STACK.md has a typo
- `bcryptjs@^3.0.3`   ← upgrade from STACK.md pin of 2.4.3; ESM-native, ships types
- `dotenv@^17.4.2`
- `sequelize-cli@^6.6.5`
- Do NOT install `@types/bcryptjs` — bcryptjs 3.x ships types

Locked decisions embedded in 02-RESEARCH.md §User Constraints that this plan honors:
- Sequelize 6 + Sequelize CLI + `pg` driver (not Prisma/Drizzle/TypeORM)
- `.cjs` extension for every file CLI loads
- `underscored: true` + `timestamps: true` as define-level defaults
- pgcrypto extension is NOT enabled here — that's migration `00000000000000-enable-pgcrypto.cjs` in Plan 02-03
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create docker-compose.yml + root + backend .env.example</name>
  <files>docker-compose.yml, .env.example, backend/.env.example</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 9 (docker-compose.yml Phase 2 skeleton) — copy the compose YAML verbatim
    - `02-RESEARCH.md` §Pattern 9 (.env.example section immediately after the compose block) — copy the env template verbatim
    - `02-VALIDATION.md` Per-Task Verification Map row "Plan 02-A Wave 1 DATA-02 (deps + infra)" — automated command is the grep+test sequence
    - `.gitignore` (root) — confirm `.env`, `.env.local` already present; do NOT add another entry
    - CLAUDE.md — confirms full docker stack is Phase 10; Phase 2 adds only postgres
  </read_first>
  <action>
    Create **`docker-compose.yml`** at the repo root with EXACTLY this content (copied verbatim from 02-RESEARCH.md §Pattern 9):

    ```yaml
    # docker-compose.yml (repo root)
    # Phase 2: postgres only. Phase 10 extends with redis + api + web.
    services:
      postgres:
        image: postgres:16-alpine
        environment:
          POSTGRES_USER: campaign
          POSTGRES_PASSWORD: campaign
          POSTGRES_DB: campaigns
        ports:
          - "5432:5432"
        healthcheck:
          test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
          interval: 5s
          timeout: 5s
          retries: 10
        volumes:
          - pgdata:/var/lib/postgresql/data

    volumes:
      pgdata:
    ```

    Notes on the literal content:
    - No top-level `version:` key — Compose v2 warns on it.
    - The `$$` in the healthcheck is intentional (Compose interpolation escape so the shell sees `$POSTGRES_USER`).
    - Named volume `pgdata` persists across `docker compose down`; use `docker compose down -v` to wipe.

    Create **`.env.example`** at the repo root with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 9 env block, extended with POSTGRES_* for compose):

    ```bash
    # .env.example (repo root)
    # Phase 2: database only. Phase 3 adds JWT_*_SECRET; Phase 5 adds REDIS_URL.

    # PostgreSQL connection URL used by backend (Sequelize CLI + runtime)
    DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns

    # docker-compose postgres service credentials (must match DATABASE_URL above)
    POSTGRES_USER=campaign
    POSTGRES_PASSWORD=campaign
    POSTGRES_DB=campaigns

    # Backend runtime env
    NODE_ENV=development
    LOG_LEVEL=debug
    ```

    Create **`backend/.env.example`** (workspace-scoped copy — sequelize-cli can read from either location via `dotenv`):

    ```bash
    # backend/.env.example
    # Copy to backend/.env locally; do NOT commit .env (gitignored).
    # Phase 2: database only. Phase 3 adds JWT_*_SECRET; Phase 5 adds REDIS_URL; Phase 7 adds DATABASE_URL_TEST.

    DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns
    NODE_ENV=development
    LOG_LEVEL=debug
    ```

    Do NOT create a `.env` file — that's developer-local and gitignored.
    Do NOT modify `.gitignore` — Phase 1 already has `.env`, `.env.local`, `.env.*.local`.
  </action>
  <verify>
    <automated>test -f docker-compose.yml && test -f .env.example && test -f backend/.env.example && grep -q "postgres:16-alpine" docker-compose.yml && grep -q "pg_isready" docker-compose.yml && grep -q "DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns" .env.example && grep -q "DATABASE_URL=" backend/.env.example && grep -q "POSTGRES_USER=campaign" .env.example && (command -v docker >/dev/null && docker compose config >/dev/null 2>&1 || echo "docker unavailable — compose syntax not checked")</automated>
  </verify>
  <acceptance_criteria>
    - `docker-compose.yml` exists at repo root, contains `postgres:16-alpine`, contains `pg_isready` in the healthcheck, declares the `pgdata` named volume
    - `.env.example` at root contains the literal line `DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns` AND `POSTGRES_USER=campaign` AND `NODE_ENV=development`
    - `backend/.env.example` contains `DATABASE_URL=` (may be the same postgres URL)
    - If `docker` CLI is available on the executor's machine, `docker compose config` exits 0 (compose file is valid YAML + schema)
    - `.env` file NOT created (gitignored + shouldn't exist)
  </acceptance_criteria>
  <done>docker-compose.yml + .env.example (root) + backend/.env.example committed; `docker compose config` parses cleanly if docker is installed; grep gates above all pass.</done>
</task>

<task type="auto">
  <name>Task 2: Install backend deps (sequelize/pg/pg-hstore/bcryptjs/dotenv + sequelize-cli) via yarn workspace</name>
  <files>backend/package.json, yarn.lock</files>
  <read_first>
    - `02-RESEARCH.md` §Standard Stack — pinned versions (use these exact semver ranges)
    - `02-RESEARCH.md` §Common Pitfalls §Pitfall 6 — .cjs requirement (nothing to do here, but context for Task 3)
    - `backend/package.json` (BEFORE snapshot in <interfaces> above) — deps being added
    - `02-VALIDATION.md` row "Plan 02-A DATA-02 (deps)" — automated grep validates pkg.json
  </read_first>
  <action>
    Run from the repo root (use `/usr/local/bin/yarn` absolute path if homebrew classic yarn shadows the corepack shim — Phase 1 deferred doc note):

    ```bash
    yarn workspace @campaign/backend add sequelize@^6.37.8 pg@^8.20.0 pg-hstore@^2.3.4 bcryptjs@^3.0.3 dotenv@^17.4.2
    yarn workspace @campaign/backend add -D sequelize-cli@^6.6.5
    ```

    Expected outcome after both commands:
    - `backend/package.json` has 5 new `dependencies`: `sequelize`, `pg`, `pg-hstore`, `bcryptjs`, `dotenv` — alphabetized by yarn.
    - `backend/package.json` has 1 new `devDependency`: `sequelize-cli`.
    - `yarn.lock` updated at repo root (single lockfile for the monorepo).
    - `backend/node_modules/.bin/sequelize` binary exists and is executable.

    **CRITICAL** — do NOT pin `pg-hstore@^2.4.3`. Per 02-RESEARCH.md §Open Questions Q6, that version does not exist on npm — STACK.md has a typo. Latest is 2.3.4.

    **CRITICAL** — do NOT install `@types/bcryptjs`. Per 02-RESEARCH.md §Open Questions Q7, bcryptjs 3.x ships its own types; adding `@types/bcryptjs` would shadow them.

    **CRITICAL** — do NOT add the `db:*` scripts here. Those land in Plan 02-03 Task 3 (after migrations exist). This task is deps-only.

    If `yarn workspace @campaign/backend add` complains the workspace has pending lockfile changes from Phase 1, run `yarn install --immutable` first to confirm the lockfile is clean, then retry the add commands.
  </action>
  <verify>
    <automated>grep -q '"sequelize": "\^6\.' backend/package.json && grep -q '"pg": "\^8\.' backend/package.json && grep -q '"pg-hstore": "\^2\.3\.' backend/package.json && grep -q '"bcryptjs": "\^3\.' backend/package.json && grep -q '"dotenv": "\^17\.' backend/package.json && grep -q '"sequelize-cli": "\^6\.6\.' backend/package.json && ! grep -q '"@types/bcryptjs"' backend/package.json && ! grep -q '"pg-hstore": "\^2\.4\.3"' backend/package.json && test -f backend/node_modules/.bin/sequelize && yarn install --immutable</automated>
  </verify>
  <acceptance_criteria>
    - `backend/package.json` dependencies section contains all 5 packages at the pinned caret ranges above
    - `backend/package.json` devDependencies section contains `sequelize-cli@^6.6.5`
    - `@types/bcryptjs` is NOT present anywhere in backend/package.json
    - `pg-hstore` range is NOT `^2.4.3` (would be invalid — does not exist on npm)
    - `backend/node_modules/.bin/sequelize` binary exists
    - `yarn install --immutable` exits 0 (lockfile stable after the adds)
    - `yarn workspace @campaign/backend typecheck` still exits 0 (adding deps doesn't change TS behavior; Plan 01-04 entry point still compiles)
  </acceptance_criteria>
  <done>backend/package.json + yarn.lock committed with the 6 new package declarations; sequelize binary resolvable; typecheck unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Create .sequelizerc, src/db/config.cjs, and update backend/tsconfig.json exclude</name>
  <files>backend/.sequelizerc, backend/src/db/config.cjs, backend/tsconfig.json</files>
  <read_first>
    - `02-RESEARCH.md` §Pattern 1 (`.sequelizerc` content) — copy verbatim
    - `02-RESEARCH.md` §Pattern 2 (`src/db/config.cjs` content) — copy verbatim
    - `02-RESEARCH.md` §Pattern 10 (tsconfig.json exclude snippet) — copy verbatim
    - `02-RESEARCH.md` §Common Pitfalls §Pitfall 6 (`.cjs` rationale) + §Pitfall 8 (DATABASE_URL throw message)
    - `02-VALIDATION.md` row "Plan 02-A DATA-01 (config)" — automated grep validates structure
    - `backend/tsconfig.json` (BEFORE snapshot in <interfaces>) — current content is 8 lines
  </read_first>
  <action>
    Create **`backend/.sequelizerc`** (no extension — sequelize-cli loads via internal `require()`) with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 1):

    ```js
    // backend/.sequelizerc
    // CJS module — sequelize-cli loads this with require()
    const path = require('node:path');

    module.exports = {
      config:          path.resolve(__dirname, 'src', 'db', 'config.cjs'),
      'models-path':   path.resolve(__dirname, 'src', 'models'),
      'migrations-path': path.resolve(__dirname, 'src', 'migrations'),
      'seeders-path':  path.resolve(__dirname, 'src', 'seeders'),
    };
    ```

    Rationale for absolute paths via `path.resolve(__dirname, ...)`: deterministic regardless of CWD. Invoking `yarn workspace @campaign/backend db:migrate` from repo root still resolves paths relative to `backend/`.

    If sequelize-cli later fails to load `.sequelizerc` with ERR_REQUIRE_ESM (Research Assumption A2 flagged this as possible edge case), rename to `.sequelizerc.cjs` — same content.

    Create **`backend/src/db/config.cjs`** with EXACTLY this content (verbatim from 02-RESEARCH.md §Pattern 2):

    ```js
    // backend/src/db/config.cjs
    // Loaded by sequelize-cli — must be CJS (backend is "type": "module")
    require('dotenv').config(); // reads backend/.env if present

    const base = {
      dialect: 'postgres',
      use_env_variable: 'DATABASE_URL',   // sequelize-cli special key — reads process.env.DATABASE_URL
      dialectOptions: {
        // Local dev / docker: no SSL. Production (hosted PG) may require { ssl: { require: true, rejectUnauthorized: false } }
        ssl: false,
      },
      define: {
        underscored: true,
        timestamps: true,
      },
    };

    module.exports = {
      development: {
        ...base,
        logging: console.log,           // CLI output for dev
      },
      test: {
        ...base,
        use_env_variable: 'DATABASE_URL_TEST',  // separate test DB — Phase 7 will populate
        logging: false,
      },
      production: {
        ...base,
        logging: false,
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      },
    };
    ```

    Key properties confirmed in 02-RESEARCH.md:
    - `use_env_variable: 'DATABASE_URL'` is the canonical sequelize-cli pattern for a single connection URL.
    - `NODE_ENV=test` → picks the `test` key → reads `DATABASE_URL_TEST` (Phase 7 populates it).
    - `define.underscored + define.timestamps` set workspace-wide defaults; models can still override.

    **Overwrite** `backend/tsconfig.json` (currently 8 lines) with this content (verbatim from 02-RESEARCH.md §Pattern 10):

    ```json
    {
      "extends": "../tsconfig.base.json",
      "compilerOptions": {
        "types": ["node"],
        "lib": ["ES2022"],
        "rootDir": "src"
      },
      "include": ["src/**/*.ts"],
      "exclude": ["src/migrations/**", "src/seeders/**", "src/db/config.cjs"]
    }
    ```

    What changed vs. Phase 1:
    - `include` tightened from `"src/**/*"` to `"src/**/*.ts"` — restricts tsc discovery to TypeScript files only, naturally excluding `.cjs` migrations/seeders/config.
    - Added explicit `exclude` for belt-and-suspenders against tsc ever trying to parse `.cjs` files.

    Do NOT touch `../tsconfig.base.json` (Phase 1 sets NodeNext strict options globally).
  </action>
  <verify>
    <automated>test -f backend/.sequelizerc && test -f backend/src/db/config.cjs && grep -q "path.resolve(__dirname" backend/.sequelizerc && grep -q "config.cjs" backend/.sequelizerc && grep -q "use_env_variable" backend/src/db/config.cjs && grep -q "DATABASE_URL" backend/src/db/config.cjs && grep -q "DATABASE_URL_TEST" backend/src/db/config.cjs && grep -q "underscored" backend/src/db/config.cjs && grep -q "src/migrations" backend/tsconfig.json && grep -q '"src/\*\*/\*.ts"' backend/tsconfig.json && yarn workspace @campaign/backend typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `backend/.sequelizerc` exists, uses `path.resolve(__dirname, ...)` for all four paths, points `config` to `src/db/config.cjs`
    - `backend/src/db/config.cjs` exists, calls `require('dotenv').config()` at the top, exports `{ development, test, production }`, uses `use_env_variable: 'DATABASE_URL'` (and `DATABASE_URL_TEST` for test), sets `dialect: 'postgres'`, `define: { underscored: true, timestamps: true }`
    - `backend/tsconfig.json` `include` is exactly `["src/**/*.ts"]` and `exclude` contains `src/migrations/**`, `src/seeders/**`, and `src/db/config.cjs`
    - `yarn workspace @campaign/backend typecheck` exits 0 — Phase 1 entry point (`src/index.ts`) still compiles under the tightened include/exclude rules
    - `backend/node_modules/.bin/sequelize --help` runs without crashing (binary resolves; loading `.sequelizerc` succeeds) — OPTIONAL spot-check, skip if the CLI complains about missing `src/migrations` (that's expected at this point; the dir lands in Plan 02-03)
  </acceptance_criteria>
  <done>.sequelizerc + config.cjs + updated tsconfig.json committed; yarn typecheck exits 0; Phase 2 CLI wiring unblocked for Plan 02-02 (models) and Plan 02-03 (migrations).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer-shell → docker-compose | docker-compose invokes postgres image with credentials from env/.env — compose is run by trusted developer/reviewer locally |
| backend process → postgres | Sequelize connects to DATABASE_URL; URL contains credentials (trusted within the dev/test network perimeter) |
| git repo → published artifacts | `.env.example` is committed and public; real `.env` MUST NOT be committed (gitignored) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01-01 | Information Disclosure (V14 config) | `.env.example` at repo root | mitigate | Only placeholder values (`campaign:campaign` local dev creds that never reach production); no secrets committed. `.gitignore` already excludes real `.env` (Phase 1 Plan 01-01). |
| T-02-01-02 | Information Disclosure (V14 config) | `backend/src/db/config.cjs` | mitigate | Reads credentials via `process.env.DATABASE_URL` — no hardcoded URL. Production branch requires `ssl: { require: true }`. `dotenv` never logs; `console.log` for `logging` is the *SQL statement* sink, not the connection string. |
| T-02-01-03 | Denial of Service (V14 config) | sequelize-cli loading `.sequelizerc` in an ESM workspace | accept | Research Assumption A2 — `.sequelizerc` (no extension) may be parsed as ESM under `"type": "module"`. If it fails at runtime, rename to `.sequelizerc.cjs`. Impact: Plan 02-03 migration run would fail with ERR_REQUIRE_ESM — caught by Plan 02-03's verify. |
| T-02-01-04 | Configuration drift (V14) | `yarn.lock` vs declared deps | mitigate | `yarn install --immutable` in verify proves lockfile is stable and matches declared deps. Fresh-clone reproducibility preserved (Phase 1 discipline). |
| T-02-01-05 | Supply chain (V6 crypto) | `bcryptjs@^3.0.3` pin | mitigate | Using bcryptjs (pure JS, no node-gyp) not native bcrypt — avoids Docker multi-arch build breaks (STACK.md rationale). Version verified against npm 2026-04-20. |
| T-02-01-06 | Unauthorized dep injection (V6) | `pg-hstore@^2.4.3` typo in STACK.md | mitigate | Research Open Questions Q6 caught the typo — pin `^2.3.4` which actually exists. Plan verify greps for the `^2.3` prefix. |
| T-02-01-07 | Tampering (V14 config) | tsconfig.json include/exclude scope | mitigate | Explicit `exclude` for `src/migrations/**` prevents tsc from trying to parse CJS files as ESM; `include: src/**/*.ts` restricts tsc to typed files only. Migrations/seeders remain invisible to the typecheck lane — running or editing them can't regress typecheck. |

No V2/V3/V4/V8 threats apply at this layer — those surface in Phase 3 (auth), Phase 4 (access control), Phase 5 (worker transaction integrity).
</threat_model>

<verification>
Plan 02-01 is the infra + tooling foundation. Post-plan state:

1. `docker compose up -d postgres` brings up a healthy postgres:16-alpine container reachable on `localhost:5432` (Manual check — Plan 02-03 will exercise it via `db:migrate`).
2. `yarn install --immutable` from repo root exits 0.
3. `yarn workspace @campaign/backend typecheck` exits 0 (Phase 1 entry point still compiles under new tsconfig).
4. `backend/node_modules/.bin/sequelize` exists (binary provided by sequelize-cli devDep).
5. `test -f docker-compose.yml && test -f .env.example && test -f backend/.env.example && test -f backend/.sequelizerc && test -f backend/src/db/config.cjs` — all 5 exist.

**NOT verified yet (Plan 02-02 and 02-03 own these):**
- Model classes (Plan 02-02 creates `src/models/*.ts` + `src/db/index.ts`)
- Migration execution / pgcrypto / tables / indexes (Plan 02-03)
- Seed data (Plan 02-04)
- `yarn db:migrate` / `yarn db:seed` scripts in package.json (added in Plan 02-03)
</verification>

<success_criteria>
- [ ] `docker-compose.yml` exists at repo root with postgres:16-alpine service + pg_isready healthcheck + pgdata volume
- [ ] Root `.env.example` documents `DATABASE_URL`, `POSTGRES_USER/PASSWORD/DB`, `NODE_ENV`, `LOG_LEVEL`
- [ ] `backend/.env.example` documents `DATABASE_URL`
- [ ] `backend/package.json` has all 6 Phase 2 deps (5 runtime + 1 dev) at pinned versions (`^6.37.8`, `^8.20.0`, `^2.3.4`, `^3.0.3`, `^17.4.2`, `^6.6.5`)
- [ ] `pg-hstore` is NOT pinned to `^2.4.3` (that version doesn't exist)
- [ ] `@types/bcryptjs` is NOT installed
- [ ] `backend/.sequelizerc` exists, exports CJS object with absolute paths via `path.resolve(__dirname, ...)`
- [ ] `backend/src/db/config.cjs` exists, loads dotenv, exports `{ development, test, production }` with `use_env_variable: 'DATABASE_URL'` (test uses `DATABASE_URL_TEST`)
- [ ] `backend/tsconfig.json` `include` is `["src/**/*.ts"]`; `exclude` contains migrations + seeders + db/config.cjs
- [ ] `yarn install --immutable` exits 0
- [ ] `yarn workspace @campaign/backend typecheck` exits 0
- [ ] `backend/node_modules/.bin/sequelize` binary exists
- [ ] No secret values committed anywhere (`.env` not created; only `.env.example` placeholders)
</success_criteria>

<output>
After completion, create `.planning/phases/02-schema-migrations-seed/02-01-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.

Handoff to Plan 02-02: `backend/src/db/config.cjs` is loaded by sequelize-cli at CLI-invocation time; the runtime Sequelize instance (Plan 02-02 creates `backend/src/db/index.ts`) reads `DATABASE_URL` directly via `dotenv`. Both config layers read the SAME env var — no drift possible.
</output>
