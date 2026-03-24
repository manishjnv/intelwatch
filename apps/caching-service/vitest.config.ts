import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
    alias: {
      '@etip/shared-utils': new URL('../../packages/shared-utils/src/index.ts', import.meta.url).pathname,
      '@etip/shared-auth': new URL('../../packages/shared-auth/src/index.ts', import.meta.url).pathname,
      '@etip/shared-types': new URL('../../packages/shared-types/src/index.ts', import.meta.url).pathname,
      '@etip/shared-cache': new URL('../../packages/shared-cache/src/index.ts', import.meta.url).pathname,
    },
  },
});
