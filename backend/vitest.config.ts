// backend/vitest.config.ts
// C18: Vitest 2.1.9 pinned via root resolutions. Use singleFork (2.x syntax).
// NOT maxWorkers:1 — that is Vitest 4.x migration syntax.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // All test files share one forked process → shared DB pool
      },
    },
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
