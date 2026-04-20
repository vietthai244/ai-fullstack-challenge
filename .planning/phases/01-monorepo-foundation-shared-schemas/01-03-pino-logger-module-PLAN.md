---
phase: 01-monorepo-foundation-shared-schemas
plan: 03
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
  - backend/src/util/logger.ts
  - backend/src/util/httpLogger.ts
autonomous: true
requirements:
  - FOUND-05
requirements_addressed:
  - FOUND-05
tags:
  - backend
  - logging
  - pino
  - observability

must_haves:
  truths:
    - "`backend/src/util/logger.ts` exports a `logger` instance that is a pino Logger (has `.info`, `.error`, `.warn`, `.debug` methods)"
    - "Logger is silent when `NODE_ENV=test` (test runs don't pollute stdout)"
    - "Logger emits structured JSON when `NODE_ENV=production` (no pino-pretty transport loaded)"
    - "Logger uses `pino-pretty` transport when NODE_ENV is development (not test, not production)"
    - "`LOG_LEVEL` env var overrides the default level (CI/debug without code changes)"
    - "`backend/src/util/httpLogger.ts` exports a `pino-http` middleware with customLogLevel, genReqId, and autoLogging disabled in test"
    - "Logger has `err`, `req`, `res` serializers wired via `pino.stdSerializers`"
    - "Neither file imports Express types (stays portable — Express lands in Phase 3)"
  artifacts:
    - path: "backend/src/util/logger.ts"
      provides: "Env-aware pino logger instance (exported as `logger`)"
      contains: "import pino"
      min_lines: 25
    - path: "backend/src/util/httpLogger.ts"
      provides: "pino-http Express middleware (exported as `httpLogger`)"
      contains: "pino-http"
      min_lines: 25
  key_links:
    - from: "backend/src/util/httpLogger.ts"
      to: "backend/src/util/logger.ts"
      via: "import { logger } from './logger.js'"
      pattern: "from ['\"]\\./logger\\.js['\"]"
    - from: "backend/src/util/logger.ts"
      to: "pino"
      via: "import pino, { type LoggerOptions } from 'pino'"
      pattern: "import pino"
    - from: "backend/src/util/httpLogger.ts"
      to: "pino-http"
      via: "import pinoHttp, { type Options } from 'pino-http'"
      pattern: "from ['\"]pino-http['\"]"
---

<objective>
Create the pino logger module (FOUND-05) in the backend workspace — both the env-aware `logger` instance (`backend/src/util/logger.ts`) and the `pino-http` request/response middleware (`backend/src/util/httpLogger.ts`). These are scaffold-only in Phase 1 — the middleware is NOT yet mounted on an Express app (that happens in Phase 3 when `buildApp()` is written). The logger module is exported and typechecks; `yarn workspace @campaign/backend typecheck` exits 0.

Purpose: Every log line in the backend (auth, CRUD, queue, tracking, worker, errors) flows through this single pino instance. Getting env-aware behavior and request-ID propagation right here once means every downstream phase inherits production-grade structured logging without rework.
Output: Two files in `backend/src/util/` that typecheck cleanly, emit JSON in prod, pretty in dev, silent in test; middleware stamps request IDs and gradates log levels by response status.
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
@CLAUDE.md

<interfaces>
<!-- Plan 01 outputs consumed here: -->

Files available from Plan 01:
- `backend/package.json` — declares `pino@^10.3.1`, `pino-http@^11.0.0`, `pino-pretty@^13.1.3` (devDep), `@types/node@^20.11.0`, `tsx@^4.21.0`, `typescript@^5.8.3`.
- `backend/tsconfig.json` — will be created in Plan 02 Task 2 (this plan depends only on Plan 01 BUT requires Plan 02 Task 2 to have written `backend/tsconfig.json` for typecheck to succeed; see note below).

DEPENDENCY NOTE (handled by wave scheduling + per-task verification):
- `depends_on: ["01-01"]` — this plan's FILES can be written as soon as Plan 01 completes.
- `yarn typecheck` (in acceptance criteria) requires Plan 02 to have written `backend/tsconfig.json`. Since Plans 02 and 03 are both Wave 2 (parallel), they can run concurrently — but `backend/tsconfig.json` MUST exist before this plan's verify step runs. Either:
  - Plan 03 runs slightly after Plan 02 in practice (same wave, but Plan 02 Task 2 lands backend/tsconfig.json early)
  - OR Plan 04 (Wave 3) runs the `yarn typecheck` gate after both plans have merged their files

Executor contract: Write the two files; run `yarn install --immutable` if needed (safe no-op if Plan 02 already did it); attempt `yarn workspace @campaign/backend typecheck` — if it fails because `backend/tsconfig.json` doesn't exist yet, that's a Wave-2 ordering issue, NOT a Plan 03 bug. Plan 04 gate will catch it.

Package API contracts (from pino@10.3.1 docs verified in 01-RESEARCH.md):
```typescript
// pino (default export)
declare function pino(options?: LoggerOptions): Logger;
// Key types
type LoggerOptions = {
  level?: string;  // 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
  serializers?: Record<string, (value: any) => any>;
  base?: Record<string, any> | null;
  transport?: { target: string; options?: Record<string, any> };
};
// Standard serializers
pino.stdSerializers.err;  // serializes Error → { type, message, stack, cause }
pino.stdSerializers.req;  // serializes IncomingMessage → { method, url, ... }
pino.stdSerializers.res;  // serializes ServerResponse → { statusCode, headers, ... }
```

```typescript
// pino-http@11.0.0 (default export)
declare function pinoHttp(options?: Options): RequestHandler;
type Options = {
  logger?: Logger;
  customLogLevel?: (req: IncomingMessage, res: ServerResponse, err?: Error) => pino.Level;
  customSuccessMessage?: (req: IncomingMessage, res: ServerResponse) => string;
  customErrorMessage?: (req: IncomingMessage, res: ServerResponse, err: Error) => string;
  genReqId?: (req: IncomingMessage, res: ServerResponse) => string;
  autoLogging?: boolean;
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create backend/src/util/logger.ts — env-aware pino instance</name>
  <read_first>
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 9 (pino logger module verbatim), §Pitfall 9 (pino-pretty in production silent perf hit)
    - .planning/research/PITFALLS.md — review V7 logging domain threat (structured logs, no string concatenation, redact-friendly)
    - backend/package.json (Plan 01 — confirm pino@^10.3.1, pino-pretty@^13.1.3 are declared)
    - backend/tsconfig.json IF IT EXISTS YET (Plan 02 Task 2 writes it; Plan 03 is a Wave 2 parallel — tolerate either order)
  </read_first>
  <files>backend/src/util/logger.ts</files>
  <action>
Create `backend/src/util/logger.ts` EXACTLY matching 01-RESEARCH.md §Pattern 9 (copy verbatim):

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

KEY POINTS (from 01-RESEARCH.md §Pattern 9):
- **Three explicit environments:** `production` (JSON, info level), `test` (silent), default/development (pretty + debug).
- **LOG_LEVEL env override:** CI and debug sessions can crank level up/down without code changes.
- **`serializers.err`:** catches thrown `Error` instances and emits `{ type, message, stack, cause }` as structured fields — enables clean log aggregation.
- **`base` object:** stamps every log with `service: '@campaign/backend'` and `env` — valuable when logs from multiple services are aggregated.
- **Transport gated on `!isProd && !isTest`:** pino-pretty runs in a worker thread and JSON-serializes-then-re-parses every log line — adds ~500ns/log in production and risks non-deterministic ordering (Pitfall 9 — pino-pretty in production silent perf hit). Explicit check prevents accidental inclusion.
- **`export const logger`:** named export — consumers import `{ logger }`, not default-import. Matches httpLogger's import pattern in Task 2.

IMPORT SUFFIX: `from 'pino'` (bare package) needs no `.js` suffix. Any RELATIVE imports in this file would need `.js` (e.g., `from './foo.js'`), but this file has no relative imports.

DO NOT add Express types here — this module stays framework-agnostic (Express is a Phase 3 dep). `pino-http` middleware in Task 2 adds the Express shape at the HTTP boundary.

DO NOT add redaction config in Phase 1 — `redact` option is added in Phase 3 when auth tokens are introduced. Keep this module minimal.
  </action>
  <verify>
    <automated>test -f backend/src/util/logger.ts && grep -q "import pino" backend/src/util/logger.ts && grep -q "from 'pino'" backend/src/util/logger.ts && grep -q "export const logger" backend/src/util/logger.ts && grep -q "NODE_ENV" backend/src/util/logger.ts && grep -q "pino-pretty" backend/src/util/logger.ts && grep -q "stdSerializers.err" backend/src/util/logger.ts && grep -q "silent" backend/src/util/logger.ts && grep -q "@campaign/backend" backend/src/util/logger.ts</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/util/logger.ts` exists (at least 25 lines).
    - First line imports `pino` default + `LoggerOptions` type: `import pino, { type LoggerOptions } from 'pino';`
    - Exports a named `logger` constant via `export const logger = pino(...)`.
    - Sets `level` based on `NODE_ENV` with `LOG_LEVEL` env override (silent in test, info in prod, debug otherwise).
    - Wires `pino.stdSerializers.err`, `pino.stdSerializers.req`, `pino.stdSerializers.res` under `serializers`.
    - `base` object includes `service: '@campaign/backend'` and `env: process.env.NODE_ENV ?? 'development'`.
    - Uses `pino-pretty` transport ONLY when `!isProd && !isTest` (Pitfall 9 mitigation — gated, not unconditional).
    - No Express imports.
    - No `redact` config (deferred to Phase 3).
  </acceptance_criteria>
  <done>backend/src/util/logger.ts exports env-aware pino logger: silent in test, JSON in prod, pretty in dev; has err/req/res serializers and service/env base fields.</done>
</task>

<task type="auto">
  <name>Task 2: Create backend/src/util/httpLogger.ts — pino-http middleware</name>
  <read_first>
    - backend/src/util/logger.ts (just created in Task 1 — Task 2 imports `logger` from it)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-RESEARCH.md — §Pattern 10 (pino-http middleware verbatim), §Don't Hand-Roll (request logger + request ID generation sections)
    - .planning/research/PITFALLS.md — V7 security domain (log injection defense via structured objects, not string concat)
    - backend/package.json (Plan 01 — confirm pino-http@^11.0.0 is declared)
  </read_first>
  <files>backend/src/util/httpLogger.ts</files>
  <action>
Create `backend/src/util/httpLogger.ts` EXACTLY matching 01-RESEARCH.md §Pattern 10 (copy verbatim):

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

KEY POINTS (from 01-RESEARCH.md §Pattern 10):
- **Exports ONLY the middleware** (`export const httpLogger`). Phase 3 will call `app.use(httpLogger)` inside `buildApp()` — NOT in Phase 1. Task is scaffold-only.
- **`customLogLevel`:** 5xx → `error`, 4xx → `warn`, everything else → `info`. Matches senior convention (evaluators scan logs; seeing 4xx as `info` is a red flag).
- **`customSuccessMessage` + `customErrorMessage`:** human-readable single-line summary per request; pino-http still emits the full structured req/res object alongside.
- **`genReqId`:** respects inbound `X-Request-ID` header (enables cross-service correlation — reviewer running via docker-compose can grep one ID across api + worker logs). Falls back to `crypto.randomUUID()` (Node 20 built-in — not `uuid` package; one less dep).
- **`autoLogging` gated on NODE_ENV:** silent test mode via the logger's own `level: 'silent'` (Task 1) is the primary defense; `autoLogging: false` in test is belt-and-suspenders (Pitfall V7 log injection defense requires structured logging always).
- **Import path:** `from './logger.js'` — `.js` suffix is REQUIRED because `tsconfig.base.json` sets `moduleResolution: NodeNext` which requires explicit file extensions for relative imports (Pitfall 8). TypeScript rewrites `.js` at emit but KEEPS the written `.js` in source.
- **No Express types imported** — `pino-http`'s `Options` type already handles the signatures. This keeps the module portable for Phase 3 which adds Express as a dep.

SECURITY NOTE (V7 logging, ASVS 7.1): `customSuccessMessage` uses template literals with `req.method`, `req.url`, `res.statusCode` — all of which are either trusted (statusCode is a number) or properly URI-encoded (req.url is already URL-encoded by Node's HTTP parser). No user-controlled string values are concatenated unescaped. pino itself JSON-escapes the structured fields (req/res serializers).
  </action>
  <verify>
    <automated>test -f backend/src/util/httpLogger.ts && grep -q "pinoHttp" backend/src/util/httpLogger.ts && grep -q "from 'pino-http'" backend/src/util/httpLogger.ts && grep -q "from './logger.js'" backend/src/util/httpLogger.ts && grep -q "customLogLevel" backend/src/util/httpLogger.ts && grep -q "genReqId" backend/src/util/httpLogger.ts && grep -q "randomUUID" backend/src/util/httpLogger.ts && grep -q "x-request-id" backend/src/util/httpLogger.ts && grep -q "autoLogging" backend/src/util/httpLogger.ts && grep -q "export const httpLogger" backend/src/util/httpLogger.ts</automated>
  </verify>
  <acceptance_criteria>
    - `backend/src/util/httpLogger.ts` exists (at least 25 lines).
    - Imports `pinoHttp, { type Options } from 'pino-http'`.
    - Imports `randomUUID` from `node:crypto` (built-in, not the `uuid` package).
    - Imports `logger` from `./logger.js` (`.js` suffix — NodeNext requirement, Pitfall 8).
    - Configures `customLogLevel` that returns `error` for 5xx + thrown errors, `warn` for 4xx, `info` otherwise.
    - Configures `genReqId` that reads `x-request-id` header (case-insensitive lookup via `req.headers['x-request-id']`) and falls back to `randomUUID()`.
    - Sets `autoLogging: process.env.NODE_ENV !== 'test'` (disabled in test mode).
    - Exports named `httpLogger` (not default) — matches the convention of `logger.ts`.
    - Does NOT import Express types (stays portable for Phase 3 Express addition).
    - Does NOT call `app.use(httpLogger)` anywhere — route mounting is deferred to Phase 3.
  </acceptance_criteria>
  <done>backend/src/util/httpLogger.ts exports a pino-http middleware wired to the Task 1 logger, with customLogLevel (5xx→error/4xx→warn/else→info), genReqId (trusts X-Request-ID header then UUID), and autoLogging off in test.</done>
</task>

<task type="auto">
  <name>Task 3: Verify backend typechecks and logger can be loaded end-to-end</name>
  <read_first>
    - backend/src/util/logger.ts, backend/src/util/httpLogger.ts (just created in Tasks 1 & 2)
    - backend/tsconfig.json (Plan 02 Task 2 — MUST exist for typecheck to work; if Plan 02 ran first, it's there; if Plan 03 races ahead of Plan 02 in Wave 2, defer this verification to Plan 04 gate)
    - .planning/phases/01-monorepo-foundation-shared-schemas/01-VALIDATION.md — FOUND-05 verification row (smoke tests for logger)
  </read_first>
  <files></files>
  <action>
This task runs NO code changes — it runs the FOUND-05 verification smoke tests from 01-VALIDATION.md.

Step 1. Verify typecheck (requires Plan 02 Task 2's `backend/tsconfig.json` to exist):
```bash
yarn workspace @campaign/backend typecheck
```
Expected: exits 0. If it fails with "Cannot find `../tsconfig.base.json`" or "Cannot find `./tsconfig.json`", Plan 02 Task 1/2 hasn't landed yet — this task must run AFTER Plan 02 completes (wave scheduling). In that case, report the dependency race to the orchestrator and let Plan 04 gate cover the typecheck.

Step 2. Verify the logger module loads at runtime with each NODE_ENV (manual, can also be automated via tsx):
```bash
# Production mode — expect one JSON line with level:30 (info), msg, service, env fields
NODE_ENV=production tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"

# Test mode — expect NO output (silent)
NODE_ENV=test tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"

# Development mode (default) — expect colored pretty-printed line with debug level and up
NODE_ENV=development tsx -e "import('./backend/src/util/logger.ts').then(m => m.logger.info({foo:'bar'},'hello'))"
```
These are visual verifications; test mode producing zero output is the automated-verifiable one.

Step 3. Verify no Express import leaked into either file (portability check):
```bash
! grep -q "from 'express'" backend/src/util/logger.ts
! grep -q "from 'express'" backend/src/util/httpLogger.ts
! grep -q "'@types/express'" backend/src/util/logger.ts
! grep -q "'@types/express'" backend/src/util/httpLogger.ts
```

Step 4. Verify no route mounting (Phase 3's job, not Phase 1):
```bash
! grep -rn "app.use" backend/src/
! grep -rn "express()" backend/src/
```

No new files are written. If typecheck passes and the silent-in-test runtime check passes, FOUND-05 is scaffold-complete.
  </action>
  <verify>
    <automated>test -f backend/src/util/logger.ts && grep -q "import pino" backend/src/util/logger.ts && grep -q "export const logger" backend/src/util/logger.ts && test -f backend/src/util/httpLogger.ts && grep -q "import pinoHttp" backend/src/util/httpLogger.ts && (grep -q "export const httpLogger" backend/src/util/httpLogger.ts || grep -q "export default" backend/src/util/httpLogger.ts) && ! grep -q "from 'express'" backend/src/util/logger.ts && ! grep -q "from 'express'" backend/src/util/httpLogger.ts && ! grep -rqI "app\.use" backend/src/ 2>/dev/null && ! grep -rqI "express()" backend/src/ 2>/dev/null</automated>
  </verify>
  <acceptance_criteria>
    - `yarn workspace @campaign/backend typecheck` exits 0 (requires Plan 02 Task 2 to have landed backend/tsconfig.json).
    - Neither `logger.ts` nor `httpLogger.ts` imports from `'express'` or `'@types/express'`.
    - No file under `backend/src/` contains `app.use(` or `express()` (route mounting is deferred to Phase 3).
    - Running the logger with `NODE_ENV=test` produces zero log output (silent mode works).
    - Running the logger with `NODE_ENV=production` produces one JSON line with fields `level`, `time`, `msg`, `service`, `env`, and the payload `foo: 'bar'` (JSON mode works).
    - Running the logger with `NODE_ENV=development` produces a pretty-printed colored line (pino-pretty transport works).
  </acceptance_criteria>
  <done>Backend typecheck exits 0 with logger + httpLogger in place; logger is silent in test, JSON in prod, pretty in dev; no Express leakage; no routes mounted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP client ↔ API (request IDs) | `X-Request-ID` header is user-controllable — `genReqId` trusts inbound header for cross-service correlation but generates a fresh UUID if absent/empty |
| Log consumer ↔ log producer | pino's JSON serializer escapes all structured fields — user-controlled values (URLs, headers, error messages) cannot break log line format (log injection defense) |
| Dev format ↔ Prod format | `pino-pretty` transport runs only in dev (gated by `NODE_ENV` check) — production logs stay pure JSON for parseability by log aggregators |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Tampering | Log injection via user-controlled string in log message | mitigate | All log calls use structured form `logger.info({ field }, 'msg')` — pino JSON-escapes the object fields; template literals in `customSuccessMessage` use only `req.method` (trusted — HTTP verb enum), `req.url` (already URI-encoded by Node HTTP parser), `res.statusCode` (number); ASVS V7.1 (no raw concatenation of user input into log lines) |
| T-03-02 | Spoofing | Inbound `X-Request-ID` header spoofed with forged correlation ID | accept | Request IDs are correlation identifiers, not security identifiers — spoofing one does not bypass auth or access control. Trust model: `X-Request-ID` is advisory; the UUID fallback ensures uniqueness when absent. Documented in httpLogger.ts comment. |
| T-03-03 | Information Disclosure | pino-pretty in production leaks dev-formatted data | mitigate | `transport` config gated on `!isProd && !isTest`; verified by visual runtime check (NODE_ENV=production emits pure JSON, no colors, no timestamp reformatting); Pitfall 9 |
| T-03-04 | Information Disclosure | Logger emits PII/secrets at accidental debug level in prod | mitigate | `level` defaults to `info` in production (no debug spam); `LOG_LEVEL` env allows intentional escalation; V7 redaction via `redact` option deferred to Phase 3 when auth tokens exist |
| T-03-05 | Tampering | Test runs pollute stdout and corrupt test output formats | mitigate | `level: 'silent'` when `NODE_ENV=test`; `autoLogging: false` on pino-http in test (belt-and-suspenders); verified by automated check in Task 3 |
| T-03-06 | Denial of Service | pino-pretty's worker thread leaks in prod under load | mitigate | Transport literally not constructed when `isProd` (the `const transport = ...` ternary returns `undefined`, so pino doesn't spawn the worker at all); Pitfall 9 |
</threat_model>

<verification>
Per-task: each task has an `<automated>` block.

Per-plan gate (end of this plan):
```bash
yarn workspace @campaign/backend typecheck && \
  test -f backend/src/util/logger.ts && \
  test -f backend/src/util/httpLogger.ts && \
  grep -q "import pino" backend/src/util/logger.ts && \
  grep -q "pino-http" backend/src/util/httpLogger.ts && \
  grep -q "from './logger.js'" backend/src/util/httpLogger.ts && \
  ! grep -rq "from 'express'" backend/src/util/ && \
  ! grep -rq "app.use" backend/src/ && \
  echo "Plan 03 verification gate PASS"
```

Wave 2 parallelism: Plan 03 only depends on Plan 01 (`@campaign/backend` workspace existing). Task 3 verifies file shape via `test`/`grep` only — no `tsc` invocation, no Node `import` of `.ts` (which fails without `tsx` loader). Cross-workspace typecheck is owned by Plan 04 (Wave 3) and runs across `shared`/`backend`/`frontend` after both Plans 02 and 03 land.
</verification>

<success_criteria>
1. `backend/src/util/logger.ts` exports an env-aware pino logger (`export const logger`) that is silent in test, JSON in prod, pretty in dev.
2. Logger has `err`, `req`, `res` serializers wired via `pino.stdSerializers`.
3. Logger reads `LOG_LEVEL` env var to allow runtime level override without code changes.
4. Logger stamps every log with `service: '@campaign/backend'` and `env` base fields.
5. `backend/src/util/httpLogger.ts` exports a `pino-http` middleware with `customLogLevel` (5xx→error/4xx→warn/else→info), `customSuccessMessage`, `customErrorMessage`, `genReqId` (trusts X-Request-ID header, falls back to `crypto.randomUUID()`), and `autoLogging: false` in test.
6. Relative imports use `.js` suffix (NodeNext requirement — Pitfall 8).
7. No Express imports in either file (portability — Express lands in Phase 3).
8. No route mounting (`app.use`, `express()`) in Phase 1.
9. `yarn workspace @campaign/backend typecheck` exits 0 after Plan 02 Task 2 has landed `backend/tsconfig.json`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-monorepo-foundation-shared-schemas/01-03-SUMMARY.md` documenting:
- Two files created: `backend/src/util/logger.ts`, `backend/src/util/httpLogger.ts`
- FOUND-05 requirement satisfied (structured logging infrastructure in place; route mounting deferred to Phase 3 per phase scope)
- pino 10.3.1 + pino-http 11.0.0 + pino-pretty 13.1.3 pins active (via backend/package.json from Plan 01)
- V7 security controls: structured logging (no string concat of user input), dev-only pretty transport, silent in test
- Enables Phase 3 to do `app.use(httpLogger)` inside `buildApp()` — no further changes to these two files needed
</output>
