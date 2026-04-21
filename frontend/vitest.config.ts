// frontend/vitest.config.ts
//
// Phase 8 (UI-01): Vitest 2.1.9 test config.
// jsdom environment for React component tests (no DB pool needed).
// @ alias must match vite.config.ts resolve.alias.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
