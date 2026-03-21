import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { iocRoutes } from '../src/routes/iocs.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';

// ── Mock shared-auth before import ──────────────────────────────

vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: () => ({
    sub: 'user-001', tenantId: 'tenant-001', role: 'admin',
    email: 'test@test.com', iat: 0, exp: 9999999999,
  }),
  hasPermission: () => true,
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
}));

// ── Mock service ────────────────────────────────────────────────

function createMockService() {
  return {
    listIocs: vi.fn().mockResolvedValue({ items: [{ id: 'ioc-1' }], total: 1 }),
    getIoc: vi.fn().mockResolvedValue({ id: 'ioc-1', iocType: 'ip', normalizedValue: '1.2.3.4' }),
    getIocDetail: vi.fn().mockResolvedValue({ id: 'ioc-1', iocType: 'ip', computed: { confidenceTrend: {}, actionability: {} } }),
    getFeedAccuracy: vi.fn().mockResolvedValue([{ feedSourceId: 'f1', totalIocs: 50, falsePositiveRate: 2.5 }]),
    createIoc: vi.fn().mockResolvedValue({ id: 'new-1', iocType: 'ip', normalizedValue: '1.2.3.4' }),
    updateIoc: vi.fn().mockResolvedValue({ id: 'ioc-1', severity: 'high' }),
    deleteIoc: vi.fn().mockResolvedValue(undefined),
    searchIocs: vi.fn().mockResolvedValue({ items: [{ id: 'ioc-1' }], total: 1 }),
    pivotIoc: vi.fn().mockResolvedValue({ byFeed: [], byThreatActor: [], byMalware: [], bySubnet: [] }),
    getTimeline: vi.fn().mockResolvedValue({ iocId: 'ioc-1', events: [] }),
    exportIocs: vi.fn().mockResolvedValue({ data: '[]', contentType: 'application/json', filename: 'export.json' }),
    getStats: vi.fn().mockResolvedValue({ total: 10, byType: { ip: 5 } }),
    bulkOperation: vi.fn().mockResolvedValue({ affected: 3 }),
  };
}

describe('IOC Intelligence — Routes', () => {
  let app: FastifyInstance;
  let mockService: ReturnType<typeof createMockService>;
  const AUTH = { Authorization: 'Bearer valid-token' };

  beforeAll(async () => {
    mockService = createMockService();
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    await app.register(iocRoutes(mockService as never), { prefix: '/api/v1/ioc' });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  // ── List ────────────────────────────────────────────────────

  it('GET /api/v1/ioc — returns paginated list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ioc', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/v1/ioc — 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ioc' });
    expect(res.statusCode).toBe(401);
  });

  // ── Create ──────────────────────────────────────────────────

  it('POST /api/v1/ioc — creates IOC and returns 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/ioc', headers: AUTH,
      payload: { iocType: 'ip', value: '1.2.3.4' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.id).toBe('new-1');
  });

  it('POST /api/v1/ioc — 400 for missing iocType', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/ioc', headers: AUTH,
      payload: { value: '1.2.3.4' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Detail ──────────────────────────────────────────────────

  it('GET /api/v1/ioc/:id — returns IOC detail', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe('ioc-1');
  });

  it('GET /api/v1/ioc/:id — 400 for non-UUID id', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/not-a-uuid', headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Update ──────────────────────────────────────────────────

  it('PUT /api/v1/ioc/:id — updates and returns IOC', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000', headers: AUTH,
      payload: { severity: 'high' },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── Delete ──────────────────────────────────────────────────

  it('DELETE /api/v1/ioc/:id — returns 204', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000', headers: AUTH,
    });
    expect(res.statusCode).toBe(204);
  });

  // ── Search ──────────────────────────────────────────────────

  it('POST /api/v1/ioc/search — returns search results', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/ioc/search', headers: AUTH,
      payload: { query: 'APT28' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).total).toBe(1);
  });

  // ── Export ──────────────────────────────────────────────────

  it('POST /api/v1/ioc/export — returns file with content-disposition', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/ioc/export', headers: AUTH,
      payload: { format: 'json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  // ── Stats ───────────────────────────────────────────────────

  it('GET /api/v1/ioc/stats — returns aggregated stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ioc/stats', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.total).toBe(10);
  });

  // ── Bulk ────────────────────────────────────────────────────

  it('POST /api/v1/ioc/bulk — returns affected count', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/ioc/bulk', headers: AUTH,
      payload: { ids: ['550e8400-e29b-41d4-a716-446655440000'], action: 'set_severity', severity: 'critical' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.affected).toBe(3);
  });

  // ── Pivot ───────────────────────────────────────────────────

  it('GET /api/v1/ioc/:id/pivot — returns pivot categories', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000/pivot', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('byFeed');
  });

  // ── Feed Accuracy (B3) ──────────────────────────────────────

  it('GET /api/v1/ioc/feed-accuracy — returns per-feed stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ioc/feed-accuracy', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].feedSourceId).toBe('f1');
  });

  // ── Detail with computed signals ───────────────────────────

  it('GET /api/v1/ioc/:id — returns computed accuracy signals', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('computed');
  });

  // ── Timeline ────────────────────────────────────────────────

  it('GET /api/v1/ioc/:id/timeline — returns timeline events', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000/timeline', headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toHaveProperty('events');
  });
});
