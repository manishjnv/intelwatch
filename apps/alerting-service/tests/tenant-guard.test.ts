import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AlertStore } from '../src/services/alert-store.js';
import { RuleStore } from '../src/services/rule-store.js';
import { ChannelStore } from '../src/services/channel-store.js';
import { RuleEngine } from '../src/services/rule-engine.js';
import { Notifier } from '../src/services/notifier.js';
import { AlertHistory } from '../src/services/alert-history.js';
import type { FastifyInstance } from 'fastify';

/**
 * U2 (roadmap STEP_00B): the tenant comes from the nginx-set x-tenant-id header,
 * never from a client-chosen query/body tenantId.
 */
describe('Tenant guard', () => {
  let app: FastifyInstance;
  let alertStore: AlertStore;

  function alertFor(tenantId: string) {
    return alertStore.create({
      ruleId: '00000000-0000-0000-0000-000000000001',
      ruleName: 'Rule', tenantId, severity: 'high', title: `Alert ${tenantId}`, description: 'x',
    });
  }

  beforeAll(async () => {
    alertStore = new AlertStore(undefined, 100);
    app = await buildApp({
      config: loadConfig({}),
      alertDeps: { alertStore, alertHistory: new AlertHistory() },
      statsDeps: { alertStore, ruleStore: new RuleStore() },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(async () => { alertStore.clear(); await alertFor('tenant-a'); await alertFor('tenant-b'); });

  it('rejects a query tenantId that differs from the authenticated tenant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/alerts?tenantId=tenant-b',
      headers: { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('uses the header tenant when no tenantId is sent', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/alerts',
      headers: { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' },
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json().data.map((a: { title: string }) => a.title);
    expect(titles).toEqual(['Alert tenant-a']);
  });

  it('allows a matching query tenantId', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/alerts?tenantId=tenant-a',
      headers: { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('search endpoint cannot read another tenant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/alerts/search?q=Alert&tenantId=tenant-b',
      headers: { 'x-tenant-id': 'tenant-a', 'x-user-role': 'tenant_admin' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a body tenantId that differs from the authenticated tenant', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/alerts/bulk-acknowledge',
      headers: { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst', 'content-type': 'application/json' },
      payload: { tenantId: 'tenant-b', ids: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets super_admin choose a tenant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/alerts?tenantId=tenant-b',
      headers: { 'x-tenant-id': 'tenant-a', 'x-user-role': 'super_admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((a: { title: string }) => a.title)).toEqual(['Alert tenant-b']);
  });

  it('leaves internal calls without the header unchanged (health, service-to-service)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts?tenantId=tenant-b' });
    expect(res.statusCode).toBe(200);
  });
});

/**
 * Step 3 S154: rule/channel by-id routes are scoped to the caller's tenant via
 * requestTenant() — a row owned by another tenant reads back as 404.
 */
describe('Tenant scoping — rules and channels by id', () => {
  let app: FastifyInstance;
  let ruleStore: RuleStore;
  let channelStore: ChannelStore;

  beforeAll(async () => {
    ruleStore = new RuleStore();
    channelStore = new ChannelStore();
    app = await buildApp({
      config: loadConfig({}),
      ruleDeps: { ruleStore, ruleEngine: new RuleEngine() },
      channelDeps: { channelStore, notifier: new Notifier() },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { ruleStore.clear(); channelStore.clear(); });

  it('GET/PUT/DELETE a rule owned by another tenant returns 404', async () => {
    const rule = await ruleStore.create({
      name: 'Tenant B Rule', tenantId: 'tenant-b', severity: 'high', enabled: true, cooldownMinutes: 15,
      condition: { type: 'threshold', threshold: { metric: 'x', operator: 'gt', value: 1, windowMinutes: 60 } },
    });
    const headers = { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' };

    const getRes = await app.inject({ method: 'GET', url: `/api/v1/alerts/rules/${rule.id}`, headers });
    expect(getRes.statusCode).toBe(404);

    const putRes = await app.inject({ method: 'PUT', url: `/api/v1/alerts/rules/${rule.id}`, headers, payload: { name: 'X' } });
    expect(putRes.statusCode).toBe(404);

    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/rules/${rule.id}`, headers });
    expect(delRes.statusCode).toBe(404);
  });

  it('GET/PUT/DELETE a rule owned by the same tenant succeeds', async () => {
    const rule = await ruleStore.create({
      name: 'Tenant A Rule', tenantId: 'tenant-a', severity: 'high', enabled: true, cooldownMinutes: 15,
      condition: { type: 'threshold', threshold: { metric: 'x', operator: 'gt', value: 1, windowMinutes: 60 } },
    });
    const headers = { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' };

    const getRes = await app.inject({ method: 'GET', url: `/api/v1/alerts/rules/${rule.id}`, headers });
    expect(getRes.statusCode).toBe(200);

    const putRes = await app.inject({ method: 'PUT', url: `/api/v1/alerts/rules/${rule.id}`, headers, payload: { name: 'Renamed' } });
    expect(putRes.statusCode).toBe(200);

    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/rules/${rule.id}`, headers });
    expect(delRes.statusCode).toBe(204);
  });

  it('PUT/DELETE a channel owned by another tenant returns 404', async () => {
    const channel = await channelStore.create({
      name: 'Tenant B Channel', tenantId: 'tenant-b', enabled: true,
      config: { type: 'email', email: { recipients: ['a@example.com'] } },
    });
    const headers = { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' };

    const putRes = await app.inject({ method: 'PUT', url: `/api/v1/alerts/channels/${channel.id}`, headers, payload: { name: 'X' } });
    expect(putRes.statusCode).toBe(404);

    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/channels/${channel.id}`, headers });
    expect(delRes.statusCode).toBe(404);
  });

  it('PUT/DELETE a channel owned by the same tenant succeeds', async () => {
    const channel = await channelStore.create({
      name: 'Tenant A Channel', tenantId: 'tenant-a', enabled: true,
      config: { type: 'email', email: { recipients: ['a@example.com'] } },
    });
    const headers = { 'x-tenant-id': 'tenant-a', 'x-user-role': 'analyst' };

    const putRes = await app.inject({ method: 'PUT', url: `/api/v1/alerts/channels/${channel.id}`, headers, payload: { name: 'Renamed' } });
    expect(putRes.statusCode).toBe(200);

    const delRes = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/channels/${channel.id}`, headers });
    expect(delRes.statusCode).toBe(204);
  });
});
