import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { actorRoutes } from '../src/routes/actors.js';
import type { ActorService } from '../src/service.js';
import type { ActorServiceP2 } from '../src/service-p2.js';
import { verifyAccessToken, hasPermission } from '@etip/shared-auth';

// Mock shared-auth
vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    sub: 'user-1', tenantId: 'tenant-1', role: 'admin', email: 'admin@test.com',
  }),
  hasPermission: vi.fn().mockReturnValue(true),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
}));

const mockVerify = vi.mocked(verifyAccessToken);
const mockPermission = vi.mocked(hasPermission);

function createMockService(): ActorService {
  return {
    listActors: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 }),
    getActor: vi.fn().mockResolvedValue({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'APT28',
      aliases: ['Fancy Bear'], actorType: 'nation_state', motivation: 'espionage',
      confidence: 90, active: true,
    }),
    createActor: vi.fn().mockResolvedValue({
      id: 'new-uuid', name: 'Lazarus', actorType: 'nation_state', confidence: 80,
    }),
    updateActor: vi.fn().mockResolvedValue({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'APT28', confidence: 95,
    }),
    deleteActor: vi.fn().mockResolvedValue(undefined),
    searchActors: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 }),
    getStats: vi.fn().mockResolvedValue({ total: 5, active: 4, byType: {}, byMotivation: {}, bySophistication: {}, avgConfidence: 75 }),
    getLinkedIocs: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50, actorName: 'APT28' }),
    getTimeline: vi.fn().mockResolvedValue({ data: { actorName: 'APT28', days: 90, totalIocs: 0, timeline: [] } }),
    getMitreSummary: vi.fn().mockResolvedValue({ data: { actorName: 'APT28', totalTechniques: 2, sophisticationScore: 40, tactics: [] } }),
    exportActors: vi.fn().mockResolvedValue({ content: '[]', contentType: 'application/json', filename: 'test.json' }),
    // P0
    getExplainableAttribution: vi.fn().mockResolvedValue({ compositeScore: 65, signals: [] }),
    getAliasSuggestions: vi.fn().mockResolvedValue([{ actorId: 'x', actorName: 'Sofacy', similarity: 0.85 }]),
    getCorroboration: vi.fn().mockResolvedValue({ feedCount: 3, boost: 10, corroboratedConfidence: 80, singleSource: false }),
    getDormancyStatus: vi.fn().mockResolvedValue({ status: 'active', daysSinceLastIoc: 5, resurgenceDetected: false, confidenceAdjustment: 0 }),
    getScoredLinks: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    // P1
    getAttributionDecay: vi.fn().mockResolvedValue({ originalConfidence: 80, decayedConfidence: 72, avgDecayFactor: 0.9, perType: [] }),
    getTtpEvolution: vi.fn().mockResolvedValue({ newTtps: ['T9999'], abandonedTtps: [], consistentTtps: ['T1059'], evolutionVelocity: 25, totalUnique: 4 }),
    getSharedInfrastructure: vi.fn().mockResolvedValue([]),
    getActorProvenance: vi.fn().mockResolvedValue({ actorId: 'a1', actorName: 'APT28', confidence: 90 }),
    getMitreHeatmap: vi.fn().mockResolvedValue([{ tactic: 'Execution', coverage: 0.14 }]),
  } as unknown as ActorService;
}

function createMockServiceP2(): ActorServiceP2 {
  return {
    getDiamondModel: vi.fn().mockResolvedValue({ completeness: 75, facets: [] }),
    getFalseFlagAlerts: vi.fn().mockResolvedValue([]),
    getVictimologyPrediction: vi.fn().mockResolvedValue({ actorName: 'APT28', profileSectors: ['government'], predictions: [{ sector: 'government', frequency: 3, probability: 0.6 }] }),
    getActorComparison: vi.fn().mockResolvedValue({ actorA: { id: 'a1', name: 'APT28' }, actorB: { id: 'a2', name: 'APT29' }, overallSimilarity: 0.45 }),
    getFeedActorAccuracy: vi.fn().mockResolvedValue([{ feedId: 'f1', actorCount: 3, avgConfidence: 75 }]),
  } as unknown as ActorServiceP2;
}

describe('Threat Actor Intel — Routes', () => {
  let app: FastifyInstance;
  let mockService: ActorService;
  let mockServiceP2: ActorServiceP2;
  const AUTH_HEADER = 'Bearer valid-test-token';

  beforeAll(async () => {
    mockService = createMockService();
    mockServiceP2 = createMockServiceP2();
    app = Fastify({ logger: false });
    await app.register(sensible);
    registerErrorHandler(app);
    await app.register(actorRoutes(mockService, mockServiceP2), { prefix: '/api/v1/actors' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue({
      sub: 'user-1', tenantId: 'tenant-1', role: 'admin', email: 'admin@test.com',
    } as ReturnType<typeof verifyAccessToken>);
    mockPermission.mockReturnValue(true);
  });

  describe('GET /api/v1/actors', () => {
    it('200 — calls listActors and returns result', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/actors', headers: { authorization: AUTH_HEADER } });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.listActors)).toHaveBeenCalledWith('tenant-1', expect.any(Object));
      const body = JSON.parse(res.body);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
    });

    it('401 — rejects missing auth without calling service', async () => {
      mockVerify.mockImplementation(() => { throw new Error('Invalid token'); });
      const res = await app.inject({ method: 'GET', url: '/api/v1/actors' });
      expect(res.statusCode).toBe(401);
      expect(vi.mocked(mockService.listActors)).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/actors', () => {
    it('201 — calls createActor with parsed body', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/actors',
        headers: { authorization: AUTH_HEADER, 'content-type': 'application/json' },
        payload: { name: 'Lazarus', actorType: 'nation_state', motivation: 'financial' },
      });
      expect(res.statusCode).toBe(201);
      expect(vi.mocked(mockService.createActor)).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ name: 'Lazarus', actorType: 'nation_state' }));
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('Lazarus');
    });

    it('400 — rejects missing name via Zod before calling service', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/actors',
        headers: { authorization: AUTH_HEADER, 'content-type': 'application/json' },
        payload: { actorType: 'criminal' },
      });
      expect(res.statusCode).toBe(400);
      expect(vi.mocked(mockService.createActor)).not.toHaveBeenCalled();
    });

    it('403 — rejects insufficient permissions before calling service', async () => {
      mockPermission.mockReturnValue(false);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/actors',
        headers: { authorization: AUTH_HEADER, 'content-type': 'application/json' },
        payload: { name: 'Test' },
      });
      expect(res.statusCode).toBe(403);
      expect(vi.mocked(mockService.createActor)).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/actors/search', () => {
    it('200 — calls searchActors with q param', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/search?q=APT',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.searchActors)).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ q: 'APT' }));
    });

    it('400 — rejects missing q param without calling service', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/search',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(400);
      expect(vi.mocked(mockService.searchActors)).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/actors/stats', () => {
    it('200 — calls getStats for correct tenant', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/stats',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getStats)).toHaveBeenCalledWith('tenant-1');
      const body = JSON.parse(res.body);
      expect(body.data.total).toBe(5);
    });
  });

  describe('GET /api/v1/actors/:id', () => {
    it('200 — calls getActor with correct tenant and ID', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getActor)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('APT28');
    });

    it('400 — rejects non-UUID id without calling service', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/not-a-uuid',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(400);
      expect(vi.mocked(mockService.getActor)).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/v1/actors/:id', () => {
    it('200 — calls updateActor with correct args', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        headers: { authorization: AUTH_HEADER, 'content-type': 'application/json' },
        payload: { confidence: 95 },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.updateActor)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', expect.objectContaining({ confidence: 95 }));
    });
  });

  describe('DELETE /api/v1/actors/:id', () => {
    it('204 — calls deleteActor with correct args', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(204);
      expect(vi.mocked(mockService.deleteActor)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });
  });

  describe('GET /api/v1/actors/:id/iocs', () => {
    it('200 — calls getLinkedIocs with correct actor ID', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/iocs',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getLinkedIocs)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', expect.any(Object));
      const body = JSON.parse(res.body);
      expect(body.actorName).toBe('APT28');
    });
  });

  describe('GET /api/v1/actors/:id/mitre', () => {
    it('200 — calls getMitreSummary', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/mitre',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getMitreSummary)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });
  });

  // ═══ P0 ACCURACY IMPROVEMENT ROUTES ════════════════════════

  describe('GET /api/v1/actors/:id/attribution', () => {
    it('200 — calls getExplainableAttribution and returns score', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/attribution',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getExplainableAttribution)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      const body = JSON.parse(res.body);
      expect(body.data.compositeScore).toBe(65);
    });
  });

  describe('GET /api/v1/actors/:id/aliases', () => {
    it('200 — calls getAliasSuggestions and returns array with total', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/aliases',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getAliasSuggestions)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  describe('GET /api/v1/actors/:id/corroboration', () => {
    it('200 — calls getCorroboration and returns feed data', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/corroboration',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(mockService.getCorroboration)).toHaveBeenCalledWith('tenant-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      const body = JSON.parse(res.body);
      expect(body.data.feedCount).toBe(3);
      expect(body.data.corroboratedConfidence).toBe(80);
    });
  });

  describe('GET /api/v1/actors/:id/dormancy', () => {
    it('200 — returns dormancy status', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/dormancy',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('active');
    });
  });

  describe('GET /api/v1/actors/:id/links', () => {
    it('200 — returns scored links', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/links',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  // ═══ P1 ACCURACY IMPROVEMENT ROUTES ════════════════════════

  describe('GET /api/v1/actors/:id/decay', () => {
    it('200 — returns attribution decay', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/decay',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.decayedConfidence).toBeDefined();
    });
  });

  describe('GET /api/v1/actors/:id/ttp-evolution', () => {
    it('200 — returns TTP evolution', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/ttp-evolution',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.newTtps).toBeInstanceOf(Array);
      expect(body.data.evolutionVelocity).toBe(25);
    });
  });

  describe('GET /api/v1/actors/:id/shared-infra', () => {
    it('200 — returns shared infrastructure', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/shared-infra',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/actors/:id/provenance', () => {
    it('200 — returns actor provenance', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/provenance',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.actorName).toBe('APT28');
    });
  });

  describe('GET /api/v1/actors/:id/mitre-heatmap', () => {
    it('200 — returns MITRE heatmap data', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/mitre-heatmap',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  // ═══ P2 ACCURACY IMPROVEMENT ROUTES ════════════════════════

  describe('GET /api/v1/actors/:id/diamond', () => {
    it('200 — returns Diamond Model', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/diamond',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.completeness).toBe(75);
    });
  });

  describe('GET /api/v1/actors/:id/false-flags', () => {
    it('200 — returns false flag alerts', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/false-flags',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/actors/:id/predictions', () => {
    it('200 — returns victimology predictions', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/predictions',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.predictions).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/v1/actors/compare', () => {
    it('200 — compares two actors', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/actors/compare?a=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11&b=b1ffcd00-0d1c-5fa9-cc7e-7cc0ce491b22',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.overallSimilarity).toBeDefined();
    });

    it('400 — rejects non-UUID params', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/compare?a=bad&b=bad',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/actors/feed-accuracy', () => {
    it('200 — returns feed accuracy report', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/actors/feed-accuracy',
        headers: { authorization: AUTH_HEADER },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeInstanceOf(Array);
    });
  });
});
