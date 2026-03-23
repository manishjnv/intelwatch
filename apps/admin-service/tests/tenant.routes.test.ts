import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TenantStore } from '../src/services/tenant-store.js';

const config = loadConfig({ TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!' });

describe('Tenant Routes', () => {
  let app: FastifyInstance;
  let tenantStore: TenantStore;

  beforeEach(async () => {
    tenantStore = new TenantStore();
    app = await buildApp({ config, tenantDeps: { tenantStore } });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/tenants', () => {
    it('returns 200 with empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data).toEqual([]);
    });

    it('returns created tenants', async () => {
      tenantStore.create({ name: 'Corp A', ownerEmail: 'a@a.com' });
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants' });
      expect(JSON.parse(res.body).data.length).toBe(1);
    });

    it('filters by plan', async () => {
      tenantStore.create({ name: 'Free', ownerEmail: 'f@f.com', plan: 'free' });
      tenantStore.create({ name: 'Pro', ownerEmail: 'p@p.com', plan: 'pro' });
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants?plan=pro' });
      const body = JSON.parse(res.body);
      expect(body.data.every((t: { plan: string }) => t.plan === 'pro')).toBe(true);
    });
  });

  describe('POST /api/v1/admin/tenants', () => {
    it('creates tenant and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/tenants',
        payload: { name: 'New Corp', ownerEmail: 'admin@newcorp.com', plan: 'starter' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('New Corp');
      expect(body.data.status).toBe('active');
    });

    it('returns 400 for missing ownerEmail', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/tenants',
        payload: { name: 'Bad' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/admin/tenants/:id', () => {
    it('returns 200 with tenant details', async () => {
      const tenant = tenantStore.create({ name: 'Detail Corp', ownerEmail: 'd@d.com' });
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/${tenant.id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe(tenant.id);
    });

    it('returns 404 for unknown tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/admin/tenants/:id/suspend', () => {
    it('suspends active tenant and returns 200', async () => {
      const tenant = tenantStore.create({ name: 'Bad Actor', ownerEmail: 'b@b.com' });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/tenants/${tenant.id}/suspend`,
        payload: { reason: 'ToS violation' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe('suspended');
    });

    it('returns 404 for unknown tenant', async () => {
      const res = await app.inject({ method: 'PUT', url: '/api/v1/admin/tenants/bad/suspend', payload: { reason: 'x' } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/admin/tenants/:id/reinstate', () => {
    it('reinstates suspended tenant', async () => {
      const tenant = tenantStore.create({ name: 'Pardoned', ownerEmail: 'p@p.com' });
      tenantStore.suspend(tenant.id, 'Test');
      const res = await app.inject({ method: 'PUT', url: `/api/v1/admin/tenants/${tenant.id}/reinstate` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe('active');
    });
  });

  describe('PUT /api/v1/admin/tenants/:id/plan', () => {
    it('changes plan and returns 200', async () => {
      const tenant = tenantStore.create({ name: 'Upgrading', ownerEmail: 'u@u.com', plan: 'free' });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/tenants/${tenant.id}/plan`,
        payload: { plan: 'enterprise' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.plan).toBe('enterprise');
    });
  });

  describe('GET /api/v1/admin/tenants/:id/usage', () => {
    it('returns usage stats for tenant', async () => {
      const tenant = tenantStore.create({ name: 'Stats Corp', ownerEmail: 's@s.com' });
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/${tenant.id}/usage` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.data.iocCount).toBe('number');
      expect(typeof body.data.apiCallCount).toBe('number');
    });
  });

  describe('DELETE /api/v1/admin/tenants/:id', () => {
    it('deletes tenant and returns 204', async () => {
      const tenant = tenantStore.create({ name: 'Gone', ownerEmail: 'g@g.com' });
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/tenants/${tenant.id}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 for unknown tenant', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/tenants/bad' });
      expect(res.statusCode).toBe(404);
    });
  });
});
