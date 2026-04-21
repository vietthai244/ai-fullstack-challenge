// frontend/vite.config.ts
//
// Phase 8 (UI-01): Vite 5 build config.
// @ alias resolves ./src — must match tsconfig.json paths.
// Dev proxy forwards /api + /track to backend on :3000.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/track': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
