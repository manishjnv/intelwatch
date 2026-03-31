import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AlertRulesStore } from '../src/services/alert-rules-store.js';
import { ScheduledMaintenanceStore } from '../src/services/scheduled-maintenance-store.js';
import { TenantAnalyticsStore } from '../src/services/tenant-analytics-store.js';
import { AdminActivityStore } from '../src/services/admin-activity-store.js';
import { TenantStore } from '../src/services/tenant-store.js';

const config = loadConfig({ TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!' });

describe('P0 Features Routes', () => {
  let app: FastifyInstance;
  let alertRulesStore: AlertRulesStore;
  let scheduledMaintenanceStore: ScheduledMaintenanceStore;
  let tenantAnalyticsStore: TenantAnalyticsStore;
  let adminActivityStore: AdminActivityStore;
  let tenantStore: TenantStore;

  beforeEach(async () => {
    alertRulesStore = new AlertRulesStore();
    scheduledMaintenanceStore = new ScheduledMaintenanceStore();
    tenantAnalyticsStore = new TenantAnalyticsStore();
    adminActivityStore = new AdminActivityStore();
    tenantStore = new TenantStore();
    app = await buildApp({
      config,
      p0Deps: { alertRulesStore, scheduledMaintenanceStore, tenantAnalyticsStore, adminActivityStore, tenantStore },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── P0 #7: Alert Rules ────────────────────────────────────────

  describe('GET /api/v1/admin/alert-rules', () => {
    it('returns default alert rules', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/alert-rules' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/admin/alert-rules', () => {
    it('creates an alert rule and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/alert-rules',
        payload: { name: 'Custom CPU', metric: 'cpu', threshold: 85, operator: 'gt', severity: 'warning', notifyChannels: ['email'] },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.name).toBe('Custom CPU');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/alert-rules',
        payload: { name: 'Bad rule' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/admin/alert-rules/:id', () => {
    it('updates alert rule threshold', async () => {
      const rule = alertRulesStore.create({ name: 'Test', metric: 'memory', threshold: 80, operator: 'gt', severity: 'warning', notifyChannels: [] });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/alert-rules/${rule.id}`,
        payload: { threshold: 90 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.threshold).toBe(90);
    });

    it('returns 404 for unknown rule', async () => {
      const res = await app.inject({ method: 'PUT', url: '/api/v1/admin/alert-rules/bad', payload: { threshold: 50 } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/alert-rules/:id', () => {
    it('deletes rule and returns 204', async () => {
      const rule = alertRulesStore.create({ name: 'Del', metric: 'disk', threshold: 80, operator: 'gt', severity: 'warning', notifyChannels: [] });
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/alert-rules/${rule.id}` });
      expect(res.statusCode).toBe(204);
    });
  });

  // ─── P0 #8: Scheduled Maintenance ─────────────────────────────

  describe('GET /api/v1/admin/maintenance/scheduled', () => {
    it('returns list of scheduled jobs', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/maintenance/scheduled' });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(JSON.parse(res.body).data)).toBe(true);
    });
  });

  describe('POST /api/v1/admin/maintenance/scheduled', () => {
    it('creates a scheduled maintenance job and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/maintenance/scheduled',
        payload: { title: 'Nightly Backup', cronExpr: '0 2 * * *', durationMinutes: 30, scope: 'platform', notifyBefore: 60 },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.title).toBe('Nightly Backup');
    });

    it('returns 400 for invalid cron expression', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/maintenance/scheduled',
        payload: { title: 'Bad Cron', cronExpr: 'not-a-cron', durationMinutes: 10, scope: 'platform', notifyBefore: 30 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── P0 #9: Tenant Analytics ───────────────────────────────────

  describe('GET /api/v1/admin/tenants/:id/analytics', () => {
    it('returns analytics for a known tenant', async () => {
      const tenant = tenantStore.create({ name: 'Analytics Corp', ownerName: 'Admin', ownerEmail: 'a@a.com' });
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/${tenant.id}/analytics?period=30d` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.data.iocIngested).toBe('number');
      expect(typeof body.data.apiCalls).toBe('number');
    });

    it('returns 404 for unknown tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants/bad/analytics' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── P0 #10: Admin Activity Log ───────────────────────────────

  describe('GET /api/v1/admin/activity', () => {
    it('returns empty activity log initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/activity' });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(JSON.parse(res.body).data.items)).toBe(true);
    });
  });

  describe('POST /api/v1/admin/activity', () => {
    it('logs an admin action and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/activity',
        payload: { adminId: 'admin-1', action: 'tenant.suspended', target: 'tenant-abc', details: { reason: 'ToS' } },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.action).toBe('tenant.suspended');
    });
  });
});
