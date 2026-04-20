---
phase: 01-monorepo-foundation-shared-schemas
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .yarnrc.yml
  - .yarn/releases/yarn-4.14.1.cjs
  - .gitignore
  - package.json
  - yarn.lock
  - shared/package.json
  - shared/tsconfig.json
  - shared/src/index.ts
  - shared/src/schemas/index.ts
  - shared/src/schemas/auth.ts
  - shared/src/schemas/campaign.ts
  - backend/package.json
  - frontend/package.json
autonomous: true
requirements:
  - FOUND-01
requirements_addressed:
  - FOUND-01
tags:
  - monorepo
  - yarn4
  - workspaces
  - shared-schemas

must_haves:
  truths:
    - "`yarn install --immutable` from a fresh clone exits 0 on Yarn 4 with node-modules linker (no `.pnp.*` files)"
    - "`yarn workspaces foreach -At run build` builds `@campaign/shared` first and produces `shared/dist/index.js` + `shared/dist/index.d.ts`"
    - "Root `postinstall` script rebuilds `shared/dist/` after a fresh install"
    - "`zod` is declared only in `shared/package.json` (not in backend/ or frontend/)"
    - "Backend and frontend workspaces list `@campaign/shared: workspace:*` as a dep"
  artifacts:
    - path: "package.json"
      provides: "Yarn 4 root: workspaces, packageManager, resolutions, scripts, devDeps"
      contains: "\"packageManager\": \"yarn@4.14.1\""
    - path: ".yarnrc.yml"
      provides: "Yarn 4 node-modules linker config"
      contains: "nodeLinker: node-modules"
    - path: ".yarn/releases/yarn-4.14.1.cjs"
      provides: "Committed Yarn 4 binary (corepack-pinned)"
    - path: "shared/package.json"
      provides: "@campaign/shared — exports dist/, type:module, zod dep"
      contains: "\"exports\""
    - path: "shared/dist/index.js"
      provides: "Compiled shared module (post-build)"
    - path: "shared/src/schemas/auth.ts"
      provides: "RegisterSchema skeleton"
      contains: "RegisterSchema"
    - path: "shared/src/schemas/campaign.ts"
      provides: "CampaignStatusEnum with draft|scheduled|sending|sent"
      contains: "CampaignStatusEnum"
    - path: "backend/package.json"
      provides: "@campaign/backend stub — workspace:* dep on shared, pino deps declared"
      contains: "\"@campaign/shared\": \"workspace:*\""
    - path: "frontend/package.json"
      provides: "@campaign/frontend stub — workspace:* dep on shared"
      contains: "\"@campaign/shared\": \"workspace:*\""
  key_links:
    - from: "package.json (root postinstall)"
      to: "shared/dist/"
      via: "yarn workspace @campaign/shared build"
      pattern: "postinstall.*@campaign/shared.*build"
    - from: "backend/package.json"
      to: "shared/dist/"
      via: "workspace:* dep + tsc NodeNext resolution of exports field"
      pattern: "\"@campaign/shared\": \"workspace:\\*\""
    - from: "frontend/package.json"
      to: "shared/dist/"
      via: "workspace:* dep"
      pattern: "\"@campaign/shared\": \"workspace:\\*\""
---

<objective>
Bootstrap the Yarn 4 flat monorepo (FOUND-01). Create `backend/`, `frontend/`, `shared/` workspaces with `nodeLinker: node-modules` (no PnP — guards M6), commit the Yarn 4 release binary, wire a root `postinstall` that topologically builds `@campaign/shared`, and seed `shared/` with a minimal Zod schema skeleton (`RegisterSchema`, `CampaignStatusEnum`) that emits to `dist/` via `tsc`. Declare `zod` only in `shared/package.json` (guards M7). Pin Vitest 2.1.9 + @vitejs/plugin-react 4.7.0 in root `resolutions` (guards C18) so later phases inherit the locked versions. Backend + frontend workspace package.json files are stubs at this stage — real deps (pino, React, etc.) land in the next plans / later phases.

Purpose: Every downstream phase (auth, CRUD, queue, tests, frontend) imports types from `@campaign/shared`. The workspace topology and `workspace:*` protocol must resolve correctly before any code is written.
Output: Fresh-clone `yarn install` succeeds, `yarn build` produces `shared/dist/`, backend + frontend can reference `@campaign/shared` via `workspace:*`.
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
@.planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-VALIDATION.md
@CLAUDE.md

<interfaces>
<!-- This plan CREATES the interfaces that Plans 02, 03, 04 depend on. Concrete file contents are specified verbatim in the action blocks below (copy-pasted from 01-RESEARCH.md §Architecture Patterns). -->

After this plan completes, these are consumable:

```json
// shared/package.json exports field — consumers import from '@campaign/shared'
"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
```

```typescript
// @campaign/shared — skeleton re-exports (Plan 04 + Phases 3,4 will extend)
export { RegisterSchema, type RegisterInput } from './schemas/auth.js';
export { CampaignStatusEnum, type CampaignStatus } from './schemas/campaign.js';
```

Root `package.json` key scripts (consumed by Plans 02, 03, 04 + all future phases):
- `yarn build` → `yarn workspaces foreach -At run build` (topological — shared first)
- `yarn typecheck` → `yarn workspaces foreach -Apt run typecheck`
- `yarn lint` → `eslint .`
- `yarn format:check` → `prettier --check .`
- `postinstall` → `yarn workspace @campaign/shared build`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bootstrap Yarn 4 (corepack) + .yarnrc.yml + root package.json + .gitignore</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 1 (root package.json), §Pattern 11 (.yarnrc.yml), §Pattern 12 (.gitignore), §Standard Stack (version pins)
    - .planning/research/PITFALLS.md — M6 (Yarn PnP breaks tooling), C18 (Vitest/plugin-react resolutions)
    - .gitignore (currently has partial content — must extend, not replace)
    - CLAUDE.md — §Guardrails (Do not re-open Key Decisions)
  </read_first>
  <files>.yarnrc.yml, .yarn/releases/yarn-4.14.1.cjs, .gitignore, package.json</files>
  <action>
Step 1. Pin Yarn 4.14.1 via corepack (creates `.yarn/releases/yarn-4.14.1.cjs` AND the `packageManager` field in package.json automatically):
```bash
corepack enable
corepack use yarn@4.14.1
```
Verify `.yarn/releases/yarn-4.14.1.cjs` was created and is committed (do NOT gitignore `.yarn/releases/`).

Step 2. Create `.yarnrc.yml` at repo root with EXACTLY these three lines (copy verbatim from 01-RESEARCH.md §Pattern 11):
```yaml
nodeLinker: node-modules
enableGlobalCache: true
enableImmutableInstalls: false
```
`nodeLinker: node-modules` is the M6 mitigation — do NOT omit. Do NOT add `nmHoistingLimits`.

Step 3. Extend (not replace) `.gitignore` to add the Yarn 4 + TS + Node patterns from 01-RESEARCH.md §Pattern 12. Preserve whatever existing entries are already there; append:
```
# dependencies
node_modules/
.yarn/cache
.yarn/install-state.gz
.yarn/build-state.yml
.pnp.*

# build output
dist/
build/
*.tsbuildinfo

# env / secrets
.env
.env.local
.env.*.local

# editor / OS
.DS_Store
.vscode/
!.vscode/settings.json.example

# testing
coverage/
```
CRITICAL: Do NOT gitignore `.yarn/releases/` — the Yarn 4 binary MUST be committed per Yarn 4 docs.

Step 4. Write root `package.json` EXACTLY matching 01-RESEARCH.md §Pattern 1 (verbatim — no "v1 simplified" version; includes ALL resolutions and ALL devDeps):
```json
{
  "name": "campaign",
  "version": "0.1.0",
  "private": true,
  "packageManager": "yarn@4.14.1",
  "workspaces": ["shared", "backend", "frontend"],
  "scripts": {
    "postinstall": "yarn workspace @campaign/shared build",
    "build":       "yarn workspaces foreach -At run build",
    "dev:shared":  "yarn workspace @campaign/shared run dev",
    "dev:backend": "yarn workspace @campaign/backend run dev",
    "dev:frontend":"yarn workspace @campaign/frontend run dev",
    "lint":        "eslint .",
    "lint:fix":    "eslint . --fix",
    "typecheck":   "yarn workspaces foreach -Apt run typecheck",
    "format":      "prettier --write .",
    "format:check":"prettier --check .",
    "test":        "yarn workspaces foreach -Apt run test"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.1.1",
    "prettier": "^3.8.3",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.58.2"
  },
  "resolutions": {
    "vitest": "2.1.9",
    "@vitest/coverage-v8": "2.1.9",
    "@vitejs/plugin-react": "4.7.0",
    "zod": "^3.23.8"
  },
  "engines": {
    "node": ">=20.11.0"
  }
}
```
Flags explained:
- `-At` = `--all --topological` (build needs strict topological order — shared must finish before backend/frontend start).
- `-Apt` = `--all --parallel --topological` (safe for lint/typecheck/test because those are independent reads).
- `postinstall` is the M9/C18.1 mitigation — guarantees `shared/dist/` exists before any downstream tool loads it.
- `resolutions` is the C18.5 mitigation — Vitest 2.1.9 pin prevents dependabot from bumping to 4.x which requires Vite 6.

Do NOT add `"type": "module"` at the root (see 01-RESEARCH.md Open Question #1 — root stays CommonJS-neutral; per-workspace package.json files each declare their own type).
  </action>
  <verify>
    <automated>test -f .yarn/releases/yarn-4.14.1.cjs && grep -q "nodeLinker: node-modules" .yarnrc.yml && grep -q '"packageManager": "yarn@4.14.1"' package.json && grep -q '"workspaces":' package.json && grep -q '"vitest": "2.1.9"' package.json && grep -q '"@vitejs/plugin-react": "4.7.0"' package.json && grep -q "node_modules/" .gitignore && grep -q ".pnp" .gitignore && ! grep -q "^\.yarn/releases" .gitignore</automated>
  </verify>
  <acceptance_criteria>
    - `.yarn/releases/yarn-4.14.1.cjs` exists (committed Yarn binary).
    - `.yarnrc.yml` contains `nodeLinker: node-modules` (M6 mitigation).
    - Root `package.json` has `"packageManager": "yarn@4.14.1"` (exact version).
    - Root `package.json` has `"workspaces": ["shared", "backend", "frontend"]` (exact order).
    - Root `package.json` `resolutions` contains `vitest: 2.1.9`, `@vitest/coverage-v8: 2.1.9`, `@vitejs/plugin-react: 4.7.0`, `zod: ^3.23.8`.
    - Root `package.json` `scripts.postinstall` is `yarn workspace @campaign/shared build`.
    - Root `package.json` `scripts.build` uses `foreach -At` (topological — not `-A` nor `-Apt`).
    - `.gitignore` contains `node_modules/`, `.pnp.*`, `dist/`, `.env`, `coverage/`, `.yarn/cache`, `.yarn/install-state.gz`.
    - `.gitignore` does NOT contain a bare `.yarn` or `.yarn/releases` line — the Yarn binary MUST be committed.
    - No `.pnp.cjs` or `.pnp.loader.mjs` exists in repo root after setup.
  </acceptance_criteria>
  <done>Corepack pins Yarn 4.14.1, .yarnrc.yml disables PnP, root package.json declares the 3 workspaces + resolutions + scripts, .gitignore excludes node_modules/.yarn-cache/dist/env files but includes the Yarn binary.</done>
</task>

<task type="auto">
  <name>Task 2: Create shared workspace (package.json + tsconfig + skeleton Zod schemas)</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 2 (shared/package.json exports), §Pattern 3 (skeleton re-exports), §Pattern 4 (shared/tsconfig.json), §Pattern 5 (tsconfig.base.json compiler options — needed to know what shared/tsconfig extends)
    - .planning/research/STACK.md — Shared workspace section (zod ^3.23.8, typescript devDep)
    - .planning/research/PITFALLS.md — M7 (zod version drift: declare ONLY in shared/), M8 (shared has zero workspace deps)
    - package.json (root — to know the `workspaces` array is `["shared", "backend", "frontend"]` so this workspace must live at repo-root `shared/`)
  </read_first>
  <files>shared/package.json, shared/tsconfig.json, shared/src/index.ts, shared/src/schemas/index.ts, shared/src/schemas/auth.ts, shared/src/schemas/campaign.ts</files>
  <action>
NOTE: `tsconfig.base.json` is created in Plan 02 (Wave 2). `shared/tsconfig.json` extends `../tsconfig.base.json`, so a first `yarn build` attempted between Plan 01 completion and Plan 02 completion WILL fail with "Cannot find `../tsconfig.base.json`". That is intentional — Plan 02 ships the base config and Plan 04 runs the full verify pipeline. The postinstall build will fail during Plan 01's yarn install; use `yarn install --skip-builds` OR set `enableScripts: false` temporarily OR (preferred) defer the first full install-with-build to Plan 02. See Task 4 below — it does NOT run `yarn install` fully; it verifies file shape only. Plan 02 Task 1 runs the full install.

Step 1. Create `shared/package.json` EXACTLY matching 01-RESEARCH.md §Pattern 2 (copy verbatim):
```json
{
  "name": "@campaign/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build":     "tsc -p tsconfig.json",
    "dev":       "tsc -p tsconfig.json --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint":      "eslint src",
    "test":      "echo 'no tests in shared (Phase 1 scaffold)' && exit 0"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```
KEY POINTS (from 01-RESEARCH.md §Pattern 2 and Pitfall 7):
- `"type": "module"` — shared is pure ESM.
- `"exports"` has `"types"` FIRST in the conditions object (per Node.js docs — ordering matters for modern TS resolvers; Pitfall 7).
- `"main"` + `"types"` fields retained alongside `"exports"` for older-tooling compat (belt-and-suspenders per 01-RESEARCH.md).
- `zod` is the ONLY runtime dependency (M7 mitigation — declare zod ONLY here, never in backend/frontend).
- `"files": ["dist"]` — reinforces "don't ship src/" discipline (C18.6: Vite optimizer chokes on TS from node_modules).
- Do NOT declare `typescript` as a devDependency here — it's hoisted from root (Yarn 4 node-modules linker does this per 01-RESEARCH.md Open Question #4).

Step 2. Create `shared/tsconfig.json` EXACTLY matching 01-RESEARCH.md §Pattern 4 (copy verbatim):
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": false,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```
KEY POINTS:
- `composite: false` — project references intentionally skipped (ARCHITECTURE §11).
- `noEmit: false` — overrides the base (which sets `noEmit: true`); shared is the ONE workspace that emits.
- `declaration: true` + `declarationMap: true` — produces `.d.ts` + `.d.ts.map` so IDE jump-to-definition works back into `shared/src/*.ts`.
- `extends: "../tsconfig.base.json"` — the base file itself is created in Plan 02 Task 2 (this is the intentional Plan 01→Plan 02 handoff).

Step 3. Create the `shared/src/` skeleton files EXACTLY matching 01-RESEARCH.md §Pattern 3:

`shared/src/index.ts`:
```typescript
export * from './schemas/index.js';
```

`shared/src/schemas/index.ts`:
```typescript
export * from './auth.js';
export * from './campaign.js';
```

`shared/src/schemas/auth.ts`:
```typescript
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;
```

`shared/src/schemas/campaign.ts`:
```typescript
import { z } from 'zod';

export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;
```

CRITICAL IMPORT-SUFFIX RULE: All `export * from './foo.js'` lines use `.js` (not `.ts`) because `moduleResolution: NodeNext` (set in Plan 02's `tsconfig.base.json`) requires the explicit .js suffix that TS will rewrite from .ts source at emit. DO NOT WRITE `from './foo'` or `from './foo.ts'`. This is Pitfall 8 (moduleResolution mismatch).

DO NOT create any empty dist/ directory — `tsc` creates it at build time (Plan 02).
  </action>
  <verify>
    <automated>test -f shared/package.json && test -f shared/tsconfig.json && test -f shared/src/index.ts && test -f shared/src/schemas/index.ts && test -f shared/src/schemas/auth.ts && test -f shared/src/schemas/campaign.ts && grep -q '"name": "@campaign/shared"' shared/package.json && grep -q '"type": "module"' shared/package.json && grep -q '"zod"' shared/package.json && grep -q '"exports"' shared/package.json && grep -q 'RegisterSchema' shared/src/schemas/auth.ts && grep -q "z.enum" shared/src/schemas/campaign.ts && grep -q "'draft'" shared/src/schemas/campaign.ts && grep -q "'sent'" shared/src/schemas/campaign.ts && grep -q "extends.*tsconfig.base" shared/tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - `shared/package.json` has `"name": "@campaign/shared"`, `"type": "module"`, `"zod": "^3.23.8"` in dependencies.
    - `shared/package.json` `exports["."]` has `types` key BEFORE `import` key (order matters per Pitfall 7).
    - `shared/package.json` has `"main": "./dist/index.js"` and `"types": "./dist/index.d.ts"` (belt-and-suspenders for older tooling).
    - `shared/package.json` has no workspace dependencies (zero — M8 mitigation).
    - `shared/tsconfig.json` extends `../tsconfig.base.json` and sets `outDir: "dist"`, `noEmit: false`, `declaration: true`.
    - `shared/src/schemas/auth.ts` exports `RegisterSchema` (a Zod object with email/password/name).
    - `shared/src/schemas/campaign.ts` exports `CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent'])` (exact 4-state machine per DATA-01 / CLAUDE.md §Core constraints).
    - All relative imports use `.js` suffix (not `.ts` and not bare — NodeNext resolution requirement, Pitfall 8).
    - No `zod` entry in `backend/package.json` or `frontend/package.json` (M7 mitigation — verified in Task 3).
  </acceptance_criteria>
  <done>shared/ workspace has package.json with exports field + zod dep, tsconfig.json extending base, src/index.ts re-exporting src/schemas/* which contains the RegisterSchema + CampaignStatusEnum skeleton. No dist/ yet — that's built by Plan 02.</done>
</task>

<task type="auto">
  <name>Task 3: Create backend + frontend workspace stubs (package.json only) with workspace:* dep on shared</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Standard Stack (Backend-specific table, Frontend-specific table), §Pattern 6 (backend/tsconfig, frontend/tsconfig — but those come in Plan 02)
    - .planning/research/STACK.md — Backend section (pino, pino-http, pino-pretty, tsx, @types/node pins)
    - .planning/research/PITFALLS.md — M7 (zod version drift — DO NOT declare zod in backend or frontend)
    - shared/package.json (just written — confirms the scoped name `@campaign/shared` for the workspace: reference)
    - package.json (root workspaces field — confirms these workspaces are at `backend/` and `frontend/` at repo root)
  </read_first>
  <files>backend/package.json, frontend/package.json</files>
  <action>
Step 1. Create `backend/package.json`. This is the Phase 1 STUB: declares `@campaign/shared` as a workspace dep, plus the Phase 1 runtime deps (pino for FOUND-05) and dev deps (tsx + @types/node). Real Express/Sequelize/BullMQ deps come in Phases 3-5 (per phase_context scope discipline).

```json
{
  "name": "@campaign/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build":     "echo 'backend build deferred to Phase 10' && exit 0",
    "dev":       "tsx watch src/index.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint":      "eslint src",
    "test":      "echo 'backend tests land in Phase 7' && exit 0"
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
KEY POINTS (from 01-RESEARCH.md §Standard Stack):
- `"@campaign/shared": "workspace:*"` — Yarn 4 workspace protocol (§Pattern 1 rationale).
- `pino@^10.3.1`, `pino-http@^11.0.0` are runtime deps (used in Plan 03 logger module); `pino-pretty@^13.1.3` is devDep (pretty transport only in dev, per §Pattern 9).
- `tsx@^4.21.0` is the dev runner (replaces ts-node).
- NO `zod` declaration here — M7 mitigation. Backend imports Zod via `@campaign/shared` re-exports.
- NO Express / Sequelize / BullMQ / jsonwebtoken — those are Phase 3-5 per phase_context scope.
- `build` script is a no-op — backend build-to-dist happens in Phase 10 (Docker deliverable). In Phase 1, `yarn workspaces foreach -At run build` only needs `shared/` to actually emit.
- `typecheck` runs `tsc --noEmit`; Plan 02 creates the backend tsconfig.json this references.
- `dev` uses `tsx watch src/index.ts` but `src/index.ts` does not yet exist — that's Phase 3 (auth). Running `yarn dev:backend` in Phase 1 will error, which is expected.

Step 2. Create `frontend/package.json`. Phase 1 stub — `@campaign/shared` workspace dep only; Vite/React/Tailwind/shadcn come in Phase 8.

```json
{
  "name": "@campaign/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build":     "echo 'frontend build deferred to Phase 8' && exit 0",
    "dev":       "echo 'frontend dev deferred to Phase 8' && exit 0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint":      "eslint src",
    "test":      "echo 'frontend tests land in Phase 9' && exit 0"
  },
  "dependencies": {
    "@campaign/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```
KEY POINTS:
- ONLY `@campaign/shared` as a dep. Vite / React / Tailwind / shadcn / Redux / React Query — ALL Phase 8 per phase_context scope discipline.
- NO `zod` here either (M7).
- `build` + `dev` are no-ops in Phase 1 — Plan 02 just needs `typecheck` to work once the tsconfig lands.

VERIFICATION BOUNDARY: The root `postinstall` that runs `yarn workspace @campaign/shared build` will fail until Plan 02 creates `tsconfig.base.json`. Therefore:
- Do NOT run `yarn install` at the end of this task — Plan 02 Task 1 runs the first successful install.
- The `verify` block below ONLY checks file shape, not a runtime install.
  </action>
  <verify>
    <automated>test -f backend/package.json && test -f frontend/package.json && grep -q '"name": "@campaign/backend"' backend/package.json && grep -q '"name": "@campaign/frontend"' frontend/package.json && grep -q '"@campaign/shared": "workspace:\*"' backend/package.json && grep -q '"@campaign/shared": "workspace:\*"' frontend/package.json && grep -q '"pino"' backend/package.json && grep -q '"pino-http"' backend/package.json && grep -q '"tsx"' backend/package.json && ! grep -q '"zod"' backend/package.json && ! grep -q '"zod"' frontend/package.json</automated>
  </verify>
  <acceptance_criteria>
    - `backend/package.json` has `"name": "@campaign/backend"` + `"type": "module"` + `"@campaign/shared": "workspace:*"`.
    - `backend/package.json` declares `pino@^10.3.1`, `pino-http@^11.0.0` as dependencies (needed by Plan 03).
    - `backend/package.json` declares `pino-pretty@^13.1.3`, `tsx@^4.21.0`, `@types/node@^20.11.0`, `typescript@^5.8.3` as devDependencies.
    - `backend/package.json` does NOT declare `zod` (M7 mitigation).
    - `backend/package.json` does NOT declare Express, Sequelize, BullMQ, jsonwebtoken, bcryptjs (phase scope discipline — deferred to Phases 3-5).
    - `frontend/package.json` has `"name": "@campaign/frontend"` + `"type": "module"` + `"@campaign/shared": "workspace:*"`.
    - `frontend/package.json` does NOT declare zod, React, Vite, Tailwind, shadcn, Redux, React Query (phase scope discipline — all deferred to Phase 8).
    - Both package.json files have `typecheck` and `lint` scripts (wired in Plan 02).
  </acceptance_criteria>
  <done>backend/ and frontend/ both have package.json stubs declaring @campaign/shared via workspace:* protocol; backend additionally declares pino/pino-http/pino-pretty/tsx/@types/node as Plan 03 needs them; neither declares zod (M7). No tsconfig or src/ yet (Plan 02 adds those).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Filesystem ↔ git | Everything committed becomes public on GitHub (spec requires public repo) — secrets must never land in root configs |
| npm registry ↔ node_modules | Supply-chain boundary — pin-the-manager (Yarn 4 via corepack + `packageManager`) + pin Vitest/plugin-react via `resolutions` defends against dependabot drift |
| PnP vs node-modules linker | Yarn default in 4.x is PnP; we downgrade to node-modules in `.yarnrc.yml` to preserve sequelize-cli + Vite + tsx compatibility (M6 mitigation) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | Package install / lockfile | mitigate | `"packageManager": "yarn@4.14.1"` pinned in root package.json; `.yarn/releases/yarn-4.14.1.cjs` committed; `yarn.lock` committed after first install (Plan 02 Task 1); ASVS V14.1 (lockfile integrity) |
| T-01-02 | Tampering | Transitive dep drift (Vitest → v4 breaks Vite 5) | mitigate | Root `resolutions` pins `vitest: 2.1.9`, `@vitest/coverage-v8: 2.1.9`, `@vitejs/plugin-react: 4.7.0`, `zod: ^3.23.8` (Pitfall C18.5); ASVS V14.2 (known-good versions) |
| T-01-03 | Tampering | PnP linker downgrade by accident | mitigate | `.yarnrc.yml` explicitly sets `nodeLinker: node-modules`; verified by Plan 04 smoke test (`test ! -f .pnp.cjs`) (Pitfall M6); ASVS V14.1 |
| T-01-04 | Tampering | Zod version drift across workspaces (instanceof failure) | mitigate | Declare `zod` only in `shared/package.json` + `resolutions.zod: ^3.23.8` as belt-and-suspenders; verified by `! grep zod backend/package.json` (Pitfall M7) |
| T-01-05 | Information Disclosure | Secrets leaking into committed files | mitigate | `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`; no secrets processed in Phase 1 (logger reads LOG_LEVEL / NODE_ENV which are non-secret); ASVS V14.3 (secrets never in repo) |
| T-01-06 | Tampering | Committed Yarn binary replaced with malicious version | accept | Yarn 4 binary is deterministic via `corepack use yarn@4.14.1`; hash verification is overkill for a 4-8hr deliverable; future CI can add integrity check |
</threat_model>

<verification>
Per-task: automated grep + file-existence checks (each task's `<verify>` block).

Per-plan gate (run after all 3 tasks in this plan complete; Plan 02 Task 1 then runs the first full `yarn install`):
```bash
# Structural gate — file shape only (install happens in Plan 02)
test -f .yarnrc.yml && \
test -f .yarn/releases/yarn-4.14.1.cjs && \
test -f package.json && \
test -f shared/package.json && \
test -f shared/src/schemas/auth.ts && \
test -f shared/src/schemas/campaign.ts && \
test -f backend/package.json && \
test -f frontend/package.json && \
grep -q "nodeLinker: node-modules" .yarnrc.yml && \
grep -q '"packageManager": "yarn@4.14.1"' package.json && \
grep -q '"vitest": "2.1.9"' package.json && \
grep -q '"zod": "\^3.23.8"' shared/package.json && \
! grep -q '"zod"' backend/package.json && \
! grep -q '"zod"' frontend/package.json && \
grep -q '"@campaign/shared": "workspace:\*"' backend/package.json && \
grep -q '"@campaign/shared": "workspace:\*"' frontend/package.json && \
echo "Plan 01 structural gate PASS"
```

The `yarn install` + `yarn build` smoke test deferred to Plan 02 (after `tsconfig.base.json` exists).
</verification>

<success_criteria>
1. `.yarn/releases/yarn-4.14.1.cjs` is committed (Yarn binary present).
2. `.yarnrc.yml` contains `nodeLinker: node-modules` (M6 mitigated).
3. Root `package.json` pins `packageManager: "yarn@4.14.1"` and contains ALL four `resolutions` (vitest, @vitest/coverage-v8, @vitejs/plugin-react, zod — C18 mitigated).
4. Root `package.json` `scripts.postinstall = yarn workspace @campaign/shared build` (M9/C18.1 mitigated).
5. `shared/package.json` declares `zod: ^3.23.8` as the ONLY runtime dep, with `type: module` + correct `exports` field (types first).
6. `shared/tsconfig.json` extends `../tsconfig.base.json` (forward-reference to Plan 02).
7. `shared/src/index.ts` re-exports `./schemas/index.js`; `schemas/auth.ts` exports `RegisterSchema`; `schemas/campaign.ts` exports `CampaignStatusEnum` with exact 4-state machine.
8. `backend/package.json` declares `@campaign/shared: workspace:*` + pino/pino-http/pino-pretty/tsx/@types/node/typescript; does NOT declare zod.
9. `frontend/package.json` declares `@campaign/shared: workspace:*` + typescript only; does NOT declare zod, React, Vite, Tailwind, etc.
10. `.gitignore` excludes `.yarn/cache`, `node_modules/`, `dist/`, `.pnp.*`, `.env*` but includes `.yarn/releases/`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-monorepo-foundation-shared-schemas/01-01-SUMMARY.md` documenting:
- What was created (file list)
- Versions pinned (Yarn 4.14.1, TS 5.8.3, pino 10.3.1, zod ^3.23.8, Vitest 2.1.9, @vitejs/plugin-react 4.7.0)
- What was intentionally deferred (tsconfig.base.json → Plan 02; logger.ts → Plan 03; cross-workspace import-proof → Plan 04; first `yarn install` → Plan 02 Task 1 after tsconfig.base.json lands)
- M6/M7/M8/M9 + C18 mitigations applied
</output>
