import { describe, it, expect, beforeEach } from 'vitest';
import { AlertGroupStore } from '../src/services/alert-group-store.js';

describe('AlertGroupStore', () => {
  let store: AlertGroupStore;

  beforeEach(() => {
    store = new AlertGroupStore(30); // 30-min window
  });

  it('generates consistent fingerprints', () => {
    const fp1 = store.fingerprint('rule-1', 'high');
    const fp2 = store.fingerprint('rule-1', 'high');
    expect(fp1).toBe(fp2);
  });

  it('generates different fingerprints for different rules', () => {
    expect(store.fingerprint('rule-1', 'high')).not.toBe(store.fingerprint('rule-2', 'high'));
  });

  it('creates a new group for first alert', () => {
    const result = store.addAlert({
      alertId: 'alert-1', ruleId: 'rule-1', tenantId: 'tenant-1', severity: 'high', title: 'Test',
    });
    expect(result.isNew).toBe(true);
    expect(result.group.alertIds).toEqual(['alert-1']);
    expect(result.group.status).toBe('active');
  });

  it('adds subsequent alerts to existing group within window', () => {
    store.addAlert({ alertId: 'a1', ruleId: 'rule-1', tenantId: 't1', severity: 'high', title: 'T' });
    const result = store.addAlert({ alertId: 'a2', ruleId: 'rule-1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(result.isNew).toBe(false);
    expect(result.group.alertIds).toEqual(['a1', 'a2']);
  });

  it('creates new group for different rule', () => {
    store.addAlert({ alertId: 'a1', ruleId: 'rule-1', tenantId: 't1', severity: 'high', title: 'T' });
    const result = store.addAlert({ alertId: 'a2', ruleId: 'rule-2', tenantId: 't1', severity: 'high', title: 'T' });
    expect(result.isNew).toBe(true);
  });

  it('gets group by ID', () => {
    const { group } = store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(store.getById(group.id)).toBeDefined();
  });

  it('returns undefined for non-existent group', () => {
    expect(store.getById('nope')).toBeUndefined();
  });

  it('finds group by alert ID', () => {
    store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    const found = store.getByAlertId('a1');
    expect(found).toBeDefined();
    expect(found!.alertIds).toContain('a1');
  });

  it('returns undefined for unknown alert ID', () => {
    expect(store.getByAlertId('unknown')).toBeUndefined();
  });

  it('lists groups for tenant', () => {
    store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.addAlert({ alertId: 'a2', ruleId: 'r2', tenantId: 't2', severity: 'high', title: 'T' });
    const result = store.list('t1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('filters groups by status', () => {
    const { group } = store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.resolveGroup(group.id);
    store.addAlert({ alertId: 'a2', ruleId: 'r2', tenantId: 't1', severity: 'high', title: 'T' });

    const active = store.list('t1', { status: 'active', page: 1, limit: 20 });
    expect(active.total).toBe(1);

    const resolved = store.list('t1', { status: 'resolved', page: 1, limit: 20 });
    expect(resolved.total).toBe(1);
  });

  it('resolves a group', () => {
    const { group } = store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    const resolved = store.resolveGroup(group.id);
    expect(resolved!.status).toBe('resolved');
  });

  it('returns undefined when resolving non-existent group', () => {
    expect(store.resolveGroup('nope')).toBeUndefined();
  });

  it('creates new group after resolved group even for same fingerprint', () => {
    const { group: g1 } = store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.resolveGroup(g1.id);
    const { group: g2, isNew } = store.addAlert({ alertId: 'a2', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    expect(isNew).toBe(true);
    expect(g2.id).not.toBe(g1.id);
  });

  it('computes group stats', () => {
    store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.addAlert({ alertId: 'a2', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.addAlert({ alertId: 'a3', ruleId: 'r2', tenantId: 't1', severity: 'critical', title: 'T' });

    const stats = store.stats('t1');
    expect(stats.totalGroups).toBe(2);
    expect(stats.activeGroups).toBe(2);
    expect(stats.avgAlertsPerGroup).toBe(1.5);
  });

  it('clears all groups', () => {
    store.addAlert({ alertId: 'a1', ruleId: 'r1', tenantId: 't1', severity: 'high', title: 'T' });
    store.clear();
    expect(store.stats('t1').totalGroups).toBe(0);
  });
});
