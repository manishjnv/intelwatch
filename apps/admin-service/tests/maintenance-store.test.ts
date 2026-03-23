import { describe, it, expect, beforeEach } from 'vitest';
import { MaintenanceStore } from '../src/services/maintenance-store.js';

describe('MaintenanceStore', () => {
  let store: MaintenanceStore;
  const future = new Date(Date.now() + 3600_000).toISOString();
  const futureEnd = new Date(Date.now() + 7200_000).toISOString();

  beforeEach(() => {
    store = new MaintenanceStore();
  });

  describe('create', () => {
    it('creates a maintenance window with required fields', () => {
      const win = store.create({
        title: 'DB Migration',
        description: 'Upgrading PostgreSQL to 17',
        type: 'planned',
        scope: 'platform',
        tenantIds: [],
        startsAt: future,
        endsAt: futureEnd,
        createdBy: 'admin-1',
      });
      expect(win.id).toBeTruthy();
      expect(win.title).toBe('DB Migration');
      expect(win.status).toBe('scheduled');
    });

    it('assigns scheduled status for future window', () => {
      const win = store.create({
        title: 'Test',
        description: '',
        type: 'emergency',
        scope: 'platform',
        tenantIds: [],
        startsAt: future,
        endsAt: futureEnd,
        createdBy: 'admin-1',
      });
      expect(win.status).toBe('scheduled');
    });

    it('assigns active status when startsAt is in the past', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const win = store.create({
        title: 'Ongoing',
        description: '',
        type: 'emergency',
        scope: 'platform',
        tenantIds: [],
        startsAt: past,
        endsAt: futureEnd,
        createdBy: 'admin-1',
      });
      expect(win.status).toBe('active');
    });
  });

  describe('list', () => {
    it('returns empty list initially', () => {
      expect(store.list().length).toBe(0);
    });

    it('returns all created windows', () => {
      store.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      store.create({ title: 'B', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      expect(store.list().length).toBe(2);
    });

    it('filters by status', () => {
      store.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const scheduled = store.list({ status: 'scheduled' });
      expect(scheduled.every((w) => w.status === 'scheduled')).toBe(true);
    });
  });

  describe('getById', () => {
    it('returns the window by id', () => {
      const win = store.create({ title: 'X', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      expect(store.getById(win.id)?.id).toBe(win.id);
    });

    it('returns undefined for unknown id', () => {
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates title and description', () => {
      const win = store.create({ title: 'Old', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      const updated = store.update(win.id, { title: 'New Title' });
      expect(updated?.title).toBe('New Title');
    });

    it('returns undefined when updating non-existent window', () => {
      expect(store.update('bad-id', { title: 'x' })).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes the window', () => {
      const win = store.create({ title: 'Del', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      expect(store.delete(win.id)).toBe(true);
      expect(store.getById(win.id)).toBeUndefined();
    });

    it('returns false for unknown id', () => {
      expect(store.delete('bad-id')).toBe(false);
    });
  });

  describe('activate / deactivate', () => {
    it('sets status to active', () => {
      const win = store.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      store.activate(win.id);
      expect(store.getById(win.id)?.status).toBe('active');
    });

    it('sets status to completed on deactivate', () => {
      const win = store.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      store.activate(win.id);
      store.deactivate(win.id);
      expect(store.getById(win.id)?.status).toBe('completed');
    });

    it('isActive returns true when platform maintenance is active', () => {
      const win = store.create({ title: 'A', description: '', type: 'planned', scope: 'platform', tenantIds: [], startsAt: future, endsAt: futureEnd, createdBy: 'admin' });
      store.activate(win.id);
      expect(store.isActive()).toBe(true);
    });

    it('isActive returns false when no active windows', () => {
      expect(store.isActive()).toBe(false);
    });
  });
});
