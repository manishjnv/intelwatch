import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Health endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      config: {
        TI_NODE_ENV: 'test',
        TI_ONBOARDING_PORT: 0,
        TI_ONBOARDING_HOST: '127.0.0.1',
        TI_REDIS_URL: 'redis://localhost:6379/0',
        TI_JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!!',
        TI_SERVICE_JWT_SECRET: 'test-service-secret!!',
        TI_CORS_ORIGINS: '*',
        TI_RATE_LIMIT_WINDOW_MS: 60000,
        TI_RATE_LIMIT_MAX: 1000,
        TI_LOG_LEVEL: 'silent',
      },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('onboarding-service');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /ready returns ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ready');
  });

  it('GET /unknown returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
