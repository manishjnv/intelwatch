import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AuditStore } from '../src/services/audit-store.js';

const config = loadConfig({ TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!' });

const addSampleEvents = (store: AuditStore): void => {
  for (let i = 0; i < 5; i++) {
    store.addEvent({
      tenantId: i % 2 === 0 ? 'tenant-1' : 'tenant-2',
      userId: `user-${i}`,
      action: i % 2 === 0 ? 'ioc.created' : 'ioc.deleted',
      resource: 'ioc',
      resourceId: `r${i}`,
      details: { value: `1.2.3.${i}` },
      ipAddress: '192.168.1.1',
    });
  }
};

describe('Audit Routes', () => {
  let app: FastifyInstance;
  let auditStore: AuditStore;

  beforeEach(async () => {
    auditStore = new AuditStore();
    app = await buildApp({ config, auditDeps: { auditStore } });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/audit', () => {
    it('returns 200 with empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data.items)).toBe(true);
      expect(body.data.total).toBe(0);
    });

    it('returns all audit events', async () => {
      addSampleEvents(auditStore);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit' });
      const body = JSON.parse(res.body);
      expect(body.data.total).toBe(5);
    });

    it('filters by tenantId query param', async () => {
      addSampleEvents(auditStore);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit?tenantId=tenant-1' });
      const body = JSON.parse(res.body);
      expect(body.data.items.every((e: { tenantId: string }) => e.tenantId === 'tenant-1')).toBe(true);
    });

    it('filters by action query param', async () => {
      addSampleEvents(auditStore);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit?action=ioc.created' });
      const body = JSON.parse(res.body);
      expect(body.data.items.every((e: { action: string }) => e.action === 'ioc.created')).toBe(true);
    });

    it('paginates with limit and page', async () => {
      addSampleEvents(auditStore);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit?limit=2&page=1' });
      const body = JSON.parse(res.body);
      expect(body.data.items.length).toBe(2);
      expect(body.data.total).toBe(5);
    });
  });

  describe('GET /api/v1/admin/audit/stats', () => {
    it('returns stats with totalEvents', async () => {
      addSampleEvents(auditStore);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/audit/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.totalEvents).toBe(5);
      expect(typeof body.data.byAction).toBe('object');
    });
  });

  describe('POST /api/v1/admin/audit/export', () => {
    it('returns CSV content with correct content-type', async () => {
      addSampleEvents(auditStore);
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/audit/export', payload: {} });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body).toContain('id,tenantId,userId,action');
    });
  });
});
