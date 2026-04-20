---
phase: 01-monorepo-foundation-shared-schemas
plan: 03
subsystem: backend
tags: [pino, logging, pino-http, observability, request-id, node20]

requires:
  - phase: 01-monorepo-foundation-shared-schemas
    provides: "Plan 01: @campaign/backend workspace with pino + pino-http + pino-pretty declared as deps; Plan 02: backend/tsconfig.json extending strict NodeNext base + first yarn install populating node_modules"
provides:
  - "backend/src/util/logger.ts — env-aware pino Logger instance (pretty in dev, JSON in prod, silent in test; LOG_LEVEL override honored)"
  - "backend/src/util/httpLogger.ts — pino-http middleware factory (not yet mounted on an Express app — that's Phase 3)"
  - "Request-ID propagation convention: trust inbound X-Request-ID header, otherwise mint crypto.randomUUID()"
  - "Log-level gradation policy: 5xx/thrown → error, 4xx → warn, 2xx/3xx → info"
affects: [phase-03-authentication, phase-04-campaigns-api, phase-10-full-docker-stack]

tech-stack:
  added: [pino@^10.3.1, pino-http@^11.0.0, pino-pretty@^13.1.3]
  patterns:
    - "Env-aware transport: spread-conditional `...transportOption` instead of `transport: undefined` (required by exactOptionalPropertyTypes: true)"
    - ".js suffix on relative imports (NodeNext module resolution)"
    - "Named-import for CJS pino-http (import { pinoHttp } from 'pino-http') because default import isn't callable under strict NodeNext + esModuleInterop"

key-files:
  created:
    - backend/src/util/logger.ts
    - backend/src/util/httpLogger.ts
  modified: []

key-decisions:
  - "Logger module is framework-agnostic — NO Express imports. Express middleware layer lives only in httpLogger.ts."
  - "Request-IDs are correlation IDs, NOT security IDs — inbound X-Request-ID is trusted as an advisory value (T-03-02 disposition: accept)."
  - "customSuccessMessage concatenates only trusted fields (req.method enum + Node-URI-encoded req.url + res.statusCode number) — no user-controlled strings inline (V7 / ASVS 7.1 defense against log injection)."
  - "pino-pretty transport is gated on (!isProd && !isTest). In prod/test the transport key is absent from options, so the pino-pretty worker thread is never spawned (Pitfall 9 — no transport leak under load)."
  - "autoLogging disabled when NODE_ENV=test, belt-and-suspenders with silent log level."
  - "No redact config in Phase 1 — token/secret redaction added in Phase 3 when JWT tokens are introduced."

patterns-established:
  - "Env-aware pino config via conditional spread of `transportOption` — works under `exactOptionalPropertyTypes: true`"
  - "Correlation ID genReqId: honor inbound header, fallback to crypto.randomUUID()"
  - "Named-export CJS interop: `import { pinoHttp } from 'pino-http'` (not default import) for NodeNext strict mode"

requirements-completed: [FOUND-05]

duration: ~8 min
completed: 2026-04-21
---

# Phase 1, Plan 03: pino Logger Module Summary

**Env-aware structured logging is wired into the backend workspace — shape and exports are in place for Phase 3's Express bootstrap to drop in with one `app.use(httpLogger)` call.**

## Performance

- **Duration:** ~8 min (including two small deviations for TS strict-mode quirks)
- **Tasks:** 3/3 (1 file write + 1 file write + 1 grep/test verify)
- **Files created:** 2

## Accomplishments

- pino Logger instance exported with env-aware transport, serializers (err/req/res), and LOG_LEVEL override — meets all FOUND-05 truths in the plan frontmatter.
- pino-http middleware factory exported — 5xx/4xx log-level gradation, X-Request-ID propagation, autoLogging-off in test.
- Both files stay Express-free — they can be unit-tested in isolation and Phase 3 mounts them without any refactor.
- `yarn workspace @campaign/backend typecheck` exits 0 with both files in place (strict NodeNext + noUncheckedIndexedAccess + exactOptionalPropertyTypes).

## Task Commits

1. **Task 1: Write backend/src/util/logger.ts** — `fdbcf5e` (feat) — env-aware pino logger instance (FOUND-05)
   - Fix commit: `8a91823` (fix) — spread transport key instead of `{ transport: undefined }` to satisfy `exactOptionalPropertyTypes: true`
2. **Task 2: Write backend/src/util/httpLogger.ts** — `4f66d3d` (feat) — pino-http middleware with request-id propagation (FOUND-05)
3. **Task 3: Verify logger module shape** — `762c930` (docs) — rephrase httpLogger comment to avoid the literal string `app.use()` (the Task 3 grep guard bans `app.use(` anywhere under backend/src/ in Phase 1)

## Files Created

- `backend/src/util/logger.ts` — ~55 lines. Exports `logger`. Imports only `pino` + its types. Gated pino-pretty transport. Respects `LOG_LEVEL`. Serializers wired via `pino.stdSerializers`. `service: '@campaign/backend'` base field.
- `backend/src/util/httpLogger.ts` — ~70 lines. Exports `httpLogger`. Imports `{ pinoHttp, type Options } from 'pino-http'`, `{ randomUUID } from 'node:crypto'`, `{ logger } from './logger.js'`. customLogLevel + customSuccessMessage + customErrorMessage + genReqId + autoLogging configured.

## Deviations

1. **TS strict mode tripped on `{ transport: undefined }`** — expected by pino's type signature but rejected by `exactOptionalPropertyTypes: true`. Resolution: conditionally spread a `transportOption` object so the `transport` key is either present (dev) or completely absent (prod/test). Documented inline in logger.ts. Rule-2 in-scope fix — committed as a separate `fix` commit for reviewer traceability.
2. **pino-http default import was not callable under NodeNext + esModuleInterop** — TypeScript surfaced the CJS default as a namespace object rather than a function. Resolution: use the named export `import { pinoHttp } from 'pino-http'` which is explicitly declared in the typings and resolves to the same function at runtime. Documented with a multi-paragraph comment in httpLogger.ts so future readers don't re-litigate this choice. (01-RESEARCH.md §Code Examples showed `import pinoHttp from 'pino-http'` — this deviation is a justified strict-mode refinement.)
3. **Task 3's verify grep bans the literal string `app.use(` anywhere under backend/src/** — the initial draft of httpLogger.ts had a comment reading "…will be mounted via `app.use(httpLogger)` in Phase 3" which tripped the guard. Resolution: rephrase the comment to "…will be registered on the app instance" — preserves intent without tripping the grep. Committed as `docs(1-3): rephrase httpLogger comment to avoid app.use() literal`.

## Threat Model Observations (FOUND-05 / ASVS V7)

- T-03-01 (Log injection) — MITIGATED. All log calls use structured form `logger.info({ field }, 'msg')`; customSuccessMessage uses only trusted HTTP metadata.
- T-03-02 (X-Request-ID spoofing) — ACCEPT. Request-IDs are correlation identifiers, not security identifiers. Documented inline.
- T-03-03 (pino-pretty leaks in prod) — MITIGATED. Transport literal is absent from prod/test options.
- T-03-04 (PII/secrets at accidental debug level in prod) — PARTIAL. Default level is `info` in prod; LOG_LEVEL override is intentional. `redact` config deferred to Phase 3 (when JWT secrets exist).
- T-03-05 (Test runs polluting stdout) — MITIGATED. silent level + `autoLogging: false` in test.
- T-03-06 (pino-pretty worker leaks under load) — MITIGATED. Transport never constructed in prod.

## Phase 1 Progress

Plan 01-03 completes FOUND-05. Phase 1 now has 3/4 plans done:
- ✅ Plan 01-01 — Yarn 4 + workspaces + shared (FOUND-01)
- ✅ Plan 01-02 — Root TS + ESLint + Prettier (FOUND-04)
- ✅ Plan 01-03 — pino logger module (FOUND-05)
- ⏳ Plan 01-04 — Cross-workspace import proof + Phase 1 acceptance gate (validates all 5 ROADMAP success criteria)

## Handoff to Phase 3

When Phase 3 writes `backend/src/app.ts` (the Express buildApp factory), it will:
```ts
import express from 'express';
import { httpLogger } from './util/httpLogger.js';
export const buildApp = () => {
  const app = express();
  app.use(httpLogger);     // ← mount the middleware here (Phase 3, not Phase 1)
  // … routes
  return app;
};
```
No refactor needed — the scaffold is drop-in ready.
