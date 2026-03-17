/**
 * @module @etip/shared-auth/__tests__/service-jwt.test
 * @description Tests for service-to-service JWT tokens.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  loadServiceJwtSecret,
  signServiceToken,
  verifyServiceToken,
} from '../src/service-jwt.js';

const TEST_ENV = {
  TI_SERVICE_JWT_SECRET: 'test-service-secret-16+',
};

describe('Service JWT', () => {
  describe('loadServiceJwtSecret', () => {
    it('loads secret from environment', () => {
      expect(() => loadServiceJwtSecret(TEST_ENV)).not.toThrow();
    });

    it('throws if TI_SERVICE_JWT_SECRET is missing', () => {
      expect(() => loadServiceJwtSecret({})).toThrow(
        'TI_SERVICE_JWT_SECRET must be at least 16 characters'
      );
    });

    it('throws if TI_SERVICE_JWT_SECRET is too short', () => {
      expect(() =>
        loadServiceJwtSecret({ TI_SERVICE_JWT_SECRET: 'short' })
      ).toThrow('TI_SERVICE_JWT_SECRET must be at least 16 characters');
    });
  });

  describe('signServiceToken + verifyServiceToken', () => {
    beforeAll(() => {
      loadServiceJwtSecret(TEST_ENV);
    });

    it('signs and verifies a service token', () => {
      const token = signServiceToken('enrichment-service', 'graph-service');
      expect(token).toBeTruthy();

      const payload = verifyServiceToken(token);
      expect(payload.iss).toBe('enrichment-service');
      expect(payload.aud).toBe('graph-service');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('token expires within ~60 seconds', () => {
      const token = signServiceToken('svc-a', 'svc-b');
      const payload = verifyServiceToken(token);
      const ttl = payload.exp - payload.iat;
      expect(ttl).toBe(60);
    });

    it('verifies with expected issuer', () => {
      const token = signServiceToken('enrichment-service', 'graph-service');
      const payload = verifyServiceToken(token, 'enrichment-service');
      expect(payload.iss).toBe('enrichment-service');
    });

    it('rejects wrong issuer when expectedIssuer is set', () => {
      const token = signServiceToken('enrichment-service', 'graph-service');
      expect(() =>
        verifyServiceToken(token, 'wrong-service')
      ).toThrow('Unexpected service issuer');
    });

    it('rejects tampered token', () => {
      const token = signServiceToken('svc-a', 'svc-b');
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyServiceToken(tampered)).toThrow('Invalid service token');
    });

    it('rejects empty token', () => {
      expect(() => verifyServiceToken('')).toThrow();
    });

    it('returns SERVICE_AUTH_FAILED code for wrong issuer', () => {
      const token = signServiceToken('svc-a', 'svc-b');
      try {
        verifyServiceToken(token, 'expected-svc');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { code: string; statusCode: number };
        expect(e.code).toBe('SERVICE_AUTH_FAILED');
        expect(e.statusCode).toBe(403);
      }
    });

    it('returns SERVICE_TOKEN_INVALID code for garbage', () => {
      try {
        verifyServiceToken('garbage.token.here');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { code: string; statusCode: number };
        expect(e.code).toBe('SERVICE_TOKEN_INVALID');
        expect(e.statusCode).toBe(401);
      }
    });
  });
});
