import { describe, it, expect, beforeEach } from 'vitest';
import { RuleStore } from '../src/services/rule-store.js';
import type { CreateRuleDto } from '../src/schemas/alert.js';

function makeRule(overrides?: Partial<CreateRuleDto>): CreateRuleDto {
  return {
    name: 'Test Rule',
    tenantId: 'tenant-1',
    severity: 'high',
    condition: {
      type: 'threshold',
      threshold: { metric: 'critical_iocs', operator: 'gt', value: 10, windowMinutes: 60 },
    },
    enabled: true,
    cooldownMinutes: 15,
    ...overrides,
  };
}

describe('RuleStore', () => {
  let store: RuleStore;

  beforeEach(() => {
    store = new RuleStore();
  });

  it('creates a rule with generated ID and timestamps', () => {
    const rule = store.create(makeRule());
    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('Test Rule');
    expect(rule.tenantId).toBe('tenant-1');
    expect(rule.severity).toBe('high');
    expect(rule.enabled).toBe(true);
    expect(rule.triggerCount).toBe(0);
    expect(rule.lastTriggeredAt).toBeNull();
    expect(rule.createdAt).toBeDefined();
    expect(rule.updatedAt).toBeDefined();
  });

  it('gets a rule by ID', () => {
    const created = store.create(makeRule());
    const found = store.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('returns undefined for non-existent ID', () => {
    expect(store.getById('non-existent')).toBeUndefined();
  });

  it('lists rules filtered by tenant', () => {
    store.create(makeRule({ tenantId: 'tenant-1' }));
    store.create(makeRule({ tenantId: 'tenant-2' }));
    const result = store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].tenantId).toBe('tenant-1');
  });

  it('lists rules with type filter', () => {
    store.create(makeRule());
    store.create(makeRule({
      name: 'Pattern Rule',
      condition: {
        type: 'pattern',
        pattern: { eventType: 'ioc.created', field: 'type', pattern: 'ip', minOccurrences: 3, windowMinutes: 60 },
      },
    }));
    const result = store.list('tenant-1', { type: 'threshold', page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].condition.type).toBe('threshold');
  });

  it('lists rules with severity filter', () => {
    store.create(makeRule({ severity: 'high' }));
    store.create(makeRule({ name: 'Low', severity: 'low' }));
    const result = store.list('tenant-1', { severity: 'high', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists rules with enabled filter', () => {
    store.create(makeRule({ enabled: true }));
    store.create(makeRule({ name: 'Disabled', enabled: false }));
    const result = store.list('tenant-1', { enabled: false, page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('Disabled');
  });

  it('paginates rules', () => {
    for (let i = 0; i < 5; i++) store.create(makeRule({ name: `Rule ${i}` }));
    const page1 = store.list('tenant-1', { page: 1, limit: 2 });
    expect(page1.data.length).toBe(2);
    expect(page1.totalPages).toBe(3);

    const page3 = store.list('tenant-1', { page: 3, limit: 2 });
    expect(page3.data.length).toBe(1);
  });

  it('updates a rule', () => {
    const rule = store.create(makeRule());
    const updated = store.update(rule.id, { name: 'Updated', severity: 'critical' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated');
    expect(updated!.severity).toBe('critical');
    // updatedAt is refreshed (may be same ms in fast envs, so just verify it's set)
    expect(updated!.updatedAt).toBeDefined();
  });

  it('returns undefined when updating non-existent rule', () => {
    expect(store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a rule', () => {
    const rule = store.create(makeRule());
    expect(store.delete(rule.id)).toBe(true);
    expect(store.getById(rule.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent rule', () => {
    expect(store.delete('nope')).toBe(false);
  });

  it('toggles a rule', () => {
    const rule = store.create(makeRule({ enabled: true }));
    const toggled = store.toggle(rule.id, false);
    expect(toggled).toBeDefined();
    expect(toggled!.enabled).toBe(false);
  });

  it('returns undefined when toggling non-existent rule', () => {
    expect(store.toggle('nope', true)).toBeUndefined();
  });

  it('marks rule as triggered', () => {
    const rule = store.create(makeRule());
    store.markTriggered(rule.id);
    const updated = store.getById(rule.id)!;
    expect(updated.triggerCount).toBe(1);
    expect(updated.lastTriggeredAt).toBeDefined();
  });

  it('detects cooldown', () => {
    const rule = store.create(makeRule({ cooldownMinutes: 60 }));
    store.markTriggered(rule.id);
    expect(store.isInCooldown(rule.id)).toBe(true);
  });

  it('returns false for cooldown on rule with 0 cooldown', () => {
    const rule = store.create(makeRule({ cooldownMinutes: 0 }));
    store.markTriggered(rule.id);
    expect(store.isInCooldown(rule.id)).toBe(false);
  });

  it('returns false for cooldown on non-existent rule', () => {
    expect(store.isInCooldown('nope')).toBe(false);
  });

  it('gets enabled rules for a tenant', () => {
    store.create(makeRule({ enabled: true }));
    store.create(makeRule({ name: 'Disabled', enabled: false }));
    const enabled = store.getEnabledRules('tenant-1');
    expect(enabled.length).toBe(1);
  });

  it('counts rules per tenant', () => {
    store.create(makeRule({ tenantId: 'tenant-1' }));
    store.create(makeRule({ tenantId: 'tenant-1' }));
    store.create(makeRule({ tenantId: 'tenant-2' }));
    expect(store.count('tenant-1')).toBe(2);
    expect(store.count('tenant-2')).toBe(1);
  });

  it('clears all rules', () => {
    store.create(makeRule());
    store.clear();
    expect(store.count('tenant-1')).toBe(0);
  });
});
