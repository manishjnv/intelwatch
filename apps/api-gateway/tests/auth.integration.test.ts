/**
 * @module api-gateway/tests/auth.integration
 * @description Integration tests for auth routes.
 * Tests the REAL Fastify app with all middleware (helmet, cors, rate-limit,
 * error handler) and REAL auth routes. Mocks the UserService to control
 * DB interactions while testing the full gateway stack.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig, signAccessToken, signRefreshToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';

// ── Mock user-service — Prisma layer is replaced ─────────────────────
const mockRegisterResult = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
  user: { id: 'u-001', email: 'test@acme.com', displayName: 'Test User', role: 'tenant_admin', tenantId: 't-001', avatarUrl: null },
  tenant: { id: 't-001', name: 'ACME', slug: 'acme', plan: 'free' },
};

const mockLoginResult = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
  user: { id: 'u-001', email: 'test@acme.com', displayName: 'Test User', role: 'tenant_admin', tenantId: 't-001', avatarUrl: null },
};

const mockRefreshResult = {
  accessToken: 'mock-new-access',
  refreshToken: 'mock-new-refresh',
  expiresIn: 900,
};

const mockProfile = {
  id: 'u-001', email: 'test@acme.com', displayName: 'Test User',
  role: 'tenant_admin', tenantId: 't-001', avatarUrl: null,
};

const mockRegister = vi.fn().mockResolvedValue(mockRegisterResult);
const mockLogin = vi.fn().mockResolvedValue(mockLoginResult);
const mockRefreshTokens = vi.fn().mockResolvedValue(mockRefreshResult);
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);

vi.mock('@etip/user-service', () => ({
  UserService: vi.fn().mockImplementation(() => ({
    register: mockRegister,
    login: mockLogin,
    refreshTokens: mockRefreshTokens,
    logout: mockLogout,
    getProfile: mockGetProfile,
  })),
  prisma: { $disconnect: vi.fn() },
  disconnectPrisma: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { healthRoutes } from '../src/routes/health.js';
import { authRoutes } from '../src/routes/auth.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const TOKEN_PARAMS = {
  userId: 'u-001',
  tenantId: 't-001',
  email: 'test@acme.com',
  role: 'tenant_admin' as const,
  sessionId: 's-001',
};

async function buildIntegrationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: ['https://ti.intelwatch.in', 'http://localhost:3002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Service-Token'],
  });
  await app.register(rateLimit, { max: 100, timeWindow: 60000 });
  await app.register(sensible);
  registerErrorHandler(app);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  await app.ready();
  return app;
}

describe('Auth Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    loadJwtConfig(TEST_JWT_ENV);
    app = await buildIntegrationApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue(mockRegisterResult);
    mockLogin.mockResolvedValue(mockLoginResult);
    mockRefreshTokens.mockResolvedValue(mockRefreshResult);
    mockLogout.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue(mockProfile);
  });

  // ── Full Auth Flow ─────────────────────────────────────────────────

  describe('full auth flow: register → login → GET /me → refresh → logout', () => {
    it('completes the entire auth lifecycle', async () => {
      // 1. Register
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@acme.com',
          password: 'SecurePassword123!',
          displayName: 'Test User',
          tenantName: 'ACME',
          tenantSlug: 'acme',
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regBody = regRes.json();
      expect(regBody.data.accessToken).toBe('mock-access-token');
      expect(regBody.data.user.email).toBe('test@acme.com');
      expect(regBody.data.tenant.slug).toBe('acme');
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@acme.com', tenantSlug: 'acme' }),
      );

      // 2. Login
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@acme.com', password: 'SecurePassword123!' },
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().data.accessToken).toBe('mock-access-token');
      expect(mockLogin).toHaveBeenCalledOnce();

      // 3. GET /me (with real JWT)
      const accessToken = signAccessToken(TOKEN_PARAMS);
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json().data.email).toBe('test@acme.com');
      expect(mockGetProfile).toHaveBeenCalledWith('u-001', 't-001');

      // 4. Refresh
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'some-refresh-token' },
      });
      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.json().data.accessToken).toBe('mock-new-access');
      expect(mockRefreshTokens).toHaveBeenCalledOnce();

      // 5. Logout
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(logoutRes.statusCode).toBe(204);
      expect(mockLogout).toHaveBeenCalledWith('s-001');
    });
  });

  // ── Duplicate Registration → 409 ──────────────────────────────────

  describe('duplicate registration', () => {
    it('returns 409 for duplicate tenant slug', async () => {
      mockRegister.mockRejectedValue(new AppError(409, 'Tenant slug already taken', 'CONFLICT'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'dup@acme.com', password: 'SecurePassword123!',
          displayName: 'Dup User', tenantName: 'ACME', tenantSlug: 'acme',
        },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('returns 409 for duplicate email', async () => {
      mockRegister.mockRejectedValue(new AppError(409, 'Email already registered', 'CONFLICT'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'dup@acme.com', password: 'SecurePassword123!',
          displayName: 'Dup User', tenantName: 'Other', tenantSlug: 'other',
        },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });
  });

  // ── Invalid Credentials → 401 ─────────────────────────────────────

  describe('invalid credentials', () => {
    it('returns 401 for wrong password', async () => {
      mockLogin.mockRejectedValue(new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@acme.com', password: 'WrongPassword123!' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  // ── Missing Auth on Protected Endpoint → 401 ──────────────────────

  describe('auth enforcement', () => {
    it('returns 401 on GET /me without token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 on POST /logout without token', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with invalid JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer totally.invalid.token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_TOKEN');
    });
  });

  // ── Validation Errors → 400 ───────────────────────────────────────

  describe('validation errors', () => {
    it('returns 400 for invalid email in register', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'not-an-email', password: 'SecurePassword123!',
          displayName: 'Test', tenantName: 'Test', tenantSlug: 'test',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for short password in register (< 12 chars)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@test.com', password: 'short',
          displayName: 'Test', tenantName: 'Test', tenantSlug: 'test',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing required fields in register', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'test@test.com' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid tenant slug format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@test.com', password: 'SecurePassword123!',
          displayName: 'Test', tenantName: 'Test', tenantSlug: 'INVALID_SLUG!!',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for empty login body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });
});
