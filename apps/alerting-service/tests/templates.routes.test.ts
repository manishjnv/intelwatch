import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { RuleStore } from '../src/services/rule-store.js';
import type { FastifyInstance } from 'fastify';

describe('Template routes', () => {
  let app: FastifyInstance;
  let ruleStore: RuleStore;

  beforeAll(async () => {
    const config = loadConfig({});
    ruleStore = new RuleStore();
    app = await buildApp({ config, templateDeps: { ruleStore } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    ruleStore.clear();
  });

  it('GET /api/v1/alerts/templates returns all templates', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(6);
  });

  it('GET /api/v1/alerts/templates/:id returns specific template', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/templates/tpl-high-ioc-rate' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('High Critical IOC Rate');
  });

  it('GET /api/v1/alerts/templates/:id returns 404 for unknown', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/templates/tpl-unknown' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/alerts/templates/:id/apply creates rule from template', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/templates/tpl-high-ioc-rate/apply',
      payload: { tenantId: 'tenant-1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.name).toBe('High Critical IOC Rate');
    expect(body.data.tenantId).toBe('tenant-1');
    expect(body.data.severity).toBe('critical');
    expect(body.data.condition.type).toBe('threshold');
    expect(body.data.id).toBeDefined();
  });

  it('POST /api/v1/alerts/templates/:id/apply uses default tenant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/templates/tpl-feed-absence/apply',
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.tenantId).toBe('default');
  });

  it('POST /api/v1/alerts/templates/:id/apply returns 404 for unknown', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/templates/tpl-unknown/apply',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('applied template creates a real rule in the store', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/templates/tpl-apt-pattern/apply',
      payload: { tenantId: 'tenant-1' },
    });
    expect(ruleStore.count('tenant-1')).toBe(1);
    const rules = ruleStore.getEnabledRules('tenant-1');
    expect(rules[0].name).toBe('APT Actor Pattern');
  });
});
