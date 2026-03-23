import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Health routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      config: {
        TI_NODE_ENV: 'test',
        TI_USER_MANAGEMENT_PORT: 0,
        TI_USER_MANAGEMENT_HOST: '127.0.0.1',
        TI_REDIS_URL: 'redis://localhost:6379',
        TI_JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars',
        TI_SERVICE_JWT_SECRET: 'test-service-secret-16',
        TI_CORS_ORIGINS: 'http://localhost:3002',
        TI_RATE_LIMIT_MAX: 200,
        TI_RATE_LIMIT_WINDOW_MS: 60000,
        TI_LOG_LEVEL: 'silent',
        TI_MFA_ISSUER: 'ETIP Test',
        TI_MFA_BACKUP_CODE_COUNT: 10,
        TI_BREAK_GLASS_SESSION_TTL_MIN: 30,
        TI_SSO_CALLBACK_BASE_URL: 'http://localhost:3016',
      },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('user-management-service');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /ready', () => {
    it('returns 200 with ready status', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ready');
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/nonexistent' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
