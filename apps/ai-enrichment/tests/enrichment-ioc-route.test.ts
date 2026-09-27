import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { enrichmentRoutes } from '../src/routes/enrichment.js';
import type { EnrichmentRepository } from '../src/repository.js';

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

const { queueAddMock } = vi.hoisted(() => ({ queueAddMock: vi.fn().mockResolvedValue({ id: 'job-1' }) }));
vi.mock('../src/queue.js', () => ({
  getEnrichQueue: vi.fn(() => ({ add: queueAddMock })),
}));

const AUTH_HEADER = { authorization: 'Bearer test-token' };
const TENANT_ID = '00000000-0000-0000-0000-000000000099';

const ENRICHED_IOC = {
  id: '00000000-0000-0000-0000-000000000010',
  tenantId: TENANT_ID,
  severity: 'critical',
  enrichedAt: new Date('2026-09-01T00:00:00Z'),
  enrichmentData: {
    vtResult: { malicious: 5, suspicious: 0, harmless: 10, undetected: 1, totalEngines: 16, detectionRate: 31, tags: [], lastAnalysisDate: null },
    abuseipdbResult: null, haikuResult: null, gsbResult: null, ipinfoResult: null,
    enrichmentStatus: 'enriched', failureReason: null, externalRiskScore: 60,
    costBreakdown: null, enrichmentQuality: 70, geolocation: null,
  },
};

const UNENRICHED_HIGH_IOC = {
  id: '00000000-0000-0000-0000-000000000011',
  tenantId: TENANT_ID,
  severity: 'high',
  enrichedAt: null,
  enrichmentData: null,
};

const UNENRICHED_LOW_IOC = {
  id: '00000000-0000-0000-0000-000000000012',
  tenantId: TENANT_ID,
  severity: 'low',
  enrichedAt: null,
  enrichmentData: null,
};

function mockRepo(): EnrichmentRepository {
  return {
    findById: vi.fn(async (iocId: string, tenantId: string) => {
      const all = [ENRICHED_IOC, UNENRICHED_HIGH_IOC, UNENRICHED_LOW_IOC];
      const ioc = all.find((i) => i.id === iocId);
      if (!ioc || ioc.tenantId !== tenantId) return null;
      return ioc;
    }),
  } as unknown as EnrichmentRepository;
}

describe('GET /api/v1/enrichment/ioc/:iocId', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(enrichmentRoutes(mockRepo(), null, ['critical', 'high']), { prefix: '/api/v1/enrichment' });
    await app.ready();
  });

  beforeEach(() => vi.clearAllMocks());

  it('returns full enrichment data for an enriched IOC', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/enrichment/ioc/${ENRICHED_IOC.id}`, headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.enrichmentStatus).toBe('enriched');
    expect(data.vtResult.malicious).toBe(5);
    expect(data.externalRiskScore).toBe(60);
  });

  it('returns pending status + null fields for an un-enriched high-severity IOC', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/enrichment/ioc/${UNENRICHED_HIGH_IOC.id}`, headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.enrichmentStatus).toBe('pending');
    expect(data.vtResult).toBeNull();
    expect(data.haikuResult).toBeNull();
    expect(data.externalRiskScore).toBeNull();
    expect(data.enrichedAt).toBeNull();
  });

  it('returns not_selected status for an un-enriched low-severity IOC', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/enrichment/ioc/${UNENRICHED_LOW_IOC.id}`, headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.enrichmentStatus).toBe('not_selected');
  });

  it('returns 404 (not tenant-leaking) for an IOC belonging to another tenant', async () => {
    const repo = {
      findById: vi.fn(async () => null), // simulates tenant-scoped query finding nothing
    } as unknown as EnrichmentRepository;
    const otherApp = Fastify();
    await otherApp.register(enrichmentRoutes(repo, null, ['critical', 'high']), { prefix: '/api/v1/enrichment' });
    await otherApp.ready();

    const res = await otherApp.inject({
      method: 'GET', url: `/api/v1/enrichment/ioc/${ENRICHED_IOC.id}`, headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBe(404);
    expect((repo.findById as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([ENRICHED_IOC.id, TENANT_ID]);
  });

  it('returns 400 for a non-UUID iocId', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/enrichment/ioc/not-a-uuid', headers: AUTH_HEADER,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/enrichment/ioc/${ENRICHED_IOC.id}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/enrichment/trigger sets manual:true', () => {
  it('enqueues a job with manual:true', async () => {
    const repo = mockRepo();
    const app = Fastify();
    await app.register(enrichmentRoutes(repo, null, ['critical', 'high']), { prefix: '/api/v1/enrichment' });
    await app.ready();

    const res = await app.inject({
      method: 'POST', url: '/api/v1/enrichment/trigger',
      headers: AUTH_HEADER, payload: { iocId: UNENRICHED_LOW_IOC.id },
    });

    expect(res.statusCode).toBe(202);
    expect(queueAddMock).toHaveBeenCalledOnce();
    const [, jobData] = queueAddMock.mock.calls[0];
    expect(jobData.manual).toBe(true);
  });
});
