import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { commandCenterRoutes } from '../src/routes/command-center.js';
import { errorHandlerPlugin } from '../src/plugins/error-handler.js';
import type { CommandCenterQueries } from '../src/services/command-center-queries.js';
import type { ConsumptionTracker } from '../src/services/consumption-tracker.js';

function createMockQueries(): CommandCenterQueries {
  return {
    prisma: { aiProcessingCost: { count: vi.fn().mockResolvedValue(120) } },
    getGlobalStats: vi.fn().mockResolvedValue({
      totalCostUsd: 142.30,
      totalItemsProcessed: 12450,
      byDay: [{ date: '2026-03-27', costUsd: 12.50, itemCount: 500 }],
      byProvider: { anthropic: { costUsd: 120, itemCount: 10000 } },
      byModel: { 'claude-sonnet-4-6': { costUsd: 95, itemCount: 8000 } },
      bySubtask: { triage: { costUsd: 30, itemCount: 5000 } },
    }),
    getTenantStats: vi.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      totalConsumed: 3200,
      totalAttributedCostUsd: 23.45,
      byProvider: { anthropic: { count: 3000, costUsd: 20 } },
      byItemType: { ioc: { count: 2000, costUsd: 15 } },
      byDay: [{ date: '2026-03-27', count: 100, costUsd: 2.50 }],
    }),
    getTenantList: vi.fn().mockResolvedValue([
      { tenantId: 'tenant-1', itemsConsumed: 8400, attributedCostUsd: 28.30 },
      { tenantId: 'tenant-2', itemsConsumed: 6200, attributedCostUsd: 21.10 },
    ]),
  } as any;
}

function createMockTracker(): ConsumptionTracker {
  return {
    trackConsumption: vi.fn().mockResolvedValue(true),
    trackBatch: vi.fn().mockResolvedValue(3),
  } as any;
}

async function buildTestApp(
  queries = createMockQueries(),
  tracker = createMockTracker(),
) {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(
    commandCenterRoutes({ queries, consumptionTracker: tracker }),
    { prefix: '/api/v1/customization/command-center' },
  );
  return { app, queries, tracker };
}

describe('Command Center Routes', () => {
  describe('GET /global-stats', () => {
    it('returns global stats for super_admin', async () => {
      const { app, queries } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/global-stats?period=month',
        headers: { 'x-user-role': 'super_admin' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.totalCostUsd).toBe(142.30);
      expect(body.data.totalItemsProcessed).toBe(12450);
      expect(queries.getGlobalStats).toHaveBeenCalledOnce();
    });

    it('rejects non-super_admin', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/global-stats',
        headers: { 'x-user-role': 'tenant_admin' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('defaults to month period', async () => {
      const { app, queries } = await buildTestApp();
      await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/global-stats',
        headers: { 'x-user-role': 'super_admin' },
      });

      expect(queries.getGlobalStats).toHaveBeenCalledOnce();
      const callArgs = (queries.getGlobalStats as any).mock.calls[0][0];
      expect(callArgs.since).toBeInstanceOf(Date);
      expect(callArgs.until).toBeInstanceOf(Date);
    });
  });

  describe('GET /tenant-stats', () => {
    it('returns tenant stats with x-tenant-id', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/tenant-stats?period=week',
        headers: { 'x-tenant-id': 'tenant-1' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.tenantId).toBe('tenant-1');
      expect(body.data.totalConsumed).toBe(3200);
    });

    it('rejects missing x-tenant-id', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/tenant-stats',
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /tenant-list', () => {
    it('returns all tenants for super_admin', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/tenant-list',
        headers: { 'x-user-role': 'super_admin' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('rejects non-super_admin', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/tenant-list',
        headers: { 'x-user-role': 'tenant_admin' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /queue-stats', () => {
    it('returns queue stats for super_admin', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customization/command-center/queue-stats',
        headers: { 'x-user-role': 'super_admin' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveProperty('pendingItems');
      expect(body.data).toHaveProperty('processingRate');
    });
  });

  describe('POST /consumption', () => {
    it('records new consumption (201)', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customization/command-center/consumption',
        payload: { tenantId: 'tenant-1', itemId: 'ioc-123', itemType: 'ioc' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.recorded).toBe(true);
    });

    it('returns 200 for duplicate consumption', async () => {
      const tracker = createMockTracker();
      (tracker.trackConsumption as any).mockResolvedValue(false);
      const { app } = await buildTestApp(undefined, tracker);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customization/command-center/consumption',
        payload: { tenantId: 'tenant-1', itemId: 'ioc-123', itemType: 'ioc' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.recorded).toBe(false);
    });

    it('validates required fields', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customization/command-center/consumption',
        payload: { tenantId: 'tenant-1' }, // missing itemId, itemType
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /consumption/batch', () => {
    it('processes batch of records', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customization/command-center/consumption/batch',
        payload: {
          records: [
            { tenantId: 't1', itemId: 'ioc-1', itemType: 'ioc' },
            { tenantId: 't1', itemId: 'ioc-2', itemType: 'ioc' },
            { tenantId: 't1', itemId: 'art-1', itemType: 'article' },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.created).toBe(3);
      expect(body.data.total).toBe(3);
    });
  });
});

describe('ConsumptionTracker (unit)', () => {
  it('trackConsumption calls prisma create', async () => {
    const mockPrisma = {
      tenantItemConsumption: {
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(42),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as any;

    // Import and test directly
    const { ConsumptionTracker } = await import('../src/services/consumption-tracker.js');
    const tracker = new ConsumptionTracker(mockPrisma);

    const result = await tracker.trackConsumption({
      tenantId: 'tenant-1',
      itemId: 'ioc-123',
      itemType: 'ioc',
    });

    expect(result).toBe(true);
    expect(mockPrisma.tenantItemConsumption.create).toHaveBeenCalledOnce();
  });

  it('trackConsumption returns false on duplicate', async () => {
    const mockPrisma = {
      tenantItemConsumption: {
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
    } as any;

    const { ConsumptionTracker } = await import('../src/services/consumption-tracker.js');
    const tracker = new ConsumptionTracker(mockPrisma);

    const result = await tracker.trackConsumption({
      tenantId: 'tenant-1',
      itemId: 'ioc-123',
      itemType: 'ioc',
    });

    expect(result).toBe(false);
  });

  it('getMonthlyCount returns count from prisma', async () => {
    const mockPrisma = {
      tenantItemConsumption: {
        count: vi.fn().mockResolvedValue(42),
      },
    } as any;

    const { ConsumptionTracker } = await import('../src/services/consumption-tracker.js');
    const tracker = new ConsumptionTracker(mockPrisma);

    const count = await tracker.getMonthlyCount('tenant-1');
    expect(count).toBe(42);
  });
});
