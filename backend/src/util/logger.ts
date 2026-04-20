// backend/src/util/logger.ts
//
// Env-aware pino logger (FOUND-05).
//
// Behavior by NODE_ENV:
//   - production  → structured JSON at level `info` (no pino-pretty transport)
//   - test        → level `silent` (no log output pollutes test runs)
//   - otherwise   → pino-pretty transport at level `debug` (colored dev output)
//
// `LOG_LEVEL` env var overrides the computed level (CI / debug sessions).
//
// Standard serializers (`err`, `req`, `res`) are wired via `pino.stdSerializers`
// so thrown Errors and Node HTTP req/res objects are flattened into clean
// structured fields instead of giant nested objects.
//
// No Express imports — this module stays framework-agnostic. The HTTP
// middleware layer lives in `httpLogger.ts` (Task 2); Express itself lands in
// Phase 3 when `buildApp()` is written.
//
// No `redact` config in Phase 1 — token/secret redaction is added in Phase 3
// when JWT auth is introduced.

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

// Pretty print only in dev (never in prod, never in test).
// Gating the transport literal means pino does not spawn the pino-pretty
// worker thread at all when we are not in dev — Pitfall 9 mitigation.
const transport =
  !isProd && !isTest
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      }
    : undefined;

export const logger = pino({ ...baseOptions, transport });
