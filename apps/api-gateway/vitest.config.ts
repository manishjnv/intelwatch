import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  resolve: {
    alias: {
      '@etip/shared-auth': path.resolve(__dirname, '../../packages/shared-auth/src/index.ts'),
      '@etip/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@etip/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src/index.ts'),
    },
  },
  test: {
    globals: false,
    include: ['__tests__/**/*.test.ts'],
  },
});
