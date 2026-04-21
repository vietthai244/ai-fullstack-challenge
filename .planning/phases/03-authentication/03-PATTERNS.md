# Phase 3: Authentication — Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 17 (12 create + 4 modify + 1 shared modify)
**Analogs found:** 12 exact/role-match / 17 (5 files are NEW conventions for the backend)

---

## Conventions to Preserve (cross-cutting, extracted from Phase 1 + Phase 2 source)

These are the existing conventions every Phase 3 file must mimic. Deviations should be documented, not silently invented.

| Convention | Rule | Canonical Source |
|-----------|------|------------------|
| **Import style — ESM `.js` suffix on relative imports** | `tsconfig.base.json` sets `moduleResolution: NodeNext`. Every relative import MUST end in `.js` (TS reads `.ts`, Node runtime sees `.js`). Never `.ts`, never extensionless. | `backend/src/db/index.ts:4-8`, `backend/src/index.ts:11`, `backend/src/util/httpLogger.ts:50` |
| **Shared package resolution** | `import { X } from '@campaign/shared'` — no sub-path imports (`@campaign/shared/schemas/...`). `shared/dist/` is the entry. `postinstall` rebuilds it. | `backend/src/index.ts:10`, `backend/src/models/campaign.ts:3` |
| **Logger usage** | `import { logger } from '../util/logger.js'` — named export. Use structured-object first arg: `logger.info({ foo }, 'message')`, `logger.error({ err }, 'message')`. Level comes automatically from env (silent in test). Do NOT instantiate a second pino instance. | `backend/src/db/index.ts:4,24`, `backend/src/util/logger.ts:60` |
| **DB / model import** | `import { User, Campaign, Recipient, CampaignRecipient } from '../db/index.js'` — the `db/index.ts` barrel. It runs `initModel` + `associate` as a side effect. Never import directly from `../models/*`. | `backend/src/db/index.ts:41` (re-export), seeder at `20260101000000-demo-data.cjs` shows model-free raw queries — but TS services use the barrel |
| **File extension for configs** | Config that sequelize-cli / Node CJS tools read = `.cjs` (e.g., `db/config.cjs`, seeders, migrations). TS runtime code = `.ts`. `backend/package.json` sets `"type": "module"` so `.cjs` is required for CJS. | `backend/src/db/config.cjs`, `backend/src/seeders/*.cjs`, `backend/src/migrations/*.cjs` |
| **Model class shape** | `class X extends Model<Attrs, CreationAttrs>` with `static initModel(sequelize)` + `static associate(models)`; all fields declared via `declare` (no runtime assignments). `underscored: true, timestamps: true` in options. | `backend/src/models/user.ts:14-43` |
| **Zod schema shape** | File per domain (`shared/src/schemas/auth.ts`, `campaign.ts`). `export const XxxSchema = z.object({...})` + `export type Xxx = z.infer<typeof XxxSchema>`. Barrel at `schemas/index.ts` re-exports via `export *`. `shared/src/index.ts` re-exports the schemas barrel. | `shared/src/schemas/auth.ts:1-8`, `shared/src/schemas/campaign.ts:1-4`, `shared/src/schemas/index.ts:1-2`, `shared/src/index.ts:1` |
| **Env loading** | `import 'dotenv/config'` at the top of whichever module boots first. Throw on missing required vars (fail-fast). | `backend/src/db/index.ts:2,10-13` |
| **Error-handling style (NEW in this phase)** | No prior convention — Phase 3 establishes: `HttpError` base + `{Bad,Unauthorized,Forbidden,NotFound,Conflict,Validation}Error` subclasses. Service throws; route handlers `try/catch(err){ next(err) }`; tail `errorHandler` middleware maps to `{error:{code,message}}`. | RESEARCH.md §Error Shape & Handler (lines 622-708). No existing analog in the codebase — this is the first `util/errors.ts`. |
| **Router mount order (NEW)** | `buildApp()` order: `httpLogger` → `express.json` → `cookieParser` → public routers (`/auth`) → protected routers (`/campaigns`, `/recipients` with `router.use(authenticate)`) → `errorHandler` tail. | RESEARCH.md §`app.ts` Factory Split (lines 786-818). No existing `app.ts` yet. |
| **Status codes** | 201 on create (register), 200 on login/refresh/me/logout, 400 on Zod/validation, 401 on auth fail + `INVALID_TOKEN` code (no distinct "expired" leak), 404 on cross-user (AUTH-07), 409 on unique-violation. Response envelope is always `{ data: ... }` on success, `{ error: { code, message } }` on failure. | RESEARCH.md §4 Response Shape + §Error Shape |
| **Auth payload on `req.user`** | `{ id: number, email: string }` — `Number(payload.sub)` once at `authenticate` middleware boundary (Pitfall P3-3). Downstream services work with numeric `id`. Declared via `declare module 'express-serve-static-core'`. | RESEARCH.md §Access Token Design (lines 219-238) |

---

## File Classification

| File (create/modify) | Role | Data Flow | Closest Analog | Match Quality |
|----------------------|------|-----------|----------------|---------------|
| `backend/src/app.ts` (CREATE) | bootstrap / factory | request-response | **None in repo** — `index.ts` is the closest but it's single-purpose scaffold | new-convention |
| `backend/src/index.ts` (MODIFY) | bootstrap / entry | lifecycle | `backend/src/index.ts` (itself, Phase 1) | self (total rewrite) |
| `backend/src/config/env.ts` (CREATE) | config / schema | startup-validation | `shared/src/schemas/auth.ts` (Zod pattern) + `backend/src/db/index.ts` (env check pattern) | role-match |
| `backend/src/lib/redis.ts` (CREATE) | lib / client | event-driven (connection) | `backend/src/db/index.ts` (Sequelize client init + logger wire) | role-match |
| `backend/src/lib/tokens.ts` (CREATE) | lib / pure | transform (sign/verify) | **None** — no JWT code exists yet | new-convention |
| `backend/src/util/errors.ts` (CREATE) | util / types | N/A (class hierarchy) | **None** — first error class in repo | new-convention |
| `backend/src/middleware/authenticate.ts` (CREATE) | middleware | request-response | **None** — first middleware (beyond Phase 1's pino-http) | partial (style from `util/httpLogger.ts`) |
| `backend/src/middleware/validate.ts` (CREATE) | middleware / factory | request-response | **None** — first middleware factory | partial (style from `util/httpLogger.ts`) |
| `backend/src/middleware/errorHandler.ts` (CREATE) | middleware / tail | error-response | **None** — first error handler | new-convention |
| `backend/src/services/authService.ts` (CREATE) | service | CRUD (users) | `backend/src/seeders/20260101000000-demo-data.cjs` (DB writes + bcrypt) + `backend/src/models/user.ts` (types) | role-match (different runtime — CJS seeder vs ESM service, but same bcrypt + User ops) |
| `backend/src/routes/auth.ts` (CREATE) | route / router | request-response | **None** — first HTTP router | new-convention |
| `backend/src/routes/campaigns.ts` (CREATE — stub) | route / router | request-response (stub) | `backend/src/routes/auth.ts` (same wave) | partial (sibling pattern) |
| `backend/src/routes/recipients.ts` (CREATE — stub) | route / router | request-response (stub) | `backend/src/routes/auth.ts` (same wave) | partial (sibling pattern) |
| `backend/package.json` (MODIFY) | config | N/A | `backend/package.json` (itself) | self |
| `.env.example` (MODIFY, root) | config / docs | N/A | `.env.example` (itself) | self |
| `backend/.env.example` (MODIFY) | config / docs | N/A | `backend/.env.example` (itself) | self |
| `shared/src/schemas/auth.ts` (MODIFY) | schema | validation | `shared/src/schemas/auth.ts` (itself — extend) + `shared/src/schemas/campaign.ts` (sibling) | self + sibling |

---

## Pattern Assignments

### `backend/src/app.ts` — (CREATE, bootstrap/factory, NEW)

**Analog:** None. This is the first Express app in the repo. `backend/src/index.ts` was a throwaway Phase 1 proof-import.

**Replicate this (from RESEARCH.md §`app.ts` Factory Split, lines 790-818):**

```ts
// backend/src/app.ts
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { httpLogger } from './util/httpLogger.js';
import { authRouter } from './routes/auth.js';
import { campaignsRouter } from './routes/campaigns.js';
import { recipientsRouter } from './routes/recipients.js';
import { errorHandler } from './middleware/errorHandler.js';

export function buildApp(): Express {
  const app = express();
  app.use(httpLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ data: { ok: true } }));

  app.use('/auth', authRouter);
  app.use('/campaigns', campaignsRouter);
  app.use('/recipients', recipientsRouter);

  app.use(errorHandler);
  return app;
}
```

**Middleware order is locked** — deviation must be justified. Verified against RESEARCH.md §`authenticate` Middleware Design Middleware-order invariant (lines 572-578).

**Imports to mimic Phase 1 logger import style:** `import { httpLogger } from './util/httpLogger.js'` exactly as `db/index.ts:4` does for `logger`.

---

### `backend/src/index.ts` — (MODIFY, bootstrap/entry)

**Analog:** itself (Phase 1 scaffold at `backend/src/index.ts:1-28`). Replace the `describePhase1()` proof function with a real async `main()`.

**Phase 1 shape (current, to be REPLACED):**
```ts
// backend/src/index.ts:1-28 (current)
import { RegisterSchema, CampaignStatusEnum, type CampaignStatus } from '@campaign/shared';
import { logger } from './util/logger.js';
const _phase1ImportProof = { /* ... */ };
export function describePhase1() { /* ... */ }
```

**Replicate this (from RESEARCH.md §`backend/src/index.ts` (MODIFIED), lines 822-854):**

```ts
// backend/src/index.ts (new)
import { buildApp } from './app.js';
import { sequelize } from './db/index.js';
import { pingRedis, redis } from './lib/redis.js';
import { config } from './config/env.js';
import { logger } from './util/logger.js';

async function main() {
  await sequelize.authenticate();
  await pingRedis();

  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await Promise.allSettled([sequelize.close(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'api startup failed');
  process.exit(1);
});
```

**Keep from Phase 1:** `.js` suffix style on every relative import; `logger` named import; `@campaign/shared` package import if types still needed (though the new bootstrap doesn't need it — drop the Phase 1 proof constants entirely).

---

### `backend/src/config/env.ts` — (CREATE, config/schema, role-match to Zod schema)

**Analog:** `shared/src/schemas/auth.ts:1-8` (Zod idiom) + `backend/src/db/index.ts:10-13` (fail-fast env check pattern).

**Analog excerpt — Zod schema pattern** (`shared/src/schemas/auth.ts:1-8`):
```ts
import { z } from 'zod';
export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;
```

**Analog excerpt — fail-fast env pattern** (`backend/src/db/index.ts:2-13`):
```ts
import 'dotenv/config';
// ...
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — see .env.example');
}
```

**Replicate this (from RESEARCH.md §Env Vars & Startup Validation, lines 869-905):**

```ts
// backend/src/config/env.ts
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(10),
  LOG_LEVEL: z.string().optional(),
}).refine(
  (d) => d.JWT_ACCESS_SECRET !== d.JWT_REFRESH_SECRET,
  { message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different (m6)' },
);

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const config = parsed.data;
```

**Note on `zod` dependency:** `zod` is declared only in `shared/package.json` (M7 version-drift guard). `backend/` resolves `zod` via hoisted `node_modules`; do NOT add `zod` directly to `backend/package.json` (RESEARCH.md §Standard Stack, line 143).

---

### `backend/src/lib/redis.ts` — (CREATE, lib/client, role-match to db bootstrap)

**Analog:** `backend/src/db/index.ts:18-26` (client construction) + `backend/src/util/logger.ts:60` (logger wire).

**Analog excerpt** (`backend/src/db/index.ts:15-26`):
```ts
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  define: { underscored: true, timestamps: true },
  logging: isTest
    ? false
    : isDev
      ? (sql: string) => logger.debug({ sql }, 'sequelize')
      : false,
});
```

**Replicate this (from RESEARCH.md §Redis Wiring, lines 445-463):**

```ts
// backend/src/lib/redis.ts
import IORedis from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';

export const redis = new IORedis(config.REDIS_URL, {
  lazyConnect: false,
  // NOTE: NO maxRetriesPerRequest: null here — that's BullMQ's requirement (C5).
  // Denylist is a correctness primitive; we WANT retries to surface errors.
});

redis.on('error', (err) => logger.error({ err }, 'redis client error'));
redis.on('connect', () => logger.debug('redis connected'));

export async function pingRedis(): Promise<void> {
  const result = await redis.ping();
  if (result !== 'PONG') throw new Error(`Unexpected redis ping response: ${result}`);
}
```

**Mimic from db/index.ts:**
- Named `export const redis = new IORedis(...)` (matches `export const sequelize = new Sequelize(...)`)
- Attach `.on('error', ...)` + `.on('connect', ...)` with `logger.error({ err }, '...')` structured form — matches Phase 1 pino convention.
- Do NOT `import 'dotenv/config'` here — `config/env.ts` does it once at startup.

---

### `backend/src/lib/tokens.ts` — (CREATE, lib/pure, NEW convention)

**Analog:** None. First JWT code.

**Replicate this (from RESEARCH.md §Access Token Design lines 175-200 + §Refresh Token Design lines 247-275):**

```ts
// backend/src/lib/tokens.ts
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { UnauthorizedError } from '../util/errors.js';

export interface AccessPayload { sub: string; email: string; type: 'access'; }
export interface RefreshPayload { sub: string; jti: string; type: 'refresh'; }

export function signAccess(user: { id: number | string; email: string }): string {
  const payload: AccessPayload = { sub: String(user.id), email: user.email, type: 'access' };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.ACCESS_TOKEN_TTL,
  });
}

export function verifyAccess(token: string): AccessPayload & { iat: number; exp: number } {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],          // EXPLICIT — PITFALLS 3rd eval-flag
  }) as AccessPayload & { iat: number; exp: number };
  if (decoded.type !== 'access') throw new UnauthorizedError('INVALID_TOKEN_TYPE');
  return decoded;
}

export function signRefresh(user: { id: number | string }): { token: string; jti: string; exp: number } {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: String(user.id), jti, type: 'refresh' } satisfies RefreshPayload,
    config.JWT_REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: config.REFRESH_TOKEN_TTL },
  );
  const { exp } = jwt.verify(token, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as RefreshPayload & { exp: number };
  return { token, jti, exp };
}

export function verifyRefresh(token: string): RefreshPayload & { iat: number; exp: number } {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as RefreshPayload & { iat: number; exp: number };
  if (decoded.type !== 'refresh') throw new UnauthorizedError('INVALID_TOKEN_TYPE');
  return decoded;
}
```

**Invariants to enforce via plan-check grep:**
- Every `jwt.verify` call has `algorithms: ['HS256']` (P3-5 defense).
- `sub` is `String(user.id)` at sign, `Number(...)` only at authenticate boundary (P3-3).

---

### `backend/src/util/errors.ts` — (CREATE, util/types, NEW convention)

**Analog:** None. First error class.

**Replicate this exactly (from RESEARCH.md §Error Shape & Handler lines 626-659):**

```ts
// backend/src/util/errors.ts
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = this.constructor.name;
  }
}
export class BadRequestError extends HttpError {
  constructor(code = 'BAD_REQUEST', message?: string) { super(400, code, message); }
}
export class UnauthorizedError extends HttpError {
  constructor(code = 'UNAUTHORIZED', message?: string) { super(401, code, message); }
}
export class ForbiddenError extends HttpError {
  constructor(code = 'FORBIDDEN', message?: string) { super(403, code, message); }
}
export class NotFoundError extends HttpError {
  constructor(code = 'NOT_FOUND', message?: string) { super(404, code, message); }
}
export class ConflictError extends HttpError {
  constructor(code = 'CONFLICT', message?: string) { super(409, code, message); }
}
export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', public readonly details?: unknown) {
    super(400, 'VALIDATION_ERROR', message);
  }
}
```

**Contract every service + route MUST respect:** throw `HttpError` subclasses (never raw `Error`). Never pass `status` to the handler — it reads from the class.

---

### `backend/src/middleware/authenticate.ts` — (CREATE, middleware, partial — style from httpLogger)

**Analog:** `backend/src/util/httpLogger.ts:1-77` (only prior "middleware" — shows the pino-http Options + named export style; not a close logical match because httpLogger is a factory, not a per-request handler).

**Analog excerpt — export + import style** (`backend/src/util/httpLogger.ts:48-77`):
```ts
import { pinoHttp, type Options } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

const options: Options = { /* ... */ };
export const httpLogger = pinoHttp(options);
```

**Replicate this (from RESEARCH.md §`authenticate` Middleware Design, lines 213-238):**

```ts
// backend/src/middleware/authenticate.ts
import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../lib/tokens.js';
import { UnauthorizedError } from '../util/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: number; email: string };
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('MISSING_TOKEN'));
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccess(token);
    req.user = { id: Number(payload.sub), email: payload.email };
    return next();
  } catch {
    return next(new UnauthorizedError('INVALID_TOKEN'));
  }
}
```

**Mimic from httpLogger.ts:**
- Named export (`export function authenticate` vs. default export).
- Import `type` keyword for type-only imports (`import type { Request, ... }`) — matches `import { pinoHttp, type Options }` style.
- `./logger.js` or `../util/logger.js` with `.js` suffix.

**P3-6 defense:** single `catch` with no message variable — do NOT leak `err.message` to the client; always `INVALID_TOKEN`.

---

### `backend/src/middleware/validate.ts` — (CREATE, middleware/factory, NEW)

**Analog:** `backend/src/util/httpLogger.ts` (factory pattern — returns a middleware).

**Replicate this (from RESEARCH.md §Shared Zod Schemas, lines 763-774):**

```ts
// backend/src/middleware/validate.ts
import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../util/errors.js';

export function validate<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'params' | 'query' = 'body',
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ValidationError('Invalid request', result.error.flatten()));
    }
    (req as any)[source] = result.data;
    next();
  };
}
```

**Usage pattern in routes (mimic):**
```ts
authRouter.post('/register', validate(RegisterSchema), async (req, res, next) => { /* ... */ });
```

---

### `backend/src/middleware/errorHandler.ts` — (CREATE, middleware/tail, NEW)

**Analog:** None. First error handler in repo.

**Replicate this exactly (from RESEARCH.md §`middleware/errorHandler.ts`, lines 664-707):**

```ts
// backend/src/middleware/errorHandler.ts
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../util/errors.js';
import { logger } from '../util/logger.js';

const SEQUELIZE_UNIQUE = 'SequelizeUniqueConstraintError';
const SEQUELIZE_VALIDATION = 'SequelizeValidationError';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request' },
    });
  }
  if (err?.name === SEQUELIZE_UNIQUE) {
    return res.status(409).json({
      error: { code: 'UNIQUE_VIOLATION', message: 'Resource already exists' },
    });
  }
  if (err?.name === SEQUELIZE_VALIDATION) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: err.message },
    });
  }
  logger.error({ err, reqId: req.id }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
};
```

**Logger usage mimics** `backend/src/db/index.ts:24` `logger.debug({ sql }, 'sequelize')` — structured object first, message string second. `req.id` comes from pino-http (`httpLogger.ts:65-69` `genReqId`).

**Invariant:** this MUST be the last `app.use` in `buildApp()` (Express 4 error-middleware contract).

---

### `backend/src/services/authService.ts` — (CREATE, service, role-match to seeder)

**Analog:** `backend/src/seeders/20260101000000-demo-data.cjs:27-47` (only prior bcrypt + User.create code, even though it's CJS). Type definitions from `backend/src/models/user.ts`.

**Analog excerpt — bcrypt + User insert pattern** (`backend/src/seeders/20260101000000-demo-data.cjs:27-47`):
```js
const bcrypt = require('bcryptjs');
// ...
const passwordHash = await bcrypt.hash('demo1234', 10);
await queryInterface.bulkInsert('users', [{
  email: 'demo@example.com',
  password_hash: passwordHash,
  name: 'Demo Marketer',
  created_at: now,
  updated_at: now,
}]);
```

**Model-type analog** (`backend/src/models/user.ts:1-38`):
```ts
import { DataTypes, Model, Sequelize, type Optional } from 'sequelize';
// ...
export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number;
  declare email: string;
  declare passwordHash: string;
  // ...
}
```

**Replicate this (from RESEARCH.md §bcrypt Choice, lines 408-437):**

```ts
// backend/src/services/authService.ts
import bcrypt from 'bcryptjs';
import { User } from '../db/index.js';
import { config } from '../config/env.js';
import { ConflictError, UnauthorizedError } from '../util/errors.js';

export async function registerUser(input: { email: string; password: string; name: string }) {
  try {
    const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_COST);
    const user = await User.create({ email: input.email, passwordHash, name: input.name });
    return user;
  } catch (err: any) {
    if (err?.name === 'SequelizeUniqueConstraintError') {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED');
    }
    throw err;
  }
}

export async function authenticateUser(email: string, password: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Timing-attack defense — dummy compare so response time doesn't leak existence
    await bcrypt.compare(password, '$2b$10$00000000000000000000000000000000000000000000000000000');
    throw new UnauthorizedError('INVALID_CREDENTIALS');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('INVALID_CREDENTIALS');
  return user;
}
```

**Mimic from seeder:**
- `import bcrypt from 'bcryptjs'` — default-import (CJS-compatible). Same package, same cost=10 default (via `config.BCRYPT_COST`).
- **DIFFERENT from seeder:** use `User.create({...})` Sequelize Model API (TS, camelCase attrs like `passwordHash`), NOT `queryInterface.bulkInsert('users', [{password_hash: ...}])` (raw SQL, snake_case). The model layer handles `underscored: true` naming automatically (`user.ts:33`).

**Import the User model from `../db/index.js`** (the barrel), NOT `../models/user.js` — this guarantees `initModel` + `associate` ran. See `db/index.ts:41` for the re-export.

---

### `backend/src/routes/auth.ts` — (CREATE, route/router, NEW)

**Analog:** None. First Express router.

**Replicate this (full skeleton from RESEARCH.md §Code Examples lines 1018-1118):**

```ts
// backend/src/routes/auth.ts
import { Router } from 'express';
import { RegisterSchema, LoginSchema } from '@campaign/shared';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import * as authService from '../services/authService.js';
import { signAccess, signRefresh, verifyRefresh } from '../lib/tokens.js';
import { redis } from '../lib/redis.js';
import { UnauthorizedError } from '../util/errors.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../db/index.js';

export const authRouter: Router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/auth',                               // Path=/auth (deliberate — see RESEARCH.md §Refresh Token Design)
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

authRouter.post('/register', validate(RegisterSchema), async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body);
    res.status(201).json({ data: { id: user.id, email: user.email, name: user.name } });
  } catch (err) { next(err); }
});

authRouter.post('/login', validate(LoginSchema), async (req, res, next) => {
  try {
    const user = await authService.authenticateUser(req.body.email, req.body.password);
    const accessToken = signAccess(user);
    const { token: refreshToken } = signRefresh(user);
    res.cookie('rt', refreshToken, COOKIE_OPTS);
    res.json({ data: { accessToken, user: { id: user.id, email: user.email, name: user.name } } });
  } catch (err) { next(err); }
});

// /refresh, /logout, /me — see RESEARCH.md lines 1062-1117 for full bodies
```

**Conventions to mimic (all from the example above):**
- Named exports (`export const authRouter: Router = Router()` — matches model class named exports in `models/*.ts`).
- Every handler: `async (req, res, next) => { try { ... } catch (err) { next(err); } }` — ALWAYS forward to the tail `errorHandler`, never respond with errors inline.
- `res.json({ data: ... })` envelope on success (matches RESEARCH.md §4 + `buildApp()` health endpoint).
- Import `@campaign/shared` (no sub-path) — matches `models/campaign.ts:3` and `backend/src/index.ts:10`.
- `res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined })` for logout/replay — matching path (Pitfall P3-1).
- CSRF check on `/refresh`: `if (req.headers['x-requested-with'] !== 'fetch') throw new UnauthorizedError('CSRF_CHECK_FAILED');` (RESEARCH.md line 1064-1066).

---

### `backend/src/routes/campaigns.ts` — (CREATE, route/router stub, partial sibling)

**Analog:** `backend/src/routes/auth.ts` (same wave — Phase 4 will own the real implementation; Phase 3 only writes the stub that proves AUTH-06 + AUTH-07).

**Replicate this (from RESEARCH.md §`authenticate` Middleware Design, lines 525-537):**

```ts
// backend/src/routes/campaigns.ts  — Phase 3 STUB; Phase 4 fills in
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { NotFoundError } from '../util/errors.js';

export const campaignsRouter: Router = Router();
campaignsRouter.use(authenticate);              // ← EVERY route below is protected (C7)

// Phase 4 replaces this; Phase 3's stub proves AUTH-06 (401 without token) + AUTH-07 (404 with token).
campaignsRouter.get('/:id', async (_req, _res, next) => {
  next(new NotFoundError('CAMPAIGN_NOT_FOUND'));
});
```

**Critical invariant (plan-check grep target):** `router.use(authenticate)` MUST appear at the top of the router — C7 guard. Never per-route on a protected router.

---

### `backend/src/routes/recipients.ts` — (CREATE, route/router stub, sibling of campaigns)

**Analog:** `backend/src/routes/campaigns.ts` (mirror).

**Replicate this:**

```ts
// backend/src/routes/recipients.ts  — Phase 3 STUB; Phase 4 fills in
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { NotFoundError } from '../util/errors.js';

export const recipientsRouter: Router = Router();
recipientsRouter.use(authenticate);

recipientsRouter.get('/:id', async (_req, _res, next) => {
  next(new NotFoundError('RECIPIENT_NOT_FOUND'));
});
```

---

### `backend/package.json` — (MODIFY, config)

**Analog:** itself (`backend/package.json:19-35` — existing deps/devDeps blocks).

**Current deps (keep):** `@campaign/shared workspace:*`, `bcryptjs`, `dotenv`, `pg`, `pg-hstore`, `pino`, `pino-http`, `sequelize`.

**Add (from RESEARCH.md §Installation, lines 164-166):**
```bash
yarn workspace @campaign/backend add express@^4.22.1 cookie-parser@^1.4.7 jsonwebtoken@^9.0.3 ioredis@^5.10.1
yarn workspace @campaign/backend add --dev @types/express@^5.0.6 @types/jsonwebtoken@^9.0.10 @types/cookie-parser@^1.4.10
```

**Do NOT add `zod` directly** — it's consumed via `@campaign/shared` only (M7 guard, RESEARCH.md line 143).

**Scripts:** keep all Phase 2 `db:*` scripts unchanged. No new script in Phase 3 (test-smoke runner is `bash test/smoke/*.sh` — ad-hoc, not a package script).

---

### `.env.example` (root) + `backend/.env.example` — (MODIFY, config/docs)

**Analog:** itself (existing files at both paths).

**Current root .env.example (to preserve, lines 1-13):**
```
# .env.example (repo root)
DATABASE_URL=postgres://campaign:campaign@localhost:5432/campaigns
POSTGRES_USER=campaign
POSTGRES_PASSWORD=campaign
POSTGRES_DB=campaigns
NODE_ENV=development
LOG_LEVEL=debug
```

**Append (from RESEARCH.md §.env.example additions, lines 908-928):**
```bash
# --- Phase 3 additions ---
JWT_ACCESS_SECRET=replace-me-with-at-least-32-random-chars-aaaaaaaaaaa
JWT_REFRESH_SECRET=replace-me-with-a-DIFFERENT-32+-char-value-bbbbbbbb
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
BCRYPT_COST=10
REDIS_URL=redis://localhost:6379
PORT=3000
```

Mirror the same additions in `backend/.env.example`.

**Phase 10 note carried in comment:** `REDIS_URL=redis://redis:6379` when the API container runs inside docker-compose (service-name resolution, C15).

---

### `shared/src/schemas/auth.ts` — (MODIFY, schema, self + sibling)

**Analog:** itself (extend the existing `RegisterSchema`) + `shared/src/schemas/campaign.ts` for Zod idiom.

**Existing file (preserve verbatim — lines 1-8):**
```ts
import { z } from 'zod';
export const RegisterSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;
```

**Append (from RESEARCH.md §Shared Zod Schemas, lines 731-756):**
```ts
// AUTH-02 — Login body
export const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),    // min=1 for login (don't leak password policy)
});
export type LoginInput = z.infer<typeof LoginSchema>;

// AUTH-05 — authenticated user shape
export const AuthUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

// AUTH-02 — Login response
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// AUTH-03 — Refresh response
export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
```

**Invariant:** pattern matches existing `RegisterSchema` — every exported schema has a paired `export type X = z.infer<typeof XSchema>` (same style as `campaign.ts:3-4` and the existing `auth.ts:8`).

**Post-modify step** (do not forget — RESEARCH.md line 784): run `yarn workspace @campaign/shared build` (or `yarn install` to trigger `postinstall`) so `shared/dist/schemas/auth.{js,d.ts}` regenerates and backend can import the new names.

---

## Shared Patterns (cross-cutting, applied to multiple Phase 3 files)

### Authentication (router-level)
**Source:** `backend/src/middleware/authenticate.ts` (NEW this phase)
**Apply to:** `routes/campaigns.ts`, `routes/recipients.ts` (router-level via `router.use(authenticate)`); `routes/auth.ts` ONLY on the `/me` sub-route (per-route, because /register /login /refresh /logout are public).

```ts
// campaignsRouter and recipientsRouter — TOP of file
router.use(authenticate);
```

```ts
// authRouter — per-route on /me only
authRouter.get('/me', authenticate, async (req, res, next) => { /* ... */ });
```

---

### Error throwing (services) + forwarding (routes)
**Source:** `backend/src/util/errors.ts` (NEW)
**Apply to:** all service files (`authService.ts`) + all route handlers.

**Service throws HttpError subclass:**
```ts
throw new ConflictError('EMAIL_ALREADY_REGISTERED');
throw new UnauthorizedError('INVALID_CREDENTIALS');
throw new NotFoundError('CAMPAIGN_NOT_FOUND');
```

**Route handler forwards to tail:**
```ts
authRouter.post('/xxx', validate(Schema), async (req, res, next) => {
  try {
    // ... business logic ...
    res.json({ data: result });
  } catch (err) { next(err); }      // <— always forward; never res.status(500).json(...) inline
});
```

**Tail handler formats:** `{ error: { code, message } }` — see `middleware/errorHandler.ts` pattern above.

---

### Validation (Zod at the boundary)
**Source:** `backend/src/middleware/validate.ts` (NEW)
**Apply to:** every route handler that reads a request body/params/query. No service function should re-validate.

```ts
authRouter.post('/register', validate(RegisterSchema), handler);  // body (default)
authRouter.get('/xxx/:id', validate(IdParamSchema, 'params'), handler);
```

`req.body` is typed + trusted after `validate(...)` runs.

---

### Logger usage (structured-object first)
**Source:** `backend/src/util/logger.ts:60` (existing) + `backend/src/db/index.ts:24` (usage example).
**Apply to:** `index.ts` startup logs, `middleware/errorHandler.ts` unhandled-error log, `lib/redis.ts` connection events.

```ts
logger.info({ port: config.PORT, env: config.NODE_ENV }, 'api listening');
logger.error({ err, reqId: req.id }, 'unhandled error');
logger.debug('redis connected');                  // message-only is OK when no context
```

Never use `console.log` in runtime code. (The env-validation block in `config/env.ts` is the one exception: `console.error` runs BEFORE the logger module is safe to import — see RESEARCH.md line 890.)

---

### Model import convention
**Source:** `backend/src/db/index.ts:29-41` (existing)
**Apply to:** every service and route that reads/writes a User (in Phase 3, that's `services/authService.ts` and `routes/auth.ts` for `/me` + `/refresh`).

```ts
import { User } from '../db/index.js';
// Never: import { User } from '../models/user.js';
```

The barrel guarantees `initModel` + `associate` have run. Direct imports from `models/*` are a footgun (model-not-initialized errors at runtime).

---

### Cookie handling (`rt` refresh cookie)
**Source:** RESEARCH.md §Refresh Token Design (lines 282-330) — NEW, no prior cookie code in repo.
**Apply to:** `routes/auth.ts` login, refresh, logout handlers.

**Single `COOKIE_OPTS` constant at top of `routes/auth.ts`:**
```ts
const COOKIE_OPTS = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/auth',                               // Path=/auth (deliberate — not /auth/refresh)
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
```

**Set cookie:**
```ts
res.cookie('rt', refreshToken, COOKIE_OPTS);
```

**Clear cookie (logout, denylist replay):**
```ts
res.clearCookie('rt', { ...COOKIE_OPTS, maxAge: undefined });   // MUST match Path + httpOnly + sameSite + secure
```

Pitfall P3-1: `clearCookie` silently no-ops if options don't match. Always spread `COOKIE_OPTS`.

---

## No Analog Found

Files with no close match in the repo — planner should follow the RESEARCH.md skeleton cited below, **not** invent independent conventions.

| File | Role | Reason | Skeleton Source |
|------|------|--------|-----------------|
| `backend/src/util/errors.ts` | error types | First error class in repo | RESEARCH.md §Error Shape & Handler (lines 622-659) |
| `backend/src/middleware/errorHandler.ts` | tail error middleware | First error handler in repo | RESEARCH.md §middleware/errorHandler.ts (lines 661-707) |
| `backend/src/middleware/authenticate.ts` | per-request middleware | First auth middleware — `util/httpLogger.ts` is the only prior middleware and it's a factory, not a matching idiom | RESEARCH.md §authenticate Middleware Design (lines 213-238) |
| `backend/src/middleware/validate.ts` | middleware factory | First validate middleware | RESEARCH.md §Shared Zod Schemas (lines 763-774) |
| `backend/src/lib/tokens.ts` | JWT sign/verify pure lib | First JWT code | RESEARCH.md §Access + Refresh Token Design (lines 175-275) |
| `backend/src/routes/auth.ts` | first HTTP router | No prior Express router exists | RESEARCH.md §Code Examples — routes/auth.ts full skeleton (lines 1016-1118) |
| `backend/src/app.ts` | Express factory | No prior `app.ts` | RESEARCH.md §app.ts Factory Split (lines 790-818) |

For all of the above: the plan's action section should quote the RESEARCH.md line range as the canonical skeleton and tell the executor to mimic it literally.

---

## Metadata

**Analog search scope:**
- `backend/src/` tree (14 files scanned — index, util, db, models, migrations, seeders)
- `shared/src/` tree (4 files scanned — index + 3 schemas)
- `backend/package.json`, `shared/package.json`, root `.env.example`, `backend/.env.example`
- RESEARCH.md §§ Module Structure, Access Token, Refresh Token, bcrypt Choice, Redis, authenticate Middleware, AUTH-07 Ownership, Error Shape, Shared Zod Schemas, app.ts Factory, Env Vars, Code Examples

**Files scanned:** ~22 files read in full or targeted excerpts.

**Pattern extraction date:** 2026-04-21

**Key observation:** Phase 3 is the bridge from "library code + data layer" (Phase 1+2) to "HTTP API" (Phase 4+). Five files (`app.ts`, `util/errors.ts`, `middleware/{authenticate,validate,errorHandler}.ts`, `routes/auth.ts`, `lib/tokens.ts`) introduce conventions the entire rest of the backend will mimic. Treat these as the new templates for Phase 4+5 — they carry more weight than a typical feature file.
