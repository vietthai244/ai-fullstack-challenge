---
phase: "03-authentication"
plan: "01"
subsystem: "backend-infra"
tags: [auth, infra, redis, error-handling, env, zod, validation]
dependency_graph:
  requires: [phase-02-data-model]
  provides: [config/env.ts, lib/redis.ts, util/errors.ts, middleware/validate.ts, middleware/errorHandler.ts, redis-in-compose]
  affects: [03-02, 03-03, 03-04]
tech_stack:
  added: [express@^4.22.1, cookie-parser@^1.4.7, jsonwebtoken@^9.0.3, ioredis@^5.10.1, "@types/express@^5.0.6", "@types/jsonwebtoken@^9.0.10", "@types/cookie-parser@^1.4.10"]
  patterns: [fail-fast-env-validation, ioredis-named-import, HttpError-hierarchy, zod-validate-middleware, tail-error-handler]
key_files:
  created:
    - backend/src/config/env.ts
    - backend/src/lib/redis.ts
    - backend/src/util/errors.ts
    - backend/src/middleware/validate.ts
    - backend/src/middleware/errorHandler.ts
  modified:
    - docker-compose.yml
    - .env.example
    - backend/.env.example
    - backend/package.json
    - yarn.lock
decisions:
  - "ioredis named import { Redis as IORedis } required — default import has no construct signature under NodeNext moduleResolution"
  - "maxRetriesPerRequest omitted from auth Redis client (comment explains why — BullMQ concern only, Phase 5)"
  - "errorHandler uses typeof guard + .name string match for Sequelize errors (avoids importing sequelize package in middleware)"
metrics:
  duration: "185s"
  completed_date: "2026-04-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 4
---

# Phase 3 Plan 01: Authentication Scaffolding Summary

Phase 3 Wave 1 scaffolding: Redis in docker-compose, fail-fast Zod env config with JWT secret guards, ioredis denylist client, HttpError class hierarchy, Zod validate middleware factory, and tail error handler — all prerequisite primitives for plans 02/03/04.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 03-01-01 | docker-compose redis + env keys | 75f1225 | docker-compose.yml, .env.example, backend/.env.example |
| 03-01-02 | Install deps + config/env.ts + lib/redis.ts | bbe4a71 | backend/package.json, yarn.lock, backend/src/config/env.ts, backend/src/lib/redis.ts |
| 03-01-03 | util/errors.ts + middleware/validate.ts + middleware/errorHandler.ts | 3896c99 | backend/src/util/errors.ts, backend/src/middleware/validate.ts, backend/src/middleware/errorHandler.ts |

## Requirements Unblocked

All 7 AUTH-REQ IDs (AUTH-01..07) are now infrastructure-unblocked. This plan builds no HTTP routes but every endpoint in plans 02-04 depends on these primitives:

- AUTH-01 (register): needs ConflictError, ValidationError, validate() middleware
- AUTH-02 (login): needs UnauthorizedError, cookie-parser, jsonwebtoken dep
- AUTH-03 (refresh): needs redis denylist client + UnauthorizedError
- AUTH-04 (logout): needs redis denylist client + clearCookie path
- AUTH-05 (me): needs authenticate middleware (plan 02)
- AUTH-06 (protected routes 401): needs errorHandler + UnauthorizedError
- AUTH-07 (cross-user 404): needs NotFoundError + errorHandler

## Verification Results

- `docker compose config` parses; redis:7-alpine service with healthcheck and redisdata volume present
- Both `.env.example` files contain all 7 Phase 3 keys (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, BCRYPT_COST, REDIS_URL, PORT)
- `backend/src/config/env.ts`: Zod schema with `.min(32)` on both JWT secrets + `.refine()` inequality guard; process.exit(1) on violation
- `backend/src/lib/redis.ts`: named import `{ Redis as IORedis }`, no `maxRetriesPerRequest`, `.on('error')` wired to logger
- `backend/src/util/errors.ts`: 7-class hierarchy (HttpError + 6 subclasses)
- `backend/src/middleware/validate.ts`: `validate<T>(schema, source?)` factory; throws ValidationError on failure
- `backend/src/middleware/errorHandler.ts`: maps HttpError/ZodError/Sequelize → `{error:{code,message}}`; no stack leak; reqId in 500 log
- `yarn workspace @campaign/backend typecheck` passes with zero errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ioredis default import not constructable under NodeNext**
- **Found during:** Task 2 typecheck
- **Issue:** `import IORedis from 'ioredis'` → `TS2351: This expression is not constructable` — ioredis v5 exports named `Redis` class, not a default-constructable export under NodeNext moduleResolution
- **Fix:** Changed to `import { Redis as IORedis } from 'ioredis'`; kept alias so all downstream `new IORedis(...)` calls unchanged; added explicit `err: Error` type annotation on `.on('error', ...)` callback to resolve implicit-any
- **Files modified:** backend/src/lib/redis.ts
- **Commit:** bbe4a71

## Carry-forwards

- Plan 04 MUST register `cookieParser()` in `buildApp()` in `app.ts` BEFORE the auth router (P3-7 — refresh cookie reads fail silently without this)
- Plan 04 MUST draft the DECISIONS.md note explaining `Path=/auth` cookie scope (A1 deviation from ARCHITECTURE.md §8 — deliberate so logout can clear the cookie)
- `backend/src/lib/redis.ts` comment explains `maxRetriesPerRequest: null` is Phase 5 BullMQ's concern — executor of Plan 05 must add it to the BullMQ IORedis connection, NOT this client

## Known Stubs

None — this plan creates infrastructure primitives only, no HTTP routes or data flows.

## Threat Flags

None — all threat mitigations from T-03-01, T-03-02, T-03-04, T-03-05 applied as specified.

## Self-Check: PASSED

- [x] backend/src/config/env.ts exists
- [x] backend/src/lib/redis.ts exists
- [x] backend/src/util/errors.ts exists
- [x] backend/src/middleware/validate.ts exists
- [x] backend/src/middleware/errorHandler.ts exists
- [x] Commits 75f1225, bbe4a71, 3896c99 exist in git log
