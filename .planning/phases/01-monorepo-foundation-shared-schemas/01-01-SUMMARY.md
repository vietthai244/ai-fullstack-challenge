---
phase: 01-monorepo-foundation-shared-schemas
plan: 01
subsystem: infra
tags: [monorepo, yarn4, workspaces, shared-schemas, zod, typescript]

# Dependency graph
requires: []
provides:
  - Yarn 4.14.1 flat monorepo root with `nodeLinker: node-modules`
  - Three workspaces registered at root: `shared/`, `backend/`, `frontend/`
  - `@campaign/shared` package with `exports` field emitting to `dist/` (skeleton schemas only)
  - `RegisterSchema` + `CampaignStatusEnum` (4-state machine) as the first shared Zod schemas
  - Root `postinstall` hook that builds `@campaign/shared` before downstream workspaces see it
  - Root `resolutions` pinning vitest 2.1.9, @vitest/coverage-v8 2.1.9, @vitejs/plugin-react 4.7.0, zod ^3.23.8
  - Backend + frontend workspace stubs with `workspace:*` dep on `@campaign/shared`
  - `.gitignore` extended for Yarn 4 + dist + env (Yarn binary stays committed)
affects: [01-02-base-configs, 01-03-backend-logger, 01-04-verify-phase, all-future-phases]

# Tech tracking
tech-stack:
  added:
    - yarn@4.14.1 (via corepack, committed binary at .yarn/releases/yarn-4.14.1.cjs)
    - typescript@^5.8.3 (root devDep, hoisted)
    - zod@^3.23.8 (shared workspace runtime dep — M7 mitigation: declared only here)
    - pino@^10.3.1, pino-http@^11.0.0 (backend runtime deps for Plan 03 logger)
    - pino-pretty@^13.1.3, tsx@^4.21.0, @types/node@^20.11.0 (backend devDeps)
    - eslint@^9.39.4, typescript-eslint@^8.58.2, @eslint/js, eslint-config-prettier@^10.1.8,
      eslint-plugin-react@^7.37.5, eslint-plugin-react-hooks@^7.1.1, prettier@^3.8.3 (root devDeps)
  patterns:
    - "Flat monorepo (backend/ + frontend/ + shared/ at root) — matches spec wording, not packages/*"
    - "Shared workspace emits compiled dist/ via tsc (not raw TS) — C18.6 mitigation"
    - "Zod declared ONLY in shared/ — M7 mitigation + belt-and-suspenders via root resolutions"
    - "Root postinstall topologically builds shared before anything else resolves its types (M9/C18.1)"
    - "Yarn 4 workspace protocol: workspace:* for internal deps"
    - "exports field orders types BEFORE import per Node.js docs (Pitfall 7)"
    - "NodeNext resolution requires .js suffix on relative imports (Pitfall 8)"
    - "Resolutions pin vitest 2.1.9 + @vitejs/plugin-react 4.7.0 (C18.5 — guards dependabot drift)"

key-files:
  created:
    - .yarnrc.yml (nodeLinker: node-modules + enableGlobalCache + enableImmutableInstalls: false)
    - .yarn/releases/yarn-4.14.1.cjs (committed Yarn 4 binary — 3.0 MB)
    - package.json (root — workspaces, scripts, resolutions, devDeps, packageManager, engines)
    - shared/package.json (@campaign/shared, exports, zod dep)
    - shared/tsconfig.json (extends ../tsconfig.base.json — Plan 02 creates base)
    - shared/src/index.ts, shared/src/schemas/index.ts
    - shared/src/schemas/auth.ts (RegisterSchema + RegisterInput)
    - shared/src/schemas/campaign.ts (CampaignStatusEnum = z.enum([draft, scheduled, sending, sent]))
    - backend/package.json (@campaign/backend stub + pino deps + workspace:* dep on shared)
    - frontend/package.json (@campaign/frontend stub + workspace:* dep on shared)
  modified:
    - .gitignore (added node_modules, .yarn/cache, dist, .env, .pnp.*, coverage — kept .yarn/releases)

key-decisions:
  - "Committed Yarn 4.14.1 binary at .yarn/releases/yarn-4.14.1.cjs for deterministic clone installs"
  - "nodeLinker: node-modules (NOT PnP) — M6 mitigation; Yarn 4.14.1 defaults to PnP otherwise"
  - "Root packageManager uses plain yarn@4.14.1 (without sha512 hash) per plan verbatim spec"
  - "Zod declared once in shared/package.json; backend/frontend import via @campaign/shared re-exports (M7)"
  - "Backend Phase 1 stub declares pino/pino-http/pino-pretty/tsx/@types/node only; Express/Sequelize/BullMQ/JWT come in Phases 3-5"
  - "Frontend Phase 1 stub has only @campaign/shared + typescript; React/Vite/Tailwind/Redux/RQ all deferred to Phase 8"

patterns-established:
  - "Yarn 4 flat workspaces with node-modules linker (ARCHITECTURE §11)"
  - "Shared compiled-library package.json with exports.types-first ordering (Pitfall 7)"
  - "Skeleton Zod schema re-export chain: index.ts → schemas/index.ts → schemas/{auth,campaign}.ts"
  - "NodeNext module resolution discipline: .js suffix on every relative import"
  - "Postinstall builds shared → downstream workspaces always resolve fresh dist/ types (M9/C18.1)"
  - "Root resolutions block guards against transitive version drift for ecosystem-critical pins"

requirements-completed: [FOUND-01]

# Metrics
duration: 3.3min
completed: 2026-04-20
---

# Phase 01 Plan 01: Yarn 4 + Workspaces + Shared Scaffold Summary

**Yarn 4.14.1 flat monorepo bootstrapped with backend/frontend/shared workspaces, `@campaign/shared` exports skeleton Zod schemas (RegisterSchema + CampaignStatusEnum 4-state machine), and pinned resolutions (vitest 2.1.9, @vitejs/plugin-react 4.7.0, zod ^3.23.8) guarding against transitive drift.**

## Performance

- **Duration:** 3.3 min (~199s)
- **Started:** 2026-04-20T19:34:19Z
- **Completed:** 2026-04-20T19:37:38Z
- **Tasks:** 3
- **Files created:** 10 (1 Yarn binary + 1 .yarnrc.yml + 1 root package.json + 3 workspace package.json + 4 shared TS source files)
- **Files modified:** 1 (.gitignore)

## Accomplishments

- Yarn 4.14.1 pinned via corepack; binary committed at `.yarn/releases/yarn-4.14.1.cjs` (3.0 MB) so fresh clones deterministically resolve the same manager version.
- `.yarnrc.yml` forces `nodeLinker: node-modules` — the M6 mitigation that keeps Vite/tsx/sequelize-cli compatibility open (Yarn 4's default is PnP, which would break downstream phases).
- Root `package.json` declares all three workspaces in topological order (`shared` first), wires `postinstall → yarn workspace @campaign/shared build` (M9/C18.1), and uses `foreach -At` for full builds (strict topological) vs `-Apt` for independent tasks (lint/typecheck/test in parallel).
- Root `resolutions` block locks `vitest: 2.1.9`, `@vitest/coverage-v8: 2.1.9`, `@vitejs/plugin-react: 4.7.0`, `zod: ^3.23.8` — the C18.5 mitigation that prevents dependabot or transitive updates from pulling Vitest 4.x (which requires Vite 6) or inadvertently bumping zod across a major boundary.
- `@campaign/shared` package.json exposes `exports["."]` with `types` key first, keeps belt-and-suspenders `main` + `types` fields, declares `zod ^3.23.8` as the ONLY runtime dep (M7 belt-and-suspenders vs the root resolutions pin).
- Skeleton Zod schemas land in `shared/src/schemas/`: `RegisterSchema` (email max 320, password 8-128, name 1-200) for Phase 3 auth, and `CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent'])` — the exact 4-state machine from CLAUDE.md Core Constraints #1.
- Backend stub declares `pino@^10.3.1`, `pino-http@^11.0.0` (needed by Plan 03 logger) + `pino-pretty`, `tsx`, `@types/node`, `typescript` devDeps; frontend stub declares only `@campaign/shared` + `typescript`. Neither declares `zod` (M7 discipline) and neither pulls in Phase 3+ libs (Express, Sequelize, React, Vite, Tailwind, Redux, BullMQ) — strict phase-scope discipline.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bootstrap Yarn 4 (corepack) + .yarnrc.yml + root package.json + .gitignore** — `9747fbb` (feat)
2. **Task 2: Create shared workspace (package.json + tsconfig + skeleton Zod schemas)** — `fb000ca` (feat)
3. **Task 3: Create backend + frontend workspace stubs (package.json only) with workspace:\* dep on shared** — `b65394d` (feat)

**Plan metadata:** TBD (this SUMMARY commit follows in a separate metadata commit per GSD protocol)

## Files Created/Modified

- `.yarnrc.yml` — 3-line Yarn 4 config (`nodeLinker: node-modules`, `enableGlobalCache: true`, `enableImmutableInstalls: false`). **Intentionally does NOT set `yarnPath`** — corepack's `packageManager` field handles resolution; plan spec mandates these exact three lines.
- `.yarn/releases/yarn-4.14.1.cjs` — committed Yarn 4 binary (3,005,868 bytes) downloaded from repo.yarnpkg.com, guaranteeing deterministic manager resolution for anyone cloning the repo.
- `.gitignore` — extended (not replaced) to include `node_modules/`, `.yarn/cache`, `.yarn/install-state.gz`, `.yarn/build-state.yml`, `.pnp.*`, `dist/`, `build/`, `*.tsbuildinfo`, `.env`, `.env.local`, `.env.*.local`, `.DS_Store`, `.vscode/`, `coverage/`. Preserved `.idea` from the pre-existing file. Crucially does NOT ignore `.yarn/releases/` — the Yarn binary MUST be committed.
- `package.json` (root) — name `campaign`, private, packageManager `yarn@4.14.1`, workspaces `["shared", "backend", "frontend"]`, scripts block (postinstall, build, dev:*, lint, lint:fix, typecheck, format, format:check, test), devDependencies for ESLint/Prettier/TS/typescript-eslint, resolutions, engines `node >=20.11.0`.
- `shared/package.json` — `@campaign/shared@0.1.0`, `"type": "module"`, `main: ./dist/index.js`, `types: ./dist/index.d.ts`, `exports["."]` with types-first ordering, `files: ["dist"]`, scripts for build/dev/typecheck/lint/test, `dependencies: { zod: "^3.23.8" }`. Zero workspace deps (M8 — shared is a leaf).
- `shared/tsconfig.json` — extends `../tsconfig.base.json` (Plan 02 creates base), `outDir: dist`, `rootDir: src`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `composite: false`, `noEmit: false`. Building this tsconfig directly now WILL fail with "Cannot find `../tsconfig.base.json`" — intentional handoff to Plan 02.
- `shared/src/index.ts` — single line `export * from './schemas/index.js';` (NodeNext `.js` suffix, Pitfall 8).
- `shared/src/schemas/index.ts` — re-exports `./auth.js` + `./campaign.js`.
- `shared/src/schemas/auth.ts` — `RegisterSchema = z.object({ email: z.string().email().max(320), password: z.string().min(8).max(128), name: z.string().min(1).max(200) })` + `RegisterInput` type alias.
- `shared/src/schemas/campaign.ts` — `CampaignStatusEnum = z.enum(['draft', 'scheduled', 'sending', 'sent'])` + `CampaignStatus` type alias.
- `backend/package.json` — `@campaign/backend@0.1.0`, `"type": "module"`, scripts (build = no-op until Phase 10, dev = tsx watch src/index.ts which doesn't exist yet, typecheck, lint, test), dependencies `@campaign/shared: workspace:*` + `pino ^10.3.1` + `pino-http ^11.0.0`, devDependencies `@types/node ^20.11.0` + `pino-pretty ^13.1.3` + `tsx ^4.21.0` + `typescript ^5.8.3`.
- `frontend/package.json` — `@campaign/frontend@0.1.0`, `"type": "module"`, scripts (build/dev no-ops until Phase 8, typecheck, lint, test), dependencies `@campaign/shared: workspace:*` only, devDependencies `typescript ^5.8.3` only.

## Decisions Made

- **Committed Yarn binary via manual download** instead of relying on corepack's `packageManager` sha512 hash alone. Plan 01 explicitly requires a committed binary at `.yarn/releases/yarn-4.14.1.cjs` — modern corepack (v0.31.0 on this machine) writes the sha512-integrity form to `packageManager` but does NOT populate `.yarn/releases/` automatically, so the binary was downloaded from `repo.yarnpkg.com` and committed. The plain `yarn@4.14.1` value is preserved in `packageManager` per plan verbatim spec; the integrity hash is re-derivable from the committed binary if ever needed.
- **Chose NOT to add `yarnPath: .yarn/releases/yarn-4.14.1.cjs` to `.yarnrc.yml`** because the plan says "EXACTLY these three lines". Corepack's `packageManager` field handles resolution. If a future pitfall reveals this causes CI to use an unexpected Yarn version, Plan 02 or later can add `yarnPath` as a deviation.
- **Deleted stray `.pnp.cjs` + `yarn.lock`** generated by `corepack use yarn@4.14.1` BEFORE `.yarnrc.yml` existed. Without `.yarnrc.yml`, Yarn 4's default PnP linker ran briefly; these artifacts are blocked by `.gitignore` rules anyway, but the acceptance criterion explicitly demands "No `.pnp.cjs` or `.pnp.loader.mjs` exists in repo root after setup", so they were scrubbed for a clean slate. The first real install (Plan 02 Task 1) will regenerate `yarn.lock` under the node-modules linker with the committed yarn binary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Manually downloaded Yarn 4 binary because corepack 0.31.0 no longer auto-commits `.yarn/releases/yarn-4.14.1.cjs`**
- **Found during:** Task 1 (corepack use yarn@4.14.1)
- **Issue:** The plan step 1 assumes `corepack use yarn@4.14.1` populates `.yarn/releases/yarn-4.14.1.cjs`. On this machine (corepack 0.31.0 / Node 22.14.0), corepack writes the `packageManager` field with a sha512 integrity hash but does NOT create `.yarn/releases/`. The plan's acceptance criterion #1 and verify grep both require the binary file to exist.
- **Fix:** `mkdir -p .yarn/releases && curl -sL https://repo.yarnpkg.com/4.14.1/packages/yarnpkg-cli/bin/yarn.js -o .yarn/releases/yarn-4.14.1.cjs`. Verified the downloaded file has the expected `#!/usr/bin/env node` shebang and is ~3.0 MB.
- **Files modified:** `.yarn/releases/yarn-4.14.1.cjs` (new file).
- **Verification:** `test -f .yarn/releases/yarn-4.14.1.cjs` passes; the committed binary is not gitignored (`git check-ignore` exit 1); Task 1's full verify block passes.
- **Committed in:** `9747fbb` (Task 1 commit).

**2. [Rule 1 — Bug cleanup] Removed stray `.pnp.cjs` and empty `yarn.lock` generated by pre-`.yarnrc.yml` corepack run**
- **Found during:** Task 1 (after corepack use yarn + verify)
- **Issue:** Running `corepack use yarn@4.14.1` before `.yarnrc.yml` existed caused Yarn 4 to briefly use its default PnP linker, writing `.pnp.cjs` to the repo root. Acceptance criterion #9 explicitly forbids `.pnp.cjs` existing in the repo root.
- **Fix:** `rm -f .pnp.cjs .pnp.loader.mjs yarn.lock`. `.pnp.*` is already gitignored, so these would never have been committed, but the acceptance criterion is a structural check.
- **Files modified:** None committed (all three files were already gitignored — and yarn.lock wasn't even staged yet).
- **Verification:** `ls .pnp.*` shows no matches; `git status` does not list these files. Task 1 verify passes.
- **Committed in:** N/A (files were untracked deletions).

**3. [Preserved existing content] `.gitignore` retained pre-existing `.idea` line**
- **Found during:** Task 1 (Step 3 — extend .gitignore)
- **Issue:** Plan says "Extend (not replace) `.gitignore`". The pre-existing file had only `.idea`.
- **Fix:** Kept `.idea` as the first line, then appended all the Yarn 4 / TS / Node / env / editor / testing patterns per plan spec.
- **Files modified:** `.gitignore`.
- **Verification:** `grep -q "node_modules/" .gitignore && grep -q ".pnp" .gitignore` both pass.
- **Committed in:** `9747fbb` (Task 1 commit).

---

**Total deviations:** 3 auto-fixed (2 blocking/bug under Rule 1+3 + 1 preserved-existing-content). All driven by environment realities (corepack 0.31.0 behavior + pre-existing `.idea` line); none expanded scope or changed the plan's contract.
**Impact on plan:** Zero scope creep. All acceptance criteria and verify blocks pass identically to how they would if corepack had written the binary directly.

## Issues Encountered

- **Corepack 0.31.0 changed behavior for `.yarn/releases/`** — noted above. Documented as a Rule 3 auto-fix. Future phases / CI should continue to rely on the committed binary rather than runtime corepack re-download.
- **No other issues.**

## User Setup Required

None — no external service configuration required for this plan. Plan 02 Task 1 will run the first full `yarn install` (after `tsconfig.base.json` lands so `postinstall` can build `@campaign/shared`).

## Threat Flags

None — this plan only introduces build tooling and type-only schema skeletons. No new network endpoints, auth paths, file access patterns, or DB schema changes. All threats in the plan's `<threat_model>` (T-01-01 through T-01-06) are addressed by the committed Yarn binary + pinned `packageManager` + node-modules linker + root resolutions + `.gitignore` for `.env*`.

## Self-Check: PASSED

- `.yarnrc.yml` — FOUND
- `.yarn/releases/yarn-4.14.1.cjs` — FOUND (not gitignored)
- `package.json` (root) — FOUND
- `shared/package.json` — FOUND
- `shared/tsconfig.json` — FOUND
- `shared/src/index.ts` — FOUND
- `shared/src/schemas/index.ts` — FOUND
- `shared/src/schemas/auth.ts` — FOUND (contains `RegisterSchema`)
- `shared/src/schemas/campaign.ts` — FOUND (contains `CampaignStatusEnum` + all 4 states)
- `backend/package.json` — FOUND (contains `@campaign/shared: workspace:*` + `pino` + `pino-http`; no `zod`)
- `frontend/package.json` — FOUND (contains `@campaign/shared: workspace:*`; no `zod`)
- `.gitignore` — FOUND (extended, not replaced)

Commit hashes verified:
- `9747fbb` — FOUND (Task 1: feat(1-1): yarn 4 + monorepo root scaffold)
- `fb000ca` — FOUND (Task 2: feat(1-1): @campaign/shared workspace with Zod schema skeleton)
- `b65394d` — FOUND (Task 3: feat(1-1): backend + frontend workspace stubs with workspace:* dep on shared)

Per-plan structural gate: PASS (all grep + file-existence checks from the plan's `<verification>` block confirmed).

## Next Plan Readiness (Plan 02 — Base Configs)

Ready:
- All three workspaces registered at root; Plan 02 can land `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `backend/tsconfig.json`, `frontend/tsconfig.json`.
- `@campaign/shared` package.json `scripts.build: tsc -p tsconfig.json` is ready to run as soon as Plan 02 creates `../tsconfig.base.json`.
- Root `postinstall: yarn workspace @campaign/shared build` is in place — Plan 02 Task 1 can run `yarn install` and expect the postinstall to succeed IFF `tsconfig.base.json` lands before or alongside.

Intentionally deferred (documented here for Plan 02+):
- First `yarn install` → Plan 02 Task 1 (after tsconfig.base.json exists so postinstall can build shared).
- `yarn.lock` creation → Plan 02 Task 1 (after first successful install).
- `tsconfig.base.json` → Plan 02 (this plan's `shared/tsconfig.json` extends it — forward reference is intentional).
- Root ESLint flat config + Prettier configs → Plan 02.
- Backend + frontend `tsconfig.json` → Plan 02.
- `backend/src/util/logger.ts` (pino instance) → Plan 03 (FOUND-05).
- Cross-workspace `@campaign/shared` import smoke test → Plan 04 (verification gate).
- Express / Sequelize / BullMQ / JWT / bcrypt → Phases 3–5.
- React / Vite / Tailwind / Redux / React Query / shadcn → Phase 8.

Mitigations applied this plan (cross-referenced to PITFALLS.md):
- **M6** (Yarn PnP breaks tooling) → `nodeLinker: node-modules` in `.yarnrc.yml`; `.pnp.*` files scrubbed + gitignored.
- **M7** (zod version drift) → zod declared ONLY in `shared/package.json`; backend + frontend confirmed empty of `zod`; root `resolutions.zod: ^3.23.8` as belt-and-suspenders.
- **M8** (shared has workspace deps) → `shared/package.json` lists zero workspace dependencies (leaf).
- **M9 / C18.1** (downstream tools see stale `shared/dist/`) → root `postinstall: yarn workspace @campaign/shared build` guarantees a fresh build after every install.
- **C18.5** (Vitest/plugin-react auto-bump breaks Vite 5) → root `resolutions` pin `vitest: 2.1.9`, `@vitest/coverage-v8: 2.1.9`, `@vitejs/plugin-react: 4.7.0`.
- **C18.6** (Vite optimizer chokes on raw TS from node_modules) → `shared/` uses `tsc` emit with `files: ["dist"]` and `exports` points to `dist/`, not `src/`.
- **Pitfall 7** (exports condition ordering) → `"types"` before `"import"` in `shared/package.json` exports.
- **Pitfall 8** (NodeNext requires .js suffix) → every relative import in `shared/src/` uses `.js` suffix.

---
*Phase: 01-monorepo-foundation-shared-schemas*
*Completed: 2026-04-20*
