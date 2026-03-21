import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const VALID_ENV = {
  TI_DATABASE_URL: 'postgresql://user:pass@localhost:5432/etip',
  TI_REDIS_URL: 'redis://:password@localhost:6379',
  TI_JWT_SECRET: 'a'.repeat(32),
  TI_SERVICE_JWT_SECRET: 'b'.repeat(16),
};

describe('loadConfig', () => {
  it('loads valid config with defaults', () => {
    const config = loadConfig(VALID_ENV);
    expect(config.TI_ENRICHMENT_PORT).toBe(3006);
    expect(config.TI_ENRICHMENT_HOST).toBe('0.0.0.0');
    expect(config.TI_AI_ENABLED).toBe(false);
    expect(config.TI_VT_RATE_LIMIT_PER_MIN).toBe(4);
    expect(config.TI_ABUSEIPDB_RATE_LIMIT_PER_DAY).toBe(1000);
    expect(config.TI_ENRICHMENT_CONCURRENCY).toBe(2);
  });

  it('parses TI_AI_ENABLED as boolean', () => {
    const config = loadConfig({ ...VALID_ENV, TI_AI_ENABLED: 'true' });
    expect(config.TI_AI_ENABLED).toBe(true);
  });

  it('throws on missing required fields', () => {
    expect(() => loadConfig({})).toThrow('Invalid environment configuration');
  });

  it('throws on JWT secret too short', () => {
    expect(() => loadConfig({ ...VALID_ENV, TI_JWT_SECRET: 'short' })).toThrow();
  });

  it('accepts custom port', () => {
    const config = loadConfig({ ...VALID_ENV, TI_ENRICHMENT_PORT: '4006' });
    expect(config.TI_ENRICHMENT_PORT).toBe(4006);
  });

  it('accepts VT and AbuseIPDB API keys', () => {
    const config = loadConfig({
      ...VALID_ENV,
      TI_VIRUSTOTAL_API_KEY: 'vt-key-123',
      TI_ABUSEIPDB_API_KEY: 'abuse-key-456',
    });
    expect(config.TI_VIRUSTOTAL_API_KEY).toBe('vt-key-123');
    expect(config.TI_ABUSEIPDB_API_KEY).toBe('abuse-key-456');
  });

  it('defaults API keys to empty string', () => {
    const config = loadConfig(VALID_ENV);
    expect(config.TI_VIRUSTOTAL_API_KEY).toBe('');
    expect(config.TI_ABUSEIPDB_API_KEY).toBe('');
  });
});
