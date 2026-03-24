import { describe, it, expect, beforeEach } from 'vitest';
import { MaintenanceStore } from '../src/services/maintenance-store.js';

describe('MaintenanceStore', () => {
  let store: MaintenanceStore;

  beforeEach(() => {
    store = new MaintenanceStore();
  });

  function makeActiveWindow(overrides?: Record<string, unknown>) {
    return {
      name: 'Deploy Window',
      tenantId: 'tenant-1',
      startAt: new Date(Date.now() - 60_000).toISOString(),
      endAt: new Date(Date.now() + 3600_000).toISOString(),
      ...overrides,
    };
  }

  it('creates a maintenance window', () => {
    const w = store.create(makeActiveWindow());
    expect(w.id).toBeDefined();
    expect(w.name).toBe('Deploy Window');
    expect(w.suppressAllRules).toBe(true);
  });

  it('gets by ID', () => {
    const w = store.create(makeActiveWindow());
    expect(store.getById(w.id)).toBeDefined();
  });

  it('returns undefined for non-existent ID', () => {
    expect(store.getById('nope')).toBeUndefined();
  });

  it('lists windows for tenant', () => {
    store.create(makeActiveWindow({ tenantId: 'tenant-1' }));
    store.create(makeActiveWindow({ tenantId: 'tenant-2' }));
    expect(store.list('tenant-1', { page: 1, limit: 20 }).total).toBe(1);
  });

  it('filters active windows', () => {
    store.create(makeActiveWindow()); // active
    store.create(makeActiveWindow({
      name: 'Past',
      startAt: new Date(Date.now() - 7200_000).toISOString(),
      endAt: new Date(Date.now() - 3600_000).toISOString(),
    })); // past

    const active = store.list('tenant-1', { active: true, page: 1, limit: 20 });
    expect(active.total).toBe(1);
    expect(active.data[0].name).toBe('Deploy Window');
  });

  it('filters inactive windows', () => {
    store.create(makeActiveWindow()); // active
    store.create(makeActiveWindow({
      name: 'Future',
      startAt: new Date(Date.now() + 3600_000).toISOString(),
      endAt: new Date(Date.now() + 7200_000).toISOString(),
    })); // future

    const inactive = store.list('tenant-1', { active: false, page: 1, limit: 20 });
    expect(inactive.total).toBe(1);
    expect(inactive.data[0].name).toBe('Future');
  });

  it('updates a window', () => {
    const w = store.create(makeActiveWindow());
    const updated = store.update(w.id, { name: 'Renamed' });
    expect(updated!.name).toBe('Renamed');
  });

  it('returns undefined when updating non-existent', () => {
    expect(store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a window', () => {
    const w = store.create(makeActiveWindow());
    expect(store.delete(w.id)).toBe(true);
    expect(store.getById(w.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent', () => {
    expect(store.delete('nope')).toBe(false);
  });

  it('isRuleSuppressed returns true during active suppressAllRules window', () => {
    store.create(makeActiveWindow({ suppressAllRules: true }));
    expect(store.isRuleSuppressed('tenant-1', 'any-rule')).toBe(true);
  });

  it('isRuleSuppressed returns true for specific ruleId in window', () => {
    store.create(makeActiveWindow({ suppressAllRules: false, ruleIds: ['rule-1'] }));
    expect(store.isRuleSuppressed('tenant-1', 'rule-1')).toBe(true);
    expect(store.isRuleSuppressed('tenant-1', 'rule-2')).toBe(false);
  });

  it('isRuleSuppressed returns false outside window', () => {
    store.create(makeActiveWindow({
      startAt: new Date(Date.now() - 7200_000).toISOString(),
      endAt: new Date(Date.now() - 3600_000).toISOString(),
    }));
    expect(store.isRuleSuppressed('tenant-1', 'rule-1')).toBe(false);
  });

  it('isRuleSuppressed returns false for different tenant', () => {
    store.create(makeActiveWindow({ tenantId: 'tenant-2' }));
    expect(store.isRuleSuppressed('tenant-1', 'rule-1')).toBe(false);
  });

  it('isAllRulesSuppressed returns true during active window', () => {
    store.create(makeActiveWindow({ suppressAllRules: true }));
    expect(store.isAllRulesSuppressed('tenant-1')).toBe(true);
  });

  it('isAllRulesSuppressed returns false when no active window', () => {
    expect(store.isAllRulesSuppressed('tenant-1')).toBe(false);
  });

  it('clears all windows', () => {
    store.create(makeActiveWindow());
    store.clear();
    expect(store.list('tenant-1', { page: 1, limit: 20 }).total).toBe(0);
  });
});
