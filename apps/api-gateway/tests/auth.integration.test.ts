import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig, signAccessToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';

const mockRegisterResult = { accessToken: 'mock-at', refreshToken: 'mock-rt', expiresIn: 900, user: { id: 'u1', email: 'test@acme.com', displayName: 'Test', role: 'tenant_admin', tenantId: 't1', avatarUrl: null }, tenant: { id: 't1', name: 'ACME', slug: 'acme', plan: 'free' } };
const mockLoginResult = { accessToken: 'mock-at', refreshToken: 'mock-rt', expiresIn: 900, user: { id: 'u1', email: 'test@acme.com', displayName: 'Test', role: 'tenant_admin', tenantId: 't1', avatarUrl: null } };
const mockRefreshResult = { accessToken: 'mock-new-at', refreshToken: 'mock-new-rt', expiresIn: 900 };
const mockProfile = { id: 'u1', email: 'test@acme.com', displayName: 'Test', role: 'tenant_admin', tenantId: 't1', avatarUrl: null };

const mockRegister = vi.fn().mockResolvedValue(mockRegisterResult);
const mockLogin = vi.fn().mockResolvedValue(mockLoginResult);
const mockRefreshTokens = vi.fn().mockResolvedValue(mockRefreshResult);
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockGetProfile = vi.fn().mockResolvedValue(mockProfile);

vi.mock('@etip/user-service', () => ({ UserService: vi.fn().mockImplementation(() => ({ register: mockRegister, login: mockLogin, refreshTokens: mockRefreshTokens, logout: mockLogout, getProfile: mockGetProfile })), prisma: { $disconnect: vi.fn() }, disconnectPrisma: vi.fn() }));

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { healthRoutes } from '../src/routes/health.js';
import { authRoutes } from '../src/routes/auth.js';

const TEST_JWT_ENV = { TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!', TI_JWT_ISSUER: 'test-issuer', TI_JWT_ACCESS_EXPIRY: '900', TI_JWT_REFRESH_EXPIRY: '604800' };
const TOKEN_PARAMS = { userId: 'u1', tenantId: 't1', email: 'test@acme.com', role: 'tenant_admin' as const, sessionId: 's1' };

async function buildIntegrationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: ['https://ti.intelwatch.in'], credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Request-ID','X-Service-Token'] });
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
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildIntegrationApp(); });
  beforeEach(() => { vi.clearAllMocks(); mockRegister.mockResolvedValue(mockRegisterResult); mockLogin.mockResolvedValue(mockLoginResult); mockRefreshTokens.mockResolvedValue(mockRefreshResult); mockLogout.mockResolvedValue(undefined); mockGetProfile.mockResolvedValue(mockProfile); });

  describe('full auth flow', () => {
    it('register -> login -> me -> refresh -> logout', async () => {
      const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'test@acme.com', password: 'SecurePassword123!', displayName: 'Test', tenantName: 'ACME', tenantSlug: 'acme' } });
      expect(reg.statusCode).toBe(201); expect(reg.json().data.accessToken).toBe('mock-at');
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'test@acme.com', password: 'SecurePassword123!' } });
      expect(login.statusCode).toBe(200);
      const token = signAccessToken(TOKEN_PARAMS);
      const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(200); expect(me.json().data.email).toBe('test@acme.com');
      const refresh = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: 'some-rt' } });
      expect(refresh.statusCode).toBe(200);
      const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { authorization: `Bearer ${token}` } });
      expect(logout.statusCode).toBe(204);
    });
  });

  describe('duplicate registration', () => {
    it('returns 409 for duplicate slug', async () => { mockRegister.mockRejectedValue(new AppError(409, 'Tenant slug already taken', 'CONFLICT')); const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'x@x.com', password: 'SecurePassword123!', displayName: 'X', tenantName: 'A', tenantSlug: 'a' } }); expect(r.statusCode).toBe(409); });
    it('returns 409 for duplicate email', async () => { mockRegister.mockRejectedValue(new AppError(409, 'Email already registered', 'CONFLICT')); const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'x@x.com', password: 'SecurePassword123!', displayName: 'X', tenantName: 'A', tenantSlug: 'a' } }); expect(r.statusCode).toBe(409); });
  });

  describe('invalid credentials', () => {
    it('returns 401 for wrong password', async () => { mockLogin.mockRejectedValue(new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')); const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'x@x.com', password: 'Wrong123!' } }); expect(r.statusCode).toBe(401); });
  });

  describe('auth enforcement', () => {
    it('401 on GET /me without token', async () => { const r = await app.inject({ method: 'GET', url: '/api/v1/auth/me' }); expect(r.statusCode).toBe(401); });
    it('401 on POST /logout without token', async () => { const r = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' }); expect(r.statusCode).toBe(401); });
    it('401 with invalid JWT', async () => { const r = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: 'Bearer bad.jwt' } }); expect(r.statusCode).toBe(401); });
  });

  describe('validation errors', () => {
    it('400 for invalid email', async () => { const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'not-email', password: 'SecurePassword123!', displayName: 'T', tenantName: 'T', tenantSlug: 'test' } }); expect(r.statusCode).toBe(400); });
    it('400 for short password', async () => { const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'x@x.com', password: 'short', displayName: 'T', tenantName: 'T', tenantSlug: 'test' } }); expect(r.statusCode).toBe(400); });
    it('400 for missing fields', async () => { const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'x@x.com' } }); expect(r.statusCode).toBe(400); });
    it('400 for invalid slug', async () => { const r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'x@x.com', password: 'SecurePassword123!', displayName: 'T', tenantName: 'T', tenantSlug: 'INVALID!!' } }); expect(r.statusCode).toBe(400); });
    it('400 for empty login body', async () => { const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} }); expect(r.statusCode).toBe(400); });
  });
});
