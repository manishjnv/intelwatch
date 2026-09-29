import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { ChannelConfig } from '../schemas/alert.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Encrypts/decrypts notification channel configs (Slack webhook URLs, webhook
 * secrets/headers) at rest in Postgres. AES-256-GCM with a random IV per call.
 */
export class ChannelCrypto {
  private readonly key: Buffer;

  /** keyBase64 must be 32 random bytes, base64-encoded (`openssl rand -base64 32`). */
  constructor(keyBase64: string) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) {
      throw new AppError(
        500,
        'TI_ALERTING_ENCRYPTION_KEY must be 32 random bytes in base64 (openssl rand -base64 32)',
        'ENCRYPTION_KEY_INVALID',
      );
    }
    this.key = key;
  }

  /** JSON-encodes `value` and AES-256-GCM encrypts it. Returns 'v1:' + base64(iv‖ciphertext‖tag). */
  encrypt(value: unknown): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${Buffer.concat([iv, ciphertext, tag]).toString('base64')}`;
  }

  /**
   * Decrypts + JSON-parses a blob produced by encrypt(). Any failure (bad prefix,
   * short ciphertext, wrong key, tampered tag, invalid JSON) throws — never returns
   * ciphertext or partial data.
   */
  decrypt<T>(blob: string): T {
    try {
      if (!blob.startsWith('v1:')) throw new Error('missing v1: prefix');
      const raw = Buffer.from(blob.slice(3), 'base64');
      if (raw.length < IV_LEN + TAG_LEN) throw new Error('ciphertext too short');
      const iv = raw.subarray(0, IV_LEN);
      const tag = raw.subarray(raw.length - TAG_LEN);
      const ciphertext = raw.subarray(IV_LEN, raw.length - TAG_LEN);
      const decipher = createDecipheriv(ALGO, this.key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8')) as T;
    } catch {
      throw new AppError(500, 'Failed to decrypt channel config', 'DECRYPTION_FAILED');
    }
  }
}

/** Returns a deep copy of `config` with secrets masked — safe to send in API responses. */
export function maskChannelConfig(config: ChannelConfig): ChannelConfig {
  const masked = structuredClone(config);
  if (masked.type === 'slack') {
    masked.slack = { ...masked.slack, webhookUrl: maskUrl(masked.slack.webhookUrl) };
  } else if (masked.type === 'webhook') {
    masked.webhook = {
      ...masked.webhook,
      url: maskUrl(masked.webhook.url),
      ...(masked.webhook.secret !== undefined ? { secret: '****' } : {}),
      ...(masked.webhook.headers ? { headers: maskHeaders(masked.webhook.headers) } : {}),
    };
  }
  // email: recipients are not secrets — returned unchanged
  return masked;
}

/** `https://host/****` — keeps the origin, hides path and query (which may carry tokens). */
export function maskUrl(u: string): string {
  try {
    return `${new URL(u).origin}/****`;
  } catch {
    return '****';
  }
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(headers).map((k) => [k, '****']));
}
