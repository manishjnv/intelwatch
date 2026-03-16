import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadJwtConfig, signAccessToken, signRefreshToken } from '@etip/shared-auth';
import { authenticate, getUser } from '../src/plugins/auth.js';
import { rbac } from '../src/plugins/rbac.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { healthRoutes } from '../src/routes/health.js';
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

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(healthRoutes);

  app.get('/test/protected', { preHandler: [authenticate] }, async (req) => {
    const user = getUser(req);
    return { userId: user.sub, role: user.role, tenantId: user.tenantId };
  });
  app.get('/test/ioc-read', { preHandler: [authenticate, rbac('ioc:read')] }, async () => ({ access: 'granted' }));
  app.get('/test/ioc-delete', { preHandler: [authenticate, rbac('ioc:delete')] }, async () => ({ access: 'granted' }));
  app.get('/test/admin-write', { preHandler: [authenticate, rbac('admin:write')] }, async () => ({ access: 'granted' }));
  app.get('/test/app-error', async () => { throw new AppError(422, 'Custom error', 'CUSTOM_CODE', { field: 'value' }); });
  app.get('/test/unknown-error', async () => { throw new Error('Something unexpected'); });

  await app.ready();
  return app;
}

describe('API Gateway', () => {
  let app: FastifyInstance;
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildTestApp(); });

  // Matrix #62-65: Health endpoint tests
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('api-gateway');
      expect(body.version).toBe('1.0.0');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.timestamp).toBeTruthy();
    });
    it('does not require authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /ready', () => {
    it('returns 200 with server check', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(res.json().checks.server).toBe('ok');
    });
  });

  // Matrix #76-77: Auth middleware tests
  describe('authenticate middleware', () => {
    it('grants access with valid access token', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.userId).toBe(ANALYST_PARAMS.userId);
      expect(body.role).toBe('analyst');
      expect(body.tenantId).toBe(ANALYST_PARAMS.tenantId);
    });
    it('rejects missing Authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/protected' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
    it('rejects non-Bearer format', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: 'Basic abc123' } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
    it('rejects empty Bearer token', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/protected', headers: { authorization: 'Bearer ' } });
      expect(res.statusCode).toBe(401);
    });
    it('rejects invalid JWT', async () => {
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

  // Matrix #78-80: RBAC middleware tests
  describe('rbac middleware', () => {
    it('analyst can read IOCs', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-read', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().access).toBe('granted');
    });
    it('viewer can read IOCs', async () => {
      const token = signAccessToken(VIEWER_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-read', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });
    it('analyst cannot delete IOCs', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-delete', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });
    it('viewer cannot delete IOCs', async () => {
      const token = signAccessToken(VIEWER_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-delete', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });
    it('analyst cannot access admin:write', async () => {
      const token = signAccessToken(ANALYST_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/admin-write', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });
    it('super_admin can access everything', async () => {
      const superToken = signAccessToken({ ...ANALYST_PARAMS, role: 'super_admin' });
      const res = await app.inject({ method: 'GET', url: '/test/admin-write', headers: { authorization: `Bearer ${superToken}` } });
      expect(res.statusCode).toBe(200);
    });
    it('includes role and required permission in 403 details', async () => {
      const token = signAccessToken(VIEWER_PARAMS);
      const res = await app.inject({ method: 'GET', url: '/test/ioc-delete', headers: { authorization: `Bearer ${token}` } });
      const body = res.json();
      expect(body.error.details.role).toBe('viewer');
      expect(body.error.details.required).toBe('ioc:delete');
    });
  });

  // Matrix #91-94: Error handler tests
  describe('error handler', () => {
    it('formats AppError correctly', async () => {
      const res = await app.inject({ method: 'GET', url: '/test/app-error' });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe('CUSTOM_CODE');
      expect(body.error.message).toBe('Custom error');
      expect(body.error.details.field).toBe('value');
    });
    it('catches unknown errors as 500', async () => {
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
});
