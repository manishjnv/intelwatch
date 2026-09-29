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

  it('creates a maintenance window', async () => {
    const w = await store.create(makeActiveWindow());
    expect(w.id).toBeDefined();
    expect(w.name).toBe('Deploy Window');
    expect(w.suppressAllRules).toBe(true);
  });

  it('gets by ID', async () => {
    const w = await store.create(makeActiveWindow());
    expect(await store.getById(w.id)).toBeDefined();
  });

  it('returns undefined for non-existent ID', async () => {
    expect(await store.getById('nope')).toBeUndefined();
  });

  it('lists windows for tenant', async () => {
    await store.create(makeActiveWindow({ tenantId: 'tenant-1' }));
    await store.create(makeActiveWindow({ tenantId: 'tenant-2' }));
    expect((await store.list('tenant-1', { page: 1, limit: 20 })).total).toBe(1);
  });

  it('filters active windows', async () => {
    await store.create(makeActiveWindow()); // active
    await store.create(makeActiveWindow({
      name: 'Past',
      startAt: new Date(Date.now() - 7200_000).toISOString(),
      endAt: new Date(Date.now() - 3600_000).toISOString(),
    })); // past

    const active = await store.list('tenant-1', { active: true, page: 1, limit: 20 });
    expect(active.total).toBe(1);
    expect(active.data[0].name).toBe('Deploy Window');
  });

  it('filters inactive windows', async () => {
    await store.create(makeActiveWindow()); // active
    await store.create(makeActiveWindow({
      name: 'Future',
      startAt: new Date(Date.now() + 3600_000).toISOString(),
      endAt: new Date(Date.now() + 7200_000).toISOString(),
    })); // future

    const inactive = await store.list('tenant-1', { active: false, page: 1, limit: 20 });
    expect(inactive.total).toBe(1);
    expect(inactive.data[0].name).toBe('Future');
  });

  it('updates a window', async () => {
    const w = await store.create(makeActiveWindow());
    const updated = await store.update(w.id, { name: 'Renamed' });
    expect(updated!.name).toBe('Renamed');
  });

  it('returns undefined when updating non-existent', async () => {
    expect(await store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a window', async () => {
    const w = await store.create(makeActiveWindow());
    expect(await store.delete(w.id)).toBe(true);
    expect(await store.getById(w.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent', async () => {
    expect(await store.delete('nope')).toBe(false);
  });

  it('isRuleSuppressed returns true during active suppressAllRules window', async () => {
    await store.create(makeActiveWindow({ suppressAllRules: true }));
    expect(await store.isRuleSuppressed('tenant-1', 'any-rule')).toBe(true);
  });

  it('isRuleSuppressed returns true for specific ruleId in window', async () => {
    await store.create(makeActiveWindow({ suppressAllRules: false, ruleIds: ['rule-1'] }));
    expect(await store.isRuleSuppressed('tenant-1', 'rule-1')).toBe(true);
    expect(await store.isRuleSuppressed('tenant-1', 'rule-2')).toBe(false);
  });

  it('isRuleSuppressed returns false outside window', async () => {
    await store.create(makeActiveWindow({
      startAt: new Date(Date.now() - 7200_000).toISOString(),
      endAt: new Date(Date.now() - 3600_000).toISOString(),
    }));
    expect(await store.isRuleSuppressed('tenant-1', 'rule-1')).toBe(false);
  });

  it('isRuleSuppressed returns false for different tenant', async () => {
    await store.create(makeActiveWindow({ tenantId: 'tenant-2' }));
    expect(await store.isRuleSuppressed('tenant-1', 'rule-1')).toBe(false);
  });

  it('isAllRulesSuppressed returns true during active window', async () => {
    await store.create(makeActiveWindow({ suppressAllRules: true }));
    expect(await store.isAllRulesSuppressed('tenant-1')).toBe(true);
  });

  it('isAllRulesSuppressed returns false when no active window', async () => {
    expect(await store.isAllRulesSuppressed('tenant-1')).toBe(false);
  });

  it('clears all windows', async () => {
    await store.create(makeActiveWindow());
    store.clear();
    expect((await store.list('tenant-1', { page: 1, limit: 20 })).total).toBe(0);
  });

  // ─── Tenant scoping (Step 3 S154) ───────────────────────────────────

  it('getById scoped to a different tenant returns undefined', async () => {
    const w = await store.create(makeActiveWindow({ tenantId: 'tenant-1' }));
    expect(await store.getById(w.id, 'tenant-2')).toBeUndefined();
  });

  it('delete scoped to a different tenant returns false', async () => {
    const w = await store.create(makeActiveWindow({ tenantId: 'tenant-1' }));
    expect(await store.delete(w.id, 'tenant-2')).toBe(false);
  });
});
