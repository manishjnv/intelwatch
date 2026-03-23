import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@etip/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@etip/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
      '@etip/shared-auth': path.resolve(__dirname, '../../packages/shared-auth/src'),
    },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
