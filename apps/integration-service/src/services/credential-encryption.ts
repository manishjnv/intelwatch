import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppError } from '@etip/shared-utils';
import { SECRET_KEYS } from '../utils/secret-mask.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
/** Marker prefix so encrypt is idempotent (never double-encrypts an already-encrypted value). */
const ENC_PREFIX = 'enc:v1:';

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

    // Format: iv(12) + encrypted(N) + tag(16) → base64, prefixed with a format marker
    const combined = Buffer.concat([iv, encrypted, tag]);
    return ENC_PREFIX + combined.toString('base64');
  }

  /** True if `value` carries the encryption format marker (i.e. came from encrypt()). */
  isEncrypted(value: string): boolean {
    return value.startsWith(ENC_PREFIX);
  }

  /**
   * Decrypt a previously encrypted value.
   * Throws AppError if decryption fails (wrong key, tampered data).
   */
  decrypt(encryptedBase64: string): string {
    try {
      const combined = Buffer.from(encryptedBase64.slice(ENC_PREFIX.length), 'base64');

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
   * Skips values that don't carry the encryption format marker.
   */
  decryptCredentials(credentials: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (typeof value === 'string' && this.isEncrypted(value)) {
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

  /**
   * Deep-encrypt an integration entity (or any nested object): every value under a
   * `credentials` key, plus any value at a key matching secret-mask's SECRET_KEYS
   * (token, sharedKey, apiKey, password, ...), gets encrypted. Idempotent — an
   * already-encrypted value (marker prefix present) is left alone.
   */
  encryptSecretFields<T>(obj: T): T {
    return this.walkEncrypt(obj, false) as T;
  }

  /** Deep-decrypt: any string anywhere carrying the encryption marker is decrypted. */
  decryptSecretFields<T>(obj: T): T {
    return this.walkDecrypt(obj) as T;
  }

  private walkEncrypt(value: unknown, forceEncrypt: boolean): unknown {
    if (Array.isArray(value)) return value.map((v) => this.walkEncrypt(v, forceEncrypt));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.walkEncrypt(v, forceEncrypt || k === 'credentials' || SECRET_KEYS.test(k));
      }
      return out;
    }
    if (forceEncrypt && typeof value === 'string' && value.length > 0 && !this.isEncrypted(value)) {
      return this.encrypt(value);
    }
    return value;
  }

  private walkDecrypt(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.walkDecrypt(v));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = this.walkDecrypt(v);
      return out;
    }
    if (typeof value === 'string' && this.isEncrypted(value)) {
      try {
        return this.decrypt(value);
      } catch {
        return value;
      }
    }
    return value;
  }
}
