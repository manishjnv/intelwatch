import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('Threat Actor Intel — Config', () => {
  const validEnv = {
    TI_DATABASE_URL: 'postgresql://user:pass@localhost:5432/etip',
    TI_REDIS_URL: 'redis://:password@localhost:6379/0',
    TI_JWT_SECRET: 'a'.repeat(32),
    TI_SERVICE_JWT_SECRET: 'b'.repeat(16),
  };

  it('loads config with valid env vars', () => {
    const config = loadConfig(validEnv);
    expect(config.TI_THREAT_ACTOR_INTEL_PORT).toBe(3008);
    expect(config.TI_THREAT_ACTOR_INTEL_HOST).toBe('0.0.0.0');
    expect(config.TI_NODE_ENV).toBe('development');
    expect(config.TI_LOG_LEVEL).toBe('info');
  });

  it('applies custom port from env', () => {
    const config = loadConfig({ ...validEnv, TI_THREAT_ACTOR_INTEL_PORT: '4008' });
    expect(config.TI_THREAT_ACTOR_INTEL_PORT).toBe(4008);
  });

  it('throws on missing DATABASE_URL', () => {
    const { TI_DATABASE_URL: _, ...incomplete } = validEnv;
    expect(() => loadConfig(incomplete)).toThrow('Invalid environment configuration');
  });

  it('throws on missing JWT_SECRET', () => {
    const { TI_JWT_SECRET: _, ...incomplete } = validEnv;
    expect(() => loadConfig(incomplete)).toThrow('Invalid environment configuration');
  });

  it('throws on JWT_SECRET shorter than 32 chars', () => {
    expect(() => loadConfig({ ...validEnv, TI_JWT_SECRET: 'short' })).toThrow('Invalid environment configuration');
  });

  it('coerces string port to number', () => {
    const config = loadConfig({ ...validEnv, TI_THREAT_ACTOR_INTEL_PORT: '3008' });
    expect(typeof config.TI_THREAT_ACTOR_INTEL_PORT).toBe('number');
  });
});
