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

import { HealthDashboard } from '../src/services/health-dashboard.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { IntegrationRateLimiter } from '../src/services/rate-limiter.js';

const TENANT = 'tenant-1';

describe('HealthDashboard', () => {
  let store: IntegrationStore;
  let rateLimiter: IntegrationRateLimiter;
  let dashboard: HealthDashboard;

  beforeEach(() => {
    store = new IntegrationStore();
    rateLimiter = new IntegrationRateLimiter(60);
    dashboard = new HealthDashboard(store, rateLimiter);
  });

  it('returns empty summary when no integrations', () => {
    const summary = dashboard.getSummary(TENANT);
    expect(summary.totalIntegrations).toBe(0);
    expect(summary.overallSuccessRate).toBe(100);
    expect(summary.integrations).toEqual([]);
  });

  it('computes success rate from logs', async () => {
    const int = await store.createIntegration(TENANT, {
      name: 'Test', type: 'webhook', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });

    store.addLog(int.id, TENANT, 'alert.created', 'success', { statusCode: 200 });
    store.addLog(int.id, TENANT, 'alert.created', 'success', { statusCode: 200 });
    store.addLog(int.id, TENANT, 'alert.created', 'failure', { errorMessage: 'timeout' });

    const summary = dashboard.getSummary(TENANT);
    expect(summary.totalIntegrations).toBe(1);
    expect(summary.totalEvents).toBe(3);
    expect(summary.totalFailures).toBe(1);
    expect(summary.overallSuccessRate).toBe(67); // 2/3 rounded

    const health = summary.integrations[0];
    expect(health.successCount).toBe(2);
    expect(health.failureCount).toBe(1);
    expect(health.successRate).toBe(67);
    expect(health.lastError).toBe('timeout');
  });

  it('reports 100% success rate when no logs', async () => {
    await store.createIntegration(TENANT, {
      name: 'NoLogs', type: 'splunk_hec', triggers: ['ioc.created'],
      fieldMappings: [], credentials: {},
    });

    const summary = dashboard.getSummary(TENANT);
    expect(summary.integrations[0].successRate).toBe(100);
    expect(summary.integrations[0].uptimePercent).toBe(100);
  });

  it('includes rate limit status', async () => {
    const int = await store.createIntegration(TENANT, {
      name: 'RateLimited', type: 'webhook', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });

    rateLimiter.tryConsume(int.id);
    rateLimiter.tryConsume(int.id);

    const summary = dashboard.getSummary(TENANT);
    expect(summary.integrations[0].rateLimit.maxPerMinute).toBe(60);
    expect(summary.integrations[0].rateLimit.remainingTokens).toBe(58);
  });

  it('includes DLQ size', () => {
    const delivery = store.createDelivery({
      integrationId: 'int-1', tenantId: TENANT, event: 'alert.created',
      payload: {}, attempts: 3, maxAttempts: 3, nextRetryAt: null,
      status: 'failure', lastError: 'err',
    });
    store.moveToDLQ(delivery.id);

    const summary = dashboard.getSummary(TENANT);
    expect(summary.dlqSize).toBe(1);
  });

  it('getIntegrationHealth returns null for missing integration', () => {
    expect(dashboard.getIntegrationHealth('no-id', TENANT)).toBeNull();
  });

  it('getIntegrationHealth returns detailed health', async () => {
    const int = await store.createIntegration(TENANT, {
      name: 'Detail', type: 'sentinel', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });

    store.addLog(int.id, TENANT, 'alert.created', 'success', {});
    store.addLog(int.id, TENANT, 'alert.created', 'dead_letter', { errorMessage: 'exhausted' });

    const health = dashboard.getIntegrationHealth(int.id, TENANT);
    expect(health).not.toBeNull();
    expect(health!.name).toBe('Detail');
    expect(health!.successCount).toBe(1);
    expect(health!.failureCount).toBe(1); // dead_letter counts as failure
    expect(health!.lastError).toBe('exhausted');
  });

  it('filters by tenant correctly', async () => {
    await store.createIntegration(TENANT, {
      name: 'Tenant1', type: 'webhook', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });
    await store.createIntegration('tenant-2', {
      name: 'Tenant2', type: 'webhook', triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });

    const summary = dashboard.getSummary(TENANT);
    expect(summary.totalIntegrations).toBe(1);
    expect(summary.integrations[0].name).toBe('Tenant1');
  });
});
