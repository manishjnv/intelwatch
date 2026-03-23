import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { IntegrationConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

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
  TI_INTEGRATION_SIEM_RETRY_MAX: 3,
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 2000,
  TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 10000,
  TI_INTEGRATION_WEBHOOK_MAX_PER_TENANT: 10,
  TI_INTEGRATION_TAXII_PAGE_SIZE: 100,
  TI_IOC_SERVICE_URL: 'http://localhost:3007',
  TI_GRAPH_SERVICE_URL: 'http://localhost:3012',
  TI_CORRELATION_SERVICE_URL: 'http://localhost:3013',
};

describe('Integration Service — Health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ config: TEST_CONFIG });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('integration-service');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /ready returns status ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
