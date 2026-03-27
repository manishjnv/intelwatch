import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { tenantOverlayRoutes } from '../src/routes/tenant-overlay.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';

// Mock auth
vi.mock('../src/plugins/auth.js', () => ({
  authenticate: async (req: Record<string, unknown>) => {
    req.user = { sub: 'user-001', tenantId: 'tenant-001', role: 'analyst' };
  },
  getUser: () => ({ sub: 'user-001', tenantId: 'tenant-001', role: 'analyst' }),
  rbac: (_permission: string) => {
    return async (_req: unknown, _reply: unknown) => { /* pass */ };
  },
}));

const IOC_ID = '00000000-0000-0000-0000-000000000001';

function mockService() {
  return {
    getIocsForTenant: vi.fn().mockResolvedValue([
      { id: IOC_ID, iocType: 'ip', value: '1.2.3.4', severity: 'medium', confidence: 60 },
    ]),
    getIocDetail: vi.fn().mockResolvedValue({
      id: IOC_ID, iocType: 'ip', value: '1.2.3.4', severity: 'medium', enrichmentData: {},
    }),
    setOverlay: vi.fn().mockResolvedValue({ id: 'overlay-1' }),
    removeOverlay: vi.fn().mockResolvedValue(undefined),
    bulkSetOverlay: vi.fn().mockResolvedValue(3),
    getOverlayStats: vi.fn().mockResolvedValue({
      totalGlobalIocs: 100, overlayCount: 5,
      customSeverityCount: 3, customConfidenceCount: 2, customTagsCount: 1,
    }),
  };
}

describe('TenantOverlayRoutes', () => {
  let app: ReturnType<typeof Fastify>;
  let service: ReturnType<typeof mockService>;
  let prevFlag: string | undefined;

  beforeEach(async () => {
    prevFlag = process.env['TI_GLOBAL_PROCESSING_ENABLED'];
    process.env['TI_GLOBAL_PROCESSING_ENABLED'] = 'true';

    service = mockService();
    app = Fastify();
    registerErrorHandler(app);
    await app.register(tenantOverlayRoutes(service as never), { prefix: '/api/v1/normalization/global-iocs' });
    await app.ready();
  });

  afterEach(async () => {
    if (prevFlag !== undefined) process.env['TI_GLOBAL_PROCESSING_ENABLED'] = prevFlag;
    else delete process.env['TI_GLOBAL_PROCESSING_ENABLED'];
    await app.close();
    vi.restoreAllMocks();
  });

  describe('GET /global-iocs', () => {
    it('returns merged list, 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/normalization/global-iocs' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(service.getIocsForTenant).toHaveBeenCalledWith('tenant-001', expect.any(Object));
    });

    it('feature flag off → 503', async () => {
      process.env['TI_GLOBAL_PROCESSING_ENABLED'] = 'false';
      const res = await app.inject({ method: 'GET', url: '/api/v1/normalization/global-iocs' });
      expect(res.statusCode).toBe(503);
    });

    it('filter by iocType works', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/normalization/global-iocs?iocType=domain',
      });
      expect(service.getIocsForTenant).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ iocType: 'domain' }),
      );
    });
  });

  describe('GET /global-iocs/:iocId', () => {
    it('returns detail with enrichmentData', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/normalization/global-iocs/${IOC_ID}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enrichmentData).toBeDefined();
    });

    it('not found → 404', async () => {
      service.getIocDetail.mockResolvedValue(null);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/normalization/global-iocs/${IOC_ID}`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /global-iocs/:iocId/overlay', () => {
    it('valid → 200', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/normalization/global-iocs/${IOC_ID}/overlay`,
        payload: { customSeverity: 'high' },
      });
      expect(res.statusCode).toBe(200);
      expect(service.setOverlay).toHaveBeenCalledWith(
        'tenant-001',
        IOC_ID,
        expect.objectContaining({ customSeverity: 'high', overriddenBy: 'user-001' }),
      );
    });
  });

  describe('DELETE /global-iocs/:iocId/overlay', () => {
    it('returns 204', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/normalization/global-iocs/${IOC_ID}/overlay`,
      });
      expect(res.statusCode).toBe(204);
      expect(service.removeOverlay).toHaveBeenCalledWith('tenant-001', IOC_ID);
    });
  });

  describe('POST /global-iocs/bulk-overlay', () => {
    it('valid → 200', async () => {
      const ids = [IOC_ID, '00000000-0000-0000-0000-000000000002'];
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/normalization/global-iocs/bulk-overlay',
        payload: {
          globalIocIds: ids,
          overlay: { customSeverity: 'critical' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.count).toBe(3);
    });

    it('>100 IOCs → 400', async () => {
      const ids = Array.from({ length: 101 }, (_, i) =>
        `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/normalization/global-iocs/bulk-overlay',
        payload: {
          globalIocIds: ids,
          overlay: { customSeverity: 'high' },
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /global-iocs/stats', () => {
    it('returns counts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/normalization/global-iocs/stats',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.totalGlobalIocs).toBe(100);
      expect(res.json().data.overlayCount).toBe(5);
    });
  });
});
