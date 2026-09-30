import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AlertGroupStore } from '../src/services/alert-group-store.js';
import type { FastifyInstance } from 'fastify';

describe('Group routes', () => {
  let app: FastifyInstance;
  let groupStore: AlertGroupStore;

  beforeAll(async () => {
    const config = loadConfig({});
    groupStore = new AlertGroupStore(undefined, 30);
    app = await buildApp({ config, groupDeps: { alertGroupStore: groupStore } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    groupStore.clear();
  });

  it('GET /api/v1/alerts/groups lists groups', async () => {
    await groupStore.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 'default', severity: 'high', title: 'T' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/groups' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
  });

  it('GET /api/v1/alerts/groups filters by status', async () => {
    const { group } = await groupStore.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 'default', severity: 'high', title: 'T' });
    await groupStore.resolveGroup(group.id);
    await groupStore.addAlert({ alertId: 'a2', ruleId: 'r2', tenantId: 'default', severity: 'high', title: 'T' });

    const active = await app.inject({ method: 'GET', url: '/api/v1/alerts/groups?status=active' });
    expect(active.json().data.length).toBe(1);
  });

  it('GET /api/v1/alerts/groups/:id returns group detail', async () => {
    const { group } = await groupStore.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 'default', severity: 'high', title: 'T' });
    const res = await app.inject({ method: 'GET', url: `/api/v1/alerts/groups/${group.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(group.id);
  });

  it('GET /api/v1/alerts/groups/:id returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/groups/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/alerts/groups/:id/resolve resolves a group', async () => {
    const { group } = await groupStore.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 'default', severity: 'high', title: 'T' });
    const res = await app.inject({ method: 'POST', url: `/api/v1/alerts/groups/${group.id}/resolve` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('resolved');
  });

  it('POST /api/v1/alerts/groups/:id/resolve returns 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/groups/nope/resolve' });
    expect(res.statusCode).toBe(404);
  });

  // ─── Cross-tenant scoping (Step 3 S155) ─────────────────────────────

  it('GET /:id returns 404 for another tenant\'s group', async () => {
    const { group } = await groupStore.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 'tenant-a', severity: 'high', title: 'T' });
    const res = await app.inject({
      method: 'GET', url: `/api/v1/alerts/groups/${group.id}`,
      headers: { 'x-tenant-id': 'tenant-b' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /:id/resolve returns 404 for another tenant\'s group', async () => {
    const { group } = await groupStore.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 'tenant-a', severity: 'high', title: 'T' });
    const res = await app.inject({
      method: 'POST', url: `/api/v1/alerts/groups/${group.id}/resolve`,
      headers: { 'x-tenant-id': 'tenant-b' },
    });
    expect(res.statusCode).toBe(404);
  });
});
