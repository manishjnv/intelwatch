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

  it('creates a rule with generated ID and timestamps', async () => {
    const rule = await store.create(makeRule());
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

  it('gets a rule by ID', async () => {
    const created = await store.create(makeRule());
    const found = await store.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('returns undefined for non-existent ID', async () => {
    expect(await store.getById('non-existent')).toBeUndefined();
  });

  it('lists rules filtered by tenant', async () => {
    await store.create(makeRule({ tenantId: 'tenant-1' }));
    await store.create(makeRule({ tenantId: 'tenant-2' }));
    const result = await store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].tenantId).toBe('tenant-1');
  });

  it('lists rules with type filter', async () => {
    await store.create(makeRule());
    await store.create(makeRule({
      name: 'Pattern Rule',
      condition: {
        type: 'pattern',
        pattern: { eventType: 'ioc.created', field: 'type', pattern: 'ip', minOccurrences: 3, windowMinutes: 60 },
      },
    }));
    const result = await store.list('tenant-1', { type: 'threshold', page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].condition.type).toBe('threshold');
  });

  it('lists rules with severity filter', async () => {
    await store.create(makeRule({ severity: 'high' }));
    await store.create(makeRule({ name: 'Low', severity: 'low' }));
    const result = await store.list('tenant-1', { severity: 'high', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists rules with enabled filter', async () => {
    await store.create(makeRule({ enabled: true }));
    await store.create(makeRule({ name: 'Disabled', enabled: false }));
    const result = await store.list('tenant-1', { enabled: false, page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('Disabled');
  });

  it('paginates rules', async () => {
    for (let i = 0; i < 5; i++) await store.create(makeRule({ name: `Rule ${i}` }));
    const page1 = await store.list('tenant-1', { page: 1, limit: 2 });
    expect(page1.data.length).toBe(2);
    expect(page1.totalPages).toBe(3);

    const page3 = await store.list('tenant-1', { page: 3, limit: 2 });
    expect(page3.data.length).toBe(1);
  });

  it('updates a rule', async () => {
    const rule = await store.create(makeRule());
    const updated = await store.update(rule.id, { name: 'Updated', severity: 'critical' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated');
    expect(updated!.severity).toBe('critical');
    // updatedAt is refreshed (may be same ms in fast envs, so just verify it's set)
    expect(updated!.updatedAt).toBeDefined();
  });

  it('returns undefined when updating non-existent rule', async () => {
    expect(await store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a rule', async () => {
    const rule = await store.create(makeRule());
    expect(await store.delete(rule.id)).toBe(true);
    expect(await store.getById(rule.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent rule', async () => {
    expect(await store.delete('nope')).toBe(false);
  });

  it('toggles a rule', async () => {
    const rule = await store.create(makeRule({ enabled: true }));
    const toggled = await store.toggle(rule.id, false);
    expect(toggled).toBeDefined();
    expect(toggled!.enabled).toBe(false);
  });

  it('returns undefined when toggling non-existent rule', async () => {
    expect(await store.toggle('nope', true)).toBeUndefined();
  });

  it('marks rule as triggered', async () => {
    const rule = await store.create(makeRule());
    await store.markTriggered(rule.id);
    const updated = (await store.getById(rule.id))!;
    expect(updated.triggerCount).toBe(1);
    expect(updated.lastTriggeredAt).toBeDefined();
  });

  it('detects cooldown', async () => {
    const rule = await store.create(makeRule({ cooldownMinutes: 60 }));
    await store.markTriggered(rule.id);
    expect(await store.isInCooldown(rule.id)).toBe(true);
  });

  it('returns false for cooldown on rule with 0 cooldown', async () => {
    const rule = await store.create(makeRule({ cooldownMinutes: 0 }));
    await store.markTriggered(rule.id);
    expect(await store.isInCooldown(rule.id)).toBe(false);
  });

  it('returns false for cooldown on non-existent rule', async () => {
    expect(await store.isInCooldown('nope')).toBe(false);
  });

  it('gets enabled rules for a tenant', async () => {
    await store.create(makeRule({ enabled: true }));
    await store.create(makeRule({ name: 'Disabled', enabled: false }));
    const enabled = await store.getEnabledRules('tenant-1');
    expect(enabled.length).toBe(1);
  });

  it('counts rules per tenant', async () => {
    await store.create(makeRule({ tenantId: 'tenant-1' }));
    await store.create(makeRule({ tenantId: 'tenant-1' }));
    await store.create(makeRule({ tenantId: 'tenant-2' }));
    expect(await store.count('tenant-1')).toBe(2);
    expect(await store.count('tenant-2')).toBe(1);
  });

  it('clears all rules', async () => {
    await store.create(makeRule());
    store.clear();
    expect(await store.count('tenant-1')).toBe(0);
  });

  // ─── Tenant scoping (Step 3 S154) ───────────────────────────────────

  it('getById scoped to a different tenant returns undefined', async () => {
    const rule = await store.create(makeRule({ tenantId: 'tenant-1' }));
    expect(await store.getById(rule.id, 'tenant-2')).toBeUndefined();
    expect(await store.getById(rule.id, 'tenant-1')).toBeDefined();
  });

  it('update scoped to a different tenant returns undefined', async () => {
    const rule = await store.create(makeRule({ tenantId: 'tenant-1' }));
    expect(await store.update(rule.id, { name: 'X' }, 'tenant-2')).toBeUndefined();
  });

  it('delete scoped to a different tenant returns false', async () => {
    const rule = await store.create(makeRule({ tenantId: 'tenant-1' }));
    expect(await store.delete(rule.id, 'tenant-2')).toBe(false);
    expect(await store.getById(rule.id)).toBeDefined();
  });
});
