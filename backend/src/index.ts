// backend/src/index.ts
//
// Phase 3: real HTTP bootstrap.
//
// Sequence on boot:
//   1. Load config (env.ts runs Zod validation at import — process exits
//      with code 1 if any required env is missing/malformed).
//   2. sequelize.authenticate() — prove DB is reachable.
//   3. pingRedis() — prove Redis is reachable (denylist is a correctness
//      primitive; broken Redis = broken auth).
//   4. buildApp().listen(config.PORT) — start serving.
//
// On SIGTERM/SIGINT (docker stop, Ctrl-C), drain the HTTP server then await
// DB + Redis shutdown — prevents orphaned connections.

import { buildApp } from './app.js';
import { sequelize } from './db/index.js';
import { pingRedis, redis } from './lib/redis.js';
import { config } from './config/env.js';
import { logger } from './util/logger.js';

async function main(): Promise<void> {
  await sequelize.authenticate();
  await pingRedis();

  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      'api listening',
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await Promise.allSettled([sequelize.close(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'api startup failed');
  process.exit(1);
});
