import { describe, it, expect } from 'vitest';
import { CredentialEncryption } from '../src/services/credential-encryption.js';

const KEY = 'etip-test-encryption-key-32chars!';

describe('CredentialEncryption', () => {
  const enc = new CredentialEncryption(KEY);

  it('throws on short key', () => {
    expect(() => new CredentialEncryption('short')).toThrow('at least 32 characters');
  });

  describe('encrypt/decrypt', () => {
    it('round-trips a simple string', () => {
      const encrypted = enc.encrypt('my-secret-api-key');
      expect(encrypted).not.toBe('my-secret-api-key');
      expect(enc.decrypt(encrypted)).toBe('my-secret-api-key');
    });

    it('produces different ciphertext each time (random IV)', () => {
      const a = enc.encrypt('same-plaintext');
      const b = enc.encrypt('same-plaintext');
      expect(a).not.toBe(b);
      // But both decrypt to the same value
      expect(enc.decrypt(a)).toBe('same-plaintext');
      expect(enc.decrypt(b)).toBe('same-plaintext');
    });

    it('handles empty string', () => {
      const encrypted = enc.encrypt('');
      expect(enc.decrypt(encrypted)).toBe('');
    });

    it('handles long values', () => {
      const long = 'x'.repeat(10000);
      const encrypted = enc.encrypt(long);
      expect(enc.decrypt(encrypted)).toBe(long);
    });

    it('handles special characters', () => {
      const special = 'p@$$w0rd!#%^&*(){}[]|\\:";\'<>,.?/~`';
      expect(enc.decrypt(enc.encrypt(special))).toBe(special);
    });

    it('handles unicode', () => {
      const unicode = '日本語テスト🔐🔑';
      expect(enc.decrypt(enc.encrypt(unicode))).toBe(unicode);
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = enc.encrypt('test');
      const tampered = encrypted.slice(0, -4) + 'XXXX';
      expect(() => enc.decrypt(tampered)).toThrow('Failed to decrypt');
    });

    it('throws on wrong key', () => {
      const encrypted = enc.encrypt('test');
      const otherEnc = new CredentialEncryption('different-key-must-be-32-chars!!');
      expect(() => otherEnc.decrypt(encrypted)).toThrow('Failed to decrypt');
    });
  });

  describe('encryptCredentials/decryptCredentials', () => {
    it('encrypts all string values in an object', () => {
      const creds = { apiKey: 'secret-123', token: 'bearer-xyz', count: 42 };
      const encrypted = enc.encryptCredentials(creds);

      expect(encrypted.apiKey).not.toBe('secret-123');
      expect(encrypted.token).not.toBe('bearer-xyz');
      expect(encrypted.count).toBe(42); // non-string unchanged
    });

    it('round-trips credential objects', () => {
      const creds = { apiKey: 'secret-123', token: 'bearer-xyz', enabled: true };
      const encrypted = enc.encryptCredentials(creds);
      const decrypted = enc.decryptCredentials(encrypted);

      expect(decrypted.apiKey).toBe('secret-123');
      expect(decrypted.token).toBe('bearer-xyz');
      expect(decrypted.enabled).toBe(true);
    });

    it('skips empty string values', () => {
      const creds = { apiKey: '', token: 'value' };
      const encrypted = enc.encryptCredentials(creds);
      expect(encrypted.apiKey).toBe('');
    });

    it('handles already-plain values gracefully in decryptCredentials', () => {
      const plain = { apiKey: 'not-encrypted', count: 5 };
      const result = enc.decryptCredentials(plain);
      // Short strings that don't look encrypted are left as-is
      expect(result.apiKey).toBe('not-encrypted');
      expect(result.count).toBe(5);
    });
  });
});
