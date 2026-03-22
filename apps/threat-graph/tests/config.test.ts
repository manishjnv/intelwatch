import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  TI_NODE_ENV: 'test',
  TI_THREAT_GRAPH_PORT: '3012',
  TI_THREAT_GRAPH_HOST: '0.0.0.0',
  TI_DATABASE_URL: 'postgresql://user:pass@localhost:5432/etip',
  TI_REDIS_URL: 'redis://:pass@localhost:6379/0',
  TI_NEO4J_URL: 'bolt://neo4j:pass@localhost:7687',
  TI_JWT_SECRET: 'a'.repeat(32),
  TI_JWT_ISSUER: 'test',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
  TI_SERVICE_JWT_SECRET: 'b'.repeat(16),
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_LOG_LEVEL: 'info',
};

describe('Threat Graph — Config', () => {
  it('loads valid environment', () => {
    const config = loadConfig(validEnv);
    expect(config.TI_THREAT_GRAPH_PORT).toBe(3012);
    expect(config.TI_NEO4J_URL).toBe('bolt://neo4j:pass@localhost:7687');
    expect(config.TI_GRAPH_PROPAGATION_MAX_DEPTH).toBe(3);
    expect(config.TI_GRAPH_PROPAGATION_DECAY).toBe(0.7);
    expect(config.TI_GRAPH_WORKER_CONCURRENCY).toBe(5);
  });

  it('applies defaults for optional fields', () => {
    const config = loadConfig(validEnv);
    expect(config.TI_RATE_LIMIT_WINDOW_MS).toBe(60000);
    expect(config.TI_RATE_LIMIT_MAX_REQUESTS).toBe(100);
  });

  it('throws on missing DATABASE_URL', () => {
    const env = { ...validEnv, TI_DATABASE_URL: '' };
    expect(() => loadConfig(env)).toThrow('Invalid environment configuration');
  });

  it('throws on missing NEO4J_URL', () => {
    const env = { ...validEnv, TI_NEO4J_URL: '' };
    expect(() => loadConfig(env)).toThrow('Invalid environment configuration');
  });

  it('throws on missing JWT_SECRET', () => {
    const env = { ...validEnv, TI_JWT_SECRET: 'short' };
    expect(() => loadConfig(env)).toThrow('Invalid environment configuration');
  });

  it('accepts custom propagation config', () => {
    const env = { ...validEnv, TI_GRAPH_PROPAGATION_MAX_DEPTH: '5', TI_GRAPH_PROPAGATION_DECAY: '0.5' };
    const config = loadConfig(env);
    expect(config.TI_GRAPH_PROPAGATION_MAX_DEPTH).toBe(5);
    expect(config.TI_GRAPH_PROPAGATION_DECAY).toBe(0.5);
  });

  it('rejects propagation depth > 5', () => {
    const env = { ...validEnv, TI_GRAPH_PROPAGATION_MAX_DEPTH: '10' };
    expect(() => loadConfig(env)).toThrow('Invalid environment configuration');
  });

  it('rejects decay factor > 1.0', () => {
    const env = { ...validEnv, TI_GRAPH_PROPAGATION_DECAY: '1.5' };
    expect(() => loadConfig(env)).toThrow('Invalid environment configuration');
  });

  it('coerces string port to number', () => {
    const config = loadConfig({ ...validEnv, TI_THREAT_GRAPH_PORT: '9999' });
    expect(config.TI_THREAT_GRAPH_PORT).toBe(9999);
  });
});
