/**
 * @module api-gateway/tests/auth-verification
 * @description Integration tests for POST /verify-email and POST /resend-verification.
 * Split out of auth.integration.test.ts to stay under the 400-line file limit.
 * Mocks the UserService/verifyEmail/resendVerification exports of @etip/user-service.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';

const mockVerifyEmail = vi.fn().mockResolvedValue({ message: 'Email verified. You can now log in.' });
const mockResendVerification = vi.fn().mockResolvedValue({
  message: 'If that email exists and is unverified, a new verification link has been sent.',
});

vi.mock('@etip/user-service', () => ({
  UserService: vi.fn().mockImplementation(() => ({})),
  verifyEmail: mockVerifyEmail,
  resendVerification: mockResendVerification,
  prisma: { $disconnect: vi.fn() },
  disconnectPrisma: vi.fn(),
}));

// auth.ts statically imports email-queue.js, so its mock factory runs at module-load
// time — the referenced mock fn must come from vi.hoisted() to avoid a TDZ error.
const { mockEnqueueEmailJob } = vi.hoisted(() => ({ mockEnqueueEmailJob: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/routes/email-queue.js', () => ({
  enqueueEmailJob: mockEnqueueEmailJob,
}));

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { authRoutes } from '../src/routes/auth.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

async function buildIntegrationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: ['https://intelwatch.in', 'http://localhost:3002'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Service-Token'],
  });
  await app.register(rateLimit, { max: 100, timeWindow: 60000 });
  await app.register(sensible);
  registerErrorHandler(app);

  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  await app.ready();
  return app;
}

describe('Auth Verification Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    loadJwtConfig(TEST_JWT_ENV);
    app = await buildIntegrationApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyEmail.mockResolvedValue({ message: 'Email verified. You can now log in.' });
    mockResendVerification.mockResolvedValue({
      message: 'If that email exists and is unverified, a new verification link has been sent.',
    });
    mockEnqueueEmailJob.mockResolvedValue(undefined);
  });

  // ── POST /verify-email ─────────────────────────────────────────────

  describe('POST /verify-email', () => {
    const VALID_TOKEN = 'b'.repeat(64);

    it('200 with a valid 64-hex token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/verify-email', payload: { token: VALID_TOKEN },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.message).toBe('Email verified. You can now log in.');
      expect(mockVerifyEmail).toHaveBeenCalledWith(VALID_TOKEN, expect.any(String), expect.any(String));
    });

    it.each([
      ['too short', 'abc123'],
      ['uppercase', 'A'.repeat(64)],
      ['non-hex', 'z'.repeat(64)],
    ])('400 for a %s token, verifyEmail not called', async (_label, token) => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(mockVerifyEmail).not.toHaveBeenCalled();
    });

    it('404 passthrough when verifyEmail rejects with INVALID_TOKEN', async () => {
      mockVerifyEmail.mockRejectedValue(new AppError(404, 'Invalid verification token', 'INVALID_TOKEN'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token: VALID_TOKEN } });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('INVALID_TOKEN');
    });

    it('410 passthrough when verifyEmail rejects with TOKEN_EXPIRED', async () => {
      mockVerifyEmail.mockRejectedValue(new AppError(410, 'Verification token has expired.', 'TOKEN_EXPIRED'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token: VALID_TOKEN } });
      expect(res.statusCode).toBe(410);
      expect(res.json().error.code).toBe('TOKEN_EXPIRED');
    });
  });

  // ── POST /resend-verification ──────────────────────────────────────

  describe('POST /resend-verification', () => {
    const GENERIC_MESSAGE = 'If that email exists and is unverified, a new verification link has been sent.';
    const queuePayload = {
      queue: 'etip-email-send',
      data: { type: 'email_verification', userId: 'u-002', email: 'unverified@acme.com', token: 'c'.repeat(64), tenantName: 'ACME' },
    };

    it('200 with exactly { data: { message } } — no token/_tokenForTesting/_queuePayload in the body', async () => {
      mockResendVerification.mockResolvedValue({
        message: GENERIC_MESSAGE, _tokenForTesting: 'c'.repeat(64), _queuePayload: queuePayload,
      });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/resend-verification', payload: { email: 'unverified@acme.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { message: GENERIC_MESSAGE } });
      expect(res.body).not.toContain('c'.repeat(64));
      expect(mockEnqueueEmailJob).toHaveBeenCalledWith(queuePayload);
    });

    it('enqueue not called when _queuePayload absent (unknown/already-verified email)', async () => {
      mockResendVerification.mockResolvedValue({ message: GENERIC_MESSAGE });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/resend-verification', payload: { email: 'nobody@acme.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { message: GENERIC_MESSAGE } });
      expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    });

    it('still 200 with the generic message when enqueue rejects', async () => {
      mockResendVerification.mockResolvedValue({ message: GENERIC_MESSAGE, _queuePayload: queuePayload });
      mockEnqueueEmailJob.mockRejectedValue(new Error('redis down'));
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/resend-verification', payload: { email: 'unverified@acme.com' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { message: GENERIC_MESSAGE } });
    });

    it('429 passthrough on rate limit', async () => {
      mockResendVerification.mockRejectedValue(
        new AppError(429, 'Please wait 5 minutes before requesting another verification email', 'RATE_LIMITED'),
      );
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/resend-verification', payload: { email: 'unverified@acme.com' },
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('RATE_LIMITED');
    });

    it('400 on invalid email', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/resend-verification', payload: { email: 'not-an-email' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(mockResendVerification).not.toHaveBeenCalled();
    });
  });
});
