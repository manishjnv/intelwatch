import { describe, it, expect } from 'vitest';
import { AppError } from '@etip/shared-utils';
import { loadConfig } from '../src/config.js';

function expectConfigInvalid(fn: () => unknown, messageSubstring: string): void {
  try {
    fn();
    expect.fail('expected loadConfig to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('CONFIG_INVALID');
    expect((err as AppError).message).toContain(messageSubstring);
  }
}

describe('loadConfig — Step 3 S154 persistence gating', () => {
  it('production without TI_DATABASE_URL throws CONFIG_INVALID', () => {
    expectConfigInvalid(() => loadConfig({ TI_NODE_ENV: 'production' }), 'TI_DATABASE_URL is required in production');
  });

  it('TI_DATABASE_URL without TI_ALERTING_ENCRYPTION_KEY throws CONFIG_INVALID', () => {
    expectConfigInvalid(
      () => loadConfig({ TI_NODE_ENV: 'development', TI_DATABASE_URL: 'postgresql://x' }),
      'TI_ALERTING_ENCRYPTION_KEY is required',
    );
  });

  it('dev with neither TI_DATABASE_URL nor TI_ALERTING_ENCRYPTION_KEY is fine', () => {
    const config = loadConfig({ TI_NODE_ENV: 'development' });
    expect(config.TI_DATABASE_URL).toBeUndefined();
    expect(config.TI_ALERTING_ENCRYPTION_KEY).toBeUndefined();
  });

  it('production with both set is fine', () => {
    const config = loadConfig({
      TI_NODE_ENV: 'production',
      TI_DATABASE_URL: 'postgresql://x',
      TI_ALERTING_ENCRYPTION_KEY: 'some-key',
    });
    expect(config.TI_DATABASE_URL).toBe('postgresql://x');
    expect(config.TI_ALERTING_ENCRYPTION_KEY).toBe('some-key');
  });
});
