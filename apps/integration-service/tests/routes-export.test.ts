import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';
import { TicketingService } from '../src/services/ticketing-service.js';
import { StixExportService } from '../src/services/stix-export.js';
import { BulkExportService } from '../src/services/bulk-export.js';
import type { IntegrationConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: (token: string) => {
    if (token === 'valid-token') return { userId: 'user-1', tenantId: 'tenant-1', role: 'admin' };
    throw new Error('Invalid token');
  },
  loadJwtConfig: () => {},
  loadServiceJwtSecret: () => {},
}));

const TEST_CONFIG: IntegrationConfig = {
  TI_NODE_ENV: 'test',
  TI_INTEGRATION_PORT: 0,
  TI_INTEGRATION_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long',
  TI_SERVICE_JWT_SECRET: 'test-service-jwt-secret',
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_RATE_LIMIT_MAX: 1000,
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_LOG_LEVEL: 'error',
  TI_INTEGRATION_SIEM_RETRY_MAX: 2,
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 10,
  TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 5000,
  TI_INTEGRATION_WEBHOOK_MAX_PER_TENANT: 10,
  TI_INTEGRATION_TAXII_PAGE_SIZE: 100,
  TI_IOC_SERVICE_URL: 'http://localhost:3007',
  TI_GRAPH_SERVICE_URL: 'http://localhost:3012',
  TI_CORRELATION_SERVICE_URL: 'http://localhost:3013',
};

describe('Export Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const store = new IntegrationStore();
    const stixExport = new StixExportService();
    const bulkExport = new BulkExportService(stixExport);
    const fieldMapper = new FieldMapper();
    const ticketingService = new TicketingService(store, fieldMapper);

    app = await buildApp({
      config: TEST_CONFIG,
      exportDeps: { store, stixExport, bulkExport, ticketingService },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const AUTH = { authorization: 'Bearer valid-token' };

  // ─── TAXII Discovery ─────────────────────────────────────

  it('GET /taxii/discovery — returns TAXII discovery (no auth)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/taxii/discovery',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('taxii');
    const body = res.json();
    expect(body.title).toBe('ETIP TAXII Server');
    expect(body.api_roots).toBeDefined();
  });

  // ─── TAXII Collections ────────────────────────────────────

  it('GET /taxii/collections — returns collections', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/taxii/collections',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.collections).toHaveLength(2);
    expect(body.collections[0].canRead).toBe(true);
  });

  // ─── TAXII Collection Objects ─────────────────────────────

  it('GET /taxii/collections/:id/objects — returns STIX bundle', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/taxii/collections/etip-iocs-tenant-1/objects',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('stix');
    const bundle = res.json();
    expect(bundle.type).toBe('bundle');
    expect(bundle.objects.length).toBeGreaterThan(0);
  });

  // ─── Bulk Export ──────────────────────────────────────────

  it('POST /export — CSV format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/export',
      headers: AUTH,
      payload: { format: 'csv', entityType: 'iocs' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.body).toContain('id');
  });

  it('POST /export — JSON format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/export',
      headers: AUTH,
      payload: { format: 'json', entityType: 'alerts' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const body = JSON.parse(res.body);
    expect(body.source).toBe('ETIP Platform');
    expect(body.data).toBeDefined();
  });

  it('POST /export — STIX format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/export',
      headers: AUTH,
      payload: { format: 'stix', entityType: 'iocs' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('stix');
    const bundle = JSON.parse(res.body);
    expect(bundle.type).toBe('bundle');
  });

  it('POST /export — 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/export',
      payload: { format: 'json', entityType: 'iocs' },
    });
    expect(res.statusCode).toBe(401);
  });
});
