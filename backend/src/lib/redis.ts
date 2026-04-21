// backend/src/lib/redis.ts
//
// Phase 3: ioredis client for the JWT refresh-token denylist.
//
// IMPORTANT:
//   - This is a SEPARATE connection from Phase 5's BullMQ queue/worker
//     connections (C5 — never share one IORedis instance across BullMQ +
//     application code).
//   - DO NOT set `maxRetriesPerRequest: null` here. That flag is required by
//     BullMQ (which runs long-polling blocking commands) but wrong for auth:
//     the denylist is a correctness primitive and we WANT retry timeouts to
//     surface as errors rather than hang.
//   - `.on('error', ...)` is attached so a reconnect storm becomes a logged
//     event rather than an uncaughtException (P3-8).

import { Redis as IORedis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../util/logger.js';

export const redis = new IORedis(config.REDIS_URL, {
  lazyConnect: false,
});

redis.on('error', (err: Error) => logger.error({ err }, 'redis client error'));
redis.on('connect', () => logger.debug('redis connected'));

export async function pingRedis(): Promise<void> {
  const result = await redis.ping();
  if (result !== 'PONG') {
    throw new Error(`Unexpected redis ping response: ${result}`);
  }
}
