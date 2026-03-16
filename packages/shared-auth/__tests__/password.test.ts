/**
 * @module @etip/shared-auth/__tests__/password.test
 * @description Tests for password and API key hashing.
 * Covers all test cases from TEST_VERIFICATION_MATRIX.md (#21-#35)
 */
import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashApiKey,
  verifyApiKey,
} from '../src/password.js';

describe('Password Hashing', () => {
  // Matrix #21: Hash password with bcrypt
  it('hashes a password and verifies correctly', async () => {
    const password = 'SecureP@ssw0rd!123';
    const hash = await hashPassword(password);
    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  // Matrix #22: Bcrypt cost factor is 12
  it('uses bcrypt cost factor 12', async () => {
    const hash = await hashPassword('TestPassword123!');
    const costMatch = hash.match(/^\$2[ab]\$(\d{2})\$/);
    expect(costMatch).toBeTruthy();
    expect(costMatch![1]).toBe('12');
  });

  // Matrix #23: Same password = different hashes
  it('produces different hashes for same password (unique salts)', async () => {
    const password = 'SamePassword123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  // Matrix #24: Verify correct password
  it('verifies correct password returns true', async () => {
    const password = 'CorrectPassword123!';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  // Matrix #25: Reject incorrect password
  it('rejects incorrect password', async () => {
    const hash = await hashPassword('correctPassword123!');
    expect(await verifyPassword('wrongPassword456!', hash)).toBe(false);
  });

  // Matrix #26: Hash is not plaintext
  it('hash does not contain original password', async () => {
    const password = 'MySecretPassword99!';
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });

  // Matrix #27: Hash length is consistent (60 chars)
  it('produces consistent hash length (60 chars)', async () => {
    const hash1 = await hashPassword('short');
    const hash2 = await hashPassword('a'.repeat(72));
    const hash3 = await hashPassword('unicode123');
    expect(hash1).toHaveLength(60);
    expect(hash2).toHaveLength(60);
    expect(hash3).toHaveLength(60);
  });

  // Matrix #28: Handle empty password
  it('handles empty string', async () => {
    const hash = await hashPassword('');
    expect(await verifyPassword('', hash)).toBe(true);
    expect(await verifyPassword('notempty', hash)).toBe(false);
  });

  // Matrix #29: Handle long password (bcrypt truncates at 72 bytes)
  it('handles very long passwords', async () => {
    const password = 'a'.repeat(128);
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  // Matrix #30: Hash time is consistent
  it('completes hashing within expected time range', async () => {
    const start = performance.now();
    await hashPassword('TimingTestPassword!');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThan(20);
    expect(elapsed).toBeLessThan(5000);
  });

  it('handles unicode passwords', async () => {
    const password = 'パスワード🔐€';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });
});

describe('API Key Hashing', () => {
  // Matrix #31: Hash API key
  it('hashes an API key and verifies correctly', async () => {
    const key = 'etip_sk_abc123def456ghi789';
    const hash = await hashApiKey(key);
    expect(hash).toBeTruthy();
    expect(hash).not.toBe(key);
    expect(await verifyApiKey(key, hash)).toBe(true);
  });

  // Matrix #32: API key uses same cost factor
  it('API key hashing uses bcrypt cost 12', async () => {
    const hash = await hashApiKey('etip_sk_testkey123');
    const costMatch = hash.match(/^\$2[ab]\$(\d{2})\$/);
    expect(costMatch).toBeTruthy();
    expect(costMatch![1]).toBe('12');
  });

  // Matrix #33: Verify API key (reject incorrect)
  it('rejects incorrect API key', async () => {
    const hash = await hashApiKey('etip_sk_correct_key');
    expect(await verifyApiKey('etip_sk_wrong_key', hash)).toBe(false);
  });

  // Matrix #34: Different keys = different hashes
  it('different API keys produce different hashes', async () => {
    const hash1 = await hashApiKey('etip_sk_key_one');
    const hash2 = await hashApiKey('etip_sk_key_two');
    expect(hash1).not.toBe(hash2);
  });

  // Matrix #35: API keys not stored as plaintext
  it('API key hash does not contain original key', async () => {
    const key = 'etip_sk_supersecretapikey';
    const hash = await hashApiKey(key);
    expect(hash).not.toContain(key);
    expect(hash).not.toContain('etip_sk');
  });
});
