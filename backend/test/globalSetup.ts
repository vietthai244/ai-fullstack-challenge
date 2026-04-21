// backend/test/globalSetup.ts
//
// Runs ONCE before all workers. Sets env vars and bootstraps the test DB.
// Must load .env.test before any import from src/ fires env.ts process.exit(1).

import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setup(): Promise<void> {
  // 1. Load .env.test — BEFORE any src/ import (env.ts process.exit guard)
  dotenv.config({ path: resolve(__dirname, '../.env.test') });

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST not set — see backend/.env.test');
  }

  // 2. Ensure DATABASE_URL points to test DB (db/index.ts reads this at import time)
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';

  // 3. Create campaigns_test DB if it does not exist
  // Connect to the default 'postgres' database to run CREATE DATABASE
  const parsed = new URL(testUrl);
  const adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
  const client = new pg.Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const dbName = parsed.pathname.slice(1); // strip leading /
    await client.query(`CREATE DATABASE "${dbName}"`);
  } catch (err: unknown) {
    // "already exists" (42P04) is expected on re-runs — swallow it
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code !== '42P04'
    ) {
      throw err;
    }
  } finally {
    await client.end();
  }

  // 4. Run migrations (idempotent — sequelize-cli skips already-applied migrations)
  execSync('yarn workspace @campaign/backend db:migrate', {
    stdio: 'inherit',
    env: { ...process.env },
  });
}

export async function teardown(): Promise<void> {
  // Leave DB intact for post-failure debugging — do NOT drop
}
