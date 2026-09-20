import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/core/**/*.test.ts'],
    exclude: ['**/integration.test.ts', '**/node_modules/**'],
    clearMocks: true,
  },
});
