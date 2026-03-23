import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppError } from '@etip/shared-utils';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * AES-256-GCM encryption for integration credentials.
 * Encrypts sensitive fields (API keys, tokens, passwords) before storage.
 * Uses a per-service encryption key from TI_INTEGRATION_ENCRYPTION_KEY env var.
 */
export class CredentialEncryption {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new AppError(
        500,
        'TI_INTEGRATION_ENCRYPTION_KEY must be at least 32 characters',
        'ENCRYPTION_KEY_INVALID',
      );
    }
    // Derive a fixed-length key from the provided key
    this.key = Buffer.from(encryptionKey.slice(0, KEY_LENGTH), 'utf8');
  }

  /**
   * Encrypt a plaintext value. Returns a base64 string containing
   * IV + ciphertext + auth tag concatenated.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: iv(12) + encrypted(N) + tag(16) → base64
    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a previously encrypted value.
   * Throws AppError if decryption fails (wrong key, tampered data).
   */
  decrypt(encryptedBase64: string): string {
    try {
      const combined = Buffer.from(encryptedBase64, 'base64');

      if (combined.length < IV_LENGTH + TAG_LENGTH) {
        throw new Error('Encrypted data too short');
      }

      const iv = combined.subarray(0, IV_LENGTH);
      const tag = combined.subarray(combined.length - TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(500, 'Failed to decrypt credentials', 'DECRYPTION_FAILED');
    }
  }

  /**
   * Encrypt all string values in a credentials object.
   * Non-string values are left unchanged.
   */
  encryptCredentials(credentials: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string' && value.length > 0) {
        result[key] = this.encrypt(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Decrypt all string values in a credentials object.
   * Skips values that don't look like base64-encoded encrypted data.
   */
  decryptCredentials(credentials: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string' && this.looksEncrypted(value)) {
        try {
          result[key] = this.decrypt(value);
        } catch {
          result[key] = value; // Leave as-is if decryption fails
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** Check if a string looks like base64-encoded encrypted data. */
  private looksEncrypted(value: string): boolean {
    // Encrypted values are base64 and at least IV + TAG + 1 byte long
    const minBase64Length = Math.ceil((IV_LENGTH + TAG_LENGTH + 1) / 3) * 4;
    return value.length >= minBase64Length && /^[A-Za-z0-9+/=]+$/.test(value);
  }
}
