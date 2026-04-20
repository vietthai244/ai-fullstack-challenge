# Phase 1: Monorepo Foundation & Shared Schemas — Research

**Researched:** 2026-04-20
**Domain:** Yarn 4 flat workspaces + shared-types library + root TS/ESLint/Prettier + pino logger
**Confidence:** HIGH

## Summary

Phase 1 builds the contract that every downstream phase depends on: a Yarn 4 flat monorepo (`backend/` + `frontend/` + `shared/`) where `@campaign/shared` emits compiled `dist/` via `tsc`, and all three workspaces share root-level TypeScript / ESLint / Prettier configuration. It also scaffolds the pino + pino-http logger module in the backend (not yet mounted on routes — just the exported instance). The phase has no business logic; it locks tooling, dependency resolution, and build order.

Nearly every decision in this phase is already locked by `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md §11`, `.planning/research/PITFALLS.md` (items M6, M7, M8, M9, C18), and `CLAUDE.md`. Research focus here is exhaustively prescriptive — exact file contents, exact version pins, exact script wiring — so the planner can write file-by-file tasks with no ambiguity.

**Primary recommendation:** Use `corepack use yarn@4.14.1` to pin Yarn via `packageManager`, set `nodeLinker: node-modules` in `.yarnrc.yml`, declare zod / typescript / eslint / prettier / pino at the correct workspace levels only (zod in `shared/` only — M7 mitigation), wire a root `postinstall` that runs `yarn workspace @campaign/shared build` so backend/frontend always have fresh `dist/` types before they load, and use `yarn workspaces foreach -t --all run build` (topological, `-t` flag) for full builds.

## User Constraints (from context)

> No CONTEXT.md exists yet for this phase (discuss-phase was skipped per mode: yolo). Constraints are sourced from PROJECT.md §Key Decisions, STACK.md, ARCHITECTURE.md §11, CLAUDE.md §Stack, and PITFALLS.md — all marked as locked in CLAUDE.md: **"Do not re-open Key Decisions in PROJECT.md without explicit user instruction."**

### Locked Decisions

- **Yarn 4** (currently 4.14.1) with `nodeLinker: node-modules` — NOT PnP (PITFALLS M6, C18.6)
- **Flat layout**: `backend/`, `frontend/`, `shared/` at repo root — NOT `packages/*` (ARCHITECTURE §11)
- **Scoped package names**: `@campaign/backend`, `@campaign/frontend`, `@campaign/shared`
- **`shared/` emits compiled `dist/`** via `tsc` — NOT raw TS consumption (PITFALLS C18.6: Vite optimizer chokes on TS from `node_modules`)
- **TypeScript project references intentionally skipped** — workspace resolution is sufficient at 3 workspaces (ARCHITECTURE §11: "~30 min of config for negligible benefit at this scale")
- **zod declared ONLY in `shared/package.json`** — version-drift mitigation (PITFALLS M7: zod instanceof breaks across major version drift)
- **zod 3.x pinned** (`^3.23.8` per STACK.md) — NOT zod 4, even though zod@latest is 4.3.6 (STACK.md is authoritative)
- **Vitest 2.1.9 + @vitejs/plugin-react 4.7.0 pinned via root `resolutions`** (PITFALLS C18.5)
- **pino + pino-http** for structured logging; logger module created in Phase 1, route mounting happens in Phase 3
- **Access token split**: logger config is environment-aware (pretty in dev, JSON in prod, silent in test)

### Claude's Discretion

- Exact TypeScript compiler options within the "strict + modern" envelope (target / module / moduleResolution / lib values)
- ESLint flat config vs legacy `.eslintrc` (research recommends flat — typescript-eslint v8 supports it natively)
- Prettier config values (print width, quote style, etc.) — default to modern conventions
- Whether to use `concurrently` for dev-mode `shared` watch + backend tsx + frontend vite, or document a simpler sequential dev flow
- Exact pino-http options (`customLogLevel`, `genReqId`, `autoLogging` in test)
- Whether `postinstall` or an explicit `prepare` step builds `shared/` — recommend `postinstall` (matches ARCHITECTURE §11 and PITFALLS C18.1)

### Deferred Ideas (OUT OF SCOPE)

- Husky + lint-staged pre-commit hooks (over-engineering for a 4-8 hr project)
- `commitlint` / conventional commits enforcement
- CI/CD configuration (out of v1 scope per REQUIREMENTS.md)
- Turborepo / nx orchestration (`yarn workspaces foreach -t` is sufficient)
- Changesets / versioning (private, non-publishable workspaces)
- Docker wiring for any service (Phase 10)
- Shared ESLint *package* like `@campaign/eslint-config` (overkill at 3 workspaces; root-level config is fine)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Yarn-workspaces monorepo (Yarn 4, `nodeLinker: node-modules`) with `backend/`, `frontend/`, `shared/`; `shared/` compiles to `dist/` via `tsc`; root `postinstall` builds `shared` | §1. Yarn 4 Setup; §2. Workspace Shapes; §4. `shared/` tsc build; §9. Dev Flow; §14. Files-to-Create |
| FOUND-04 | Root-level TypeScript + ESLint + Prettier extended by each workspace | §3. Root tsconfig.base.json; §5. ESLint Flat Config; §6. Prettier |
| FOUND-05 | Pino structured logging wired into the API (request logger + error logger) — just the logger module, no route mounting yet | §7. pino Logger Module; §8. pino-http Middleware |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dependency install & workspace resolution | Build tooling (Yarn 4) | — | Yarn owns workspace topology, hoisting, `workspace:*` protocol |
| Shared type emission | Build tooling (`tsc` in `shared/`) | — | `tsc` is the only build step in Phase 1; backend/frontend build steps are later phases |
| Root TS / ESLint / Prettier config | Build tooling (root) | Workspaces (extend) | Single source of truth at root, workspaces extend via `extends:` (TS) and `import` (ESLint flat) |
| Backend logger module | Backend (Node runtime) | — | pino runs inside the API process; no HTTP mounting yet (deferred to Phase 3 auth wiring) |
| Dev watch mode | Build tooling (tsc -w + tsx + Vite) | — | Each workspace has its own dev command; root `yarn dev` orchestrates |

## Standard Stack

### Core (root-level devDependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | `5.8.3` | Shared TS compiler for all three workspaces | [VERIFIED: npm view typescript — released 2026-02, stable] Note: TS 6.0.3 is `latest` (2026-04-16) but typescript-eslint 8.58.2 peers `typescript >=4.8.4 <6.1.0` — TS 6 is supported but recently-released; 5.8.3 is the safer pin for a 4-8hr project |
| `prettier` | `3.8.3` | Code formatter | [VERIFIED: npm view prettier] |
| `eslint` | `9.39.4` (maintenance) or `10.2.1` (latest) | Linter | [VERIFIED: npm view eslint dist-tags — `maintenance: 9.39.4`, `latest: 10.2.1`] **Pin `9.39.4`** — ESLint 10 just landed; stick with 9 maintenance line to match typescript-eslint 8 peer range which covers both (`^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`) |
| `typescript-eslint` | `8.58.2` | Unified TS-ESLint package (replaces separate `@typescript-eslint/parser` + `/eslint-plugin`) | [VERIFIED: npm view typescript-eslint — released 2026-04-13, supports ESLint 8/9/10 and TS 4.8.4–6.1.0] |
| `@eslint/js` | latest | ESLint's own recommended JS rules (for flat config) | [CITED: typescript-eslint.io/getting-started flat-config example] |
| `eslint-config-prettier` | `10.1.8` | Disables ESLint rules that conflict with Prettier | [VERIFIED: npm view eslint-config-prettier] |
| `eslint-plugin-react` | `7.37.5` | React-specific lint rules (frontend only but declared at root for simplicity) | [VERIFIED: npm view eslint-plugin-react] |
| `eslint-plugin-react-hooks` | `7.1.1` | React hooks rules-of-hooks | [VERIFIED: npm view eslint-plugin-react-hooks] |

### Backend-specific (declared in `backend/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pino` | `10.3.1` | Structured JSON logger | [VERIFIED: npm view pino — latest 10.3.1; current major] |
| `pino-http` | `11.0.0` | Express middleware wrapping pino for req/res logging | [VERIFIED: npm view pino-http] |
| `pino-pretty` | `13.1.3` | Dev-only pretty printer transport | [VERIFIED: npm view pino-pretty] |
| `tsx` | `4.21.0` | Dev runner for TS Node process (replaces ts-node, faster ESM) | [VERIFIED: npm view tsx; locked by STACK.md] |
| `@types/node` | `20.x` | Node typings | Node 20 LTS matches STACK.md and Docker base image |
| `@campaign/shared` | `workspace:*` | Shared Zod schemas | Workspace protocol per ARCHITECTURE §11 |

### Frontend-specific (declared in `frontend/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@campaign/shared` | `workspace:*` | Shared Zod schemas | Same workspace protocol |
| *(no new Phase 1 deps — Vite/React/Tailwind are Phase 8)* | | | |

### Shared workspace (declared in `shared/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^3.23.8` (3.x only — pinned per STACK.md) | Schema validation + inferred types | [VERIFIED: latest 3.x is 3.25.76; STACK.md pins 3.23.8 as minimum] Do NOT upgrade to zod 4 in Phase 1 |
| `typescript` | same as root | Build (devDep only) | `dist/` emitted via root `tsc` install, but `typescript` declared at root and hoisted |

### Root `resolutions` (exact pins — mitigates C18.5)

| Package | Pin | Why |
|---------|-----|-----|
| `vitest` | `2.1.9` | Last 2.x compatible with Vite 5 [VERIFIED: STACK.md + npm view vitest@2.1.9] |
| `@vitest/coverage-v8` | `2.1.9` | Must match vitest version |
| `@vitejs/plugin-react` | `4.7.0` | Last 4.x supporting Vite 5 [VERIFIED: STACK.md] |
| `zod` | `^3.23.8` | Belt-and-suspenders: even if some transitive dep pulls zod 4, resolutions force 3.x to match `shared/` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat workspaces | `packages/*` layout | Rejected in ARCHITECTURE §11 — spec wording uses "backend/frontend"; flat matches the reviewer's mental model |
| `tsc` emit from `shared/` | Raw TS imports via Vite/Vitest transform | Rejected in PITFALLS C18.6 — Vite optimizer chokes on TS from `node_modules` |
| TS project references | Workspace resolution only | Rejected in ARCHITECTURE §11 — adds config cost without observable benefit at 3 workspaces |
| ESLint 10 | ESLint 9 maintenance | ESLint 10 is current `latest` but recently released — 9.39.4 maintenance line has more community validation |
| typescript-eslint v8 flat config | Legacy `.eslintrc.cjs` | Flat config is officially recommended by typescript-eslint docs; legacy works but is deprecated |
| TypeScript 6.0.3 (current `latest`) | TypeScript 5.8.3 | TS 6.0.x lands in same week as this research — 5.8.3 has broader ecosystem validation; typescript-eslint 8 supports both |
| Separate `@typescript-eslint/parser` + `/eslint-plugin` | Unified `typescript-eslint` package | `typescript-eslint` v8+ is the recommended unified entrypoint per getting-started docs |
| `concurrently` for dev orchestration | Manual `yarn workspace @campaign/shared dev` + separate backend/frontend terminals | `concurrently` is simpler; adding it is Claude's discretion. Recommend: ship without — `postinstall` builds `shared` once, and dev just runs `tsc -w` in `shared/` alongside the backend/frontend commands in separate terminals |

**Installation (root):**
```bash
corepack enable
corepack use yarn@4.14.1
yarn install
```

**Version verification commands** (run these before locking versions in the plan):
```bash
npm view typescript version         # Expect 5.8.3 or 6.0.x
npm view typescript-eslint version  # Expect 8.58.2
npm view eslint version             # Expect 10.2.1 or 9.39.4 (use dist-tag maintenance)
npm view pino version               # Expect 10.3.1
npm view pino-http version          # Expect 11.0.0
npm view pino-pretty version        # Expect 13.1.3
npm view prettier version           # Expect 3.8.3
npm view zod@3 version              # Expect 3.25.76 (latest 3.x — STACK.md pins ^3.23.8)
```

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Developer / CI                                                  │
│   └─ `yarn install`  ───┐                                       │
│                         ▼                                       │
│                    Yarn 4 (corepack pinned via packageManager)  │
│                         │                                       │
│                         ▼                                       │
│            node_modules/ (hoisted — nodeLinker: node-modules)   │
│                         │                                       │
│                         ▼                                       │
│            ROOT postinstall: yarn workspace @campaign/shared    │
│                          build  ← emits shared/dist/*.js + .d.ts│
└───────────────────────────────┬─────────────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │ shared/      │     │ backend/     │     │ frontend/    │
   │ @campaign/   │     │ @campaign/   │     │ @campaign/   │
   │   shared     │◄────│   backend    │     │   frontend   │
   │              │     │              │     │              │
   │ src/*.ts ──► │     │ imports from │     │ imports from │
   │   tsc        │     │ @campaign/   │     │ @campaign/   │
   │   dist/*.js  │     │   shared/    │     │   shared/    │
   │   dist/*.d.ts│     │   dist/      │     │   dist/      │
   │              │     │   (via tsx   │     │   (via Vite  │
   │ exports:     │     │    + node-   │     │    resolve)  │
   │  .→dist/     │     │    resolve)  │     │              │
   └──────────────┘     │              │     │ Phase 1:     │
                        │ Phase 1:     │     │  scaffold    │
                        │  logger.ts   │     │  only        │
                        │  (pino)      │     │              │
                        │  httpLogger  │     │              │
                        │  (pino-http) │     │              │
                        │              │     │              │
                        │ Phase 3+:    │     │              │
                        │  wire logger │     │              │
                        │  into Express│     │              │
                        └──────────────┘     └──────────────┘

Build order (yarn workspaces foreach -t --all run build):
   shared → (backend, frontend in parallel)   (-t = topological per Yarn 4 docs)
```

### Recommended Project Structure (after Phase 1)

```
campaign/
├── .yarn/
│   └── releases/yarn-4.14.1.cjs       # corepack-managed Yarn binary
├── .yarnrc.yml                        # nodeLinker: node-modules
├── .gitignore                         # node_modules, dist, .yarn/cache, etc.
├── .prettierrc                        # shared formatting rules
├── .prettierignore                    # dist, node_modules, .yarn
├── eslint.config.js                   # flat config (ESM or .mjs)
├── tsconfig.base.json                 # shared TS compiler options
├── tsconfig.json                      # root — extends base, no compile (references: [] or solution-style)
├── package.json                       # root workspaces + scripts + resolutions
├── yarn.lock
├── CLAUDE.md                          # (already exists)
├── .planning/                         # (already exists)
├── shared/
│   ├── package.json                   # @campaign/shared, exports dist/
│   ├── tsconfig.json                  # extends ../tsconfig.base.json, outDir: dist
│   └── src/
│       ├── index.ts                   # re-exports all schemas
│       └── schemas/
│           ├── index.ts               # re-exports schema files
│           ├── auth.ts                # RegisterSchema skeleton
│           └── campaign.ts            # CampaignStatus enum skeleton
├── backend/
│   ├── package.json                   # @campaign/backend
│   ├── tsconfig.json                  # extends ../tsconfig.base.json
│   └── src/
│       ├── util/
│       │   ├── logger.ts              # pino instance (env-aware)
│       │   └── httpLogger.ts          # pino-http middleware
│       └── test-import.ts             # (optional verification file — proves @campaign/shared resolves)
└── frontend/
    ├── package.json                   # @campaign/frontend
    ├── tsconfig.json                  # extends ../tsconfig.base.json
    └── src/
        └── test-import.ts             # (optional verification — proves @campaign/shared resolves)
```

### Pattern 1: Root `package.json` shape

**What:** Single root package declares workspaces + cross-workspace scripts + resolutions.
**When to use:** Always (Yarn 4 workspace root requirement).
**Example:**

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

Flag notes:
- `-At` = `--all --topological` (topological build). Per Yarn 4 docs verified above — `-t` alone means topological, `--all` selects every workspace.
- `-Apt` = `--all --parallel --topological` — OK for lint/typecheck/test (independent), but NOT for build (must be strictly sequential for `shared` first). Use `-At` (no parallel) for build.
- `postinstall` is the standard hook — runs after every `yarn install`. Builds `shared/dist/` before any downstream tooling touches it. [CITED: ARCHITECTURE §11; PITFALLS C18.1]

### Pattern 2: `shared/package.json` — modern `exports` field

**What:** Compiled-library package.json that exposes `dist/index.js` + types to consumers.
**When to use:** For any workspace that ships compiled output to other workspaces.
**Example:**

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

Key points:
- `"type": "module"` — shared is pure ESM.
- `"exports"` uses the `types` condition FIRST (per Node.js docs verified above — "This condition should always be included first").
- Keep `"main"` + `"types"` fields alongside `"exports"` for older tooling compat (no harm, belt-and-suspenders per Node.js docs).
- `zod` is the ONLY runtime dependency — mitigates M7 (version drift).
- `files: ["dist"]` — even though not publishing, reinforces "don't ship `src/`" discipline.

### Pattern 3: `shared/src/index.ts` — skeleton re-exports

**What:** Single re-export entry that the planner can extend in later phases.
**When to use:** As the Phase 1 skeleton — just enough to prove import resolution works end-to-end.
**Example:**

```typescript
// shared/src/index.ts
export * from './schemas/index.js';
```

```typescript
// shared/src/schemas/index.ts
export * from './auth.js';
export * from './campaign.js';
```

```typescript
// shared/src/schemas/auth.ts
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;
```

```typescript
// shared/src/schemas/campaign.ts
import { z } from 'zod';

export const CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;
```

Key points:
- Import paths use `.js` suffixes — required when `"module": "NodeNext"` or `"ESNext"` with ESM-style resolution. TS transpiles `.ts` → `.js` but preserves the written `.js` import.
- Skeleton is minimal (1 schema, 1 enum) — Phase 3 (auth) and Phase 4 (campaigns) will extend. This is sufficient to prove the import boundary works.
- `type` aliases exported alongside schemas — reviewer immediately sees the single-source-of-truth pattern.

### Pattern 4: `shared/tsconfig.json` — emit cleanly to `dist/`

**What:** Compiler config that emits `dist/*.js` + `dist/*.d.ts` from `src/*.ts`.
**When to use:** The `shared/` workspace.
**Example:**

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

Key points:
- `composite: false` — project references are intentionally skipped (ARCHITECTURE §11). If we enabled references later, this flips to `true`.
- `noEmit: false` — shared is the ONE workspace that emits. Backend/frontend are `noEmit: true` (covered in Pattern 5).
- `declaration: true` + `declarationMap: true` — emits `.d.ts` files so consumers get types and IDE jump-to-definition works into `shared/src/*.ts`.

### Pattern 5: `tsconfig.base.json` — shared compiler options

**What:** Root TS config that every workspace extends.
**Example:**

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

Key decisions:
- **`target: "ES2022"`** — Node 20+ supports ES2022 natively; matches ARCHITECTURE's `node:20-alpine` runtime.
- **`module: "NodeNext"` + `moduleResolution: "NodeNext"`** — the only pairing that correctly resolves `"type": "module"` with `.js` import suffixes AND resolves `exports` conditions. `"ESNext"` alone breaks on `exports` conditional resolution in newer TS.
- **`strict: true`** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — senior-level strictness signals. Catches `.at()` undefined, `foo?: undefined` leaks.
- **`isolatedModules: true`** — required for tsx / Vite transforms to work correctly on each file independently.
- **`noEmit: true`** at the base — individual workspaces override (shared: `false`; backend/frontend keep `true` because tsx / Vite do the runtime compile). Backend build-to-dist in Phase 10 will add its own emit config.

### Pattern 6: Workspace-extending `tsconfig.json` (backend + frontend)

```json
// backend/tsconfig.json
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

```json
// frontend/tsconfig.json
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

Both keep `noEmit: true` (inherited) — typecheck-only in Phase 1.

### Pattern 7: ESLint flat config (`eslint.config.js`)

**What:** Single root flat config. Per typescript-eslint v8 getting-started docs, flat config is the official recommended path.
**When to use:** Entire repo.
**Example:**

```javascript
// eslint.config.js (ESM — works because nearest package.json has no "type": "module"
// at root; if it does, rename to eslint.config.mjs)
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

  // 6. Prettier compat — MUST be last to disable conflicting rules
  prettierConfig,
];
```

Key points:
- Flat config uses an array of config objects; later entries override earlier ones. `eslint-config-prettier` goes last per its docs.
- `tseslint.configs.recommended` spreads into the array (note the `...`).
- React plugin only applies to `frontend/**` via `files` glob.
- Backend has `no-console: 'off'` — pino replaces console. Frontend keeps `no-console: 'warn'`. Shared is `'error'` (library hygiene).
- No type-aware linting (`strict-type-checked`) — faster; use `recommended` only. Adds `parserOptions.project` complexity for negligible benefit in a 4-8hr project.

### Pattern 8: Prettier config

**What:** Single root `.prettierrc`.
**Example:**

```json
// .prettierrc
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

```
# .prettierignore
node_modules
dist
build
coverage
.yarn
yarn.lock
*.md
```

Rationale:
- `printWidth: 100` — modern default (older style was 80; 100 reduces wrapping noise).
- `singleQuote: true` — JS/TS convention; also what most shadcn snippets use.
- `trailingComma: 'all'` — preserves cleaner git diffs.
- `endOfLine: 'lf'` — cross-platform consistency.
- `*.md` in ignore — prevents reflowing the planning docs.

### Pattern 9: pino logger module (FOUND-05)

**What:** Single exported pino instance, env-aware, with `err` serializer.
**Example:**

```typescript
// backend/src/util/logger.ts
import pino, { type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug');

const baseOptions: LoggerOptions = {
  level,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  base: {
    service: '@campaign/backend',
    env: process.env.NODE_ENV ?? 'development',
  },
};

// Pretty print only in dev (never in prod, never in test)
const transport =
  !isProd && !isTest
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      }
    : undefined;

export const logger = pino({ ...baseOptions, transport });
```

Key points:
- Three explicit environments: `production` (JSON, info), `test` (silent), default/development (pretty + debug).
- `LOG_LEVEL` env var overrides (so CI or debug sessions can crank it up/down without code changes).
- `serializers.err` catches instances of `Error` and emits `{ type, message, stack, cause }` as structured fields.
- `base` object adds `service` + `env` fields to every log — valuable when logs are aggregated.
- Pretty transport is conditional — production stays pure JSON (faster + parseable by log aggregators).

### Pattern 10: pino-http middleware (FOUND-05)

**What:** Request/response logger + error logger wiring.
**Example:**

```typescript
// backend/src/util/httpLogger.ts
import pinoHttp, { type Options } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

const options: Options = {
  logger,
  // Custom log level per status
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'info';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  // Stable request-id: trust incoming header if present, else mint UUID
  genReqId: (req) => {
    const incoming = req.headers['x-request-id'];
    if (typeof incoming === 'string' && incoming.length > 0) return incoming;
    return randomUUID();
  },
  // Disable automatic request logging in test (logger itself is silent, but belt-and-suspenders)
  autoLogging: process.env.NODE_ENV !== 'test',
};

export const httpLogger = pinoHttp(options);
```

Key points:
- Exports ONLY the middleware. Phase 3 will `app.use(httpLogger)` in `buildApp()` — NOT in Phase 1.
- `customLogLevel` returns `error` for 5xx + thrown errors, `warn` for 4xx. Matches senior convention.
- `genReqId` respects inbound `X-Request-ID` (enables cross-service correlation), falls back to `crypto.randomUUID()`.
- Never imports Express types — stays portable. Express types are installed in Phase 3.
- Test setup will set `NODE_ENV=test` + `LOG_LEVEL=silent`; `autoLogging: false` is extra insurance.

### Pattern 11: `.yarnrc.yml` minimal config

```yaml
# .yarnrc.yml
nodeLinker: node-modules

# Optional (Yarn 4 defaults are usually fine, but explicit is better for reproducibility)
enableGlobalCache: true
enableImmutableInstalls: false  # true only in CI
```

Key points:
- Only `nodeLinker` is strictly required. `enableGlobalCache: true` is the default (cache files live in `~/.yarn/berry/cache`). `enableImmutableInstalls: false` allows lockfile updates locally (CI can set `YARN_ENABLE_IMMUTABLE_INSTALLS=true` or pass `--immutable`).
- Do NOT add `nmHoistingLimits` unless specific issues show up; the default (`none`) is right for our workspace set.
- Do NOT add `.pnp.cjs` — node-modules linker does not generate it.

### Pattern 12: `.gitignore`

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

Note: per Yarn 4 convention, commit `.yarn/releases/yarn-4.14.1.cjs` and `.yarn/plugins/` (if any); exclude `.yarn/cache` and `.yarn/install-state.gz`. This is Yarn's documented "zero-installs vs cached" split — we are NOT doing zero-installs (would bloat the repo), so exclude `.yarn/cache`.

### Anti-Patterns to Avoid

- **Using `yarn` 1.x syntax** (`yarn workspaces run build`) — Yarn 4 uses `yarn workspaces foreach -At run build`. The 1.x command does not exist in 4.
- **Declaring zod in `backend/package.json` or `frontend/package.json`** — violates M7 (version drift; `instanceof ZodError` fails across major-version drift).
- **Importing `@campaign/shared/src/...` directly** — breaks the encapsulation that `exports` provides. Always import from the bare package name `@campaign/shared`.
- **Omitting `-t` from `yarn workspaces foreach run build`** — builds run in workspace discovery order, which can put `backend` before `shared` and fail on missing `dist/`. Always `-At` for build.
- **Shipping `shared/src/` instead of `shared/dist/`** — PITFALLS C18.6; Vite chokes.
- **ESLint 8 with `.eslintrc.cjs`** — works but deprecated by ESLint 9; use flat config.
- **Setting `moduleResolution: "node"` instead of `"NodeNext"`** — breaks `exports` conditions resolution.
- **Running `yarn workspace shared build`** (missing scope) — the correct command is `yarn workspace @campaign/shared build`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-workspace dependency ordering | Custom bash script that `cd`s into each workspace | `yarn workspaces foreach -At run <script>` | Yarn 4 knows topology from `workspace:*` protocol; `-t` flag does the right thing |
| Request logger | Handwritten Express middleware with `console.log` | `pino-http` | Handles request-id propagation, timing, error correlation, log levels, serializers — all of which are easy to get subtly wrong |
| Request ID generation | Counter / `Date.now()` / homebrew random | `crypto.randomUUID()` (built into Node 20) with header passthrough | Collisions under load; poor cross-service correlation |
| Structured logger | `console.log(JSON.stringify({...}))` | `pino` | pino handles level filtering, serializer chains, async transport, child loggers |
| Cross-workspace type sharing | Copy-paste Zod schemas | `@campaign/shared` via `workspace:*` | Single source of truth for schema + TS type; zod inference does the derivation |
| Workspace linking | npm link / manual symlinks | `workspace:*` protocol | Yarn 4 creates the symlinks at install time; npm link is fragile |
| TS compiler config copy-paste across workspaces | Duplicate `compilerOptions` in each workspace | `extends: "../tsconfig.base.json"` | One place to update `target` / `strict` / etc. |
| Prettier/ESLint per-workspace configs | Separate `.prettierrc` / `.eslintrc` in each workspace | Single root config | No conflict resolution to worry about; consistent formatting |

**Key insight:** At 3 workspaces and a 4-8hr budget, every reach for additional tooling (Turborepo, changesets, ESLint monorepo plugins, TS project references, husky) costs setup time and adds complexity without a payoff. The built-in Yarn 4 `foreach -t` primitive + root-level configs are exactly enough.

## Runtime State Inventory

> Phase 1 is greenfield (empty repo except `.gitignore` and `.docs/`) — there is no pre-existing runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — empty repo | None |
| Live service config | None — no deployed services | None |
| OS-registered state | None | None |
| Secrets/env vars | None in Phase 1 (logger reads `NODE_ENV` / `LOG_LEVEL` which have safe defaults) | Document `.env.example` in Phase 10 (per ARCHITECTURE §11) |
| Build artifacts | None — first build happens in this phase | None |

**Nothing found in any category** — verified by `git status` (only `.gitignore` staged and `.docs/` untracked) and `ls /Users/thalos/Work/ai-fullstack-challenge/` (no `node_modules/`, no `dist/`, no `.yarn/`).

## Common Pitfalls

### Pitfall 1: M6 — Yarn PnP accidentally enabled

**What goes wrong:** `corepack use yarn@4.x` defaults to PnP if `.yarnrc.yml` doesn't explicitly set `nodeLinker`. PnP breaks Vite's optimizer, sequelize-cli, and tsx — all of which Phase 3+ depend on.
**Why it happens:** Copying a `package.json` with `packageManager: "yarn@4.x"` without the accompanying `.yarnrc.yml`.
**How to avoid:** Commit `.yarnrc.yml` with `nodeLinker: node-modules` BEFORE the first `yarn install`.
**Warning signs:** Presence of `.pnp.cjs`, `.pnp.loader.mjs`, or `.pnp.data.json` in the repo root after install.

### Pitfall 2: M7 — zod declared in multiple workspaces

**What goes wrong:** If `backend/package.json` and `shared/package.json` both declare `"zod"`, Yarn may hoist to different copies across workspaces → `schema.parse()` in `shared/` returns an object whose `instanceof ZodError` check in `backend/` returns `false`. Catch blocks fail silently.
**Why it happens:** Natural instinct to "declare what you import."
**How to avoid:** Declare zod ONLY in `shared/package.json`. Backend/frontend import via `@campaign/shared` (which re-exports schemas); if they need raw `z.object()`, they import `zod` too — but both point at the same hoisted copy because of the `resolutions` entry.
**Warning signs:** Multiple `zod` folders under `node_modules/`, or `yarn why zod` showing more than one version.

### Pitfall 3: M8 — circular workspace dependency

**What goes wrong:** Accidentally importing from `@campaign/backend` inside `shared/` → Yarn can still resolve it (workspace protocol is permissive), but `yarn workspaces foreach -t` now sees a cycle and fails the build order.
**Why it happens:** A shared utility "just needs one tiny thing from backend."
**How to avoid:** `shared/package.json` has ZERO workspace dependencies (only `zod`). Enforce via code review + explicit `dependencies` listing.
**Warning signs:** `yarn workspaces foreach -t run build` output shows a warning about cycles, or build hangs waiting for cycle to resolve.

### Pitfall 4: M9 — non-topological build (frontend before shared)

**What goes wrong:** `yarn workspaces foreach --all run build` (missing `-t`) builds workspaces in discovery order. If frontend's Vite build runs first, it can't resolve `@campaign/shared/dist/*` because `dist/` doesn't exist yet.
**Why it happens:** Copying a command from 1.x-era docs that used `yarn workspaces run` (which was topological by default).
**How to avoid:** Always use `-At` or `-t --all` in Yarn 4. Root `postinstall` builds `shared` explicitly as belt-and-suspenders.
**Warning signs:** CI build fails on first run with `Cannot find module '@campaign/shared'`; works after `yarn install` warm start (because `postinstall` cached `dist/`).

### Pitfall 5: C18.1 — shared/dist/ stale or missing

**What goes wrong:** Developer edits `shared/src/*.ts`, restarts backend dev server (tsx), imports show old types because `tsc -w` wasn't running.
**Why it happens:** Each workspace has its own `dev` script; `shared` needs `tsc -w` continuously or a one-shot build before dev.
**How to avoid:** Either (a) developers run `yarn workspace @campaign/shared dev` in a separate terminal during dev, OR (b) use `concurrently` / `turbo-style` orchestration. For Phase 1 simplicity, document option (a) in the README (Phase 10 deliverable) and rely on `postinstall` for one-shot builds.
**Warning signs:** `"@campaign/shared"` has no exported member 'X'` errors that go away after `yarn workspace @campaign/shared build`.

### Pitfall 6: C18.5 — dependabot / transitive upgrade of Vitest to 4.x

**What goes wrong:** A week after submission, dependabot bumps Vitest 2.1.9 → 4.x. Vitest 4 requires Vite 6, which our pinned `@vitejs/plugin-react@4.7.0` does not support. CI breaks.
**Why it happens:** Standard dependabot behavior on PATCH+MINOR majors.
**How to avoid:** Pin vitest EXACTLY (`2.1.9` — no caret) in root `resolutions`, and document the pin rationale inline with a comment in root package.json or in `docs/DECISIONS.md`.
**Warning signs:** `Cannot find module 'vite/types'` or `VitePluginReactFastRefresh` errors after upgrade.

### Pitfall 7: `exports` field without `"types"` first

**What goes wrong:** TS consumers get "Cannot find module '@campaign/shared' or its corresponding type declarations" even though `main`/`types` are set, because modern TS prefers `exports` conditions when they exist.
**Why it happens:** Natural ordering to write `import` before `types` in JSON.
**How to avoid:** Always put `"types"` FIRST in the conditions object. (Verified against Node.js docs.)

### Pitfall 8: `moduleResolution` mismatch with `exports`

**What goes wrong:** `moduleResolution: "node"` (legacy) does not honor `exports` conditions in consumed packages. Type imports silently fail.
**Why it happens:** Default TS template generators still use `"node"`.
**How to avoid:** Use `"NodeNext"` (matches `"module": "NodeNext"`). Do NOT use bare `"ESNext"` for modules — it works at runtime with Vite but TS will not resolve `exports` conditions.

### Pitfall 9: pino-pretty in production (silent perf hit)

**What goes wrong:** `pino-pretty` transport runs in a worker thread and JSON-serializes then re-parses every log line. In production this adds ~500ns/log and non-deterministic ordering.
**Why it happens:** Copy-paste from a tutorial that doesn't gate the transport.
**How to avoid:** Explicitly check `NODE_ENV !== 'production'` before setting `transport`. (Pattern 9 above.)

## Code Examples

See Patterns 1-12 above. All code samples are directly copy-pasteable into the planner's task actions.

Additional import-verification snippet (for validation):

```typescript
// backend/src/test-import.ts  (optional — throwaway, not shipped)
import { RegisterSchema, CampaignStatusEnum } from '@campaign/shared';
import { logger } from './util/logger.js';

const input = { email: 'demo@example.com', password: 'hunter2hunter2', name: 'Demo' };
const parsed = RegisterSchema.parse(input);
logger.info({ user: parsed, status: CampaignStatusEnum.enum.draft }, 'test-import OK');
```

```typescript
// frontend/src/test-import.ts  (optional — throwaway)
import { RegisterSchema, type CampaignStatus } from '@campaign/shared';

const status: CampaignStatus = 'draft';
const ok = RegisterSchema.safeParse({}).success;
console.log({ status, ok }); // eslint-disable-line no-console
```

Both should type-check (`yarn typecheck`) and lint clean (except the frontend one trips `no-console: 'warn'` — which is expected and proves the rule is wired).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Yarn 1.x workspaces (`yarn workspaces run`) | Yarn 4 workspaces (`yarn workspaces foreach -At run`) | Yarn 2+ (2019); Yarn 4 stable 2023 | Commands completely different; 1.x docs are misleading |
| `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` (two packages) | `typescript-eslint` (single unified package) | typescript-eslint v8 (2024) | Single devDep; single import path in flat config |
| ESLint `.eslintrc.cjs` | ESLint flat config (`eslint.config.js`) | ESLint 9 made flat config default (2024) | ESLint 10 still supports both, but flat is the future |
| `tsc` single config, manual watch | `tsc --watch` + `tsx` runtime | tsx 4.x (2023) supplants ts-node; Bun/Deno accelerate ESM-native | tsx is dramatically faster than ts-node; near-zero config |
| `bunyan` / `winston` | `pino` | pino ~2020 onward; v10 (2024+) | ~5-10x faster; structured JSON by default |
| `Turborepo` / `Lerna` for small monorepos | Native `yarn workspaces foreach -t` | Yarn 2+ made `foreach` first-class | Turborepo adds caching but is overkill at 3 workspaces |
| TypeScript project references for shared lib | Direct workspace resolution with compiled `dist/` | N/A (always been an option) | References are a complexity-vs-incremental-build tradeoff; at 3 workspaces, not worth it |

**Deprecated / outdated:**

- Yarn 1.x `yarn workspace <name> run <script>` syntax (replaced by `yarn workspaces foreach`) — but note Yarn 4 *does* still support the 1.x-style `yarn workspace <name> run <script>` for single-workspace targeting (we use this in `postinstall`)
- `ts-node` (superseded by `tsx`)
- `@typescript-eslint/*` split packages (superseded by unified `typescript-eslint`)
- `console.log` as production logging (pino is the standard)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TypeScript 5.8.3 is safer than 6.0.3 for a 4-8hr project | Standard Stack / Alternatives | Low — TS 6 is backward compatible with 5; if user prefers bleeding-edge, swap is trivial (single version bump). typescript-eslint 8 supports both. |
| A2 | ESLint 9.39.4 (maintenance) is safer than 10.2.1 (latest) | Standard Stack / Alternatives | Low — typescript-eslint 8 peers both. If user wants 10, bump the pin. |
| A3 | `concurrently` for dev orchestration is optional (not recommended for Phase 1) | Alternatives | Very low — developer ergonomic choice. Docs can say "run `yarn workspace @campaign/shared dev` in one terminal and `yarn workspace @campaign/backend dev` in another." |
| A4 | `postinstall` is the right hook for building `shared/` | Pattern 1 | Very low — matches ARCHITECTURE §11 direct recommendation. Alternative `prepare` hook runs in more contexts (install + pack + publish); `postinstall` is sufficient here. |
| A5 | Pino 10.x is stable and compatible with pino-http 11.x | Standard Stack | Low — pino-http 11 explicitly targets pino v10 per its README; unverified in a live `yarn install` but documented. |
| A6 | `exports` with `"types"` first is the correct modern pattern for a TS library workspace | Pattern 2 | Very low — verified against Node.js official `packages.html` docs. |
| A7 | Root-level ESLint config with workspace-scoped overrides (via `files` glob) is simpler than per-workspace configs | Pattern 7 | Low — flat config's `files` glob is designed for exactly this. |

All other claims in this research are tagged `[VERIFIED: ...]` or `[CITED: ...]` with the source.

## Open Questions

1. **Should root `package.json` include `"type": "module"` (ESM everywhere)?**
   - What we know: `shared/` is ESM (`"type": "module"`). Backend in Phase 3+ will likely also be ESM (tsx supports both, and `NodeNext` requires one or the other). Frontend (Vite) handles this internally.
   - What's unclear: Whether root itself needs it (root has no runtime code — it's just scripts).
   - Recommendation: **Do NOT** set `"type": "module"` at root. Root is not runtime — keep it neutral so `eslint.config.js` can stay CommonJS-safe if needed. If flat config lands as `.js` in a root without `"type": "module"`, it is CommonJS; with `"type": "module"` it's ESM. Since we wrote `import` statements in Pattern 7, name the file `eslint.config.mjs` to force ESM regardless of root `"type"`. **Recommended filename: `eslint.config.mjs`.**

2. **Does `@campaign/shared` need a `prepare` script for build-on-install in CI?**
   - What we know: Root `postinstall` runs after `yarn install`, which triggers in CI.
   - What's unclear: If a CI job does `yarn install --immutable --ignore-scripts`, postinstall is skipped — `shared/dist/` won't exist.
   - Recommendation: Document in Phase 10 README that the Dockerfile MUST NOT pass `--ignore-scripts` to `yarn install`. No action in Phase 1.

3. **Should typecheck script run against `tsc -b` (build mode) or `tsc --noEmit`?**
   - What we know: `tsc --noEmit` is simpler and works without project references. `tsc -b` requires `composite: true` in referenced projects.
   - What's unclear: Whether future phases might want incremental typecheck.
   - Recommendation: Use `tsc --noEmit` per workspace in Phase 1 (matches "TS project references intentionally skipped" decision). Add `"typecheck": "tsc --noEmit"` to each workspace's scripts.

4. **Where does `@campaign/shared` get zod from — its own `dependencies` or hoisted?**
   - What we know: zod is declared in `shared/package.json` as a `dependency`. Yarn 4 hoists to root `node_modules` by default under node-modules linker.
   - What's unclear: Whether backend/frontend can `import { z } from 'zod'` directly (they'll get the hoisted copy) even though they don't declare it.
   - Recommendation: Backend/frontend should import Zod schemas via `@campaign/shared` re-exports (`export { z } from 'zod'` from `shared/src/index.ts`). This is the canonical pattern. If raw `z.object()` is needed outside shared, add a `peerDependency: { zod: "^3.23.8" }` to `shared/package.json` and declare `zod` as a regular dep in the consumer — but ONLY if the consumer actually needs raw access. For Phase 1, only `shared/` needs zod.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All workspaces | ✓ | v22.14.0 (host) | Docker uses node:20-alpine in Phase 10; we pin `engines.node: ">=20.11.0"` |
| corepack | Yarn 4 bootstrap | ✓ | 0.31.0 | Bundled with Node ≥ 16.9 |
| Yarn 4 | Workspace manager | Will be installed via `corepack use yarn@4.14.1` in Phase 1 | — (host has Yarn 1.22.19 which is irrelevant) | — |
| Docker | Not needed in Phase 1 | ✓ | 27.4.0 | Used in Phase 10 |
| npm registry | Package install | ✓ (verified via `npm view`) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

All tooling is either available on host or installed via corepack/yarn during Phase 1 setup. No blockers.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 (pinned via root `resolutions`) — **installed in Phase 3/Phase 7**, NOT Phase 1 |
| Config file | `backend/vitest.config.ts` — created in Phase 7 |
| Quick run command | N/A — Phase 1 has no runtime tests |
| Full suite command | `yarn test` (Phase 7 onward) |

**Phase 1 is pre-test** — no business logic yet. Validation is "does the scaffold stand up?" and is covered by a set of deterministic shell commands below, not Vitest.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | `yarn install` completes cleanly on Yarn 4 + node-modules | smoke | `yarn install --immutable` exits 0; no `.pnp.*` files present; `node_modules/@campaign/shared` is a symlink to `shared/` | ❌ Wave 0 (scripts created in Phase 1) |
| FOUND-01 | Topological build produces `shared/dist/index.js` + `shared/dist/index.d.ts` | smoke | `yarn workspaces foreach -At run build` exits 0; `test -f shared/dist/index.js`; `test -f shared/dist/index.d.ts` | ❌ Wave 0 |
| FOUND-01 | Root `postinstall` builds `shared` before downstream tooling | smoke | `rm -rf shared/dist && yarn install` → `test -f shared/dist/index.js` | ❌ Wave 0 |
| FOUND-01 | Backend imports from `@campaign/shared` resolve | smoke | `yarn workspace @campaign/backend run typecheck` exits 0 (given `backend/src/test-import.ts` references `RegisterSchema` from `@campaign/shared`) | ❌ Wave 0 |
| FOUND-01 | Frontend imports from `@campaign/shared` resolve | smoke | `yarn workspace @campaign/frontend run typecheck` exits 0 (given `frontend/src/test-import.ts` references schemas) | ❌ Wave 0 |
| FOUND-04 | Root `tsconfig.base.json` is extended by each workspace | smoke | `yarn typecheck` exits 0 across all three workspaces | ❌ Wave 0 |
| FOUND-04 | `yarn lint` passes on empty scaffold | smoke | `yarn lint` exits 0 | ❌ Wave 0 |
| FOUND-04 | `yarn format:check` passes | smoke | `yarn format:check` exits 0 | ❌ Wave 0 |
| FOUND-05 | `backend/src/util/logger.ts` exports a pino logger instance | smoke | `node --input-type=module -e "import('./backend/src/util/logger.js').then(m => console.log(typeof m.logger.info))"` prints `function` (after transpile) — or simpler: a typecheck-only assertion `import { logger } from '@campaign/backend/util/logger'; logger.info('ok');` in a throwaway verification file | ❌ Wave 0 |
| FOUND-05 | `backend/src/util/httpLogger.ts` exports a pino-http middleware | smoke | `yarn workspace @campaign/backend typecheck` verifies types; runtime verification deferred to Phase 3 when Express is mounted | ❌ Wave 0 |
| FOUND-05 | Logger emits JSON when `NODE_ENV=production`, silent when `NODE_ENV=test` | unit (optional, can be manual) | `NODE_ENV=production node -e "import('./backend/src/util/logger.js').then(m => m.logger.info({foo:'bar'},'x'))"` prints a JSON line; same with `NODE_ENV=test` prints nothing | ❌ Wave 0 (or manual only — verified by visual inspection of logger.ts code) |

### Sampling Rate

- **Per task commit:** `yarn typecheck && yarn lint` (runs across all workspaces, ~5-10 seconds on a warm cache)
- **Per wave merge:** `yarn install && yarn build && yarn typecheck && yarn lint && yarn format:check` (full clean verification; ~30 seconds)
- **Phase gate:** All five commands above pass cleanly from a fresh `rm -rf node_modules .yarn/cache && yarn install`

### Wave 0 Gaps

Phase 1 is a scaffold phase, so all artifacts are "created" rather than "missing tests to write." The following files must exist before Phase 1 can be verified:

- [ ] `.yarnrc.yml` — `nodeLinker: node-modules`
- [ ] `.yarn/releases/yarn-4.14.1.cjs` — committed Yarn binary (via `corepack use yarn@4.14.1`)
- [ ] `package.json` (root) — workspaces, scripts, resolutions, devDeps
- [ ] `yarn.lock` — committed lockfile from first install
- [ ] `tsconfig.base.json` — root shared TS compiler options
- [ ] `tsconfig.json` (root) — optional solution-style file that extends base and has empty `files` (prevents editors from using `tsconfig.base.json` as a root project)
- [ ] `eslint.config.mjs` — flat config
- [ ] `.prettierrc`, `.prettierignore`
- [ ] `.gitignore` — already has some entries, extend with Yarn + dist patterns
- [ ] `shared/package.json` — exports field, zod dep, build scripts
- [ ] `shared/tsconfig.json` — emits to dist
- [ ] `shared/src/index.ts` — re-exports
- [ ] `shared/src/schemas/index.ts`
- [ ] `shared/src/schemas/auth.ts` — `RegisterSchema` skeleton
- [ ] `shared/src/schemas/campaign.ts` — `CampaignStatusEnum` skeleton
- [ ] `backend/package.json` — pino, pino-http, pino-pretty, tsx, @types/node, @campaign/shared workspace dep
- [ ] `backend/tsconfig.json`
- [ ] `backend/src/util/logger.ts`
- [ ] `backend/src/util/httpLogger.ts`
- [ ] `frontend/package.json` — just @campaign/shared workspace dep (frontend deps come in Phase 8)
- [ ] `frontend/tsconfig.json`
- [ ] `(optional)` `backend/src/test-import.ts` and `frontend/src/test-import.ts` — throwaway verification files, deleted after Phase 1 passes

*(No Vitest config or test files in Phase 1 — that's Phase 7.)*

## Security Domain

> `security_enforcement` is not explicitly set in config.json — treating as enabled. Phase 1 scaffolds tooling; no routes, auth, or data handling yet.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Deferred to Phase 3 |
| V3 Session Management | no | Deferred to Phase 3 |
| V4 Access Control | no | Deferred to Phase 3-4 |
| V5 Input Validation | partial | Zod schema skeleton lands here — schemas themselves are Phase 3+; only the infrastructure + `RegisterSchema` skeleton are in Phase 1 |
| V6 Cryptography | no | No secrets processing in Phase 1 (logger reads LOG_LEVEL only) |
| V7 Error Handling and Logging | yes (partial) | pino structured logs + error serializer — mounted in Phase 3, configured in Phase 1 |
| V14 Configuration | yes | Yarn 4 lockfile commitment + `packageManager` field lock prevents supply-chain drift; `.yarnrc.yml` prevents PnP downgrade to weaker resolution |

### Known Threat Patterns for Monorepo Tooling

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unpinned dependencies / lockfile drift | Tampering | Commit `yarn.lock`; `packageManager` pins Yarn version; CI uses `--immutable` |
| Missing supply-chain pinning (vitest 4 breakage) | Tampering (downstream) | Root `resolutions` with exact versions for known-fragile packages (vitest, @vitejs/plugin-react) |
| Accidental secrets in logs | Information Disclosure | pino `err` serializer only emits known fields; `redact` option available in later phases for auth tokens |
| Log injection (user-controlled message strings) | Tampering | pino escapes JSON by default; use structured log objects, not string concatenation: `logger.info({ user }, 'x')` not `logger.info('x ' + user)` |
| Committed secrets | Information Disclosure | `.gitignore` includes `.env*` patterns; no secrets in Phase 1 yet |
| Development-mode logs leaking PII in prod | Information Disclosure | `transport: pino-pretty` is gated on `NODE_ENV !== 'production'`; `LOG_LEVEL` env var controls verbosity |

## Sources

### Primary (HIGH confidence)

- **npm registry** — version verification for all pinned packages (2026-04-20):
  - `typescript` → 5.8.3 (dist-tag `latest`: 6.0.3)
  - `typescript-eslint` → 8.58.2 (released 2026-04-13; peer `typescript >=4.8.4 <6.1.0`, `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`)
  - `eslint` → 9.39.4 (maintenance), 10.2.1 (latest)
  - `prettier` → 3.8.3
  - `eslint-config-prettier` → 10.1.8
  - `eslint-plugin-react` → 7.37.5
  - `eslint-plugin-react-hooks` → 7.1.1
  - `pino` → 10.3.1
  - `pino-http` → 11.0.0
  - `pino-pretty` → 13.1.3
  - `zod` → 3.25.76 (latest 3.x), 4.3.6 (latest overall — NOT used, per STACK.md lock)
  - `tsx` → 4.21.0
  - `vitest` → 2.1.9 (pinned exactly)
  - `@vitejs/plugin-react` → 4.7.0 (pinned exactly)
- **GitHub: yarnpkg/berry** — latest Yarn 4 release is 4.14.1
- **yarnpkg.com/configuration/yarnrc** — confirmed `nodeLinker` values (`pnp`, `pnpm`, `node-modules`) and that node-modules linker requires only `nodeLinker: node-modules` in `.yarnrc.yml`
- **yarnpkg.com/features/workspaces** — confirmed `workspaces: ["backend", "frontend", "shared"]` format, `workspace:*` protocol semantics, and `-t` flag = topological order
- **nodejs.org/api/packages.html#package-entry-points** — confirmed `exports` precedes `main`; `"types"` condition must be first
- **github.com/pinojs/pino-http** — minimal setup, `customLogLevel`, `customSuccessMessage`/`customErrorMessage`, `genReqId`, `autoLogging: false` for tests
- **typescript-eslint.io/getting-started** — confirmed flat-config pattern with unified `typescript-eslint` package

### Secondary (MEDIUM confidence)

- **github.com/pinojs/pino blob docs/api.md** — env-aware transport pattern; `LOG_LEVEL` convention; built-in serializers; `level: 'silent'` disables output
- **github.com/pinojs/pino blob docs/pretty.md** — minimal pino-pretty transport shape (`target: 'pino-pretty'`)

### Tertiary (LOW confidence)

- None. Every recommendation is either verified via npm/official docs or was already locked by upstream research docs (STACK.md, ARCHITECTURE.md, PITFALLS.md, CLAUDE.md).

## Project Constraints (from CLAUDE.md)

Directly actionable rules the planner must honor:

- **Do not modify `.docs/requirements.md`** — reviewer's original spec, kept verbatim.
- **Do not add features outside v1 scope.** v2 is a deferred-tracking section.
- **Do not re-open Key Decisions in PROJECT.md** without explicit user instruction (flat monorepo, Yarn 4, Vitest, pino, zod-in-shared, etc. are locked).
- **Follow phase ordering** in ROADMAP.md — Phase 1 is strictly first.
- **Logging strategy**: log prompts and corrections "during" build, not reconstructed (Phase 10 README deliverable — not Phase 1 work, but the habit starts now).
- **File layout** (must match CLAUDE.md §File layout): `backend/`, `frontend/`, `shared/`, `docs/`, `.planning/`, `.docs/`, `docker-compose.yml`, `README.md`. Phase 1 creates `backend/`, `frontend/`, `shared/` and leaves `docs/` + `docker-compose.yml` + `README.md` for later phases.

## Metadata

**Confidence breakdown:**

- Standard stack (versions, resolutions): HIGH — every version verified against live npm registry on 2026-04-20.
- Architecture patterns (root config, workspace shapes, exports field, tsconfig.base): HIGH — each pattern is either copy-paste from official docs (Node.js, Yarn, typescript-eslint) or directly from ARCHITECTURE §11 which is already locked.
- pino / pino-http config: HIGH — matches official pino-http docs verified in this session.
- ESLint flat config: HIGH — pattern matches typescript-eslint v8 getting-started and is officially recommended.
- Pitfalls: HIGH — all items drawn from upstream PITFALLS.md (already HIGH confidence) and extended with specific Yarn 4 / flat config / exports-field traps.
- Validation: MEDIUM — Phase 1 has no runtime tests; validation is shell-command smoke tests, which are deterministic but not codified in Vitest.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — the JS ecosystem moves fast but the pinned versions are explicit, so drift is controlled. Re-verify typescript / typescript-eslint / pino before Phase 3 if the Phase 1 → Phase 3 gap exceeds ~2 weeks.)
