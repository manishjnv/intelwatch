import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../src/config.js';

function makeEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    TI_REDIS_URL: 'redis://localhost:6379',
    TI_JWT_SECRET: 'a'.repeat(32),
    TI_SERVICE_JWT_SECRET: 'b'.repeat(16),
    ...overrides,
  };
}

describe('Correlation Engine — Config', () => {
  it('1. loads valid config with defaults', () => {
    const config = loadConfig(makeEnv());
    expect(config.TI_CORRELATION_PORT).toBe(3013);
    expect(config.TI_CORRELATION_HOST).toBe('0.0.0.0');
    expect(config.TI_NODE_ENV).toBe('development');
  });

  it('2. applies custom port and host', () => {
    const config = loadConfig(makeEnv({ TI_CORRELATION_PORT: '4013', TI_CORRELATION_HOST: '127.0.0.1' }));
    expect(config.TI_CORRELATION_PORT).toBe(4013);
    expect(config.TI_CORRELATION_HOST).toBe('127.0.0.1');
  });

  it('3. sets correlation-specific defaults', () => {
    const config = loadConfig(makeEnv());
    expect(config.TI_CORRELATION_WINDOW_HOURS).toBe(24);
    expect(config.TI_CORRELATION_ZSCORE_THRESHOLD).toBe(2.0);
    expect(config.TI_CORRELATION_DBSCAN_EPSILON).toBe(0.3);
    expect(config.TI_CORRELATION_DBSCAN_MIN_PTS).toBe(3);
    expect(config.TI_CORRELATION_FP_THRESHOLD).toBe(0.7);
    expect(config.TI_CORRELATION_FP_MIN_SAMPLES).toBe(5);
  });

  it('4. applies custom correlation tunables', () => {
    const config = loadConfig(makeEnv({
      TI_CORRELATION_WINDOW_HOURS: '48',
      TI_CORRELATION_ZSCORE_THRESHOLD: '3.0',
      TI_CORRELATION_DBSCAN_EPSILON: '0.5',
    }));
    expect(config.TI_CORRELATION_WINDOW_HOURS).toBe(48);
    expect(config.TI_CORRELATION_ZSCORE_THRESHOLD).toBe(3.0);
    expect(config.TI_CORRELATION_DBSCAN_EPSILON).toBe(0.5);
  });

  it('5. throws on missing TI_REDIS_URL', () => {
    expect(() => loadConfig({ TI_JWT_SECRET: 'a'.repeat(32), TI_SERVICE_JWT_SECRET: 'b'.repeat(16) }))
      .toThrow('Invalid environment configuration');
  });

  it('6. throws on JWT secret too short', () => {
    expect(() => loadConfig(makeEnv({ TI_JWT_SECRET: 'short' })))
      .toThrow('Invalid environment configuration');
  });

  it('7. sets inference config defaults', () => {
    const config = loadConfig(makeEnv());
    expect(config.TI_CORRELATION_INFERENCE_DECAY).toBe(0.8);
    expect(config.TI_CORRELATION_INFERENCE_MAX_DEPTH).toBe(3);
    expect(config.TI_CORRELATION_INFERENCE_MIN_CONF).toBe(0.1);
  });

  it('8. sets worker concurrency and max results defaults', () => {
    const config = loadConfig(makeEnv());
    expect(config.TI_CORRELATION_WORKER_CONCURRENCY).toBe(5);
    expect(config.TI_CORRELATION_MAX_RESULTS).toBe(10000);
    expect(config.TI_CORRELATION_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});
