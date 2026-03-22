import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { EnrichmentCostTracker } from '../src/cost-tracker.js';
import { costRoutes } from '../src/routes/cost.js';

// Mock auth module
vi.mock('../src/plugins/auth.js', () => ({
  authenticate: vi.fn(async (req: { headers: { authorization?: string }; user?: unknown }) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      const err = new Error('Unauthorized') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }
    req.user = {
      sub: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000099',
      role: 'analyst',
      email: 'analyst@test.com',
    };
  }),
  getUser: vi.fn((req: { user?: unknown }) => {
    if (!req.user) {
      const err = new Error('Unauthorized') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }
    return req.user;
  }),
}));

const AUTH_HEADER = { authorization: 'Bearer test-token' };

describe('Cost Routes', () => {
  let app: FastifyInstance;
  let costTracker: EnrichmentCostTracker;

  beforeAll(async () => {
    costTracker = new EnrichmentCostTracker();
    app = Fastify();
    await app.register(costRoutes(costTracker, 5.00), { prefix: '/api/v1/enrichment/cost' });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- GET /stats ---

  describe('GET /api/v1/enrichment/cost/stats', () => {
    it('returns 401 without auth token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/enrichment/cost/stats' });
      expect(res.statusCode).toBe(401);
    });

    it('returns aggregate stats with correct shape', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/stats',
        headers: AUTH_HEADER,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveProperty('headline');
      expect(body.data).toHaveProperty('totalIOCsEnriched');
      expect(body.data).toHaveProperty('totalCostUsd');
      expect(body.data).toHaveProperty('totalTokens');
      expect(body.data).toHaveProperty('byProvider');
      expect(body.data).toHaveProperty('byIOCType');
      expect(body.data).toHaveProperty('since');
    });

    it('returns headline string format', async () => {
      costTracker.trackProvider('ioc-a', 'ip', 'haiku_triage', 100, 50, 'haiku', 300);

      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/stats',
        headers: AUTH_HEADER,
      });

      const { headline } = res.json().data;
      expect(headline).toMatch(/\d+ IOCs? enriched for \$\d+\.\d{2}/);
    });

    it('returns byProvider breakdown', async () => {
      costTracker.trackProvider('ioc-b', 'ip', 'virustotal', 0, 0, null, 100);

      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/stats',
        headers: AUTH_HEADER,
      });

      const { byProvider } = res.json().data;
      expect(byProvider.virustotal).toBeDefined();
      expect(byProvider.virustotal.costUsd).toBe(0);
    });

    it('returns byIOCType breakdown', async () => {
      costTracker.trackProvider('ioc-c', 'domain', 'haiku_triage', 100, 50, 'haiku', 300);

      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/stats',
        headers: AUTH_HEADER,
      });

      const { byIOCType } = res.json().data;
      expect(byIOCType.domain).toBeDefined();
    });
  });

  // --- GET /ioc/:iocId ---

  describe('GET /api/v1/enrichment/cost/ioc/:iocId', () => {
    it('returns 401 without auth token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/enrichment/cost/ioc/00000000-0000-0000-0000-000000000001',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns cost breakdown for tracked IOC', async () => {
      const iocId = '00000000-0000-0000-0000-000000000010';
      costTracker.trackProvider(iocId, 'ip', 'virustotal', 0, 0, null, 100);
      costTracker.trackProvider(iocId, 'ip', 'haiku_triage', 120, 80, 'haiku', 450);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/enrichment/cost/ioc/${iocId}`,
        headers: AUTH_HEADER,
      });

      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      expect(data.iocId).toBe(iocId);
      expect(data.providers).toHaveLength(2);
      expect(data.totalCostUsd).toBeGreaterThan(0);
    });

    it('returns 404 for unknown IOC ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/enrichment/cost/ioc/00000000-0000-0000-0000-999999999999',
        headers: AUTH_HEADER,
      });

      expect(res.statusCode).toBe(404);
    });

    it('validates iocId is UUID (400 on invalid)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/enrichment/cost/ioc/not-a-uuid',
        headers: AUTH_HEADER,
      });

      // Zod parse will throw → error handler returns 400
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('shows all providers in response', async () => {
      const iocId = '00000000-0000-0000-0000-000000000020';
      costTracker.trackProvider(iocId, 'ip', 'virustotal', 0, 0, null, 100);
      costTracker.trackProvider(iocId, 'ip', 'abuseipdb', 0, 0, null, 100);
      costTracker.trackProvider(iocId, 'ip', 'haiku_triage', 100, 50, 'haiku', 300);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/enrichment/cost/ioc/${iocId}`,
        headers: AUTH_HEADER,
      });

      const providers = res.json().data.providers.map((p: { provider: string }) => p.provider);
      expect(providers).toContain('virustotal');
      expect(providers).toContain('abuseipdb');
      expect(providers).toContain('haiku_triage');
    });
  });

  // --- GET /budget ---

  describe('GET /api/v1/enrichment/cost/budget', () => {
    it('returns 401 without auth token', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/budget',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns budget status for authenticated tenant', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/budget',
        headers: AUTH_HEADER,
      });

      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      expect(data).toHaveProperty('tenantId');
      expect(data).toHaveProperty('currentSpendUsd');
      expect(data).toHaveProperty('dailyLimitUsd');
      expect(data).toHaveProperty('percentUsed');
      expect(data).toHaveProperty('isOverBudget');
    });

    it('shows isOverBudget=false when under limit', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/budget',
        headers: AUTH_HEADER,
      });

      expect(res.json().data.isOverBudget).toBe(false);
    });

    it('shows correct daily limit from config', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/enrichment/cost/budget',
        headers: AUTH_HEADER,
      });

      expect(res.json().data.dailyLimitUsd).toBe(5.00);
    });
  });
});
