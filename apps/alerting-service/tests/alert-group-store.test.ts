import { describe, it, expect, beforeEach } from 'vitest';
import { AlertGroupStore } from '../src/services/alert-group-store.js';

describe('AlertGroupStore', () => {
  let store: AlertGroupStore;

  beforeEach(() => {
    store = new AlertGroupStore(undefined, 30); // 30-min window
  });

  it('generates consistent fingerprints', () => {
    const fp1 = store.fingerprint('rule-1', 'high');
    const fp2 = store.fingerprint('rule-1', 'high');
    expect(fp1).toBe(fp2);
  });

  it('generates different fingerprints for different rules', () => {
    expect(store.fingerprint('rule-1', 'high')).not.toBe(store.fingerprint('rule-2', 'high'));
  });

  it('creates a new group for first alert', async () => {
    const result = await store.addAlert({
      alertId: 'alert-1', ruleId: 'rule-1', tenantId: 'tenant-1', severity: 'high', title: 'Test',
    });
    expect(result.isNew).toBe(true);
    expect(result.group.alertIds).toEqual(['alert-1']);
    expect(result.group.status).toBe('active');
  });

  it('adds subsequent alerts to existing group within window', async () => {
    await store.addAlert({ alertId: 'a1', ruleId: 'rule-1', tenantId: 't1', severity: 'high', title: 'T' });
    const result = await store.addAlert({ alertId: 'a2', ruleId: 'rule-1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(result.isNew).toBe(false);
    expect(result.group.alertIds).toEqual(['a1', 'a2']);
  });

  it('creates new group for different rule', async () => {
    await store.addAlert({ alertId: 'a1', ruleId: 'rule-1', tenantId: 't1', severity: 'high', title: 'T' });
    const result = await store.addAlert({ alertId: 'a2', ruleId: 'rule-2', tenantId: 't1', severity: 'high', title: 'T' });
    expect(result.isNew).toBe(true);
  });

  it('gets group by ID', async () => {
    const { group } = await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(await store.getById(group.id)).toBeDefined();
  });

  it('returns undefined for non-existent group', async () => {
    expect(await store.getById('nope')).toBeUndefined();
  });

  it('returns undefined when tenant does not match', async () => {
    const { group } = await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(await store.getById(group.id, 't2')).toBeUndefined();
    expect(await store.getById(group.id, 't1')).toBeDefined();
  });

  it('lists groups for tenant', async () => {
    await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    await store.addAlert({ alertId: 'a2', ruleId: 'r2', tenantId: 't2', severity: 'high', title: 'T' });
    const result = await store.list('t1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('filters groups by status', async () => {
    const { group } = await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    await store.resolveGroup(group.id);
    await store.addAlert({ alertId: 'a2', ruleId: 'r2', tenantId: 't1', severity: 'high', title: 'T' });

    const active = await store.list('t1', { status: 'active', page: 1, limit: 20 });
    expect(active.total).toBe(1);

    const resolved = await store.list('t1', { status: 'resolved', page: 1, limit: 20 });
    expect(resolved.total).toBe(1);
  });

  it('resolves a group', async () => {
    const { group } = await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    const resolved = await store.resolveGroup(group.id);
    expect(resolved!.status).toBe('resolved');
  });

  it('returns undefined when resolving non-existent group', async () => {
    expect(await store.resolveGroup('nope')).toBeUndefined();
  });

  it('creates new group after resolved group even for same fingerprint', async () => {
    const { group: g1 } = await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    await store.resolveGroup(g1.id);
    const { group: g2, isNew } = await store.addAlert({ alertId: 'a2', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(isNew).toBe(true);
    expect(g2.id).not.toBe(g1.id);
  });

  it('computes group stats', async () => {
    await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    await store.addAlert({ alertId: 'a2', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    await store.addAlert({ alertId: 'a3', ruleId: 'r2', tenantId: 't1', severity: 'critical', title: 'T' });

    const stats = await store.stats('t1');
    expect(stats.totalGroups).toBe(2);
    expect(stats.activeGroups).toBe(2);
    expect(stats.avgAlertsPerGroup).toBe(1.5);
  });

  it('clears all groups', async () => {
    await store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.clear();
    expect((await store.stats('t1')).totalGroups).toBe(0);
  });
});
