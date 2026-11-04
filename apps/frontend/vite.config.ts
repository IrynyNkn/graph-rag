import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@graph-rag/contracts': resolve(import.meta.dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  server: {
    // The dev server calls the APIs through the nginx of the stack running in Docker.
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    name: 'frontend',
    root: import.meta.dirname,
    include: ['src/**/*.spec.{ts,tsx}'],
    environment: 'jsdom',
  },
});
