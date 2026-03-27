/**
 * Vitest configuration for E2E pipeline smoke tests.
 *
 * These tests require running ETIP containers — they are NOT run in CI.
 * Run with: npx vitest run tests/e2e/pipeline-smoke.test.ts
 *
 * Prerequisites:
 *   docker compose -p etip -f docker-compose.etip.yml up -d
 *   export E2E_ADMIN_EMAIL=admin@example.com
 *   export E2E_ADMIN_PASSWORD=your-password
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@etip/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src/index.ts'),
      '@etip/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@etip/shared-normalization': path.resolve(__dirname, '../../packages/shared-normalization/src/index.ts'),
    },
  },
  test: {
    /**
     * Each test can take up to 3 minutes (external enrichment is slow).
     * 30s per queue hop × 7 hops + setup overhead = ~3 min max.
     */
    testTimeout: 180_000,
    hookTimeout: 30_000,

    /** Run tests sequentially — pipeline state must not interleave between tests. */
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],

    /** Verbose output so queue hop progress is visible in terminal. */
    reporter: 'verbose',

    /**
     * No coverage for E2E — these exercise running containers,
     * not source code instrumentation.
     */
    coverage: {
      enabled: false,
    },
  },
});
