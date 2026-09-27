import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma — persistence itself is covered by integration-store.test.ts.
vi.mock('../src/prisma.js', () => ({
  prisma: {
    integration: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  disconnectPrisma: vi.fn(),
}));

import { HealthScoring } from '../src/services/health-scoring.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { IntegrationRateLimiter } from '../src/services/rate-limiter.js';
import type { CreateIntegrationInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-hs';

const makeInput = (): CreateIntegrationInput => ({
  name: 'Test SIEM',
  type: 'splunk_hec',
  enabled: true,
  triggers: ['alert.created'],
  fieldMappings: [],
  credentials: {},
});

describe('HealthScoring', () => {
  let store: IntegrationStore;
  let limiter: IntegrationRateLimiter;
  let scoring: HealthScoring;

  beforeEach(() => {
    store = new IntegrationStore();
    limiter = new IntegrationRateLimiter(60);
    scoring = new HealthScoring(store, limiter);
  });

  it('returns null for nonexistent integration', () => {
    expect(scoring.calculateScore('no-such', TENANT)).toBeNull();
  });

  it('calculates perfect score for integration with no logs', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const score = scoring.calculateScore(int.id, TENANT);
    expect(score).toBeDefined();
    expect(score!.score).toBeGreaterThanOrEqual(0);
    expect(score!.score).toBeLessThanOrEqual(100);
    expect(score!.grade).toBeDefined();
    expect(score!.components).toBeDefined();
  });

  it('returns grade A for high scores', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    // Add only success logs
    for (let i = 0; i < 10; i++) {
      store.addLog(int.id, TENANT, 'alert.created', 'success', { attempt: 1 });
    }
    store.touchIntegration(int.id);
    const score = scoring.calculateScore(int.id, TENANT);
    expect(score!.score).toBeGreaterThanOrEqual(90);
    expect(score!.grade).toBe('A');
  });

  it('reduces score when failures present', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    for (let i = 0; i < 5; i++) {
      store.addLog(int.id, TENANT, 'alert.created', 'success', { attempt: 1 });
    }
    for (let i = 0; i < 5; i++) {
      store.addLog(int.id, TENANT, 'alert.created', 'failure', { errorMessage: 'fail' });
    }
    store.touchIntegration(int.id);
    const score = scoring.calculateScore(int.id, TENANT);
    expect(score!.score).toBeLessThan(90); // Not grade A
    expect(score!.components.errorRateScore).toBe(50); // 50% error rate
  });

  it('gives low syncAge score when never used', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const score = scoring.calculateScore(int.id, TENANT);
    expect(score!.components.syncAgeScore).toBe(0); // Never used
  });

  it('gives high syncAge score when recently used', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    store.touchIntegration(int.id); // Mark as just used
    const score = scoring.calculateScore(int.id, TENANT);
    expect(score!.components.syncAgeScore).toBe(100); // Just used
  });

  it('computes composite score from weighted components', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    store.touchIntegration(int.id);
    for (let i = 0; i < 10; i++) {
      store.addLog(int.id, TENANT, 'alert.created', 'success', { attempt: 1 });
    }
    const score = scoring.calculateScore(int.id, TENANT);
    // All components should be 100, composite = 100
    expect(score!.score).toBe(100);
    expect(score!.components.uptimeScore).toBe(100);
    expect(score!.components.errorRateScore).toBe(100);
  });

  // ─── Health History ─────────────────────────────────────────

  it('returns null history for nonexistent integration', () => {
    expect(scoring.getHistory('no-such', TENANT)).toBeNull();
  });

  it('records history on each score calculation', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    scoring.calculateScore(int.id, TENANT);
    scoring.calculateScore(int.id, TENANT);
    scoring.calculateScore(int.id, TENANT);

    const history = scoring.getHistory(int.id, TENANT);
    expect(history).toHaveLength(3);
    expect(history![0]!.score).toBeDefined();
    expect(history![0]!.timestamp).toBeDefined();
  });

  it('limits history to 30 points', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    for (let i = 0; i < 35; i++) {
      scoring.calculateScore(int.id, TENANT);
    }
    const history = scoring.getHistory(int.id, TENANT);
    expect(history).toHaveLength(30);
  });

  it('returns empty history if score never calculated', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const history = scoring.getHistory(int.id, TENANT);
    expect(history).toEqual([]);
  });

  // ─── Grade Mapping ──────────────────────────────────────────

  it('maps dead_letter logs as failures', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    for (let i = 0; i < 10; i++) {
      store.addLog(int.id, TENANT, 'alert.created', 'dead_letter', { errorMessage: 'dlq' });
    }
    store.touchIntegration(int.id);
    const score = scoring.calculateScore(int.id, TENANT);
    expect(score!.components.errorRateScore).toBe(0); // All failures
  });
});
