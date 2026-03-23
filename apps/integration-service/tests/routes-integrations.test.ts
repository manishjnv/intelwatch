import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';
import { SiemAdapter } from '../src/services/siem-adapter.js';
import { TicketingService } from '../src/services/ticketing-service.js';
import type { IntegrationConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

// Mock shared-auth to avoid needing real JWT
vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: (token: string) => {
    if (token === 'valid-token') return { userId: 'user-1', tenantId: 'tenant-1', role: 'admin' };
    if (token === 'tenant-b') return { userId: 'user-2', tenantId: 'tenant-2', role: 'admin' };
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

describe('Integration CRUD Routes', () => {
  let app: FastifyInstance;
  let store: IntegrationStore;

  beforeAll(async () => {
    store = new IntegrationStore();
    const fieldMapper = new FieldMapper();
    const siemAdapter = new SiemAdapter(store, fieldMapper, TEST_CONFIG);
    const ticketingService = new TicketingService(store, fieldMapper);

    app = await buildApp({
      config: TEST_CONFIG,
      routeDeps: { store, siemAdapter, ticketingService },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const AUTH = { authorization: 'Bearer valid-token' };
  const AUTH_B = { authorization: 'Bearer tenant-b' };

  it('POST /api/v1/integrations — creates integration', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: AUTH,
      payload: {
        name: 'My Splunk',
        type: 'splunk_hec',
        triggers: ['alert.created'],
        siemConfig: {
          type: 'splunk_hec',
          url: 'https://splunk.example.com',
          token: 'test-token',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.name).toBe('My Splunk');
    expect(body.data.type).toBe('splunk_hec');
    expect(body.data.id).toBeDefined();
  });

  it('GET /api/v1/integrations — lists for tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/integrations/:id — returns single', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: AUTH,
      payload: { name: 'Get Test', type: 'webhook', triggers: ['ioc.created'] },
    });
    const id = create.json().data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/${id}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Get Test');
  });

  it('GET /api/v1/integrations/:id — 404 for wrong tenant', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: AUTH,
      payload: { name: 'Tenant A', type: 'webhook', triggers: ['ioc.created'] },
    });
    const id = create.json().data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/${id}`,
      headers: AUTH_B,
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/integrations/:id — updates', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: AUTH,
      payload: { name: 'Original', type: 'jira', triggers: ['alert.created'] },
    });
    const id = create.json().data.id;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/integrations/${id}`,
      headers: AUTH,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Updated');
  });

  it('DELETE /api/v1/integrations/:id — deletes', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: AUTH,
      payload: { name: 'ToDelete', type: 'webhook', triggers: ['ioc.created'] },
    });
    const id = create.json().data.id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/integrations/${id}`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(204);
  });

  it('401 — rejects missing auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations',
    });
    expect(res.statusCode).toBe(401);
  });

  it('401 — rejects invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations',
      headers: { authorization: 'Bearer bad-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/integrations/stats — returns stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/stats',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const stats = res.json().data;
    expect(stats.totalIntegrations).toBeDefined();
    expect(stats.enabledIntegrations).toBeDefined();
  });

  it('GET /api/v1/integrations/:id/logs — returns logs', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: AUTH,
      payload: { name: 'Log Test', type: 'webhook', triggers: ['alert.created'] },
    });
    const id = create.json().data.id;

    // Add a log
    store.addLog(id, 'tenant-1', 'alert.created', 'success', { statusCode: 200 });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/${id}/logs`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});
