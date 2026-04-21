// backend/src/config/env.ts
//
// Phase 3 (AUTH-01..07): fail-fast Zod-validated env loader.
//
// Guarantees (enforced at module import — before any route mounts):
//   - JWT_ACCESS_SECRET and JWT_REFRESH_SECRET present + both >= 32 chars (m2)
//   - JWT_ACCESS_SECRET !== JWT_REFRESH_SECRET (m6)
//   - DATABASE_URL + REDIS_URL are URL-shaped
//   - BCRYPT_COST in [4..15]
//
// On any violation: console.error + process.exit(1). The logger module is
// safe to import here (logger.ts has no side-effects beyond pino instance
// creation), but console.error matches the "log before logger is ready"
// convention already used in db/index.ts:11 — and guarantees output even if
// the failure is LOG_LEVEL itself.

import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL: z.string().default('7d'),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(10),
    LOG_LEVEL: z.string().optional(),
  })
  .refine((d) => d.JWT_ACCESS_SECRET !== d.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different (m6)',
    path: ['JWT_REFRESH_SECRET'],
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  console.error('Form errors:');
  console.error(JSON.stringify(parsed.error.flatten().formErrors, null, 2));
  process.exit(1);
}

export const config = parsed.data;
