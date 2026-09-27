import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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

import { buildApp } from '../src/app.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';
import { SiemAdapter } from '../src/services/siem-adapter.js';
import { TicketingService } from '../src/services/ticketing-service.js';
import type { IntegrationConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';
import type { WebhookService } from '../src/services/webhook-service.js';

// Mock shared-auth to avoid needing real JWT, but keep the real hasPermission/PERMISSIONS
// implementation so RBAC preHandlers are exercised exactly as in production.
vi.mock('@etip/shared-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@etip/shared-auth')>();
  return {
    ...actual,
    verifyAccessToken: (token: string) => {
      if (token === 'valid-token') return { userId: 'user-1', tenantId: 'tenant-1', role: 'tenant_admin' };
      if (token === 'tenant-b') return { userId: 'user-2', tenantId: 'tenant-2', role: 'tenant_admin' };
      if (token === 'analyst-token') return { userId: 'user-3', tenantId: 'tenant-1', role: 'analyst' };
      if (token === 'super-admin-token') return { userId: 'user-4', tenantId: 'tenant-1', role: 'super_admin' };
      if (token === 'no-role-token') return { userId: 'user-5', tenantId: 'tenant-1' };
      throw new Error('Invalid token');
    },
    loadJwtConfig: () => {},
    loadServiceJwtSecret: () => {},
  };
});

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
  TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: false,
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

// Roadmap STEP_00B U4: secrets are never returned by the API.
describe('Integration routes — secret masking', () => {
  let app: FastifyInstance;
  let store: IntegrationStore;
  const AUTH = { authorization: 'Bearer valid-token' };

  beforeAll(async () => {
    store = new IntegrationStore();
    const fieldMapper = new FieldMapper();
    app = await buildApp({
      config: TEST_CONFIG,
      routeDeps: { store, siemAdapter: new SiemAdapter(store, fieldMapper, TEST_CONFIG), ticketingService: new TicketingService(store, fieldMapper) },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('masks the SIEM token on create, get and list, and keeps it on a masked PUT', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'S', type: 'splunk_hec', triggers: ['alert.created'],
        siemConfig: { type: 'splunk_hec', url: 'https://splunk.example.com', token: 'super-secret-token' } },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id;
    expect(created.body).not.toContain('super-secret-token');

    const got = await app.inject({ method: 'GET', url: `/api/v1/integrations/${id}`, headers: AUTH });
    expect(got.json().data.siemConfig.token).toBe('********');
    const list = await app.inject({ method: 'GET', url: '/api/v1/integrations', headers: AUTH });
    expect(list.body).not.toContain('super-secret-token');

    const put = await app.inject({
      method: 'PUT', url: `/api/v1/integrations/${id}`, headers: AUTH,
      payload: { name: 'S2', siemConfig: got.json().data.siemConfig },
    });
    expect(put.statusCode).toBe(200);
    expect(store.getIntegration(id, 'tenant-1')?.siemConfig?.token).toBe('super-secret-token');
  });
});

// SSRF guard (roadmap S166): tenant-supplied SIEM/webhook/ticketing URLs must be
// publicly reachable — rejected at save time, and defended again at connect time.
describe('Integration routes — SSRF guard', () => {
  let app: FastifyInstance;
  let store: IntegrationStore;
  const AUTH = { authorization: 'Bearer valid-token' };

  beforeAll(async () => {
    store = new IntegrationStore();
    const fieldMapper = new FieldMapper();
    app = await buildApp({
      config: TEST_CONFIG,
      routeDeps: { store, siemAdapter: new SiemAdapter(store, fieldMapper, TEST_CONFIG), ticketingService: new TicketingService(store, fieldMapper) },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('rejects creating a webhook integration pointed at a private IP literal', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'Bad Webhook', type: 'webhook', triggers: ['alert.created'],
        webhookConfig: { url: 'http://127.0.0.1/hook' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating a SIEM integration pointed at localhost', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'Bad Splunk', type: 'splunk_hec', triggers: ['alert.created'],
        siemConfig: { type: 'splunk_hec', url: 'http://localhost:6379', token: 'tok' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts an ordinary public destination URL', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'Good Webhook', type: 'webhook', triggers: ['alert.created'],
        webhookConfig: { url: 'https://hooks.example.com/incoming' } },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /:id/test against a private destination fails gracefully — no 500, no connection made', async () => {
    // Bypass the save-time schema check to simulate a pre-existing bad record
    // (e.g. migrated data) — connect-time protection must still hold.
    const integration = await store.createIntegration('tenant-1', {
      name: 'Sneaky', type: 'splunk_hec', enabled: true, triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
      siemConfig: { type: 'splunk_hec', url: 'http://169.254.169.254', token: 'tok', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
    });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/integrations/${integration.id}/test`, headers: AUTH,
    });

    expect(res.statusCode).toBe(200); // not a 500 crash
    const body = res.json().data;
    expect(body.success).toBe(false);
    expect(body.message).toContain('Destination not allowed');
  });
});

// Security fix: every route's preHandler used to only verify the JWT, with no role check —
// any authenticated analyst could create/update/delete/test/push integrations and point a
// connector at their own URL. requirePermission() now gates every mutation/read on the role.
describe('Integration routes — RBAC (role permission checks)', () => {
  let app: FastifyInstance;
  let store: IntegrationStore;
  const ANALYST = { authorization: 'Bearer analyst-token' };
  const SUPER_ADMIN = { authorization: 'Bearer super-admin-token' };
  const NO_ROLE = { authorization: 'Bearer no-role-token' };
  const AUTH = { authorization: 'Bearer valid-token' }; // tenant_admin

  beforeAll(async () => {
    store = new IntegrationStore();
    const fieldMapper = new FieldMapper();
    app = await buildApp({
      config: TEST_CONFIG,
      routeDeps: { store, siemAdapter: new SiemAdapter(store, fieldMapper, TEST_CONFIG), ticketingService: new TicketingService(store, fieldMapper) },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  async function seedIntegration(): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'RBAC Test', type: 'webhook', triggers: ['ioc.created'] },
    });
    return res.json().data.id;
  }

  it('POST / (create) — analyst 403, tenant_admin 201, super_admin 201, no role 403', async () => {
    const analystRes = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: ANALYST,
      payload: { name: 'Blocked', type: 'webhook', triggers: ['ioc.created'] },
    });
    expect(analystRes.statusCode).toBe(403);

    const adminRes = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'Allowed Admin', type: 'webhook', triggers: ['ioc.created'] },
    });
    expect(adminRes.statusCode).toBe(201);

    const superRes = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: SUPER_ADMIN,
      payload: { name: 'Allowed Super', type: 'webhook', triggers: ['ioc.created'] },
    });
    expect(superRes.statusCode).toBe(201);

    const noRoleRes = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: NO_ROLE,
      payload: { name: 'Blocked No Role', type: 'webhook', triggers: ['ioc.created'] },
    });
    expect(noRoleRes.statusCode).toBe(403);
  });

  it('GET / (list) — analyst 403, tenant_admin 200', async () => {
    const analystRes = await app.inject({ method: 'GET', url: '/api/v1/integrations', headers: ANALYST });
    expect(analystRes.statusCode).toBe(403);
    const adminRes = await app.inject({ method: 'GET', url: '/api/v1/integrations', headers: AUTH });
    expect(adminRes.statusCode).toBe(200);
  });

  it('bodyless POST declared as JSON returns 400 (framework client error), not 500', async () => {
    const id = await seedIntegration();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/integrations/${id}/test`,
      headers: { ...AUTH, 'content-type': 'application/json' }, payload: '',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('FST_ERR_CTP_EMPTY_JSON_BODY');
  });

  it('bodyless POST without content-type reaches the handler (Test connection path)', async () => {
    const id = await seedIntegration();
    const res = await app.inject({ method: 'POST', url: `/api/v1/integrations/${id}/test`, headers: AUTH });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).not.toBe(500);
  });

  it('GET /:id (get) — analyst 403, tenant_admin 200', async () => {
    const id = await seedIntegration();
    const analystRes = await app.inject({ method: 'GET', url: `/api/v1/integrations/${id}`, headers: ANALYST });
    expect(analystRes.statusCode).toBe(403);
    const adminRes = await app.inject({ method: 'GET', url: `/api/v1/integrations/${id}`, headers: AUTH });
    expect(adminRes.statusCode).toBe(200);
  });

  it('PUT /:id (update) — analyst 403, tenant_admin 200', async () => {
    const id = await seedIntegration();
    const analystRes = await app.inject({
      method: 'PUT', url: `/api/v1/integrations/${id}`, headers: ANALYST, payload: { name: 'Nope' },
    });
    expect(analystRes.statusCode).toBe(403);
    const adminRes = await app.inject({
      method: 'PUT', url: `/api/v1/integrations/${id}`, headers: AUTH, payload: { name: 'Renamed' },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  it('DELETE /:id (delete) — analyst 403, super_admin 204', async () => {
    const id = await seedIntegration();
    const analystRes = await app.inject({ method: 'DELETE', url: `/api/v1/integrations/${id}`, headers: ANALYST });
    expect(analystRes.statusCode).toBe(403);
    const superRes = await app.inject({ method: 'DELETE', url: `/api/v1/integrations/${id}`, headers: SUPER_ADMIN });
    expect(superRes.statusCode).toBe(204);
  });

  it('POST /:id/test — analyst 403, tenant_admin 200', async () => {
    const id = await seedIntegration();
    const analystRes = await app.inject({ method: 'POST', url: `/api/v1/integrations/${id}/test`, headers: ANALYST });
    expect(analystRes.statusCode).toBe(403);
    const adminRes = await app.inject({ method: 'POST', url: `/api/v1/integrations/${id}/test`, headers: AUTH });
    expect(adminRes.statusCode).toBe(200);
  });

  it('POST /:id/push — analyst 403 (attacker cannot point a connector at their own destination)', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'Push Test', type: 'splunk_hec', triggers: ['alert.created'],
        siemConfig: { type: 'splunk_hec', url: 'https://splunk.example.com', token: 'tok' } },
    });
    const id = create.json().data.id;
    const analystRes = await app.inject({
      method: 'POST', url: `/api/v1/integrations/${id}/push`, headers: ANALYST,
      payload: { event: 'ioc.created', payload: { foo: 'bar' } },
    });
    expect(analystRes.statusCode).toBe(403);
  });

  it('GET /:id/logs — analyst 403, tenant_admin 200', async () => {
    const id = await seedIntegration();
    const analystRes = await app.inject({ method: 'GET', url: `/api/v1/integrations/${id}/logs`, headers: ANALYST });
    expect(analystRes.statusCode).toBe(403);
    const adminRes = await app.inject({ method: 'GET', url: `/api/v1/integrations/${id}/logs`, headers: AUTH });
    expect(adminRes.statusCode).toBe(200);
  });
});

describe('POST /:id/test — webhook connectors use the same Test endpoint', () => {
  let app: FastifyInstance;
  let store: IntegrationStore;
  const AUTH = { authorization: 'Bearer valid-token' };
  const testWebhook = vi.fn().mockResolvedValue({ success: true, statusCode: 200, message: 'Webhook test successful' });

  beforeAll(async () => {
    store = new IntegrationStore();
    const fieldMapper = new FieldMapper();
    app = await buildApp({
      config: TEST_CONFIG,
      routeDeps: {
        store,
        siemAdapter: new SiemAdapter(store, fieldMapper, TEST_CONFIG),
        ticketingService: new TicketingService(store, fieldMapper),
        webhookService: { testWebhook } as unknown as WebhookService,
      },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('tests a webhook connector via webhookService.testWebhook', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/v1/integrations', headers: AUTH,
      payload: { name: 'Hook', type: 'webhook', triggers: ['ioc.created'], webhookConfig: { url: 'https://hooks.example.com/x', method: 'POST' } },
    });
    const id = created.json().data.id;
    const res = await app.inject({ method: 'POST', url: `/api/v1/integrations/${id}/test`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ success: true, message: 'Webhook test successful' });
    expect(testWebhook).toHaveBeenCalledTimes(1);
  });
});
