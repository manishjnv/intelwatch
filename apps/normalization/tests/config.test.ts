import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  TI_DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  TI_REDIS_URL: 'redis://:pass@localhost:6379/0',
  TI_JWT_SECRET: 'a'.repeat(32),
  TI_SERVICE_JWT_SECRET: 'b'.repeat(16),
};

describe('loadConfig', () => {
  it('loads valid config with defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.TI_NORMALIZATION_PORT).toBe(3005);
    expect(config.TI_NORMALIZATION_HOST).toBe('0.0.0.0');
    expect(config.TI_LOG_LEVEL).toBe('info');
    expect(config.TI_NORMALIZATION_BATCH_SIZE).toBe(500);
    expect(config.TI_NORMALIZATION_CONCURRENCY).toBe(3);
  });

  it('accepts custom port', () => {
    const config = loadConfig({ ...validEnv, TI_NORMALIZATION_PORT: '3099' });
    expect(config.TI_NORMALIZATION_PORT).toBe(3099);
  });

  it('rejects missing DATABASE_URL', () => {
    const { TI_DATABASE_URL: _, ...missing } = validEnv;
    expect(() => loadConfig(missing)).toThrow('Invalid environment configuration');
  });

  it('rejects missing REDIS_URL', () => {
    const { TI_REDIS_URL: _, ...missing } = validEnv;
    expect(() => loadConfig(missing)).toThrow('Invalid environment configuration');
  });

  it('rejects JWT_SECRET shorter than 32 chars', () => {
    expect(() => loadConfig({ ...validEnv, TI_JWT_SECRET: 'short' })).toThrow();
  });

  it('rejects SERVICE_JWT_SECRET shorter than 16 chars', () => {
    expect(() => loadConfig({ ...validEnv, TI_SERVICE_JWT_SECRET: 'x' })).toThrow();
  });

  it('accepts valid log levels', () => {
    const config = loadConfig({ ...validEnv, TI_LOG_LEVEL: 'debug' });
    expect(config.TI_LOG_LEVEL).toBe('debug');
  });

  it('rejects invalid log level', () => {
    expect(() => loadConfig({ ...validEnv, TI_LOG_LEVEL: 'verbose' })).toThrow();
  });
});
