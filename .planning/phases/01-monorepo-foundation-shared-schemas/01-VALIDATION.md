---
phase: 1
slug: monorepo-foundation-shared-schemas
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

Phase 1 is a **pre-test scaffold phase** — no Vitest yet (that lands in Phase 7). Validation is a set of deterministic shell smoke tests covering `yarn install`, topological build, typecheck, lint, and format across all three workspaces. Every REQ-ID has an automated shell command that proves the scaffold holds.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None yet — Vitest 2.1.9 lands in Phase 3/7 (pinned via root `resolutions` in Phase 1) |
| **Config file** | N/A in Phase 1 (`backend/vitest.config.ts` created in Phase 7) |
| **Quick run command** | `yarn typecheck && yarn lint` |
| **Full suite command** | `yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check` |
| **Estimated runtime** | ~5–10s (quick) / ~30–45s (full, warm cache) |

---

## Sampling Rate

- **After every task commit:** Run `yarn typecheck && yarn lint`
- **After every plan wave:** Run `yarn install --immutable && yarn build && yarn typecheck && yarn lint && yarn format:check`
- **Before `/gsd-verify-work`:** Full suite must be green **from a fresh** `rm -rf node_modules .yarn/cache && yarn install`
- **Max feedback latency:** ~10s (quick) / ~45s (full)

---

## Per-Task Verification Map

Task IDs are TBD until `gsd-planner` emits PLAN.md — this map shows the REQ-ID → verification-command mapping the planner must honor.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | FOUND-01 | V14 (lockfile drift) | Lockfile committed, `packageManager` pinned, PnP disabled | smoke | `yarn install --immutable` exits 0; `grep -q '"packageManager": "yarn@4' package.json`; `grep -q 'nodeLinker: node-modules' .yarnrc.yml`; `test ! -f .pnp.cjs` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | FOUND-01 | — | Topological build succeeds; `@campaign/shared` emits `dist/` first | smoke | `yarn workspaces foreach -At run build` exits 0; `test -f shared/dist/index.js`; `test -f shared/dist/index.d.ts` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | FOUND-01 | — | Root `postinstall` rebuilds `shared` after fresh install | smoke | `rm -rf shared/dist && yarn install --immutable && test -f shared/dist/index.js` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | FOUND-01 | — | Backend resolves `@campaign/shared` at typecheck time | smoke | `yarn workspace @campaign/backend typecheck` exits 0 with `backend/src/util/logger.ts` importing from `@campaign/shared` (or a throwaway verification file) | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | FOUND-01 | — | Frontend resolves `@campaign/shared` at typecheck time | smoke | `yarn workspace @campaign/frontend typecheck` exits 0 with an import from `@campaign/shared` in a throwaway verification file | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | FOUND-01 | V14 (version drift) | `zod` is declared ONLY in `shared/package.json` | smoke | `! grep -q '"zod"' backend/package.json && ! grep -q '"zod"' frontend/package.json && grep -q '"zod"' shared/package.json` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | FOUND-04 | — | Root `tsconfig.base.json` exists and is extended by each workspace | smoke | `test -f tsconfig.base.json`; `grep -q '"extends":.*tsconfig.base' backend/tsconfig.json frontend/tsconfig.json shared/tsconfig.json` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | FOUND-04 | — | `yarn typecheck` passes across all workspaces on empty scaffold | smoke | `yarn typecheck` exits 0 | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | FOUND-04 | — | `yarn lint` passes on empty scaffold with flat config | smoke | `yarn lint` exits 0; `test -f eslint.config.mjs` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | FOUND-04 | — | `yarn format:check` passes | smoke | `yarn format:check` exits 0; `test -f .prettierrc`; `test -f .prettierignore` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | FOUND-04 | — | `eslint-config-prettier` wired last so Prettier rules win | smoke | `grep -q "prettier" eslint.config.mjs` and verify via `yarn lint -- --print-config <file>` output shows no style-conflict rules enabled | ❌ W0 | ⬜ pending |
| TBD | 03 | 1 | FOUND-05 | V7 (logging) | `backend/src/util/logger.ts` exports a pino logger with env-aware transport | smoke | `test -f backend/src/util/logger.ts`; `grep -q "import pino" backend/src/util/logger.ts`; `yarn workspace @campaign/backend typecheck` exits 0 | ❌ W0 | ⬜ pending |
| TBD | 03 | 1 | FOUND-05 | V7 (logging) | `backend/src/util/httpLogger.ts` exports a `pino-http` middleware | smoke | `test -f backend/src/util/httpLogger.ts`; `grep -q "pino-http" backend/src/util/httpLogger.ts`; `yarn workspace @campaign/backend typecheck` exits 0 | ❌ W0 | ⬜ pending |
| TBD | 03 | 1 | FOUND-05 | V7 (logging) | Logger is silent when `LOG_LEVEL=silent` (test mode behavior documented) | smoke | `grep -q "LOG_LEVEL\|level:" backend/src/util/logger.ts`; (optional) `LOG_LEVEL=silent tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info('x'))"` emits nothing | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 1 is a **scaffold phase** — all Wave 0 items are "create these files." No test-framework install needed in Phase 1 (Vitest lands in Phase 3/7).

- [ ] `.yarnrc.yml` — `nodeLinker: node-modules`, enableGlobalCache, enableTelemetry: false
- [ ] `.yarn/releases/yarn-4.14.1.cjs` — committed Yarn binary (via `corepack use yarn@4.14.1`)
- [ ] `package.json` (root) — `workspaces`, `scripts` (dev/build/test/lint/typecheck/format), `resolutions` pinning `vitest@2.1.9` + `@vitejs/plugin-react@4.7.0`, `packageManager: "yarn@4.14.1"`, `devDependencies` (typescript, typescript-eslint v8, eslint v9, prettier v3)
- [ ] `yarn.lock` — committed lockfile from first install
- [ ] `tsconfig.base.json` — root shared TS compiler options (target ES2022, module NodeNext, moduleResolution NodeNext, strict true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, isolatedModules, skipLibCheck)
- [ ] `tsconfig.json` (root) — solution-style; extends base, empty `files` array
- [ ] `eslint.config.mjs` — flat config, typescript-eslint v8 recommended, per-workspace globs, `eslint-config-prettier` last
- [ ] `.prettierrc` — printWidth 100, singleQuote, semi, trailingComma all, tabWidth 2
- [ ] `.prettierignore` — node_modules, dist, .yarn, coverage
- [ ] `.gitignore` — extend to cover Yarn 4 (node_modules, `.yarn/cache`, `.yarn/install-state.gz`, `.pnp.*`, dist, coverage, .env)
- [ ] `shared/package.json` — name `@campaign/shared`, type module, main dist/index.js, types dist/index.d.ts, exports field, build/dev scripts, zod ^3.23.8
- [ ] `shared/tsconfig.json` — extends base, outDir dist, rootDir src, declaration true, composite false
- [ ] `shared/src/index.ts` — re-exports
- [ ] `shared/src/schemas/index.ts` — aggregator
- [ ] `shared/src/schemas/auth.ts` — `RegisterSchema` skeleton (email + password + name Zod object)
- [ ] `shared/src/schemas/campaign.ts` — `CampaignStatusEnum = z.enum(['draft','scheduled','sending','sent'])`
- [ ] `backend/package.json` — name `@campaign/backend`, type module, deps (pino, pino-http, pino-pretty, `@campaign/shared: workspace:*`), devDeps (tsx, @types/node, typescript)
- [ ] `backend/tsconfig.json` — extends base, outDir dist, rootDir src
- [ ] `backend/src/util/logger.ts` — env-aware pino logger (pretty/json/silent by LOG_LEVEL/NODE_ENV)
- [ ] `backend/src/util/httpLogger.ts` — pino-http middleware with customLogLevel + genReqId
- [ ] `frontend/package.json` — name `@campaign/frontend`, type module, dep `@campaign/shared: workspace:*` (real frontend deps come in Phase 8)
- [ ] `frontend/tsconfig.json` — extends base, includes `src/**/*`
- [ ] `shared/src/test-import-proof.ts` OR equivalent — throwaway file proving backend + frontend can import from `@campaign/shared` (cleaned up or kept minimal)

*No Vitest config or test files in Phase 1 — that's Phase 7.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logger emits pretty output in dev | FOUND-05 | Transport is `pino-pretty`, a visual side-effect; asserting the text format is brittle | Run `NODE_ENV=development tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"` — verify colorized, human-readable output |
| Logger emits JSON in prod | FOUND-05 | Visual format inspection is fine; assertion costs more than it's worth | Run `NODE_ENV=production tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"` — verify one JSON line with `level`, `time`, `msg`, `foo` fields |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s (full), < 10s (quick)
- [ ] `nyquist_compliant: true` set in frontmatter after all tasks map to automated verifications

**Approval:** pending (set to `approved YYYY-MM-DD` after planner fills Task IDs)
