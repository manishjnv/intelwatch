import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadJwtConfig, getJwtConfig, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/jwt.js';
import type { SignAccessTokenParams } from '../src/jwt.js';

const TEST_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const SAMPLE_PARAMS: SignAccessTokenParams = {
  userId: '550e8400-e29b-41d4-a716-446655440001',
  tenantId: '550e8400-e29b-41d4-a716-446655440002',
  email: 'analyst@acme.com',
  role: 'analyst',
  sessionId: '550e8400-e29b-41d4-a716-446655440003',
};

describe('JWT Module', () => {
  describe('loadJwtConfig', () => {
    it('loads config from environment variables', () => {
      const config = loadJwtConfig(TEST_ENV);
      expect(config.secret).toBe(TEST_ENV.TI_JWT_SECRET);
      expect(config.issuer).toBe('test-issuer');
      expect(config.accessExpirySeconds).toBe(900);
      expect(config.refreshExpirySeconds).toBe(604800);
    });
    it('throws if TI_JWT_SECRET is missing', () => { expect(() => loadJwtConfig({})).toThrow('TI_JWT_SECRET must be at least 32 characters'); });
    it('throws if TI_JWT_SECRET is too short', () => { expect(() => loadJwtConfig({ TI_JWT_SECRET: 'short' })).toThrow('TI_JWT_SECRET must be at least 32 characters'); });
    it('uses default issuer when TI_JWT_ISSUER not set', () => { expect(loadJwtConfig({ TI_JWT_SECRET: TEST_ENV.TI_JWT_SECRET }).issuer).toBe('intelwatch-etip'); });
    it('uses default expiry values when not set', () => { const config = loadJwtConfig({ TI_JWT_SECRET: TEST_ENV.TI_JWT_SECRET }); expect(config.accessExpirySeconds).toBe(900); expect(config.refreshExpirySeconds).toBe(604800); });
  });

  describe('signAccessToken + verifyAccessToken', () => {
    beforeAll(() => { loadJwtConfig(TEST_ENV); });
    it('signs and verifies a valid access token', () => {
      const token = signAccessToken(SAMPLE_PARAMS);
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
      const payload = verifyAccessToken(token);
      expect(payload.sub).toBe(SAMPLE_PARAMS.userId);
      expect(payload.tenantId).toBe(SAMPLE_PARAMS.tenantId);
      expect(payload.email).toBe(SAMPLE_PARAMS.email);
      expect(payload.role).toBe(SAMPLE_PARAMS.role);
      expect(payload.sessionId).toBe(SAMPLE_PARAMS.sessionId);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
    it('rejects a tampered token', () => { expect(() => verifyAccessToken(signAccessToken(SAMPLE_PARAMS).slice(0, -5) + 'XXXXX')).toThrow('Invalid access token'); });
    it('rejects an expired token', async () => {
      loadJwtConfig({ ...TEST_ENV, TI_JWT_ACCESS_EXPIRY: '1' });
      const token = signAccessToken(SAMPLE_PARAMS);
      await new Promise((r) => setTimeout(r, 1100));
      expect(() => verifyAccessToken(token)).toThrow('expired');
      loadJwtConfig(TEST_ENV);
    });
    it('rejects a token signed with a different secret', () => {
      const token = signAccessToken(SAMPLE_PARAMS);
      loadJwtConfig({ ...TEST_ENV, TI_JWT_SECRET: 'different-secret-key-at-least-32-characters!!' });
      expect(() => verifyAccessToken(token)).toThrow();
      loadJwtConfig(TEST_ENV);
    });
    it('rejects a refresh token used as access token', () => {
      const refreshToken = signRefreshToken({ userId: SAMPLE_PARAMS.userId, tenantId: SAMPLE_PARAMS.tenantId, sessionId: SAMPLE_PARAMS.sessionId });
      expect(() => verifyAccessToken(refreshToken)).toThrow('Refresh token cannot be used as access token');
    });
    it('rejects empty string', () => { expect(() => verifyAccessToken('')).toThrow(); });
    it('rejects garbage string', () => { expect(() => verifyAccessToken('not.a.jwt')).toThrow(); });
  });

  describe('signRefreshToken + verifyRefreshToken', () => {
    beforeAll(() => { loadJwtConfig(TEST_ENV); });
    it('signs and verifies a valid refresh token', () => {
      const token = signRefreshToken({ userId: SAMPLE_PARAMS.userId, tenantId: SAMPLE_PARAMS.tenantId, sessionId: SAMPLE_PARAMS.sessionId });
      const payload = verifyRefreshToken(token);
      expect(payload.sub).toBe(SAMPLE_PARAMS.userId);
      expect(payload.tenantId).toBe(SAMPLE_PARAMS.tenantId);
      expect(payload.sessionId).toBe(SAMPLE_PARAMS.sessionId);
      expect(payload.type).toBe('refresh');
    });
    it('rejects an access token used as refresh token', () => { expect(() => verifyRefreshToken(signAccessToken(SAMPLE_PARAMS))).toThrow('Not a refresh token'); });
    it('rejects a tampered refresh token', () => {
      const token = signRefreshToken({ userId: SAMPLE_PARAMS.userId, tenantId: SAMPLE_PARAMS.tenantId, sessionId: SAMPLE_PARAMS.sessionId });
      expect(() => verifyRefreshToken(token.slice(0, -5) + 'ZZZZZ')).toThrow('Invalid refresh token');
    });
    // Matrix #19: Refresh tokens have longer expiry than access tokens
    it('refresh token expiry is longer than access token expiry', () => {
      const accessToken = signAccessToken(SAMPLE_PARAMS);
      const refreshToken = signRefreshToken({ userId: SAMPLE_PARAMS.userId, tenantId: SAMPLE_PARAMS.tenantId, sessionId: SAMPLE_PARAMS.sessionId });
      const accessPayload = verifyAccessToken(accessToken);
      const refreshPayload = verifyRefreshToken(refreshToken);
      expect(refreshPayload.exp).toBeGreaterThan(accessPayload.exp);
    });
    // Matrix #20: Access and refresh tokens are structurally different
    it('access and refresh tokens have different structure', () => {
      const accessToken = signAccessToken(SAMPLE_PARAMS);
      const refreshToken = signRefreshToken({ userId: SAMPLE_PARAMS.userId, tenantId: SAMPLE_PARAMS.tenantId, sessionId: SAMPLE_PARAMS.sessionId });
      expect(accessToken).not.toBe(refreshToken);
      expect(verifyRefreshToken(refreshToken).type).toBe('refresh');
    });
  });

  describe('getJwtConfig', () => { it('returns the current config', () => { loadJwtConfig(TEST_ENV); expect(getJwtConfig().issuer).toBe('test-issuer'); }); });

  describe('error codes', () => {
    beforeEach(() => { loadJwtConfig(TEST_ENV); });
    it('returns TOKEN_EXPIRED code for expired access token', async () => {
      loadJwtConfig({ ...TEST_ENV, TI_JWT_ACCESS_EXPIRY: '1' });
      const token = signAccessToken(SAMPLE_PARAMS);
      await new Promise((r) => setTimeout(r, 1100));
      try { verifyAccessToken(token); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { code: string; statusCode: number }; expect(e.code).toBe('TOKEN_EXPIRED'); expect(e.statusCode).toBe(401); }
      loadJwtConfig(TEST_ENV);
    });
    it('returns INVALID_TOKEN code for malformed access token', () => {
      try { verifyAccessToken('garbage'); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { code: string; statusCode: number }; expect(e.code).toBe('INVALID_TOKEN'); expect(e.statusCode).toBe(401); }
    });
  });
});
