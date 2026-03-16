/**
 * @module @etip/shared-auth/__tests__/password.test
 * @description Tests for password and API key hashing.
 */
import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashApiKey,
  verifyApiKey,
} from '../src/password.js';

describe('Password Hashing', () => {
  it('hashes a password and verifies correctly', async () => {
    const password = 'SecureP@ssw0rd!123';
    const hash = await hashPassword(password);

    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password', async () => {
    const hash = await hashPassword('correctPassword123!');
    const isValid = await verifyPassword('wrongPassword456!', hash);
    expect(isValid).toBe(false);
  });

  it('produces different hashes for same password (unique salts)', async () => {
    const password = 'SamePassword123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);

    // Both still verify
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });

  it('handles empty string', async () => {
    const hash = await hashPassword('');
    expect(await verifyPassword('', hash)).toBe(true);
    expect(await verifyPassword('notempty', hash)).toBe(false);
  });

  it('handles unicode passwords', async () => {
    const password = 'パスワード🔐€';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('handles very long passwords', async () => {
    const password = 'a'.repeat(128);
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });
});

describe('API Key Hashing', () => {
  it('hashes an API key and verifies correctly', async () => {
    const key = 'etip_sk_abc123def456ghi789';
    const hash = await hashApiKey(key);

    expect(hash).toBeTruthy();
    expect(hash).not.toBe(key);
    expect(await verifyApiKey(key, hash)).toBe(true);
  });

  it('rejects incorrect API key', async () => {
    const hash = await hashApiKey('etip_sk_correct_key');
    expect(await verifyApiKey('etip_sk_wrong_key', hash)).toBe(false);
  });
});
