import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@etip/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@etip/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
      '@etip/shared-auth': path.resolve(__dirname, '../../packages/shared-auth/src'),
      '@etip/shared-enrichment': path.resolve(__dirname, '../../packages/shared-enrichment/src'),
    },
  },
});
