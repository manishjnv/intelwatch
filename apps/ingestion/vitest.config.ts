import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@etip/shared-auth': path.resolve(__dirname, '../../packages/shared-auth/src/index.ts'),
      '@etip/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@etip/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src/index.ts'),
      '@etip/shared-cache': path.resolve(__dirname, '../../packages/shared-cache/src/index.ts'),
      '@etip/shared-audit': path.resolve(__dirname, '../../packages/shared-audit/src/index.ts'),
      '@etip/shared-enrichment': path.resolve(__dirname, '../../packages/shared-enrichment/src/index.ts'),
      '@etip/shared-normalization': path.resolve(__dirname, '../../packages/shared-normalization/src/index.ts'),
    },
  },
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { branches: 70, functions: 70, lines: 70, statements: 70 },
    },
  },
});
