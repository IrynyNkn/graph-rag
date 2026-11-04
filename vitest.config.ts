import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const WORKSPACE_PACKAGES = [
  'contracts',
  'file-store',
  'graph-store',
  'inference',
  'job-queue',
  'nest-common',
  'relational-store',
  'testing',
];

// Tests run against package sources, so they need no prior build.
const alias = Object.fromEntries(
  WORKSPACE_PACKAGES.map((name) => [
    `@graph-rag/${name}`,
    resolve(import.meta.dirname, `packages/${name}/src/index.ts`),
  ]),
);

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: [
        '**/*.spec.{ts,tsx}',
        '**/index.ts',
        '**/main.ts',
        '**/main.tsx',
        'packages/testing/**',
        'apps/frontend/src/**/*.tsx',
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
    projects: [
      'apps/frontend/vite.config.ts',
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['apps/*/src/**/*.spec.ts', 'packages/*/src/**/*.spec.ts'],
          exclude: ['apps/frontend/**'],
          environment: 'node',
          setupFiles: ['packages/testing/src/silence-logs.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['apps/*/test/integration/**/*.spec.ts', 'packages/*/test/**/*.spec.ts'],
          environment: 'node',
          globalSetup: ['packages/testing/src/global-setup.ts'],
          setupFiles: ['packages/testing/src/silence-logs.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
