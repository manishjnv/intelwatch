import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { BackupStore } from '../src/services/backup-store.js';

const config = loadConfig({ TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!' });

describe('Backup Routes', () => {
  let app: FastifyInstance;
  let backupStore: BackupStore;

  beforeEach(async () => {
    backupStore = new BackupStore();
    app = await buildApp({ config, backupDeps: { backupStore } });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/backups', () => {
    it('returns 200 with empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data).toEqual([]);
    });

    it('returns backup records after trigger', async () => {
      backupStore.trigger({ type: 'full', triggeredBy: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups' });
      expect(JSON.parse(res.body).data.length).toBe(1);
    });
  });

  describe('POST /api/v1/admin/backups/trigger', () => {
    it('returns 201 with new backup record', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups/trigger',
        payload: { type: 'full', notes: 'Pre-deploy snapshot' },
        headers: { 'x-admin-id': 'admin-1' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.type).toBe('full');
      expect(body.data.status).toBe('pending');
    });

    it('returns 400 for invalid backup type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups/trigger',
        payload: { type: 'invalid-type' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/admin/backups/:id', () => {
    it('returns 200 with backup details', async () => {
      const record = backupStore.trigger({ type: 'incremental', triggeredBy: 'admin' });
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/backups/${record.id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe(record.id);
    });

    it('returns 404 for unknown backup', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/admin/backups/:id/restore', () => {
    it('returns 201 for restore of completed backup', async () => {
      const record = backupStore.trigger({ type: 'full', triggeredBy: 'admin' });
      backupStore.complete(record.id, { sizeBytes: 1024, path: '/backups/dump.sql' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/backups/${record.id}/restore`,
        payload: { notes: 'Rolling back bad deploy' },
        headers: { 'x-admin-id': 'admin-1' },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.backupId).toBe(record.id);
    });

    it('returns 400 when backup is not completed', async () => {
      const record = backupStore.trigger({ type: 'full', triggeredBy: 'admin' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/backups/${record.id}/restore`,
        payload: {},
        headers: { 'x-admin-id': 'admin-1' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for unknown backup', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups/bad/restore',
        payload: {},
        headers: { 'x-admin-id': 'admin-1' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
