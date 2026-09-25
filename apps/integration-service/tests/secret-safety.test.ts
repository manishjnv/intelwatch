import { describe, it, expect } from 'vitest';
import { loadConfig, DEV_ENCRYPTION_KEY } from '../src/config.js';
import { maskSecrets, restoreMaskedSecrets, SECRET_MASK } from '../src/utils/secret-mask.js';

// Roadmap STEP_00B U4.
const BASE = {
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long',
  TI_SERVICE_JWT_SECRET: 'test-service-jwt-secret',
};

describe('encryption key config', () => {
  it('refuses the dev default in production', () => {
    expect(() => loadConfig({ ...BASE, TI_NODE_ENV: 'production' })).toThrow(/TI_INTEGRATION_ENCRYPTION_KEY/);
  });

  it('treats an empty key (compose ${VAR:-}) as unset', () => {
    expect(() => loadConfig({ ...BASE, TI_NODE_ENV: 'production', TI_INTEGRATION_ENCRYPTION_KEY: '' })).toThrow();
    expect(loadConfig({ ...BASE, TI_INTEGRATION_ENCRYPTION_KEY: '' }).TI_INTEGRATION_ENCRYPTION_KEY).toBe(DEV_ENCRYPTION_KEY);
  });

  it('accepts a real key in production', () => {
    const key = 'a'.repeat(64);
    expect(loadConfig({ ...BASE, TI_NODE_ENV: 'production', TI_INTEGRATION_ENCRYPTION_KEY: key }).TI_INTEGRATION_ENCRYPTION_KEY).toBe(key);
  });
});

describe('maskSecrets', () => {
  const integration = {
    id: 'i1', name: 'Splunk', type: 'splunk_hec',
    siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'real-token' },
    webhookConfig: { url: 'https://w.example', secret: 'real-secret' },
    credentials: { user: 'bob', nested: { k: 'v' } },
  };

  it('masks nested secret keys and all credential values, keeps the rest', () => {
    const m = maskSecrets(integration);
    expect(m.siemConfig.token).toBe(SECRET_MASK);
    expect(m.webhookConfig.secret).toBe(SECRET_MASK);
    expect(m.credentials).toEqual({ user: SECRET_MASK, nested: { k: SECRET_MASK } });
    expect(m.siemConfig.url).toBe('https://s.example');
    expect(m.name).toBe('Splunk');
    expect(integration.siemConfig.token).toBe('real-token'); // original untouched
  });

  it('restores stored secrets when the client sends the mask back', () => {
    const input = { name: 'Splunk 2', siemConfig: { type: 'splunk_hec', url: 'https://s2.example', token: SECRET_MASK } };
    const out = restoreMaskedSecrets(input, integration);
    expect(out.siemConfig.token).toBe('real-token');
    expect(out.siemConfig.url).toBe('https://s2.example');
  });

  it('keeps a new secret the client really changed', () => {
    const out = restoreMaskedSecrets({ siemConfig: { token: 'new-token' } }, integration);
    expect(out.siemConfig.token).toBe('new-token');
  });
});
