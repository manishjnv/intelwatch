import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import { ChannelCrypto, maskChannelConfig } from '../src/services/channel-crypto.js';
import type { ChannelConfig } from '../src/schemas/alert.js';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

/** Asserts fn() throws an AppError with the given code. */
function expectAppErrorCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail('expected fn to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
  }
}

describe('ChannelCrypto', () => {
  it('round-trips a config object', () => {
    const crypto = new ChannelCrypto(KEY);
    const config: ChannelConfig = { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/services/abc' } };
    const blob = crypto.encrypt(config);
    expect(crypto.decrypt<ChannelConfig>(blob)).toEqual(config);
  });

  it('ciphertext does not contain the plaintext webhook URL', () => {
    const crypto = new ChannelCrypto(KEY);
    const config: ChannelConfig = { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/services/super-secret-path' } };
    const blob = crypto.encrypt(config);
    expect(blob).not.toContain('super-secret-path');
    expect(blob).not.toContain('hooks.slack.com');
  });

  it('decrypting with the wrong key throws DECRYPTION_FAILED', () => {
    const crypto = new ChannelCrypto(KEY);
    const blob = crypto.encrypt({ type: 'email', email: { recipients: ['a@example.com'] } });
    const wrongCrypto = new ChannelCrypto(OTHER_KEY);
    expectAppErrorCode(() => wrongCrypto.decrypt(blob), 'DECRYPTION_FAILED');
  });

  it('decrypting a tampered byte throws DECRYPTION_FAILED', () => {
    const crypto = new ChannelCrypto(KEY);
    const blob = crypto.encrypt({ type: 'email', email: { recipients: ['a@example.com'] } });
    const raw = Buffer.from(blob.slice(3), 'base64');
    raw[raw.length - 1] ^= 0xff; // flip a byte inside the auth tag
    const tampered = `v1:${raw.toString('base64')}`;
    expectAppErrorCode(() => crypto.decrypt(tampered), 'DECRYPTION_FAILED');
  });

  it('decrypting a blob missing the v1: prefix throws DECRYPTION_FAILED', () => {
    const crypto = new ChannelCrypto(KEY);
    expectAppErrorCode(() => crypto.decrypt('not-a-valid-blob'), 'DECRYPTION_FAILED');
  });

  it('a key that is not 32 bytes throws ENCRYPTION_KEY_INVALID', () => {
    expectAppErrorCode(() => new ChannelCrypto(Buffer.from('too-short').toString('base64')), 'ENCRYPTION_KEY_INVALID');
  });
});

describe('maskChannelConfig', () => {
  it('masks the slack webhook URL to origin + /****', () => {
    const config: ChannelConfig = { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/xyz' } };
    const masked = maskChannelConfig(config);
    expect(masked).not.toBe(config);
    expect((masked as any).slack.webhookUrl).toBe('https://hooks.slack.com/****');
  });

  it('masks the webhook url, secret, and header values', () => {
    const config: ChannelConfig = {
      type: 'webhook',
      webhook: {
        url: 'https://api.siem.example.com/ingest',
        method: 'POST',
        secret: 'top-secret',
        headers: { 'X-Api-Key': 'key-1', Authorization: 'Bearer tok' },
      },
    };
    const masked = maskChannelConfig(config) as any;
    expect(masked.webhook.url).toBe('https://api.siem.example.com/****');
    expect(masked.webhook.secret).toBe('****');
    expect(masked.webhook.headers['X-Api-Key']).toBe('****');
    expect(masked.webhook.headers.Authorization).toBe('****');
  });

  it('falls back to **** when the URL cannot be parsed', () => {
    const config = { type: 'webhook', webhook: { url: 'not a url', method: 'POST' } } as unknown as ChannelConfig;
    const masked = maskChannelConfig(config) as any;
    expect(masked.webhook.url).toBe('****');
  });

  it('keeps email recipients unchanged (not secrets)', () => {
    const config: ChannelConfig = { type: 'email', email: { recipients: ['soc@example.com', 'lead@example.com'] } };
    const masked = maskChannelConfig(config);
    expect(masked).toEqual(config);
  });

  it('does not mutate the input config', () => {
    const config: ChannelConfig = { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/services/abc' } };
    const snapshot = JSON.parse(JSON.stringify(config));
    maskChannelConfig(config);
    expect(config).toEqual(snapshot);
  });
});
