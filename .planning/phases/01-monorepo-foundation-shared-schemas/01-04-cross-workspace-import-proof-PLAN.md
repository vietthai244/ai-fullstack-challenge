---
phase: 01-monorepo-foundation-shared-schemas
plan: 04
type: execute
wave: 3
depends_on: ["01-01", "01-02", "01-03"]
files_modified:
  - backend/src/index.ts
  - frontend/src/index.ts
autonomous: true
requirements:
  - FOUND-01
  - FOUND-04
  - FOUND-05
requirements_addressed:
  - FOUND-01
  - FOUND-04
  - FOUND-05
tags:
  - integration
  - verification
  - cross-workspace

must_haves:
  truths:
    - "Backend imports a Zod schema from `@campaign/shared` via the workspace:* protocol and typechecks cleanly"
    - "Frontend imports a Zod schema from `@campaign/shared` via the workspace:* protocol and typechecks cleanly"
    - "Backend's logger module is importable from the same entry point that imports `@campaign/shared` (proves both pino + workspace resolution coexist)"
    - "From a fresh `rm -rf node_modules .yarn/cache shared/dist` state, the full pipeline (`yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`) exits 0"
    - "ROADMAP.md Phase 1 success criteria 1-5 all observable as TRUE"
  artifacts:
    - path: "backend/src/index.ts"
      provides: "Replaces Plan 02's `export {};` placeholder with a real cross-workspace import-proof: imports RegisterSchema + CampaignStatusEnum from @campaign/shared, imports logger from ./util/logger.js, exports nothing executable (no listen, no process.exit)"
      contains: "@campaign/shared"
    - path: "frontend/src/index.ts"
      provides: "Replaces Plan 02's `export {};` placeholder with a cross-workspace import-proof: imports RegisterSchema + CampaignStatus type from @campaign/shared"
      contains: "@campaign/shared"
  key_links:
    - from: "backend/src/index.ts"
      to: "@campaign/shared (dist)"
      via: "workspace:* + exports field resolution"
      pattern: "from ['\"]@campaign/shared['\"]"
    - from: "backend/src/index.ts"
      to: "backend/src/util/logger.ts"
      via: "import { logger } from './util/logger.js'"
      pattern: "from ['\"]\\./util/logger\\.js['\"]"
    - from: "frontend/src/index.ts"
      to: "@campaign/shared (dist)"
      via: "workspace:* + exports field resolution"
      pattern: "from ['\"]@campaign/shared['\"]"
---

<objective>
Close Phase 1 by proving the cross-workspace contract works end-to-end and running the full reviewer-grade verification pipeline. Replace the `export {};` placeholders Plan 02 created in `backend/src/index.ts` and `frontend/src/index.ts` with minimal real imports from `@campaign/shared` (RegisterSchema, CampaignStatusEnum, CampaignStatus type) — this satisfies ROADMAP.md Phase 1 success criterion #4 ("Importing a Zod schema from `@campaign/shared` in both `backend/src/` and `frontend/src/` works via `workspace:*` protocol"). Backend's index.ts ALSO imports the logger from Plan 03 to prove pino + workspace resolution coexist on the same module. Run the full `yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check` from a fresh state — this is the Phase 1 acceptance gate.

Purpose: ROADMAP.md Phase 1 success criterion #4 explicitly requires demonstrated cross-workspace imports. Without this plan, Plan 01-03 produces a scaffold that LOOKS correct but has never been tested with a real `import { ... } from '@campaign/shared'`. This plan turns the scaffold into a verified contract.
Output: Backend and frontend index.ts files actually import shared schemas; full pipeline exits 0 from a fresh-clone simulation; Phase 1 ready to close.
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
@.planning/research/PITFALLS.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-VALIDATION.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-01-yarn4-workspaces-shared-scaffold-PLAN.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-02-root-ts-eslint-prettier-PLAN.md
@.planning/phases/01-monorepo-foundation-shared-schemas/01-03-pino-logger-module-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Plans 01, 02, 03 outputs consumed here: -->

Available from previous plans:
- `shared/dist/index.js` + `shared/dist/index.d.ts` — re-exports `RegisterSchema`, `RegisterInput`, `CampaignStatusEnum`, `CampaignStatus` (via the schemas/auth.ts + schemas/campaign.ts skeletons in Plan 01).
- `backend/src/util/logger.ts` — exports `logger` (Plan 03).
- `backend/src/index.ts` and `frontend/src/index.ts` — currently `export {};` placeholders (Plan 02 Task 2).
- Root + per-workspace tsconfigs (Plan 02), ESLint flat config (Plan 02), Prettier config (Plan 02).
- yarn.lock + node_modules + shared/dist (Plan 02 Task 1's first install).

Shared module API (consumable):
```typescript
// from @campaign/shared
export const RegisterSchema: z.ZodObject<{
  email: z.ZodString;
  password: z.ZodString;
  name: z.ZodString;
}>;
export type RegisterInput = { email: string; password: string; name: string };

export const CampaignStatusEnum: z.ZodEnum<['draft', 'scheduled', 'sending', 'sent']>;
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent';
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace backend/src/index.ts with cross-workspace import-proof (shared schemas + logger)</name>
  <read_first>
    - backend/src/index.ts (currently `export {};` from Plan 02)
    - shared/src/index.ts, shared/src/schemas/auth.ts, shared/src/schemas/campaign.ts (confirm what's exported)
    - backend/src/util/logger.ts (Plan 03 — confirm `logger` is the named export)
    - shared/dist/index.d.ts (Plan 02 Task 1 emitted this — confirms the public type surface backend will resolve against)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Code Examples (test-import.ts pattern verbatim)
    - eslint.config.mjs (confirm backend has `no-console: 'off'` so logger.info works without lint warnings)
  </read_first>
  <files>backend/src/index.ts</files>
  <action>
Overwrite `backend/src/index.ts` (currently `export {};` placeholder from Plan 02 Task 2). New content based on 01-RESEARCH.md §Code Examples (the `backend/src/test-import.ts` snippet) — adapted to live as the real entry point:

```typescript
// backend/src/index.ts
//
// Phase 1 entry point — proves the @campaign/shared workspace import resolves
// and the pino logger module loads. This file is intentionally non-executable
// (no `app.listen`, no `process.exit`) so it can be `import`-ed by the typecheck
// pass without spinning up an HTTP server. Phase 3 (Authentication) will replace
// this with the real Express bootstrap that calls `buildApp().listen(PORT)`.

import { RegisterSchema, CampaignStatusEnum, type CampaignStatus } from '@campaign/shared';
import { logger } from './util/logger.js';

// Compile-time proof: the shared schemas + types resolve via the workspace:* protocol
// and CampaignStatusEnum has the exact 4-state machine locked by DATA-01 / CLAUDE.md.
const _phase1ImportProof = {
  registerSchemaShape: RegisterSchema.shape,
  statuses: CampaignStatusEnum.options satisfies readonly CampaignStatus[],
};

// Runtime proof (executed only if this module is loaded — typecheck does not run it):
export function describePhase1(): { service: string; statuses: readonly CampaignStatus[] } {
  logger.debug({ proof: _phase1ImportProof }, 'Phase 1 scaffold loaded');
  return {
    service: '@campaign/backend',
    statuses: CampaignStatusEnum.options,
  };
}
```

KEY POINTS:
- **Imports `@campaign/shared` directly** — proves workspace:* protocol + `exports` field + types-first resolution all work (success criterion #4).
- **Imports `./util/logger.js`** with `.js` suffix (NodeNext requirement — Pitfall 8).
- **`type CampaignStatus`** import — type-only import (uses the `type` modifier inline) — proves the type-side of the export resolves.
- **`satisfies readonly CampaignStatus[]`** — modern TS satisfies operator: validates that `CampaignStatusEnum.options` is assignable to `readonly CampaignStatus[]` WITHOUT widening the type. Proves strict mode + exactOptionalPropertyTypes from tsconfig.base.json don't fight this code.
- **No `app.listen`, no `import express`, no top-level side effects** — file is import-safe; typecheck loads it without binding a port. This matches the 01-RESEARCH.md note: "test-import.ts (optional verification — proves @campaign/shared resolves)".
- **`describePhase1()` is exported** — gives the function a use site (avoids `unused export` lint warning if any rule requires it). Phase 3 will delete this file entirely and write the real Express bootstrap.
- **`_phase1ImportProof` is a `const`** with leading underscore — by ESLint convention (typescript-eslint default), variables prefixed with `_` are exempt from `no-unused-vars`. This avoids needing an `// eslint-disable-next-line` comment.
- **Uses `logger.debug` not `console.log`** — eslint backend section sets `no-console: 'off'` but Plan 03 §Pattern 9 set debug as the default level in dev, so this log will appear during dev runs but be filtered out in prod.

PROHIBITED CONTENT (per phase scope discipline):
- NO Express imports (Phase 3).
- NO Sequelize imports (Phase 2).
- NO BullMQ imports (Phase 5).
- NO `app.use(httpLogger)` (Phase 3 — that's where buildApp() lives).
- NO real route handlers.
  </action>
  <verify>
    <automated>test -f backend/src/index.ts && grep -q "@campaign/shared" backend/src/index.ts && grep -q "RegisterSchema" backend/src/index.ts && grep -q "CampaignStatusEnum" backend/src/index.ts && grep -q "from './util/logger.js'" backend/src/index.ts && grep -q "describePhase1" backend/src/index.ts && ! grep -q "from 'express'" backend/src/index.ts && ! grep -q "app.listen" backend/src/index.ts && ! grep -q "process.exit" backend/src/index.ts && yarn workspace @campaign/backend typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/index.ts` exists (replacing Plan 02's `export {};` placeholder).
    - File imports `RegisterSchema`, `CampaignStatusEnum`, and `type CampaignStatus` from `@campaign/shared` (proves workspace:* + exports field).
    - File imports `logger` from `./util/logger.js` (proves the relative .js suffix import resolves under NodeNext).
    - File exports a `describePhase1()` function (gives the imports a use site).
    - File does NOT import from `'express'`, `'sequelize'`, or `'bullmq'` (phase scope discipline).
    - File does NOT call `app.listen`, `process.exit`, or any side-effecting top-level code.
    - `yarn workspace @campaign/backend typecheck` exits 0.
    - `yarn workspace @campaign/backend lint` exits 0 (no `no-unused-vars`, no `no-console` errors — backend allows console; logger.debug is allowed).
  </acceptance_criteria>
  <done>backend/src/index.ts is the cross-workspace import-proof: imports RegisterSchema + CampaignStatusEnum + type CampaignStatus from @campaign/shared, imports logger from ./util/logger.js, exports describePhase1() — typechecks and lints clean, no Express, no listen.</done>
</task>

<task type="auto">
  <name>Task 2: Replace frontend/src/index.ts with cross-workspace import-proof (shared schemas)</name>
  <read_first>
    - frontend/src/index.ts (currently `export {};` from Plan 02)
    - shared/dist/index.d.ts (confirms the public type surface frontend will resolve against)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Code Examples (frontend test-import.ts pattern)
    - eslint.config.mjs — frontend section sets `no-console: 'warn'` and has React rules scoped via files glob (this file is .ts not .tsx so React rules don't apply)
    - frontend/tsconfig.json — confirms `lib: ["ES2022", "DOM", "DOM.Iterable"]` so DOM globals like `console` are typed
  </read_first>
  <files>frontend/src/index.ts</files>
  <action>
Overwrite `frontend/src/index.ts` (currently `export {};` placeholder). Adapt 01-RESEARCH.md §Code Examples frontend test-import snippet:

```typescript
// frontend/src/index.ts
//
// Phase 1 entry point — proves the @campaign/shared workspace import resolves
// from the frontend workspace via the workspace:* protocol. This file does not
// mount React, render anything, or fetch anything — it's a pure type+module
// resolution proof. Phase 8 (Frontend Foundation) will replace this with the
// Vite + React 18 mount point.

import { RegisterSchema, CampaignStatusEnum, type CampaignStatus } from '@campaign/shared';

// Compile-time proof: shared schemas + types resolve from frontend workspace.
const _phase1ImportProof = {
  registerSchemaShape: RegisterSchema.shape,
  statuses: CampaignStatusEnum.options satisfies readonly CampaignStatus[],
};

// Runtime proof — this function is exported so it has a use site, but is never
// called in Phase 1 (no entry script, no DOM mount).
export function describePhase1Frontend(): {
  workspace: string;
  statuses: readonly CampaignStatus[];
} {
  return {
    workspace: '@campaign/frontend',
    statuses: CampaignStatusEnum.options,
  };
}

// Suppress the unused-variable warning by exporting the proof object as well.
// Phase 8 will delete this entire file when it writes the React mount point.
export const __phase1ImportProof = _phase1ImportProof;
```

KEY POINTS:
- **Imports `@campaign/shared` directly** — proves workspace:* + exports field resolves from frontend workspace just as it does from backend (success criterion #4 covers BOTH workspaces).
- **NO React imports** — Phase 8.
- **NO Vite-specific imports** — Phase 8.
- **NO `console.log`** — `eslint.config.mjs` frontend section has `no-console: 'warn'`. Don't trip the warning; logging the proof is unnecessary at typecheck time.
- **`__phase1ImportProof` exported** — gives `_phase1ImportProof` a downstream use, avoiding `no-unused-vars` lint without needing an eslint-disable comment.
- **`satisfies readonly CampaignStatus[]`** — same modern TS pattern as backend; proves strict mode tolerance.

PROHIBITED CONTENT (per phase scope discipline):
- NO `import React from 'react'`.
- NO `ReactDOM.createRoot(...)`.
- NO `import './styles.css'`.
- NO Tailwind config / shadcn imports.
- NO Redux store / React Query setup.

The file is `.ts` not `.tsx` (no JSX in Phase 1) — confirmed by frontend/tsconfig.json's `include: ["src/**/*"]` which matches both, and React plugin's files glob `frontend/**/*.{ts,tsx}` which also matches both, but no JSX means React rules don't fire.
  </action>
  <verify>
    <automated>test -f frontend/src/index.ts && grep -q "@campaign/shared" frontend/src/index.ts && grep -q "RegisterSchema" frontend/src/index.ts && grep -q "CampaignStatusEnum" frontend/src/index.ts && grep -q "describePhase1Frontend" frontend/src/index.ts && ! grep -q "from 'react'" frontend/src/index.ts && ! grep -q "ReactDOM" frontend/src/index.ts && ! grep -q "from 'vite'" frontend/src/index.ts && ! grep -q "console\\." frontend/src/index.ts && yarn workspace @campaign/frontend typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `frontend/src/index.ts` exists (replacing Plan 02's `export {};` placeholder).
    - File imports `RegisterSchema`, `CampaignStatusEnum`, and `type CampaignStatus` from `@campaign/shared`.
    - File exports `describePhase1Frontend()` and `__phase1ImportProof`.
    - File does NOT import from `'react'`, `'react-dom'`, `'vite'`, `'@tanstack/react-query'`, `'@reduxjs/toolkit'` (Phase 8 scope).
    - File does NOT use `console.*` (avoids the `no-console: 'warn'` lint rule).
    - `yarn workspace @campaign/frontend typecheck` exits 0.
    - `yarn workspace @campaign/frontend lint` exits 0 (no errors, no warnings).
  </acceptance_criteria>
  <done>frontend/src/index.ts is the cross-workspace import-proof: imports RegisterSchema + CampaignStatusEnum + type CampaignStatus from @campaign/shared, exports describePhase1Frontend(), no React/Vite/console — typechecks and lints clean.</done>
</task>

<task type="auto">
  <name>Task 3: Run the full Phase 1 acceptance gate (fresh-clone simulation)</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-VALIDATION.md — "Full suite command" + "Sampling Rate" sections (defines the "Before /gsd-verify-work" full-suite-from-fresh requirement)
    - .planning/ROADMAP.md — Phase 1 Success Criteria (the 5 specific TRUEs that must hold)
    - package.json (root — confirm scripts.build / typecheck / lint / format:check are wired)
  </read_first>
  <files></files>
  <action>
This task runs NO file changes — it's the Phase 1 acceptance gate, simulating the experience of a reviewer cloning the repo and running the documented commands.

Step 1. Simulate fresh clone (delete every derived artifact, keep only committed files):
```bash
rm -rf node_modules .yarn/cache shared/dist
# Preserve: .yarn/releases/yarn-4.14.1.cjs (committed), yarn.lock (committed), all config files
```

Step 2. Run the full pipeline. Each command must exit 0:
```bash
yarn install --immutable
yarn build
yarn typecheck
yarn lint
yarn format:check
```

Step 3. Verify ROADMAP.md Phase 1 success criteria 1-5 explicitly:

**Success criterion #1:** `yarn install` from a fresh clone completes cleanly on Yarn 4 with `nodeLinker: node-modules` (no PnP), `packageManager` field pinned in root `package.json`.
```bash
test -f .yarn/releases/yarn-4.14.1.cjs
grep -q '"packageManager": "yarn@4.14.1"' package.json
grep -q 'nodeLinker: node-modules' .yarnrc.yml
test ! -f .pnp.cjs
test ! -f .pnp.loader.mjs
```

**Success criterion #2:** `yarn workspaces foreach -t --all run build` topologically builds `@campaign/shared` first, producing `shared/dist/index.{js,d.ts}` that backend and frontend can import.
```bash
yarn workspaces foreach -At run build
test -f shared/dist/index.js
test -f shared/dist/index.d.ts
test -f shared/dist/schemas/auth.d.ts
test -f shared/dist/schemas/campaign.d.ts
```

**Success criterion #3:** `yarn lint` and `yarn typecheck` run across all workspaces and pass on an empty scaffold.
```bash
yarn lint     # exit 0
yarn typecheck  # exit 0
```

**Success criterion #4:** Importing a Zod schema from `@campaign/shared` in both `backend/src/` and `frontend/src/` works via `workspace:*` protocol (no version-drift — `zod` declared only in `shared/package.json`).
```bash
grep -q "from '@campaign/shared'" backend/src/index.ts   # Tasks 1 placed it
grep -q "from '@campaign/shared'" frontend/src/index.ts  # Task 2 placed it
yarn workspace @campaign/backend typecheck   # resolves through workspace:*
yarn workspace @campaign/frontend typecheck  # resolves through workspace:*
! grep -q '"zod"' backend/package.json
! grep -q '"zod"' frontend/package.json
grep -q '"zod"' shared/package.json
yarn why zod | grep -E "^(├─|└─)" | wc -l    # Expect 1 (single hoisted version)
```

**Success criterion #5:** Pino + pino-http module exists in backend with request-logger and error-logger wiring (not yet mounted on a route — just the logger instance exported).
```bash
test -f backend/src/util/logger.ts
test -f backend/src/util/httpLogger.ts
grep -q "import pino" backend/src/util/logger.ts
grep -q "from 'pino-http'" backend/src/util/httpLogger.ts
grep -q "export const logger" backend/src/util/logger.ts
grep -q "export const httpLogger" backend/src/util/httpLogger.ts
! grep -rq "app.use" backend/src/   # NOT yet mounted
```

Step 4. (Optional manual verification — visual logger output checks per 01-VALIDATION.md "Manual-Only Verifications"):
```bash
# Pretty in dev (visual)
NODE_ENV=development tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"
# JSON in prod (visual)
NODE_ENV=production tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"
# Silent in test (no output)
NODE_ENV=test tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"
```
These are documented as MANUAL in 01-VALIDATION.md — they are NOT required for this task to pass. The Step 1-3 automated checks ARE required.

If ALL of Steps 1-3 pass, Phase 1 is complete and ready to hand off to Phase 2 (Schema/Migrations/Seed).
  </action>
  <verify>
    <automated>rm -rf node_modules .yarn/cache shared/dist && yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check && test -f shared/dist/index.js && test -f shared/dist/index.d.ts && test -f shared/dist/schemas/auth.d.ts && test -f shared/dist/schemas/campaign.d.ts && test -f backend/src/util/logger.ts && test -f backend/src/util/httpLogger.ts && grep -q "from '@campaign/shared'" backend/src/index.ts && grep -q "from '@campaign/shared'" frontend/src/index.ts && ! grep -q '"zod"' backend/package.json && ! grep -q '"zod"' frontend/package.json && test ! -f .pnp.cjs && grep -q '"packageManager": "yarn@4.14.1"' package.json && grep -q "nodeLinker: node-modules" .yarnrc.yml && ! grep -rqI "app\.use" backend/src/ 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - From a fresh `rm -rf node_modules .yarn/cache shared/dist` state, the 5-command pipeline (`yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`) exits 0 in under 60 seconds.
    - All 5 ROADMAP.md Phase 1 success criteria are observable as TRUE via the verify steps above.
    - `shared/dist/index.js`, `shared/dist/index.d.ts`, `shared/dist/schemas/auth.{js,d.ts}`, `shared/dist/schemas/campaign.{js,d.ts}` all exist after `yarn build`.
    - Backend `index.ts` imports from `@campaign/shared` AND from `./util/logger.js`; both resolve.
    - Frontend `index.ts` imports from `@campaign/shared`; resolves.
    - `zod` declared ONLY in `shared/package.json` (M7 verified — no duplication).
    - Yarn 4.14.1 binary committed; `packageManager` field pinned; `.yarnrc.yml` sets `nodeLinker: node-modules`.
    - No `.pnp.*` files anywhere (M6 verified).
    - No `app.use(...)` anywhere in `backend/src/` (route mounting deferred to Phase 3 per scope).
  </acceptance_criteria>
  <done>Fresh-clone full pipeline exits 0; all 5 ROADMAP Phase 1 success criteria verifiable; shared/dist/ produced by topological build; cross-workspace imports resolved in both backend and frontend; pino/pino-http modules in place but not mounted; M6 + M7 + M9 + C18 mitigations all verified intact.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Compiled shared/dist ↔ consumers | Backend + frontend resolve `@campaign/shared` to `shared/dist/*` (NOT `shared/src/*`) — guards Pitfall C18.6 (Vite chokes on TS from node_modules) |
| First-install postinstall ↔ subsequent commands | If postinstall fails (e.g., shared/src/ syntax error), `shared/dist/` doesn't exist and downstream typechecks fail loudly — no silent partial state |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | Cross-workspace import accidentally pulls from `shared/src/` instead of `shared/dist/` | mitigate | `shared/package.json` `exports[".".import]` points to `./dist/index.js` — Node + TS resolve only that path; bypass via `import from '@campaign/shared/src/...'` would fail (no `./src` subpath in exports map); Pitfall C18.6 |
| T-04-02 | Information Disclosure | Plan 03 logger imported into the same module that imports `@campaign/shared` could leak schema-shape info if logged | accept | `_phase1ImportProof` is logged at `debug` level which is filtered out in production (Plan 03 logger defaults to `info` in prod); the proof object contains schema field names (e.g., `email`, `password`) which are public knowledge from the API contract — no secret disclosure |
| T-04-03 | Tampering | Phase 1 acceptance gate accidentally tolerates a regression in M6/M7/M9 | mitigate | Task 3's automated verify block explicitly re-checks all four mitigations: `test ! -f .pnp.cjs` (M6), `! grep zod backend/package.json && ! grep zod frontend/package.json` (M7), topological `yarn build` succeeds (M9), root `resolutions` still pin Vitest (C18 — verified by Plan 01 grep of package.json) |
| T-04-04 | Tampering | A future PR weakens the cross-workspace import contract (e.g., switching to a relative `../shared/src/index.ts` import) | mitigate | Tasks 1 and 2 enforce literal `from '@campaign/shared'` (not `'../shared/...'`); CI re-running this gate on every PR catches regression |
</threat_model>

<verification>
Per-task: each task has an `<automated>` block.

Per-plan gate (Task 3 IS the Phase 1 acceptance gate):
```bash
rm -rf node_modules .yarn/cache shared/dist
yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check && \
  test -f shared/dist/index.js && \
  grep -q "from '@campaign/shared'" backend/src/index.ts && \
  grep -q "from '@campaign/shared'" frontend/src/index.ts && \
  test -f backend/src/util/logger.ts && \
  test -f backend/src/util/httpLogger.ts && \
  test ! -f .pnp.cjs && \
  echo "Phase 1 ACCEPTANCE GATE PASS"
```

Total runtime target: under 60 seconds from fresh state, per 01-VALIDATION.md sampling budget.
</verification>

<success_criteria>
1. `backend/src/index.ts` imports `RegisterSchema`, `CampaignStatusEnum`, `type CampaignStatus` from `@campaign/shared` and `logger` from `./util/logger.js`.
2. `frontend/src/index.ts` imports `RegisterSchema`, `CampaignStatusEnum`, `type CampaignStatus` from `@campaign/shared`.
3. Neither file mounts an HTTP server, renders React, or has top-level side effects.
4. From a fresh `rm -rf node_modules .yarn/cache shared/dist` state, `yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check` exits 0.
5. All 5 ROADMAP.md Phase 1 success criteria verifiable as TRUE.
6. M6 (no PnP), M7 (single zod), M8 (shared has zero workspace deps), M9 (topological build), C18 (Vitest 2.1.9 + plugin-react 4.7.0 pinned in root resolutions) all still mitigated.
7. Phase 1 is complete; Phase 2 (Schema, Migrations & Seed) can begin.
</success_criteria>

<output>
After completion, create `.planning/phases/01-monorepo-foundation-shared-schemas/01-04-SUMMARY.md` documenting:
- Two files updated: `backend/src/index.ts`, `frontend/src/index.ts` (cross-workspace import-proofs)
- Phase 1 acceptance gate PASS — fresh-clone full pipeline exits 0
- All 5 ROADMAP Phase 1 success criteria verified TRUE
- All Phase 1 mitigations intact (M6/M7/M8/M9/C18)
- Phase 1 closes; Phase 2 (DATA-01, DATA-02, DATA-03 — Sequelize models, migrations, seed) is unblocked
- Note for Phase 3 / Phase 8 executors: Replace `backend/src/index.ts` with the real Express bootstrap; replace `frontend/src/index.ts` with the React + Vite mount point. The Phase 1 placeholder code can be deleted entirely — its job was solely to prove the workspace:* contract.
</output>
