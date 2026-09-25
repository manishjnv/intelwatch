import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AlertStore } from '../src/services/alert-store.js';
import { RuleStore } from '../src/services/rule-store.js';
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
    alertStore = new AlertStore(100);
    app = await buildApp({
      config: loadConfig({}),
      alertDeps: { alertStore, alertHistory: new AlertHistory() },
      statsDeps: { alertStore, ruleStore: new RuleStore() },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { alertStore.clear(); alertFor('tenant-a'); alertFor('tenant-b'); });

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
