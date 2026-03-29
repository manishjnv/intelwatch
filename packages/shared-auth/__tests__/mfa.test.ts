import { describe, it, expect, beforeAll } from 'vitest';
import {
  loadJwtConfig,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  signMfaSetupToken,
  verifyMfaSetupToken,
} from '../src/index.js';

const TEST_SECRET = 'test-secret-key-at-least-32-characters-long!!';

beforeAll(() => {
  loadJwtConfig({
    TI_JWT_SECRET: TEST_SECRET,
    TI_JWT_ISSUER: 'test-issuer',
  });
});

describe('MFA Challenge Token', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440020';
  const tenantId = '550e8400-e29b-41d4-a716-446655440010';

  it('signs and verifies a challenge token', () => {
    const token = signMfaChallengeToken(userId, tenantId, TEST_SECRET);
    expect(token).toBeTruthy();

    const payload = verifyMfaChallengeToken(token, TEST_SECRET);
    expect(payload.sub).toBe(userId);
    expect(payload.tenantId).toBe(tenantId);
    expect(payload.purpose).toBe('mfa_challenge');
  });

  it('rejects token with wrong secret', () => {
    const token = signMfaChallengeToken(userId, tenantId, TEST_SECRET);
    expect(() => verifyMfaChallengeToken(token, 'wrong-secret-that-is-32-chars-long!!!'))
      .toThrow('Invalid MFA challenge token');
  });

  it('rejects non-MFA token', async () => {
    const jwt = await import('jsonwebtoken');
    const fakeToken = jwt.default.sign(
      { sub: userId, tenantId, purpose: 'other' },
      TEST_SECRET,
      { expiresIn: 300, issuer: 'intelwatch-etip' }
    );
    expect(() => verifyMfaChallengeToken(fakeToken, TEST_SECRET))
      .toThrow('Invalid MFA token purpose');
  });
});

describe('MFA Setup Token', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440020';
  const tenantId = '550e8400-e29b-41d4-a716-446655440010';
  const email = 'analyst@acme.com';

  it('signs and verifies a setup token', () => {
    const token = signMfaSetupToken(userId, tenantId, email, TEST_SECRET);
    expect(token).toBeTruthy();

    const payload = verifyMfaSetupToken(token, TEST_SECRET);
    expect(payload.sub).toBe(userId);
    expect(payload.tenantId).toBe(tenantId);
    expect(payload.email).toBe(email);
    expect(payload.purpose).toBe('mfa_setup_required');
  });

  it('rejects token with wrong purpose', async () => {
    const jwt = await import('jsonwebtoken');
    const fakeToken = jwt.default.sign(
      { sub: userId, tenantId, email, purpose: 'mfa_challenge' },
      TEST_SECRET,
      { expiresIn: 900, issuer: 'intelwatch-etip' }
    );
    expect(() => verifyMfaSetupToken(fakeToken, TEST_SECRET))
      .toThrow('Invalid MFA setup token purpose');
  });
});
