import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('returns defaults when no env vars set', () => {
    const config = loadConfig({});
    expect(config.TI_SERVICE_PORT).toBe(3024);
    expect(config.TI_NODE_ENV).toBe('development');
    expect(config.TI_LOG_LEVEL).toBe('info');
    expect(config.TI_CACHE_DASHBOARD_TTL_S).toBe(172800);
    expect(config.TI_CACHE_TREND_TTL_S).toBe(3600);
  });

  it('parses custom port', () => {
    const config = loadConfig({ TI_SERVICE_PORT: '4024' });
    expect(config.TI_SERVICE_PORT).toBe(4024);
  });

  it('parses custom cache TTL', () => {
    const config = loadConfig({ TI_CACHE_DASHBOARD_TTL_S: '3600' });
    expect(config.TI_CACHE_DASHBOARD_TTL_S).toBe(3600);
  });

  it('throws on invalid port', () => {
    expect(() => loadConfig({ TI_SERVICE_PORT: '-1' })).toThrow();
  });

  it('throws on invalid cache TTL', () => {
    expect(() => loadConfig({ TI_CACHE_DASHBOARD_TTL_S: '5' })).toThrow();
  });

  it('accepts production environment', () => {
    const config = loadConfig({ TI_NODE_ENV: 'production' });
    expect(config.TI_NODE_ENV).toBe('production');
  });

  it('validates API gateway URL', () => {
    const config = loadConfig({ TI_API_GATEWAY_URL: 'http://custom:3001' });
    expect(config.TI_API_GATEWAY_URL).toBe('http://custom:3001');
  });
});
