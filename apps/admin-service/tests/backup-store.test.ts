import { describe, it, expect, beforeEach } from 'vitest';
import { BackupStore } from '../src/services/backup-store.js';

describe('BackupStore', () => {
  let store: BackupStore;

  beforeEach(() => {
    store = new BackupStore();
  });

  describe('trigger', () => {
    it('creates a new backup record with pending status', () => {
      const record = store.trigger({ type: 'full', triggeredBy: 'admin-1', notes: 'Manual backup' });
      expect(record.id).toBeTruthy();
      expect(record.type).toBe('full');
      expect(record.status).toBe('pending');
      expect(record.triggeredBy).toBe('admin-1');
    });

    it('creates incremental backup', () => {
      const record = store.trigger({ type: 'incremental', triggeredBy: 'system' });
      expect(record.type).toBe('incremental');
    });

    it('creates schema-only backup', () => {
      const record = store.trigger({ type: 'schema', triggeredBy: 'admin-2' });
      expect(record.type).toBe('schema');
    });
  });

  describe('list', () => {
    it('returns empty list initially', () => {
      expect(store.list().length).toBe(0);
    });

    it('returns all backup records', () => {
      store.trigger({ type: 'full', triggeredBy: 'admin' });
      store.trigger({ type: 'incremental', triggeredBy: 'admin' });
      expect(store.list().length).toBe(2);
    });

    it('lists most recent backups first', () => {
      const a = store.trigger({ type: 'full', triggeredBy: 'admin' });
      const b = store.trigger({ type: 'incremental', triggeredBy: 'admin' });
      const list = store.list();
      expect(list[0].id).toBe(b.id);
      expect(list[1].id).toBe(a.id);
    });

    it('applies limit correctly', () => {
      for (let i = 0; i < 5; i++) store.trigger({ type: 'full', triggeredBy: 'admin' });
      expect(store.list({ limit: 3 }).length).toBe(3);
    });
  });

  describe('getById', () => {
    it('returns the record by id', () => {
      const record = store.trigger({ type: 'full', triggeredBy: 'admin' });
      expect(store.getById(record.id)?.id).toBe(record.id);
    });

    it('returns undefined for unknown id', () => {
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('complete / fail', () => {
    it('marks backup as completed with size and path', () => {
      const record = store.trigger({ type: 'full', triggeredBy: 'admin' });
      store.complete(record.id, { sizeBytes: 1024 * 1024 * 50, path: '/backups/2026-03-23.dump' });
      const updated = store.getById(record.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.sizeBytes).toBe(52428800);
      expect(updated?.completedAt).toBeTruthy();
    });

    it('marks backup as failed with error message', () => {
      const record = store.trigger({ type: 'full', triggeredBy: 'admin' });
      store.fail(record.id, 'Disk full');
      const updated = store.getById(record.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe('Disk full');
    });
  });

  describe('initiateRestore', () => {
    it('creates a restore record and marks backup as restoring', () => {
      const record = store.trigger({ type: 'full', triggeredBy: 'admin' });
      store.complete(record.id, { sizeBytes: 100, path: '/backups/dump.sql' });
      const restore = store.initiateRestore(record.id, { requestedBy: 'admin-1', notes: 'Rollback' });
      expect(restore.backupId).toBe(record.id);
      expect(restore.status).toBe('pending');
    });

    it('throws when backup not found', () => {
      expect(() => store.initiateRestore('bad-id', { requestedBy: 'admin' })).toThrow();
    });

    it('throws when backup is not completed', () => {
      const record = store.trigger({ type: 'full', triggeredBy: 'admin' });
      expect(() => store.initiateRestore(record.id, { requestedBy: 'admin' })).toThrow();
    });
  });
});
