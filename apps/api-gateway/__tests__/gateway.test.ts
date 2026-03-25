import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadJwtConfig, signAccessToken, signRefreshToken } from '@etip/shared-auth';
import { authenticate, getUser } from '../src/plugins/auth.js';
import { rbac, rbacAll, rbacAny } from '../src/plugins/rbac.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { healthRoutes } from '../src/routes/health.js';
import { loadConfig } from '../src/config.js';
import { AppError } from '@etip/shared-utils';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const ANALYST_PARAMS = {
  userId: '550e8400-e29b-41d4-a716-446655440001',
  tenantId: '550e8400-e29b-41d4-a716-446655440002',
  email: 'analyst@acme.com',
  role: 'analyst' as const,
  sessionId: '550e8400-e29b-41d4-a716-446655440003',
};

const VIEWER_PARAMS = {
  userId: '550e8400-e29b-41d4-a716-446655440004',
  tenantId: '550e8400-e29b-41d4-a716-446655440002',
  email: 'viewer@acme.com',
  role: 'viewer' as const,
  sessionId: '550e8400-e29b-41d4-a716-446655440005',
};

const ADMIN_PARAMS = {
  userId: '550e8400-e29b-41d4-a716-446655440006',
  tenantId: '550e8400-e29b-41d4-a716-446655440002',
  email: 'admin@acme.com',
  role: 'tenant_admin' as const,
  sessionId: '550e8400-e29b-41d4-a716-446655440007',
};

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(healthRoutes);

  // Auth middleware test endpoints
  app.get('/test/protected', { preHandler: [authenticate] }, async (req) => {
    const user = getUser(req);
    return { userId: user.sub, role: user.role, tenantId: user.tenantId };
  });

  // rbac() test endpoints
  app.get('/test/ioc-read', { preHandler: [authenticate, rbac('ioc:read')] }, async () => ({ access: 'granted' }));
  app.get('/test/ioc-delete', { preHandler: [authenticate, rbac('ioc:delete')] }, async () => ({ access: 'granted' }));
  app.get('/test/admin-write', { preHandler: [authenticate, rbac('admin:write')] }, async () => ({ access: 'granted' }));

  // Matrix #79: rbacAll() — requires BOTH ioc:read AND ioc:create
  app.get('/test/rbac-all', { preHandler: [authenticate, rbacAll(['ioc:read', 'ioc:create'])] }, async () => ({ access: 'granted' }));

  // Matrix #80: rbacAny() — requires EITHER admin:write OR dashboard:read
  app.get('/test/rbac-any', { preHandler: [authenticate, rbacAny(['admin:write', 'dashboard:read'])] }, async () => ({ access: 'granted' }));

  // Auth-required endpoints (simulate /logout and /me without user-service)
  app.post('/test/logout', { preHandler: [authenticate] }, async (_req, reply) => reply.status(204).send());
  app.get('/test/me', { preHandler: [authenticate] }, async (req) => {
    const user = getUser(req);
    return { id: user.sub, email: user.email, role: user.role };
  });

  // Error test endpoints
  app.get('/test/app-error', async () => { throw new AppError(422, 'Custom error', 'CUSTOM_CODE', { field: 'value' }); });
  app.get('/test/unknown-error', async () => { throw new Error('Something unexpected'); });
  app.get('/test/zod-error', async () => {
    const { z } = await import('zod');
    z.object({ email: z.string().email() }).parse({ email: 'not-an-email' });
  });

  await app.ready();
  return app;
}

describe('API Gateway', () => {
  let app: FastifyInstance;
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildTestApp(); });

  // ── Matrix #62-65: Health Endpoint Tests ──────────────────────────

  describe('GET /health', () => {
    it('#62: returns 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
    });
    it('#64: health includes timestamp', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(body.timestamp).toBeTruthy();
      expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    });
    it('#65: health includes service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = res.json();
      expect(body.service).toBe('api-gateway');
      expect(body.version).toBe('1.0.0');
    });
    it('health does not require authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /ready (#63)', () => {
    it('returns 200 with server check', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(res.json().checks.server).toBe('ok');
    });
  });

  // ── Matrix #73, #75: Auth-Required Endpoint Tests ─────────────────

  describe('auth-required endpoints', () => {
    it('#73: POST /logout requires auth — returns 401 without token', async () => {
      const res = await app.inject({ method: 'POST', url: '/test/logout' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
    it('#75: GET /me requires auth — returns 401 without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
    it('#73: POST /logout with valid token returns 204', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'POST', url: '/test/logout', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(204);
    });
    it('#75: GET /me with valid token returns user', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/me', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe('analyst@acme.com');
    });
  });

  // ── Matrix #76-77: Auth Middleware Tests ───────────────────────────

  describe('authenticate middleware', () => {
    it('#76: grants access with valid access token', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.userId).toBe(ANALYST_PARAMS.userId);
      expect(body.role).toBe('analyst');
      expect(body.tenantId).toBe(ANALYST_PARAMS.tenantId);
    });
    it('#77: rejects missing Authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/protected' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
    it('#77: rejects non-Bearer format', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: 'Basic abc123' } });
      expect(res.statusCode).toBe(401);
    });
    it('#77: rejects invalid JWT', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: 'Bearer invalid.jwt.token' } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_TOKEN');
    });
    it('rejects refresh token used as access token', async () => {
      const refreshToken = signRefreshToken({ userId: ANALYST_PARAMS.userId, tenantId: ANALYST_PARAMS.tenantId, sessionId: ANALYST_PARAMS.sessionId });
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: `Bearer ${refreshToken}` } });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Matrix #78-80: RBAC Middleware Tests ───────────────────────────

  describe('rbac middleware', () => {
    it('#78: rbac() blocks unauthorized — analyst cannot delete IOCs', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-delete', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });
    it('#78: rbac() grants authorized — analyst can read IOCs', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-read', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });
    it('#78: super_admin bypasses all rbac checks', async () => {
      const superToken = signAccessToken({ ...ANALYST_PARAMS, role: 'super_admin' });
      const res = await app.inject({ method: 'GET', url: '/test/admin-write', headers: { authorization: `Bearer ${superToken}` } });
      expect(res.statusCode).toBe(200);
    });
    it('#78: 403 includes role and required permission', async () => {
      const token = signAccessToken(VIEWER_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-delete', headers: { authorization: `Bearer ${token}` } });
      expect(res.json().error.details.role).toBe('viewer');
      expect(res.json().error.details.required).toBe('ioc:delete');
    });

    // Matrix #79: rbacAll() — AND logic
    it('#79: rbacAll() — analyst has ioc:read AND ioc:create → passes', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/rbac-all', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });
    it('#79: rbacAll() — viewer has ioc:read but NOT ioc:create → 403', async () => {
      const token = signAccessToken(VIEWER_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/rbac-all', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });

    // Matrix #80: rbacAny() — OR logic
    it('#80: rbacAny() — viewer has dashboard:read → passes', async () => {
      const token = signAccessToken(VIEWER_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/rbac-any', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });
    it('#80: rbacAny() — api_only has neither admin:write nor dashboard:read → 403', async () => {
      const token = signAccessToken({ ...ANALYST_PARAMS, role: 'api_only' });
      const res = await app.inject({ method: 'GET', url: '/test/rbac-any', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Matrix #91-94: Error Handler Tests ────────────────────────────

  describe('error handler', () => {
    it('#91: formats AppError with code, message, details', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/app-error' });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe('CUSTOM_CODE');
      expect(body.error.message).toBe('Custom error');
      expect(body.error.details.field).toBe('value');
    });
    it('#91: Zod validation error returns 400 with details', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/zod-error' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(res.json().error.details).toBeDefined();
    });
    it('#94: catches unknown errors as 500', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/unknown-error' });
      expect(res.statusCode).toBe(500);
      expect(res.json().error.code).toBe('INTERNAL_ERROR');
      expect(res.json().error.message).toBe('An unexpected error occurred');
    });
    it('returns 404 for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });
  });

  // ── Rate Limit 429 Test ───────────────────────────────────────────

  describe('rate limiting', () => {
    it('returns 429 after exceeding rate limit', async () => {
      // Build a separate app with very low rate limit for testing
      const rateLimitApp = Fastify({ logger: false });
      registerErrorHandler(rateLimitApp);
      await rateLimitApp.register(rateLimit, { max: 3, timeWindow: 60000 });
      rateLimitApp.get('/test/limited', async () => ({ ok: true }));
      await rateLimitApp.ready();

      // Make requests up to the limit
      for (let i = 0; i < 3; i++) {
        const res = await rateLimitApp.inject({ method: 'GET', url: '/test/limited' });
        expect(res.statusCode).toBe(200);
      }

      // Next request should be rate limited
      const blocked = await rateLimitApp.inject({ method: 'GET', url: '/test/limited' });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('RATE_LIMITED');

      await rateLimitApp.close();
    });
  });

  // ── CORS Headers Test ─────────────────────────────────────────────

  describe('CORS headers', () => {
    it('returns Access-Control-Allow-Origin for allowed origin', async () => {
      const corsApp = Fastify({ logger: false });
      await corsApp.register(cors, {
        origin: ['https://ti.intelwatch.in'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Service-Token'],
      });
      corsApp.get('/test/cors', async () => ({ ok: true }));
      await corsApp.ready();

      const res = await corsApp.inject({
        method: 'GET',
        url: '/test/cors',
        headers: { origin: 'https://ti.intelwatch.in' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://ti.intelwatch.in');
      expect(res.headers['access-control-allow-credentials']).toBe('true');

      await corsApp.close();
    });

    it('handles OPTIONS preflight with correct headers', async () => {
      const corsApp = Fastify({ logger: false });
      await corsApp.register(cors, {
        origin: ['https://ti.intelwatch.in'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
      corsApp.get('/test/cors', async () => ({ ok: true }));
      await corsApp.ready();

      const res = await corsApp.inject({
        method: 'OPTIONS',
        url: '/test/cors',
        headers: {
          origin: 'https://ti.intelwatch.in',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Authorization',
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://ti.intelwatch.in');
      expect(res.headers['access-control-allow-methods']).toBeDefined();

      await corsApp.close();
    });
  });

  // ── Config Validation Tests ───────────────────────────────────────

  describe('config validation', () => {
    it('throws CONFIG_ERROR when TI_DATABASE_URL is missing', () => {
      expect(() => loadConfig({
        TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
        TI_SERVICE_JWT_SECRET: 'service-secret-16chars',
        TI_REDIS_URL: 'redis://localhost:6379',
        // TI_DATABASE_URL intentionally missing
      })).toThrow('Invalid environment configuration');
    });

    it('throws CONFIG_ERROR when TI_JWT_SECRET is too short', () => {
      expect(() => loadConfig({
        TI_DATABASE_URL: 'postgresql://localhost/test',
        TI_JWT_SECRET: 'short',
        TI_SERVICE_JWT_SECRET: 'service-secret-16chars',
        TI_REDIS_URL: 'redis://localhost:6379',
      })).toThrow('Invalid environment configuration');
    });

    it('throws CONFIG_ERROR when TI_REDIS_URL is missing', () => {
      expect(() => loadConfig({
        TI_DATABASE_URL: 'postgresql://localhost/test',
        TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
        TI_SERVICE_JWT_SECRET: 'service-secret-16chars',
        // TI_REDIS_URL intentionally missing
      })).toThrow('Invalid environment configuration');
    });

    it('loads valid config with defaults applied', () => {
      const config = loadConfig({
        TI_DATABASE_URL: 'postgresql://localhost/test',
        TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
        TI_SERVICE_JWT_SECRET: 'service-secret-16chars',
        TI_REDIS_URL: 'redis://localhost:6379',
      });
      expect(config.TI_API_PORT).toBe(3001);
      expect(config.TI_NODE_ENV).toBe('development');
      expect(config.TI_LOG_LEVEL).toBe('info');
      expect(config.TI_RATE_LIMIT_MAX_REQUESTS).toBe(200);
      expect(config.TI_RATE_LIMIT_WINDOW_MS).toBe(60000);
    });
  });
});
