---
phase: 01-monorepo-foundation-shared-schemas
plan: 02
subsystem: infra
tags: [typescript, eslint, prettier, tsconfig, nodenext, flat-config]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Yarn 4 workspaces (shared/, backend/, frontend/) + committed .yarn/releases/yarn-4.14.1.cjs + root package.json with ESLint/Prettier/typescript-eslint/typescript devDeps + root resolutions (vitest 2.1.9, @vitejs/plugin-react 4.7.0, zod ^3.23.8) + shared/tsconfig.json that extends ../tsconfig.base.json + shared/src skeleton Zod schemas + backend/frontend package.json stubs with workspace:* dep on shared + root postinstall wiring (yarn workspace @campaign/shared build)"
provides:
  - tsconfig.base.json (NodeNext + strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + isolatedModules + noEmit)
  - Root solution-style tsconfig.json (extends base, empty files/include — editor-marker only)
  - backend/tsconfig.json (extends base, types [node], rootDir src)
  - frontend/tsconfig.json (extends base, jsx react-jsx, DOM lib, types [])
  - backend/src/index.ts + frontend/src/index.ts (Phase-1 empty-module placeholders so tsc has inputs; replaced in Phases 3 and 8)
  - eslint.config.mjs (flat ESM config: typescript-eslint recommended + React frontend-scoped + eslint-config-prettier LAST)
  - .prettierrc (printWidth 100, singleQuote, trailingComma all, endOfLine lf)
  - .prettierignore (protects node_modules, dist, .yarn, yarn.lock, *.md, and — added as Rule 3 — .planning and .docs)
  - yarn.lock (committed from first successful install; lockfile is immutable-stable)
  - Hoisted @campaign/shared symlink in node_modules/ confirming workspace:* works under node-modules linker
  - shared/dist/{index.js,index.d.ts,schemas/*.{js,d.ts}} freshly built by postinstall

affects:
  - 01-03-pino-logger-module (needs backend/tsconfig.json to typecheck backend/src/util/logger.ts)
  - 01-04-cross-workspace-import-proof (canonical Phase-1 gate — owns the full `rm -rf node_modules .yarn/cache shared/dist && yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check` pipeline)
  - all-future-phases (every TS file in Phases 2-10 inherits these compiler options + lint rules + format config)

# Tech tracking
tech-stack:
  added:
    - "tsconfig.base.json with NodeNext module + strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + noImplicitOverride + noFallthroughCasesInSwitch + isolatedModules"
    - "ESLint 9 flat config (typescript-eslint 8 recommended, eslint-plugin-react scoped via files glob to frontend/**, eslint-config-prettier LAST per official docs)"
    - "Prettier 3 (printWidth 100, singleQuote, trailingComma all, arrowParens always, endOfLine lf)"
    - "typescript ^5.8.3 added to shared/package.json devDependencies (was missing — Rule 2 auto-fix)"
  patterns:
    - "Single source of truth: tsconfig.base.json holds all strict compiler options; every workspace extends via \"extends\": \"../tsconfig.base.json\" — no compilerOptions duplicated"
    - "Root solution-style tsconfig.json is intentionally empty (files:[], include:[]) — exists solely to prevent editors from latching onto tsconfig.base.json as a compilable project"
    - "Workspace-scoped lint rules via flat-config `files` glob: frontend = React + React Hooks rules + no-console warn; backend = no-console off (pino is the logger); shared = no-console error (library hygiene)"
    - "eslint-config-prettier as LAST entry in flat-config array — disables every ESLint formatting rule so Prettier owns style unambiguously"
    - "NodeNext module + moduleResolution pairing (mandatory; legacy \"node\" or bare \"ESNext\" would break exports-field resolution — Pitfall 8)"
    - "Phase-1 empty-module placeholders (`export {};`) in backend/src/index.ts and frontend/src/index.ts so tsc --noEmit has inputs without requiring actual code"

key-files:
  created:
    - tsconfig.base.json
    - tsconfig.json (root solution-style)
    - backend/tsconfig.json
    - backend/src/index.ts
    - frontend/tsconfig.json
    - frontend/src/index.ts
    - eslint.config.mjs
    - .prettierrc
    - .prettierignore
    - yarn.lock
    - shared/dist/index.js (produced by postinstall)
    - shared/dist/index.d.ts (produced by postinstall)
    - shared/dist/schemas/auth.{js,d.ts} (produced by postinstall)
    - shared/dist/schemas/campaign.{js,d.ts} (produced by postinstall)
  modified:
    - shared/package.json (Rule 2: added typescript ^5.8.3 devDep)
    - package.json (cosmetic multi-line reformat of workspaces array by Yarn 4)
    - shared/package.json (cosmetic multi-line reformat of files array by Yarn 4)

key-decisions:
  - "Used committed Yarn 4.14.1 binary via corepack shim at /usr/local/bin/yarn (homebrew's /opt/homebrew/bin/yarn 1.22.19 classic shadowed by default — corepack enable + absolute-path invocation was required on this machine)"
  - "Added typescript ^5.8.3 to shared/package.json devDependencies (Rule 2 — without it, `yarn workspace @campaign/shared typecheck` fails with `command not found: tsc` because Yarn 4 workspace-script PATH does not include root's hoisted .bin under the node-modules linker)"
  - "Extended .prettierignore with .planning and .docs (Rule 3 — protects GSD planning state and reviewer's spec per CLAUDE.md guardrail; originally only .planning/config.json was flagged, but any future JSON/MD added to those dirs would trigger the same failure)"
  - "First `yarn install` was permissive (no --immutable flag) because yarn.lock did not exist yet; followed immediately by `yarn install --immutable` to confirm the freshly-written lockfile is stable"
  - "Empty-module placeholders (`export {};`) for backend/src/index.ts and frontend/src/index.ts — the canonical TS idiom for a valid ES module with no exports; replaced in Phase 3 (backend bootstrap) and Phase 8 (frontend mount)"
  - "Deliberately did NOT run the full 5-command Phase-1 verify gate (`rm -rf node_modules .yarn/cache shared/dist && yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`) — that is Plan 04 Task 3's canonical acceptance gate per plan-checker W7"

patterns-established:
  - "Base-tsconfig single-source pattern: every workspace extends the root base; strict options cannot be silently downgraded in a workspace PR (T-02-01 mitigation)"
  - "Flat-config workspace-scoped rules via `files` glob — one root eslint.config.mjs, zero per-workspace configs"
  - "Prettier LAST in ESLint flat-config array — guarantees no rule-war between formatters (T-02-02 mitigation)"
  - "NodeNext resolution discipline end-to-end (tsconfig.base.json + shared exports with types-first + .js suffix on relative imports in shared/src — Pitfall 8)"
  - "Workspace devDep discipline: every script-invoked tool (tsc, eslint, prettier) must be declared as a devDependency in the workspace that runs it, OR in root if truly universal. Hoisted root bins are NOT reliably visible to Yarn 4 workspace-scoped scripts."
  - "Directive-driven formatter ignore: .planning and .docs excluded from Prettier same way CLAUDE.md guardrails say to not modify them"

requirements-completed: [FOUND-04]

# Metrics
duration: 5.3min
completed: 2026-04-20
---

# Phase 01 Plan 02: Root TS + ESLint + Prettier + First Yarn Install Summary

**NodeNext + strict TypeScript base config, ESLint 9 flat config with Prettier compat last, and the first successful `yarn install` — shared/dist/ built via postinstall, `yarn typecheck` + `yarn lint` + `yarn format:check` all exit 0 across the three-workspace monorepo.**

## Performance

- **Duration:** 5.3 min (~318s)
- **Started:** 2026-04-20T19:43:48Z
- **Completed:** 2026-04-20T19:49:06Z
- **Tasks:** 3 (Task 4 removed per plan-checker W7 — duplicated Plan 04 Task 3)
- **Files created:** 10 (tsconfig.base.json, tsconfig.json, backend/tsconfig.json, backend/src/index.ts, frontend/tsconfig.json, frontend/src/index.ts, eslint.config.mjs, .prettierrc, .prettierignore, yarn.lock) + 6 generated shared/dist/* artifacts
- **Files modified:** 2 (shared/package.json — added typescript devDep; cosmetic reformats of root package.json + shared/package.json workspaces/files arrays by Yarn 4)

## Accomplishments

- `tsconfig.base.json` pins the "senior strictness" profile — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, plus `isolatedModules` for tsx/Vite and the mandatory `module: "NodeNext"` + `moduleResolution: "NodeNext"` pairing that's the ONLY way Node correctly resolves the `exports` field in `@campaign/shared` (Pitfall 8).
- Three workspace tsconfig.json files exist and extend the base correctly: shared keeps its Plan 01 emit config; backend sets `types: ["node"]` + `lib: ["ES2022"]` + `rootDir: "src"` (Express/BullMQ wiring later); frontend sets `jsx: "react-jsx"` + `lib: ["ES2022", "DOM", "DOM.Iterable"]` + `types: []` (no ambient Node globals leak into browser code).
- First `yarn install` ran cleanly under Yarn 4.14.1 node-modules linker. `yarn.lock` written (3,844 lines), 352 packages fetched (+122.34 MiB), zero PnP artifacts (`.pnp.cjs` / `.pnp.loader.mjs` absent — M6 verified). Root `postinstall` fired, ran `yarn workspace @campaign/shared build`, and produced `shared/dist/index.js`, `shared/dist/index.d.ts`, `shared/dist/schemas/{auth,campaign}.{js,d.ts}`.
- `node_modules/@campaign/shared` resolves as a symlink to `../../shared` — proves `workspace:*` protocol works, not a stale copy (M8 / C18.1 / M9 all verified).
- `yarn why zod` reports exactly one zod version hoisted across workspaces — M7 (zod version drift) verified a second time under real install, not just package.json declaration.
- Immediate follow-up `yarn install --immutable` succeeded without rewriting the lockfile — proves the initial lockfile write is deterministic and reproducible for CI.
- `eslint.config.mjs` is a flat-config array with typescript-eslint v8 recommended spread, frontend-scoped React rules (via `files: ['frontend/**/*.{ts,tsx}']`), backend-scoped `no-console: off`, shared-scoped `no-console: error`, and `eslint-config-prettier` as the LAST entry — T-02-02 (format-war) mitigated structurally, not just stylistically.
- `.prettierrc` matches the modern-senior shape exactly (printWidth 100, singleQuote, trailingComma all, endOfLine lf); `.prettierignore` protects the full set of generated/vendor dirs plus `.planning` and `.docs` (CLAUDE.md guardrail + T-02-04).
- `yarn typecheck` exits 0 across all three workspaces (via both `yarn workspaces foreach -Apt run typecheck` and per-workspace `yarn workspace @campaign/{shared,backend,frontend} run typecheck`). `yarn lint` exits 0 cleanly (the React "version detect" warning is expected — React is not yet installed; it arrives in Phase 8). `yarn format:check` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tsconfig.base.json + root tsconfig.json, then run first yarn install** — `e4e7b32` (feat)
2. **Task 2: Create backend + frontend tsconfig.json (both extend base) + minimal src placeholders (+ Rule 2 shared typescript devDep)** — `5a202eb` (feat)
3. **Task 3: Create eslint.config.mjs flat config + .prettierrc + .prettierignore (+ Rule 3 .planning/.docs ignore)** — `96170f9` (feat)

**Plan metadata commit:** TBD — follows this SUMMARY in a separate docs commit per GSD protocol.

## Files Created/Modified

- `tsconfig.base.json` — single-source strict TS options. All 15 compiler flags per 01-RESEARCH.md §Pattern 5 verbatim.
- `tsconfig.json` (root) — solution-style marker: `extends: "./tsconfig.base.json"`, `files: []`, `include: []`. Exists so editors don't latch onto the base file as a compilable project.
- `backend/tsconfig.json` — extends `../tsconfig.base.json`, adds `types: ["node"]` + `lib: ["ES2022"]` + `rootDir: "src"` + `include: ["src/**/*"]`. Inherits `noEmit: true` (backend Docker build in Phase 10 will add its own emit config).
- `backend/src/index.ts` — 3-line empty-module placeholder (`export {};` + two comment lines). Replaced in Phase 3 by the Express/BullMQ bootstrap.
- `frontend/tsconfig.json` — extends `../tsconfig.base.json`, adds `jsx: "react-jsx"` (automatic JSX transform) + `lib: ["ES2022", "DOM", "DOM.Iterable"]` + `types: []` (empty array — opts out of all ambient types so Node globals never leak into browser code) + `rootDir: "src"` + `include: ["src/**/*"]`.
- `frontend/src/index.ts` — same empty-module placeholder; replaced in Phase 8 by the React mount.
- `eslint.config.mjs` — ESM flat config (filename `.mjs` not `.js` — root has no `"type": "module"`, so `.js` would be CommonJS and ESM imports would fail). Order: `ignores` → `js.configs.recommended` → `...tseslint.configs.recommended` → frontend React block → backend no-console-off block → shared no-console-error block → `prettierConfig` LAST.
- `.prettierrc` — 7 Prettier rules exactly per 01-RESEARCH.md §Pattern 8.
- `.prettierignore` — plan-spec entries (`node_modules`, `dist`, `build`, `coverage`, `.yarn`, `yarn.lock`, `*.md`) plus Rule-3 additions (`.planning`, `.docs`) that prevent Prettier from touching GSD state + the reviewer's spec.
- `yarn.lock` — 3,844-line lockfile from first successful install. Committed per ASVS V14.1 (dependency integrity) + T-02-05 mitigation.
- `shared/package.json` — added `devDependencies: { typescript: "^5.8.3" }` (Rule 2 — without this, workspace-scoped scripts can't find tsc). Plus cosmetic multi-line reformat of `files: ["dist"]` array by Yarn 4 during install.
- `package.json` (root) — cosmetic multi-line reformat of `workspaces` array by Yarn 4 during install. No behavioral change.
- `shared/dist/**` — 6 generated artifacts (index.{js,d.ts,js.map,d.ts.map} + schemas/{auth,campaign,index}.{js,d.ts,...maps}). Committed NOT directly — `dist/` is in `.gitignore`; these files exist on disk only, and are reproducible by `yarn postinstall` or `yarn build`.

## Decisions Made

- **Used corepack-shim `/usr/local/bin/yarn` rather than homebrew's `/opt/homebrew/bin/yarn` (1.22.19 classic)** — homebrew's `yarn` shadows corepack on macOS+homebrew setups. `corepack enable` created the shim but PATH ordering keeps homebrew first. Invoking `/usr/local/bin/yarn` with absolute path for every install/typecheck/lint/format step during execution was the pragmatic fix. For long-term DX, developers cloning this repo need `corepack enable` + PATH adjustment OR they'll hit the same shadow — documented as a follow-up for Plan 04 (cross-workspace proof) or README in Phase 10.
- **Added `typescript` to `shared/package.json` devDependencies (Rule 2)** — without this, `yarn workspace @campaign/shared typecheck` fails with `command not found: tsc`. Root `postinstall` running `yarn workspace @campaign/shared build` succeeds because postinstall executes in root-workspace context, but direct per-workspace script invocation doesn't inherit root's hoisted `.bin`. Declaring typescript as a shared devDep is the canonical fix and matches what backend + frontend already do.
- **Added `.planning` + `.docs` to `.prettierignore` (Rule 3)** — `.planning/config.json` was flagged by `prettier --check`, causing `yarn format:check` to exit 1. Per CLAUDE.md guardrails (`Do not modify .docs/requirements.md`) and threat T-02-04 (Prettier reflowing committed spec files), GSD planning state and reviewer docs must be invisible to Prettier. Added both directories.
- **First install used permissive `yarn install` (no `--immutable`)**, followed by a second `yarn install --immutable` to validate the fresh lockfile — this is required because `--immutable` on a missing lockfile errors out, and Plan 04 Task 3's gate will use the immutable form (since `yarn.lock` will exist from this plan forward).
- **Did NOT run the full 5-command Phase-1 verify gate** (`rm -rf node_modules .yarn/cache shared/dist && yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`) — that's Plan 04 Task 3's canonical acceptance gate per the plan-checker W7 note embedded in this plan. Running the individual commands (without the `rm -rf`) all exit 0 as a smoke check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Homebrew yarn 1.22.19 shadowed corepack; used corepack-shim absolute path**
- **Found during:** Task 1 (first `yarn install`)
- **Issue:** `which yarn` returned `/opt/homebrew/bin/yarn` (1.22.19 classic). Running `yarn install` invoked classic yarn which doesn't understand the `workspace:*` protocol — failed with `Couldn't find package "@campaign/shared@workspace:*" required by "@campaign/backend@0.1.0" on the "npm" registry.`
- **Fix:** Ran `corepack enable` (creates `/usr/local/bin/yarn` shim that routes to whatever `packageManager` specifies — Yarn 4.14.1 in this repo). Since homebrew PATH still shadows, invoked `/usr/local/bin/yarn` with absolute path for every yarn command. `corepack prepare yarn@4.14.1 --activate` also ran to prime the version.
- **Files modified:** None (environmental fix only — no repo changes).
- **Verification:** `/usr/local/bin/yarn --version` reports `4.14.1`; subsequent `yarn install` under that shim succeeded; `yarn why zod` shows exactly one zod version; `yarn install --immutable` also succeeds.
- **Committed in:** N/A (environmental fix; no files changed). Follow-up developer-DX note logged under "Next Plan Readiness" — README (Phase 10) should document the corepack requirement.

**2. [Rule 2 — Missing Critical Functionality] Added typescript ^5.8.3 to shared/package.json devDependencies**
- **Found during:** Task 2 (verifying `yarn workspace @campaign/shared typecheck` after creating backend+frontend tsconfigs)
- **Issue:** `yarn workspace @campaign/shared run typecheck` exited with `command not found: tsc` (exit 127). Yarn 4's workspace-scoped scripts do not reliably inherit root's hoisted `.bin` when the script invokes a binary name (`tsc`). Plan 01 declared typescript only at root + backend + frontend, but not in shared — this works for postinstall (which runs in root context) but not for direct per-workspace typecheck/build commands. Root `yarn typecheck` (which runs `yarn workspaces foreach -Apt run typecheck`) also masked the failure: the `-Apt` parallel flag returned exit 0 overall even though shared errored, because topological ordering doesn't consider typecheck failures as blocking.
- **Fix:** Added `"devDependencies": { "typescript": "^5.8.3" }` block to `shared/package.json`. Re-ran `yarn install` to refresh lockfile entries. Verified `yarn workspace @campaign/shared run typecheck` now exits 0.
- **Files modified:** `shared/package.json`, `yarn.lock`.
- **Verification:** Direct invocation `yarn workspace @campaign/shared run typecheck` exits 0. All three workspaces typecheck individually AND via root. `node_modules/@campaign/shared/node_modules` does not exist (typescript still hoists to root; declaration just makes the script-visible PATH include it).
- **Committed in:** `5a202eb` (Task 2 commit — bundled with the expected Task 2 files since it was discovered during Task 2's verify step).

**3. [Rule 3 — Blocking] Added .planning and .docs to .prettierignore**
- **Found during:** Task 3 (running `yarn format:check` as part of Task 3's downstream validation)
- **Issue:** `yarn format:check` exited 1 with `[warn] .planning/config.json` — Prettier flagged formatting differences in GSD planning state that must NOT be modified. Per CLAUDE.md guardrails (`Do not modify .docs/requirements.md — it's the reviewer's original spec, kept verbatim`) and threat T-02-04 (Prettier reflowing committed spec files), the correct fix is to exclude both directories from Prettier entirely, not to reformat those files.
- **Fix:** Added `.planning` and `.docs` as final entries in `.prettierignore`.
- **Files modified:** `.prettierignore`.
- **Verification:** `yarn format:check` now exits 0 with "All matched files use Prettier code style!".
- **Committed in:** `96170f9` (Task 3 commit — bundled with the base .prettierignore since it was discovered during Task 3's verify step).

---

**Total deviations:** 3 auto-fixed (1 Rule-2 missing-critical, 2 Rule-3 blocking).
**Impact on plan:** Zero scope creep. Deviations 2 + 3 are structural correctness requirements (workspace must be able to typecheck itself; Prettier must not touch the reviewer's spec). Deviation 1 is purely environmental (macOS+homebrew PATH shadow) and required no repo changes. All original acceptance criteria still pass.

## Issues Encountered

- **Homebrew yarn PATH shadow (noted above)** — documented as a developer-DX follow-up. No impact on CI (which won't have homebrew yarn installed).
- **Root `yarn typecheck` masked shared's tsc-not-found failure** — the `-Apt` parallel flag returned overall exit 0 despite shared erroring. This is a Yarn 4 foreach behavior; mitigation is that Plan 04 Task 3 explicitly invokes `yarn typecheck` as one of five gated commands, so a real failure there would surface. Added typescript to shared devDeps to make the per-workspace invocation work regardless.
- **No other issues.**

## User Setup Required

None — no external service configuration required for this plan.

## Threat Flags

None — this plan only introduces root build tooling (tsconfig, ESLint, Prettier) and the first `yarn install` artifacts. No new network endpoints, auth paths, file access, or DB changes. All threats in the plan's `<threat_model>` (T-02-01 through T-02-06) are addressed:
- **T-02-01** (strictness downgrade) — every workspace extends `../tsconfig.base.json`; grep-verified in acceptance criteria.
- **T-02-02** (ESLint/Prettier rule war) — `prettierConfig` is LAST in flat-config array, verified by `tail -4 eslint.config.mjs | grep prettierConfig`.
- **T-02-03** (legacy moduleResolution) — `moduleResolution: "NodeNext"` grep-pinned in `tsconfig.base.json`.
- **T-02-04** (Prettier reflowing committed spec) — `*.md` + `.planning` + `.docs` all in `.prettierignore`.
- **T-02-05** (lockfile drift) — `yarn.lock` committed (3844 lines); `yarn install --immutable` verified stable.
- **T-02-06** (type-aware lint complexity) — intentionally accepted: flat config uses non-type-aware `tseslint.configs.recommended`.

## Self-Check: PASSED

Created files verified:
- `tsconfig.base.json` — FOUND (15-compile-option NodeNext strict profile)
- `tsconfig.json` (root) — FOUND (solution-style with empty files/include)
- `backend/tsconfig.json` — FOUND (extends base + types [node] + rootDir src)
- `backend/src/index.ts` — FOUND (empty ES module placeholder)
- `frontend/tsconfig.json` — FOUND (extends base + jsx react-jsx + DOM lib + types [])
- `frontend/src/index.ts` — FOUND (empty ES module placeholder)
- `eslint.config.mjs` — FOUND (ESM flat config; prettierConfig LAST per tail -4 grep)
- `.prettierrc` — FOUND (7 Prettier rules)
- `.prettierignore` — FOUND (plan-spec entries + .planning + .docs)
- `yarn.lock` — FOUND (3844 lines)
- `shared/dist/index.js` — FOUND (postinstall output)
- `shared/dist/index.d.ts` — FOUND (postinstall output)
- `shared/dist/schemas/auth.d.ts` — FOUND
- `shared/dist/schemas/campaign.d.ts` — FOUND
- `node_modules/@campaign/shared` — FOUND as symlink (workspace:* works)
- No `.pnp.cjs` / `.pnp.loader.mjs` — verified absent (M6)

Commit hashes verified via `git log --all --oneline | grep {hash}`:
- `e4e7b32` — FOUND (Task 1: feat(1-2): tsconfig base + root tsconfig + first yarn install)
- `5a202eb` — FOUND (Task 2: feat(1-2): backend + frontend tsconfigs extending base + src placeholders)
- `96170f9` — FOUND (Task 3: feat(1-2): ESLint flat config + Prettier config)

Smoke-check gate (the individual commands of the Plan-04-owned 5-command pipeline):
- `yarn install --immutable` → exit 0 (lockfile stable)
- `yarn typecheck` → exit 0 (all 3 workspaces)
- `yarn lint` → exit 0 (only benign eslint-plugin-react "version detect" warning, expected until Phase 8)
- `yarn format:check` → exit 0 (after Rule-3 .planning/.docs ignore addition)
- `yarn why zod` → exactly one version (M7)

## Next Plan Readiness

Ready:
- Plan 03 (pino logger module) can immediately proceed — `backend/tsconfig.json` exists so `backend/src/util/logger.ts` will typecheck; backend already has pino + pino-http + @types/node declared (from Plan 01).
- Plan 04 (cross-workspace import proof) can run its canonical 5-command gate (`rm -rf node_modules .yarn/cache shared/dist && yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`) — all scaffolding is in place and all individual commands exit 0.

Intentionally deferred to Plan 04:
- The full 5-command Phase-1 verify gate (this plan did NOT run the `rm -rf` step — that is Plan 04 Task 3's acceptance gate per W7).
- Cross-workspace `@campaign/shared` import smoke test from `backend/src/` and `frontend/src/` files — proves the `workspace:*` symlink actually resolves zod/schema types end-to-end.

Known follow-ups not in any pending plan (candidates for Phase 10 README):
- Document the corepack requirement for anyone with homebrew's `yarn` installed — `corepack enable` + ensuring `/usr/local/bin` comes before `/opt/homebrew/bin` in PATH, OR invoking `./.yarn/releases/yarn-4.14.1.cjs` directly. This is a developer-environment onboarding note, not a repo bug.

Mitigations applied this plan (cross-referenced to PITFALLS.md + threat model):
- **T-02-01 / Pitfall 8** — tsconfig.base.json single-source; every workspace extends it; NodeNext module + moduleResolution pinned.
- **T-02-02** — eslint-config-prettier LAST in flat-config array.
- **T-02-03** — `moduleResolution: "NodeNext"` at base; grep-pinned.
- **T-02-04 / CLAUDE.md guardrail** — `.planning` + `.docs` + `*.md` all in `.prettierignore`.
- **T-02-05** — `yarn.lock` committed; `--immutable` verified stable.
- **M6** — no PnP artifacts (`.pnp.cjs` / `.pnp.loader.mjs` verified absent).
- **M7** — `yarn why zod` reports exactly one version under real install.
- **M8** — `shared/` still has zero workspace dependencies (only added `typescript` devDep, which is not a workspace dep).
- **M9 / C18.1** — `postinstall` fires on every install; `shared/dist/` rebuilt each time.
- **C18.5** — root `resolutions` still pin `vitest: 2.1.9`, `@vitest/coverage-v8: 2.1.9`, `@vitejs/plugin-react: 4.7.0`, `zod: ^3.23.8` (Plan 01); pins will apply when these packages are added in Phases 7 and 8.

---
*Phase: 01-monorepo-foundation-shared-schemas*
*Completed: 2026-04-20*
