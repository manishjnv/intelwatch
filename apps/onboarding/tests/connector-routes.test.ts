import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ConnectorValidator } from '../src/services/connector-validator.js';
import { IntegrationTester } from '../src/services/integration-tester.js';
import type { FastifyInstance } from 'fastify';

const TEST_CONFIG = {
  TI_NODE_ENV: 'test' as const,
  TI_ONBOARDING_PORT: 0,
  TI_ONBOARDING_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!!',
  TI_SERVICE_JWT_SECRET: 'test-service-secret!!',
  TI_CORS_ORIGINS: '*',
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_RATE_LIMIT_MAX: 1000,
  TI_LOG_LEVEL: 'silent',
};

describe('Connector Routes', () => {
  let app: FastifyInstance;
  let wizardStore: WizardStore;

  beforeAll(async () => {
    wizardStore = new WizardStore();
    const connectorValidator = new ConnectorValidator(wizardStore);
    const integrationTester = new IntegrationTester(wizardStore);
    app = await buildApp({
      config: TEST_CONFIG,
      connectorDeps: { connectorValidator, integrationTester },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('GET /connectors/types — lists supported types', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/onboarding/connectors/types' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(8);
    expect(body.total).toBe(8);
  });

  it('POST /connectors — adds a data source', async () => {
    wizardStore.getOrCreate('conn-tenant');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/connectors',
      headers: { 'x-tenant-id': 'conn-tenant' },
      payload: { name: 'CISA Feed', type: 'rss_feed', url: 'https://cisa.gov/feed.xml' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('CISA Feed');
    expect(res.json().data.status).toBe('pending');
  });

  it('POST /connectors — rejects invalid source', async () => {
    wizardStore.getOrCreate('conn-tenant');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/connectors',
      headers: { 'x-tenant-id': 'conn-tenant' },
      payload: { name: 'Bad', type: 'rest_api' }, // Missing URL
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /connectors — lists sources for tenant', async () => {
    wizardStore.getOrCreate('list-tenant');
    // Add via store bypass to simplify
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/connectors',
      headers: { 'x-tenant-id': 'conn-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('POST /connectors/validate — validates without saving', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/connectors/validate',
      payload: { name: 'Test', type: 'rss_feed', url: 'https://test.com/rss' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.valid).toBe(true);
  });

  it('POST /connectors/validate — returns errors for invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/connectors/validate',
      payload: { name: 'Bad', type: 'siem_splunk' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.valid).toBe(false);
    expect(res.json().data.errors.length).toBeGreaterThan(0);
  });

  it('POST /connectors/:sourceId/test — tests connection', async () => {
    wizardStore.getOrCreate('test-conn-tenant');
    // First add a source
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/connectors',
      headers: { 'x-tenant-id': 'test-conn-tenant' },
      payload: { name: 'Feed', type: 'rss_feed', url: 'https://feed.test/rss' },
    });
    const sourceId = addRes.json().data.id;
    // Test it
    const testRes = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/connectors/${sourceId}/test`,
      headers: { 'x-tenant-id': 'test-conn-tenant' },
    });
    expect(testRes.statusCode).toBe(200);
    expect(testRes.json().data.status).toBe('connected');
  });

  it('POST /connectors/:sourceId/integration-test — full test', async () => {
    wizardStore.getOrCreate('int-test-tenant');
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/connectors',
      headers: { 'x-tenant-id': 'int-test-tenant' },
      payload: { name: 'Webhook', type: 'webhook', url: 'https://hooks.test/in' },
    });
    const sourceId = addRes.json().data.id;
    const testRes = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/connectors/${sourceId}/integration-test`,
      headers: { 'x-tenant-id': 'int-test-tenant' },
    });
    expect(testRes.statusCode).toBe(200);
    expect(testRes.json().data.success).toBe(true);
    expect(testRes.json().data.steps.length).toBeGreaterThan(0);
  });

  it('GET /connectors/:sourceId/test-result — returns null for untested', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/connectors/nonexistent/test-result',
      headers: { 'x-tenant-id': 'conn-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });
});
