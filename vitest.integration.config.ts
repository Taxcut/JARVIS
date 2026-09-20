import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'packages/database/src/integration.test.ts',
      'apps/core/src/identity.integration.test.ts',
    ],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
