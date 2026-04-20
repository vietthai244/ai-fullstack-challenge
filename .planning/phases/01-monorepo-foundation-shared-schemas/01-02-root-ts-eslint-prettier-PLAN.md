---
phase: 01-monorepo-foundation-shared-schemas
plan: 02
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - tsconfig.base.json
  - tsconfig.json
  - eslint.config.mjs
  - .prettierrc
  - .prettierignore
  - backend/tsconfig.json
  - backend/src/index.ts
  - frontend/tsconfig.json
  - frontend/src/index.ts
  - yarn.lock
autonomous: true
requirements:
  - FOUND-04
requirements_addressed:
  - FOUND-04
tags:
  - typescript
  - eslint
  - prettier
  - tooling

must_haves:
  truths:
    - "`yarn install --immutable` from a fresh clone completes without error (lockfile committed)"
    - "`yarn typecheck` runs tsc --noEmit across shared, backend, frontend and exits 0"
    - "`yarn lint` runs ESLint flat config across all workspaces and exits 0"
    - "`yarn format:check` runs Prettier across all files and exits 0"
    - "`yarn workspaces foreach -At run build` exits 0 and produces shared/dist/index.js + shared/dist/index.d.ts"
    - "Each workspace tsconfig extends ../tsconfig.base.json"
    - "eslint-config-prettier is wired LAST in the flat config so style rules don't fight Prettier"
  artifacts:
    - path: "tsconfig.base.json"
      provides: "Shared TS compiler options (ES2022, NodeNext, strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)"
      contains: "NodeNext"
    - path: "tsconfig.json"
      provides: "Root solution-style tsconfig"
    - path: "eslint.config.mjs"
      provides: "ESLint flat config with typescript-eslint, React (frontend-scoped), eslint-config-prettier last"
      contains: "typescript-eslint"
    - path: ".prettierrc"
      provides: "Prettier rules (printWidth 100, singleQuote, trailingComma all, semi, tabWidth 2, endOfLine lf)"
      contains: "printWidth"
    - path: ".prettierignore"
      provides: "Skips dist, node_modules, .yarn, coverage, yarn.lock, *.md"
    - path: "backend/tsconfig.json"
      provides: "Backend workspace tsconfig (extends base, types [node])"
      contains: "\"types\": [\"node\"]"
    - path: "frontend/tsconfig.json"
      provides: "Frontend workspace tsconfig (extends base, jsx react-jsx, DOM lib)"
      contains: "react-jsx"
    - path: "yarn.lock"
      provides: "Committed lockfile from first successful install"
    - path: "shared/dist/index.js"
      provides: "Compiled shared module (produced by yarn build / postinstall)"
    - path: "shared/dist/index.d.ts"
      provides: "Compiled shared type declarations"
  key_links:
    - from: "backend/tsconfig.json"
      to: "tsconfig.base.json"
      via: "extends"
      pattern: "\"extends\":\\s*\"\\.\\./tsconfig\\.base\\.json\""
    - from: "frontend/tsconfig.json"
      to: "tsconfig.base.json"
      via: "extends"
      pattern: "\"extends\":\\s*\"\\.\\./tsconfig\\.base\\.json\""
    - from: "eslint.config.mjs (last entry)"
      to: "eslint-config-prettier"
      via: "import + last array position"
      pattern: "prettierConfig"
---

<objective>
Land the root-level TypeScript + ESLint + Prettier configuration (FOUND-04). Create `tsconfig.base.json` with the strict compiler options every workspace inherits, write the backend + frontend tsconfig.json files that extend it, commit a single flat ESLint config (`eslint.config.mjs`) with typescript-eslint v8 + React (frontend-scoped via `files` glob) + eslint-config-prettier last, and define the root `.prettierrc` + `.prettierignore`. Run the first successful `yarn install` (producing `yarn.lock` and `shared/dist/` via postinstall), and verify the full pipeline — `yarn install && yarn build && yarn typecheck && yarn lint && yarn format:check` — exits 0 on an empty scaffold.

Purpose: Every line of TypeScript written from Phase 2 onward inherits these compiler options, lint rules, and format conventions. Without them, workspaces cannot typecheck, lint, or build. This plan turns the Plan 01 skeleton into an installable, typechecked monorepo.
Output: Root configs committed; `shared/dist/` actually produced by build; full verify pipeline green on an empty scaffold.
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
@.planning/phases/01-monorepo-foundation-shared-schemas/01-01-yarn4-workspaces-shared-scaffold-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Plan 01 outputs consumed here: -->

Files available from Plan 01:
- `package.json` (root) — declares `typescript-eslint@^8.58.2`, `eslint@^9.39.4`, `prettier@^3.8.3`, `typescript@^5.8.3`, plus plugins (`@eslint/js`, `eslint-config-prettier`, `eslint-plugin-react`, `eslint-plugin-react-hooks`) as devDeps. Scripts already wired: `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn build`, `yarn format`.
- `shared/package.json` — has `typecheck`, `lint`, `build` scripts (build = `tsc -p tsconfig.json`).
- `shared/tsconfig.json` — already references `../tsconfig.base.json` (this plan creates that base file).
- `backend/package.json` + `frontend/package.json` — stubs with `typecheck: tsc -p tsconfig.json --noEmit` and `lint: eslint src` scripts but NO tsconfig.json yet (this plan creates them).
- `shared/src/` has `index.ts`, `schemas/index.ts`, `schemas/auth.ts`, `schemas/campaign.ts` with skeleton Zod schemas that MUST typecheck under the base options this plan writes.

Type-resolution chain this plan must complete:
```
tsconfig.base.json  (this plan — Task 1)
  ├── shared/tsconfig.json   (Plan 01 wrote it referencing ../tsconfig.base.json)
  ├── backend/tsconfig.json  (this plan — Task 2)
  └── frontend/tsconfig.json (this plan — Task 2)
```

IMPORTANT SEQUENCING: Root `postinstall` runs `yarn workspace @campaign/shared build`, which requires `tsconfig.base.json` to exist. Therefore `tsconfig.base.json` MUST be created BEFORE the first `yarn install` runs. Task 1 handles this.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create tsconfig.base.json + root tsconfig.json, then run first `yarn install`</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 5 (tsconfig.base.json exact compiler options), §Open Question #3 (tsc --noEmit vs -b)
    - .planning/research/PITFALLS.md — M6 (PnP check — verify no .pnp.* files after install), M9 (postinstall ensures topological build), C18 (Vitest pins already in root resolutions from Plan 01)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — Pitfall 8 (moduleResolution: NodeNext REQUIRED — not "node" or bare "ESNext")
    - package.json (root — confirm postinstall = `yarn workspace @campaign/shared build` and resolutions are present)
    - shared/tsconfig.json (confirm it sets noEmit: false + outDir: dist, relies on base for everything else)
  </read_first>
  <files>tsconfig.base.json, tsconfig.json, yarn.lock</files>
  <action>
Step 1. Create `tsconfig.base.json` at repo root EXACTLY matching 01-RESEARCH.md §Pattern 5 (copy verbatim):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "exclude": ["node_modules", "dist", "build"]
}
```
KEY DECISIONS (from 01-RESEARCH.md §Pattern 5):
- `target: "ES2022"` — Node 20+ supports natively; matches STACK.md node:20-alpine runtime.
- `module: "NodeNext"` + `moduleResolution: "NodeNext"` — REQUIRED pairing. Any other combination breaks `exports` conditional resolution in consumed workspaces (Pitfall 8). Do NOT use `"node"` (legacy). Do NOT use bare `"ESNext"` without the matching `moduleResolution`.
- `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` — senior-level strictness; catches `.at()` undefined leaks and `foo?: undefined` bugs.
- `isolatedModules: true` — required for tsx + Vite file-by-file transforms to work correctly.
- `noEmit: true` is the base default. `shared/tsconfig.json` (Plan 01 already wrote it) overrides to `noEmit: false` — shared is the ONE emitter.
- NO `composite`, NO `declaration` at base level — set per-workspace.

Step 2. Create `tsconfig.json` at repo root — solution-style, empty. Purpose: prevents IDEs / tools from picking up `tsconfig.base.json` as a compilable project (`tsconfig.base.json` has no `include`/`files`, so if the editor latches onto it as the "root project", it tries to compile all workspaces simultaneously with the base's `noEmit: true` — harmless but confusing).
```json
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "include": []
}
```
Empty `files` + empty `include` = compiles nothing; it's purely a marker file for editors.

Step 3. Run the first full install (this is the ONLY task in this plan that runs `yarn install`; all subsequent tasks rely on `node_modules/` already being populated):
```bash
yarn install
```
This runs:
1. Resolves workspaces (sees `["shared", "backend", "frontend"]`).
2. Installs all deps across all three workspaces + root devDeps.
3. Writes `yarn.lock`.
4. Runs root `postinstall` → `yarn workspace @campaign/shared build` → `tsc -p tsconfig.json` in `shared/` → emits `shared/dist/index.js`, `shared/dist/index.d.ts`, `shared/dist/schemas/*.js`, `shared/dist/schemas/*.d.ts`, + sourcemaps.

EXPECTED OUTPUT:
- `yarn.lock` created at repo root.
- `shared/dist/index.js` and `shared/dist/index.d.ts` exist.
- `node_modules/@campaign/shared` is a symlink to `../../shared/` (node-modules linker convention — proves workspace protocol resolved).
- NO `.pnp.cjs`, `.pnp.loader.mjs`, `.pnp.data.json` files anywhere in repo root (M6 verification).
- `yarn why zod` reports exactly one zod version (M7 verification — hoisted once).

If install fails with `error TS18003: No inputs were found` during postinstall's shared build — this means `shared/src/` is empty (Plan 01 should have created `src/index.ts`, `src/schemas/{index,auth,campaign}.ts`; verify before proceeding).

If install fails with "Cannot find module 'typescript-eslint'" — this is NOT a problem at install time; it only matters when `yarn lint` runs (Task 4 after Task 3 writes `eslint.config.mjs`).
  </action>
  <verify>
    <automated>test -f tsconfig.base.json && test -f tsconfig.json && grep -q '"moduleResolution": "NodeNext"' tsconfig.base.json && grep -q '"strict": true' tsconfig.base.json && grep -q '"noUncheckedIndexedAccess": true' tsconfig.base.json && yarn install 2>&1 | tail -3 && test -f yarn.lock && yarn install --immutable 2>&1 | tail -3 && test -f shared/dist/index.js && test -f shared/dist/index.d.ts && test ! -f .pnp.cjs && test ! -f .pnp.loader.mjs && test -L node_modules/@campaign/shared</automated>
  </verify>
  <acceptance_criteria>
    - `tsconfig.base.json` exists with exactly the compiler options from 01-RESEARCH.md §Pattern 5 — must contain `"moduleResolution": "NodeNext"`, `"module": "NodeNext"`, `"target": "ES2022"`, `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"isolatedModules": true`, `"noEmit": true`.
    - `tsconfig.json` (root) extends `./tsconfig.base.json` with empty `files` and `include` arrays.
    - `yarn install` (first run, permissive) succeeds; subsequent `yarn install --immutable` also succeeds.
    - `yarn.lock` exists at repo root.
    - `shared/dist/index.js` + `shared/dist/index.d.ts` exist (postinstall succeeded).
    - `shared/dist/schemas/auth.d.ts` + `shared/dist/schemas/campaign.d.ts` exist (proves .d.ts emission worked).
    - NO `.pnp.cjs`, `.pnp.loader.mjs`, or `.pnp.data.json` files at repo root (M6 mitigated — PnP is disabled).
    - `node_modules/@campaign/shared` is a symlink (verified by `test -L`; proves workspace:* protocol resolved).
    - `yarn why zod` output reports exactly one zod version (M7 verification — no duplicate hoisting).
  </acceptance_criteria>
  <done>Root tsconfig.base.json + tsconfig.json land with strict NodeNext options; `yarn install` produces yarn.lock + shared/dist/*; no PnP artifacts; @campaign/shared symlink resolves; zod has exactly one instance.</done>
</task>

<task type="auto">
  <name>Task 2: Create backend + frontend tsconfig.json (both extend base) + minimal src/ placeholders</name>
  <read_first>
    - tsconfig.base.json (just created in Task 1 — confirm `noEmit: true` is inherited)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 6 (workspace-extending tsconfig examples for backend + frontend, verbatim)
    - backend/package.json, frontend/package.json (confirm scripts reference `tsc -p tsconfig.json --noEmit`)
    - shared/tsconfig.json (already created — same `extends` pattern)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — Pitfall 8 (moduleResolution requirement already satisfied by base)
  </read_first>
  <files>backend/tsconfig.json, backend/src/index.ts, frontend/tsconfig.json, frontend/src/index.ts</files>
  <action>
Step 1. Create `backend/tsconfig.json` EXACTLY matching 01-RESEARCH.md §Pattern 6:
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
KEY POINTS (from 01-RESEARCH.md §Pattern 6):
- `types: ["node"]` — explicitly opts in to Node typings (`@types/node` is declared in backend/package.json). Without this, `process`, `Buffer`, `crypto.randomUUID()`, etc., have no types.
- `lib: ["ES2022"]` — same as base; no DOM lib (backend runs in Node, not browser).
- `rootDir: "src"` — limits compile scope to `src/`; prevents Vitest config files (future) from being treated as src.
- `noEmit: true` is inherited from base — Phase 1 only typechecks. Backend's compiled `dist/` is produced by Phase 10's Docker multi-stage build; Phases 3-9 run directly via `tsx`.

Step 2. Create `frontend/tsconfig.json` EXACTLY matching 01-RESEARCH.md §Pattern 6:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": [],
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```
KEY POINTS:
- `jsx: "react-jsx"` — modern React 17+ automatic JSX transform; no `import React` needed in .tsx files.
- `lib: ["ES2022", "DOM", "DOM.Iterable"]` — adds DOM for browser globals (document, window, fetch, etc.).
- `types: []` — explicitly empty array (opts out of ALL ambient types from node_modules/@types/*). This prevents Node globals from accidentally leaking into browser code. React/shadcn/Vite types come in Phase 8 via their own package.json `dependencies`.

Step 3. Create minimal placeholder source files so `tsc --noEmit` has inputs to check (avoids `error TS18003: No inputs were found`):

`backend/src/index.ts`:
```typescript
// Phase 1 placeholder — Express app + BullMQ worker wiring lands in Phase 3+.
// Keeping as a valid empty ES module so `tsc --noEmit` has an input.
export {};
```

`frontend/src/index.ts`:
```typescript
// Phase 1 placeholder — React app bootstrap lands in Phase 8.
// Keeping as a valid empty ES module so `tsc --noEmit` has an input.
export {};
```

Both files are valid empty ES modules (`export {}` is the canonical way to make a file a module without exporting anything). They'll be replaced in later phases — Phase 3 rewrites `backend/src/index.ts` into the Express bootstrap, Phase 8 rewrites `frontend/src/index.ts` into the React mount point.

Step 4. Verify all three workspaces typecheck cleanly:
```bash
yarn workspace @campaign/shared typecheck
yarn workspace @campaign/backend typecheck
yarn workspace @campaign/frontend typecheck
# OR — equivalently
yarn typecheck
```
All three should exit 0. If shared typecheck fails, check that `shared/src/schemas/*.ts` uses `.js` suffixes in imports (Pitfall 8 — NodeNext resolution requirement). If backend fails with "Cannot find name 'process'" or similar, check `types: ["node"]` is in `backend/tsconfig.json`.
  </action>
  <verify>
    <automated>test -f backend/tsconfig.json && test -f frontend/tsconfig.json && test -f backend/src/index.ts && test -f frontend/src/index.ts && grep -q '"extends": "\.\./tsconfig.base.json"' backend/tsconfig.json && grep -q '"extends": "\.\./tsconfig.base.json"' frontend/tsconfig.json && grep -q '"types"' backend/tsconfig.json && grep -q '"node"' backend/tsconfig.json && grep -q '"jsx": "react-jsx"' frontend/tsconfig.json && grep -q '"DOM"' frontend/tsconfig.json && yarn typecheck 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `backend/tsconfig.json` extends `../tsconfig.base.json`, sets `types: ["node"]`, `lib: ["ES2022"]`, `rootDir: "src"`, `include: ["src/**/*"]`.
    - `frontend/tsconfig.json` extends `../tsconfig.base.json`, sets `jsx: "react-jsx"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: []`, `rootDir: "src"`, `include: ["src/**/*"]`.
    - Neither backend nor frontend tsconfig overrides `noEmit` (both inherit `true` from base — Phase 1 is typecheck-only).
    - `backend/src/index.ts` and `frontend/src/index.ts` exist, both containing `export {};` (valid empty ES modules).
    - `yarn typecheck` (which runs `yarn workspaces foreach -Apt run typecheck`) exits 0 across all three workspaces.
    - `yarn workspace @campaign/shared typecheck` exits 0 (proves shared/src/ schemas compile under strict + NodeNext + noUncheckedIndexedAccess + exactOptionalPropertyTypes).
  </acceptance_criteria>
  <done>backend/ + frontend/ each have tsconfig.json extending the base, src/index.ts placeholder so tsc has inputs, and `yarn typecheck` exits 0 across all three workspaces.</done>
</task>

<task type="auto">
  <name>Task 3: Create eslint.config.mjs (flat config) + .prettierrc + .prettierignore</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 7 (ESLint flat config verbatim), §Pattern 8 (Prettier config verbatim), §Open Question #1 (filename must be `.mjs` not `.js`)
    - .planning/research/PITFALLS.md — review flat-config anti-patterns in Pitfalls section (ESLint 8 + .eslintrc.cjs is deprecated; prefer flat)
    - package.json (root — confirm `@eslint/js`, `eslint`, `typescript-eslint`, `eslint-config-prettier`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `prettier` are all in devDependencies)
    - shared/package.json, backend/package.json, frontend/package.json (confirm `lint: eslint src` script — root `yarn lint` runs `eslint .` which hits everything via flat config's file globs)
  </read_first>
  <files>eslint.config.mjs, .prettierrc, .prettierignore</files>
  <action>
Step 1. Create `eslint.config.mjs` at repo root EXACTLY matching 01-RESEARCH.md §Pattern 7 (copy verbatim — this is ESM flat config):

FILENAME IS `.mjs` (NOT `.js`) — per 01-RESEARCH.md §Open Question #1: root `package.json` deliberately does NOT set `"type": "module"`, so `.js` would be interpreted as CommonJS and the `import` statements would fail. Using `.mjs` forces ESM regardless.

```javascript
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  // 0. Ignore patterns (flat-config replacement for .eslintignore)
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.yarn/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  // 1. Base JS rules
  js.configs.recommended,

  // 2. TypeScript recommended rules
  ...tseslint.configs.recommended,

  // 3. Frontend-specific: React + React Hooks
  {
    files: ['frontend/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'no-console': 'warn',
    },
  },

  // 4. Backend-specific: no-console OFF (pino is the logger)
  {
    files: ['backend/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // 5. Shared workspace: minimal rules
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-console': 'error', // shared is a library — absolutely no console
    },
  },

  // 6. Prettier compat — MUST be last to disable conflicting style rules
  prettierConfig,
];
```

KEY POINTS (from 01-RESEARCH.md §Pattern 7):
- Flat config is an array of config objects; later entries override earlier ones.
- `eslint-config-prettier` MUST be LAST (per its docs) — it disables all formatting rules so Prettier owns formatting.
- `tseslint.configs.recommended` spreads into the array with `...`.
- React plugin applies ONLY to `frontend/**` via `files` glob (won't pollute backend).
- Backend disables `no-console` because pino is the structured logger there (but backend shouldn't use console anyway; the rule is off defensively for Phase 1 placeholder code).
- Frontend `no-console: 'warn'` catches accidental debug statements.
- Shared `no-console: 'error'` — library hygiene; shared is a pure data-validation module.
- NO type-aware linting (`strict-type-checked` / `parserOptions.project`) — adds 10-30s per lint run with minimal signal at this project size.
- Ignores array covers `dist/`, `node_modules/`, `.yarn/`, `coverage/`, and all `.config.{js,ts}` files (config files often have their own typing conventions).

Step 2. Create `.prettierrc` at repo root EXACTLY matching 01-RESEARCH.md §Pattern 8:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```
RATIONALE:
- `printWidth: 100` — modern default (older 80 is too wrap-heavy for TS).
- `singleQuote: true` — JS/TS convention; matches most shadcn snippets.
- `trailingComma: 'all'` — cleaner git diffs on multi-line changes.
- `endOfLine: 'lf'` — cross-platform consistency (avoids CRLF drift on Windows).
- `arrowParens: 'always'` — consistency: `(x) => x` even for single args.

Step 3. Create `.prettierignore` at repo root EXACTLY matching 01-RESEARCH.md §Pattern 8:
```
node_modules
dist
build
coverage
.yarn
yarn.lock
*.md
```
RATIONALE:
- `*.md` is critical — it prevents Prettier from reflowing the planning docs in `.planning/**` and `.docs/**` (which would mutate the reviewer's original spec — CLAUDE.md §Guardrails forbids modifying `.docs/requirements.md`).
- `yarn.lock` — generated file; never format.
- `.yarn` — vendor binaries + cache; skip entirely.
  </action>
  <verify>
    <automated>test -f eslint.config.mjs && test -f .prettierrc && test -f .prettierignore && grep -q "typescript-eslint" eslint.config.mjs && grep -q "prettierConfig" eslint.config.mjs && grep -q "eslint-config-prettier" eslint.config.mjs && tail -4 eslint.config.mjs | grep -q "prettierConfig" && grep -q '"printWidth": 100' .prettierrc && grep -q '"singleQuote": true' .prettierrc && grep -q '"trailingComma": "all"' .prettierrc && grep -q '"endOfLine": "lf"' .prettierrc && grep -q "node_modules" .prettierignore && grep -q "\*\.md" .prettierignore && grep -q "yarn.lock" .prettierignore</automated>
  </verify>
  <acceptance_criteria>
    - `eslint.config.mjs` (filename ends in `.mjs` — NOT `.js` or `.cjs`) exists at repo root.
    - `eslint.config.mjs` imports `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-config-prettier`.
    - `eslint.config.mjs` exports an array with `prettierConfig` as the LAST entry (verified by `tail -4 eslint.config.mjs | grep prettierConfig`).
    - `eslint.config.mjs` has frontend-scoped React rules (via `files: ['frontend/**/*.{ts,tsx}']`) and backend-scoped `no-console: 'off'`.
    - `.prettierrc` contains `printWidth: 100`, `singleQuote: true`, `trailingComma: "all"`, `semi: true`, `tabWidth: 2`, `arrowParens: "always"`, `endOfLine: "lf"`.
    - `.prettierignore` contains `node_modules`, `dist`, `build`, `coverage`, `.yarn`, `yarn.lock`, `*.md`.
  </acceptance_criteria>
  <done>eslint.config.mjs is ESM flat config with typescript-eslint + React (frontend-scoped) + eslint-config-prettier LAST; .prettierrc has the modern 100-col singleQuote trailingComma=all shape; .prettierignore excludes dist/node_modules/.yarn/yarn.lock/*.md.</done>
</task>

<!-- Task 4 (full-pipeline gate) removed per plan-checker W7 — duplicates Plan 04 Task 3.
     Plan 04 Task 3 is the canonical Phase 1 acceptance gate (fresh `rm -rf` + full 5-command verify). -->

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer source ↔ compiler output | `tsconfig.base.json` locks strict options — every workspace inherits; nothing can downgrade to `strict: false` silently |
| Lint rules ↔ format rules | `eslint-config-prettier` wired LAST disables lint rules that fight Prettier — guarantees no rule-war CI failures |
| Node resolution ↔ exports conditions | `moduleResolution: "NodeNext"` (base) is the ONLY setting that honors the `exports` field in `@campaign/shared` — any downgrade to `"node"` breaks type imports (Pitfall 8) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | tsconfig.base.json strictness downgrade | mitigate | Single source of truth — every workspace extends via `"extends": "../tsconfig.base.json"`; grep-verified in acceptance criteria. Any PR lowering strictness requires explicit edit to the base file; ASVS V14.2 (configuration integrity) |
| T-02-02 | Tampering | ESLint rule conflict with Prettier (format-war) | mitigate | `eslint-config-prettier` is the LAST entry in the flat config array (verified by `tail -4 eslint.config.mjs \| grep prettierConfig`); disables every ESLint style rule so Prettier wins unambiguously |
| T-02-03 | Tampering | `moduleResolution` set to legacy `"node"` | mitigate | Base pins `moduleResolution: "NodeNext"` alongside `module: "NodeNext"` (Pitfall 8); type imports from `@campaign/shared` break loudly if someone downgrades — impossible to regress silently |
| T-02-04 | Information Disclosure | Prettier reflowing committed spec file (`.docs/requirements.md`) | mitigate | `.prettierignore` lists `*.md` — Prettier never touches markdown files; reviewer's spec stays verbatim per CLAUDE.md guardrail |
| T-02-05 | Tampering | Lockfile drift between dev install and CI install | mitigate | `yarn.lock` committed; `yarn install --immutable` used in CI + verification; ASVS V14.1 (dependency integrity) |
| T-02-06 | Tampering | Type-aware lint adding transitive complexity | accept | Flat config intentionally uses `tseslint.configs.recommended` (non-type-aware) — faster CI, zero `parserOptions.project` maintenance; acceptable for 4-8hr scope |
</threat_model>

<verification>
Per-task: each task has an `<automated>` block that must exit 0.

Per-plan gate (end of this plan — Task 4 IS the gate):
```bash
rm -rf node_modules .yarn/cache shared/dist
yarn install --immutable && \
  yarn build && \
  yarn typecheck && \
  yarn lint && \
  yarn format:check && \
  echo "Plan 02 verification gate PASS"
```
Total runtime target: under 45 seconds on a warm machine, per 01-VALIDATION.md sampling budget.

This plan also unblocks Plan 03 (pino logger) — without `tsconfig.base.json` + backend/tsconfig.json, Plan 03's `backend/src/util/logger.ts` typecheck would fail.
</verification>

<success_criteria>
1. `tsconfig.base.json` exists at repo root with NodeNext module resolution, strict mode, and all 4 "senior strictness" flags (noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noFallthroughCasesInSwitch).
2. `tsconfig.json` (root, solution-style) extends `./tsconfig.base.json` with empty files + include.
3. `backend/tsconfig.json` + `frontend/tsconfig.json` extend `../tsconfig.base.json` with their workspace-specific options (backend: types=[node]; frontend: jsx=react-jsx, DOM lib, types=[]).
4. `eslint.config.mjs` (flat config, ESM) has typescript-eslint recommended rules + React rules scoped to `frontend/**` + `eslint-config-prettier` as the LAST entry.
5. `.prettierrc` + `.prettierignore` match 01-RESEARCH.md §Pattern 8 exactly; `*.md` is in ignore (protects `.docs/requirements.md` and `.planning/**`).
6. `yarn install --immutable` succeeds from a fresh `rm -rf node_modules .yarn/cache shared/dist` state.
7. `yarn build` produces `shared/dist/index.js` + `shared/dist/index.d.ts` + compiled schema files.
8. `yarn typecheck` exits 0 across all three workspaces.
9. `yarn lint` exits 0 with zero errors and zero warnings on the empty scaffold.
10. `yarn format:check` exits 0.
11. No `.pnp.*` files anywhere (M6 verified).
12. `yarn why zod` reports exactly one zod version (M7 verified).
</success_criteria>

<output>
After completion, create `.planning/phases/01-monorepo-foundation-shared-schemas/01-02-SUMMARY.md` documenting:
- Root configs landed: tsconfig.base.json, tsconfig.json, eslint.config.mjs, .prettierrc, .prettierignore
- Workspace tsconfigs: backend/tsconfig.json, frontend/tsconfig.json
- First successful `yarn install` produced yarn.lock + shared/dist/
- Full verify pipeline green: `yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`
- Confirmed: no PnP leakage (M6), single zod instance (M7), topological build works (M9), Vitest 2.1.9 + plugin-react 4.7.0 pins in place (C18)
- Enables Plan 03 (pino logger — needs backend/tsconfig.json) and Plan 04 (cross-workspace import proof)
</output>
