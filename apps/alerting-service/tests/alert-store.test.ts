import { describe, it, expect, beforeEach } from 'vitest';
import { AlertStore, type CreateAlertInput } from '../src/services/alert-store.js';

function makeAlert(overrides?: Partial<CreateAlertInput>): CreateAlertInput {
  return {
    ruleId: '00000000-0000-0000-0000-000000000001',
    ruleName: 'Test Rule',
    tenantId: 'tenant-1',
    severity: 'high',
    title: 'Test Alert',
    description: 'Something happened',
    ...overrides,
  };
}

describe('AlertStore', () => {
  let store: AlertStore;

  beforeEach(() => {
    store = new AlertStore(100);
  });

  // ─── Create ────────────────────────────────────────────────────────

  it('creates an alert in open status', () => {
    const alert = store.create(makeAlert());
    expect(alert.id).toBeDefined();
    expect(alert.status).toBe('open');
    expect(alert.severity).toBe('high');
    expect(alert.acknowledgedBy).toBeNull();
    expect(alert.resolvedBy).toBeNull();
    expect(alert.escalationLevel).toBe(0);
  });

  it('throws when tenant limit reached', () => {
    const store2 = new AlertStore(2);
    store2.create(makeAlert());
    store2.create(makeAlert());
    expect(() => store2.create(makeAlert())).toThrow('Alert limit reached');
  });

  // ─── Get / List ────────────────────────────────────────────────────

  it('gets alert by ID', () => {
    const created = store.create(makeAlert());
    const found = store.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('returns undefined for non-existent ID', () => {
    expect(store.getById('nope')).toBeUndefined();
  });

  it('lists alerts filtered by tenant', () => {
    store.create(makeAlert({ tenantId: 'tenant-1' }));
    store.create(makeAlert({ tenantId: 'tenant-2' }));
    const result = store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists alerts filtered by severity', () => {
    store.create(makeAlert({ severity: 'critical' }));
    store.create(makeAlert({ severity: 'low' }));
    const result = store.list('tenant-1', { severity: 'critical', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists alerts filtered by status', () => {
    const alert = store.create(makeAlert());
    store.create(makeAlert());
    store.acknowledge(alert.id, 'user-1');
    const result = store.list('tenant-1', { status: 'acknowledged', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists alerts filtered by ruleId', () => {
    store.create(makeAlert({ ruleId: 'rule-a' }));
    store.create(makeAlert({ ruleId: 'rule-b' }));
    const result = store.list('tenant-1', { ruleId: 'rule-a', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('paginates alerts', () => {
    for (let i = 0; i < 5; i++) store.create(makeAlert());
    const page = store.list('tenant-1', { page: 1, limit: 2 });
    expect(page.data.length).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  // ─── Lifecycle FSM ─────────────────────────────────────────────────

  it('acknowledges an open alert', () => {
    const alert = store.create(makeAlert());
    const acked = store.acknowledge(alert.id, 'user-1');
    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledgedBy).toBe('user-1');
    expect(acked.acknowledgedAt).toBeDefined();
  });

  it('resolves an open alert', () => {
    const alert = store.create(makeAlert());
    const resolved = store.resolve(alert.id, 'user-1');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedBy).toBe('user-1');
    expect(resolved.resolvedAt).toBeDefined();
  });

  it('resolves an acknowledged alert', () => {
    const alert = store.create(makeAlert());
    store.acknowledge(alert.id, 'user-1');
    const resolved = store.resolve(alert.id, 'user-1');
    expect(resolved.status).toBe('resolved');
  });

  it('suppresses an open alert', () => {
    const alert = store.create(makeAlert());
    const suppressed = store.suppress(alert.id, 30, 'false positive');
    expect(suppressed.status).toBe('suppressed');
    expect(suppressed.suppressedUntil).toBeDefined();
    expect(suppressed.suppressReason).toBe('false positive');
  });

  it('escalates an open alert', () => {
    const alert = store.create(makeAlert());
    const escalated = store.escalate(alert.id);
    expect(escalated.status).toBe('escalated');
    expect(escalated.escalationLevel).toBe(1);
    expect(escalated.escalatedAt).toBeDefined();
  });

  it('rejects invalid transition: resolved → acknowledged', () => {
    const alert = store.create(makeAlert());
    store.resolve(alert.id, 'user-1');
    expect(() => store.acknowledge(alert.id, 'user-2')).toThrow('Cannot transition');
  });

  it('rejects invalid transition: resolved → escalated', () => {
    const alert = store.create(makeAlert());
    store.resolve(alert.id, 'user-1');
    expect(() => store.escalate(alert.id)).toThrow('Cannot transition');
  });

  it('rejects invalid transition: suppressed → acknowledged', () => {
    const alert = store.create(makeAlert());
    store.suppress(alert.id, 30);
    expect(() => store.acknowledge(alert.id, 'user-1')).toThrow('Cannot transition');
  });

  it('allows suppressed → resolved', () => {
    const alert = store.create(makeAlert());
    store.suppress(alert.id, 30);
    const resolved = store.resolve(alert.id, 'user-1');
    expect(resolved.status).toBe('resolved');
  });

  it('allows suppressed → open (re-open)', () => {
    const alert = store.create(makeAlert());
    store.suppress(alert.id, 30);
    // unsuppress returns to open via unsuppressExpired
    const a = store.getById(alert.id)!;
    // Manually set suppressedUntil to past
    (a as Record<string, unknown>).suppressedUntil = new Date(Date.now() - 1000).toISOString();
    const count = store.unsuppressExpired();
    expect(count).toBe(1);
    expect(store.getById(alert.id)!.status).toBe('open');
  });

  it('throws for non-existent alert on acknowledge', () => {
    expect(() => store.acknowledge('nope', 'user-1')).toThrow('Alert not found');
  });

  // ─── Bulk Operations ──────────────────────────────────────────────

  it('bulk acknowledges alerts', () => {
    const a1 = store.create(makeAlert());
    const a2 = store.create(makeAlert());
    const a3 = store.create(makeAlert());
    store.resolve(a3.id, 'user-1'); // already resolved — should fail

    const result = store.bulkAcknowledge([a1.id, a2.id, a3.id], 'user-1');
    expect(result.acknowledged).toBe(2);
    expect(result.failed).toContain(a3.id);
  });

  it('bulk resolves alerts', () => {
    const a1 = store.create(makeAlert());
    const a2 = store.create(makeAlert());
    store.acknowledge(a1.id, 'user-1');

    const result = store.bulkResolve([a1.id, a2.id], 'user-1');
    expect(result.resolved).toBe(2);
    expect(result.failed.length).toBe(0);
  });

  it('bulk resolve with non-existent IDs', () => {
    const result = store.bulkResolve(['nope1', 'nope2'], 'user-1');
    expect(result.resolved).toBe(0);
    expect(result.failed.length).toBe(2);
  });

  // ─── Stats ─────────────────────────────────────────────────────────

  it('computes alert stats', () => {
    store.create(makeAlert({ severity: 'critical' }));
    store.create(makeAlert({ severity: 'high' }));
    const a3 = store.create(makeAlert({ severity: 'low' }));
    store.resolve(a3.id, 'user-1');

    const stats = store.stats('tenant-1');
    expect(stats.total).toBe(3);
    expect(stats.open).toBe(2);
    expect(stats.resolved).toBe(1);
    expect(stats.bySeverity.critical).toBe(1);
    expect(stats.bySeverity.high).toBe(1);
    expect(stats.bySeverity.low).toBe(1);
    expect(stats.avgResolutionMinutes).toBeGreaterThanOrEqual(0);
  });

  it('returns empty stats for tenant with no alerts', () => {
    const stats = store.stats('empty');
    expect(stats.total).toBe(0);
    expect(stats.avgResolutionMinutes).toBe(0);
  });

  // ─── Unsuppress ────────────────────────────────────────────────────

  it('unsuppresses only expired alerts', () => {
    const a1 = store.create(makeAlert());
    const a2 = store.create(makeAlert());
    store.suppress(a1.id, 1); // 1 min
    store.suppress(a2.id, 9999); // very long

    // Force a1 to be expired
    const alert1 = store.getById(a1.id)!;
    (alert1 as Record<string, unknown>).suppressedUntil = new Date(Date.now() - 1000).toISOString();

    const count = store.unsuppressExpired();
    expect(count).toBe(1);
    expect(store.getById(a1.id)!.status).toBe('open');
    expect(store.getById(a2.id)!.status).toBe('suppressed');
  });

  it('clears all alerts', () => {
    store.create(makeAlert());
    store.clear();
    const result = store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });
});
