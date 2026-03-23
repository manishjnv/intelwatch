import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MaintenanceStore } from '../src/services/maintenance-store.js';

const config = loadConfig({ TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!' });
const future = new Date(Date.now() + 3600_000).toISOString();
const futureEnd = new Date(Date.now() + 7200_000).toISOString();

describe('Maintenance Routes', () => {
  let app: FastifyInstance;
  let maintenanceStore: MaintenanceStore;

  beforeEach(async () => {
    maintenanceStore = new MaintenanceStore();
    app = await buildApp({ config, maintenanceDeps: { maintenanceStore } });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/maintenance', () => {
    it('returns 200 with empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/maintenance' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('returns created windows', async () => {
      maintenanceStore.create({ title: 'T', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/maintenance' });
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
    });
  });

  describe('POST /api/v1/admin/maintenance', () => {
    it('creates a maintenance window and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/maintenance',
        payload: { title: 'DB Upgrade', description: 'PG17', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd },
        headers: { 'x-admin-id': 'admin-1' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.title).toBe('DB Upgrade');
      expect(body.data.id).toBeTruthy();
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/maintenance',
        payload: { title: 'Oops' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/admin/maintenance/:id', () => {
    it('returns 200 with window details', async () => {
      const win = maintenanceStore.create({ title: 'X', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/maintenance/${win.id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe(win.id);
    });

    it('returns 404 for unknown id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/maintenance/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/admin/maintenance/:id', () => {
    it('updates title and returns 200', async () => {
      const win = maintenanceStore.create({ title: 'Old', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/maintenance/${win.id}`,
        payload: { title: 'Updated Title' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.title).toBe('Updated Title');
    });

    it('returns 404 for unknown id', async () => {
      const res = await app.inject({ method: 'PUT', url: '/api/v1/admin/maintenance/bad', payload: { title: 'x' } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/maintenance/:id', () => {
    it('deletes and returns 204', async () => {
      const win = maintenanceStore.create({ title: 'Del', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/maintenance/${win.id}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 for unknown id', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/maintenance/bad' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/admin/maintenance/:id/activate', () => {
    it('activates window and returns 200', async () => {
      const win = maintenanceStore.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const res = await app.inject({ method: 'POST', url: `/api/v1/admin/maintenance/${win.id}/activate` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe('active');
    });
  });

  describe('POST /api/v1/admin/maintenance/:id/deactivate', () => {
    it('deactivates window and returns 200', async () => {
      const win = maintenanceStore.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      maintenanceStore.activate(win.id);
      const res = await app.inject({ method: 'POST', url: `/api/v1/admin/maintenance/${win.id}/deactivate` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe('completed');
    });
  });
});
