// backend/src/util/httpLogger.ts
//
// pino-http Express middleware (FOUND-05 — scaffold only).
//
// This file exports the middleware but does NOT mount it on any Express
// application. Express lands in Phase 3 when `buildApp()` is written; that
// is where the middleware will be registered on the app instance. Keeping
// the middleware as a standalone export means it can be unit-tested and
// swapped without touching the HTTP layer.
//
// Request-ID policy:
//   - If the inbound request carries an `X-Request-ID` header (non-empty
//     string), trust it — this enables cross-service log correlation
//     (api ↔ worker) when a reviewer greps one ID in docker-compose logs.
//   - Otherwise, mint a fresh UUID via `crypto.randomUUID()` (Node 20 built-in;
//     no `uuid` package needed).
//   - Request IDs are correlation identifiers, NOT security identifiers.
//     Spoofing one does not bypass auth or access control (T-03-02 accepted).
//
// Log level policy:
//   - 5xx or thrown error → `error`
//   - 4xx                 → `warn`
//   - everything else     → `info`
//   (Seeing 4xx at `info` is a red flag during evaluator log review.)
//
// Security note (V7 / ASVS 7.1): `customSuccessMessage` only concatenates
// `req.method` (HTTP verb enum — trusted), `req.url` (URI-encoded by Node's
// HTTP parser), and `res.statusCode` (number). No user-controlled raw strings
// are inlined. pino JSON-escapes structured fields automatically via the
// stdSerializers wired in logger.ts.
//
// `.js` import suffix on `./logger.js` is MANDATORY — tsconfig.base.json sets
// `moduleResolution: NodeNext` which requires explicit file extensions on
// relative imports (Pitfall 8). TypeScript sees the `.ts` source; Node sees
// the emitted `.js` at runtime.
//
// Import note: we use the NAMED export `{ pinoHttp }` rather than the default
// export. pino-http is a CJS module (`module.exports = pinoLogger`) with an
// attached `.default` and `.pinoHttp` alias. Under NodeNext +
// `esModuleInterop`, the typings' `export default PinoHttp` does not reliably
// produce a callable binding — TypeScript sees it as a namespace object and
// errors with "This expression is not callable". The named export is
// explicitly declared (`export { PinoHttp as pinoHttp }` in the typings) and
// resolves to the same `pinoLogger` function at runtime. Pattern 10 in
// 01-RESEARCH.md wrote `import pinoHttp from 'pino-http'`; under this repo's
// strict TS config we use the named form — same runtime, typechecks cleanly.

import { pinoHttp, type Options } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

const options: Options = {
  logger,
  // Gradate log level by response status / thrown error.
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'info';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  // Stable request-id: trust inbound `X-Request-ID`, else mint a fresh UUID.
  genReqId: (req) => {
    const incoming = req.headers['x-request-id'];
    if (typeof incoming === 'string' && incoming.length > 0) return incoming;
    return randomUUID();
  },
  // Disable automatic request logging in test mode. The underlying logger is
  // already `silent` in test (logger.ts), but belt-and-suspenders — a future
  // test that bumps LOG_LEVEL for debugging should still get silent HTTP
  // middleware unless it explicitly turns this on.
  autoLogging: process.env.NODE_ENV !== 'test',
};

export const httpLogger = pinoHttp(options);
