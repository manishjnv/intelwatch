import { describe, it, expect, beforeEach } from 'vitest';
import { AlertStore, alertFingerprint, type CreateAlertInput } from '../src/services/alert-store.js';

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
    store = new AlertStore(undefined, 100);
  });

  // ─── Create ────────────────────────────────────────────────────────

  it('creates an alert in open status', async () => {
    const alert = await store.create(makeAlert());
    expect(alert.id).toBeDefined();
    expect(alert.status).toBe('open');
    expect(alert.severity).toBe('high');
    expect(alert.acknowledgedBy).toBeNull();
    expect(alert.resolvedBy).toBeNull();
    expect(alert.escalationLevel).toBe(0);
    expect(alert.dedupCount).toBe(1);
    expect(alert.nextEscalationAt).toBeNull();
  });

  it('throws when tenant limit reached', async () => {
    const store2 = new AlertStore(undefined, 2);
    await store2.create(makeAlert());
    await store2.create(makeAlert());
    await expect(store2.create(makeAlert())).rejects.toThrow('Alert limit reached');
  });

  // ─── Get / List ────────────────────────────────────────────────────

  it('gets alert by ID', async () => {
    const created = await store.create(makeAlert());
    const found = await store.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  it('returns undefined for non-existent ID', async () => {
    expect(await store.getById('nope')).toBeUndefined();
  });

  it('returns undefined when tenant does not match', async () => {
    const created = await store.create(makeAlert({ tenantId: 'tenant-1' }));
    expect(await store.getById(created.id, 'tenant-2')).toBeUndefined();
    expect(await store.getById(created.id, 'tenant-1')).toBeDefined();
  });

  it('lists alerts filtered by tenant', async () => {
    await store.create(makeAlert({ tenantId: 'tenant-1' }));
    await store.create(makeAlert({ tenantId: 'tenant-2' }));
    const result = await store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists alerts filtered by severity', async () => {
    await store.create(makeAlert({ severity: 'critical' }));
    await store.create(makeAlert({ severity: 'low' }));
    const result = await store.list('tenant-1', { severity: 'critical', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists alerts filtered by status', async () => {
    const alert = await store.create(makeAlert());
    await store.create(makeAlert());
    await store.acknowledge(alert.id, 'user-1');
    const result = await store.list('tenant-1', { status: 'acknowledged', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists alerts filtered by ruleId', async () => {
    await store.create(makeAlert({ ruleId: 'rule-a' }));
    await store.create(makeAlert({ ruleId: 'rule-b' }));
    const result = await store.list('tenant-1', { ruleId: 'rule-a', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('paginates alerts', async () => {
    for (let i = 0; i < 5; i++) await store.create(makeAlert());
    const page = await store.list('tenant-1', { page: 1, limit: 2 });
    expect(page.data.length).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  // ─── Lifecycle FSM ─────────────────────────────────────────────────

  it('acknowledges an open alert', async () => {
    const alert = await store.create(makeAlert());
    const acked = await store.acknowledge(alert.id, 'user-1');
    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledgedBy).toBe('user-1');
    expect(acked.acknowledgedAt).toBeDefined();
  });

  it('resolves an open alert', async () => {
    const alert = await store.create(makeAlert());
    const resolved = await store.resolve(alert.id, 'user-1');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedBy).toBe('user-1');
    expect(resolved.resolvedAt).toBeDefined();
  });

  it('resolves an acknowledged alert', async () => {
    const alert = await store.create(makeAlert());
    await store.acknowledge(alert.id, 'user-1');
    const resolved = await store.resolve(alert.id, 'user-1');
    expect(resolved.status).toBe('resolved');
  });

  it('suppresses an open alert', async () => {
    const alert = await store.create(makeAlert());
    const suppressed = await store.suppress(alert.id, 30, 'false positive');
    expect(suppressed.status).toBe('suppressed');
    expect(suppressed.suppressedUntil).toBeDefined();
    expect(suppressed.suppressReason).toBe('false positive');
  });

  it('escalates an open alert', async () => {
    const alert = await store.create(makeAlert());
    const escalated = await store.escalate(alert.id);
    expect(escalated.status).toBe('escalated');
    expect(escalated.escalationLevel).toBe(1);
    expect(escalated.escalatedAt).toBeDefined();
  });

  it('rejects invalid transition: resolved → acknowledged', async () => {
    const alert = await store.create(makeAlert());
    await store.resolve(alert.id, 'user-1');
    await expect(store.acknowledge(alert.id, 'user-2')).rejects.toThrow('Cannot transition');
  });

  it('rejects invalid transition: resolved → escalated', async () => {
    const alert = await store.create(makeAlert());
    await store.resolve(alert.id, 'user-1');
    await expect(store.escalate(alert.id)).rejects.toThrow('Cannot transition');
  });

  it('rejects invalid transition: suppressed → acknowledged', async () => {
    const alert = await store.create(makeAlert());
    await store.suppress(alert.id, 30, undefined);
    await expect(store.acknowledge(alert.id, 'user-1')).rejects.toThrow('Cannot transition');
  });

  it('allows suppressed → resolved', async () => {
    const alert = await store.create(makeAlert());
    await store.suppress(alert.id, 30, undefined);
    const resolved = await store.resolve(alert.id, 'user-1');
    expect(resolved.status).toBe('resolved');
  });

  it('allows suppressed → open (re-open) via unsuppressExpired', async () => {
    const alert = await store.create(makeAlert());
    await store.suppress(alert.id, -1, undefined); // already expired
    const count = await store.unsuppressExpired();
    expect(count).toBe(1);
    expect((await store.getById(alert.id))!.status).toBe('open');
  });

  it('throws for non-existent alert on acknowledge', async () => {
    await expect(store.acknowledge('nope', 'user-1')).rejects.toThrow('Alert not found');
  });

  // ─── Bulk Operations ──────────────────────────────────────────────

  it('bulk acknowledges alerts', async () => {
    const a1 = await store.create(makeAlert());
    const a2 = await store.create(makeAlert());
    const a3 = await store.create(makeAlert());
    await store.resolve(a3.id, 'user-1'); // already resolved — should fail

    const result = await store.bulkAcknowledge([a1.id, a2.id, a3.id], 'user-1');
    expect(result.acknowledged).toBe(2);
    expect(result.failed).toContain(a3.id);
  });

  it('bulk resolves alerts', async () => {
    const a1 = await store.create(makeAlert());
    const a2 = await store.create(makeAlert());
    await store.acknowledge(a1.id, 'user-1');

    const result = await store.bulkResolve([a1.id, a2.id], 'user-1');
    expect(result.resolved).toBe(2);
    expect(result.failed.length).toBe(0);
  });

  it('bulk resolve with non-existent IDs', async () => {
    const result = await store.bulkResolve(['nope1', 'nope2'], 'user-1');
    expect(result.resolved).toBe(0);
    expect(result.failed.length).toBe(2);
  });

  // ─── Stats ─────────────────────────────────────────────────────────

  it('computes alert stats', async () => {
    await store.create(makeAlert({ severity: 'critical' }));
    await store.create(makeAlert({ severity: 'high' }));
    const a3 = await store.create(makeAlert({ severity: 'low' }));
    await store.resolve(a3.id, 'user-1');

    const stats = await store.stats('tenant-1');
    expect(stats.total).toBe(3);
    expect(stats.open).toBe(2);
    expect(stats.resolved).toBe(1);
    expect(stats.bySeverity.critical).toBe(1);
    expect(stats.bySeverity.high).toBe(1);
    expect(stats.bySeverity.low).toBe(1);
    expect(stats.avgResolutionMinutes).toBeGreaterThanOrEqual(0);
  });

  it('returns empty stats for tenant with no alerts', async () => {
    const stats = await store.stats('empty');
    expect(stats.total).toBe(0);
    expect(stats.avgResolutionMinutes).toBe(0);
  });

  // ─── Unsuppress ────────────────────────────────────────────────────

  it('unsuppresses only expired alerts', async () => {
    const a1 = await store.create(makeAlert());
    const a2 = await store.create(makeAlert());
    await store.suppress(a1.id, -1, undefined); // already expired
    await store.suppress(a2.id, 9999, undefined); // very long

    const count = await store.unsuppressExpired();
    expect(count).toBe(1);
    expect((await store.getById(a1.id))!.status).toBe('open');
    expect((await store.getById(a2.id))!.status).toBe('suppressed');
  });

  it('clears all alerts', async () => {
    await store.create(makeAlert());
    store.clear();
    const result = await store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  // ─── Dedup ───────────────────────────────────────────────────────

  it('findDuplicate returns undefined when no matching fingerprint', async () => {
    await store.create(makeAlert({ fingerprint: 'fp-1' }));
    expect(await store.findDuplicate('tenant-1', 'fp-2')).toBeUndefined();
  });

  it('findDuplicate returns the alert within the dedup window', async () => {
    const alert = await store.create(makeAlert({ fingerprint: 'fp-1' }));
    const dup = await store.findDuplicate('tenant-1', 'fp-1');
    expect(dup?.id).toBe(alert.id);
  });

  it('recordDuplicate increments dedupCount and updates lastSeenAt', async () => {
    const alert = await store.create(makeAlert({ fingerprint: 'fp-1' }));
    const updated = await store.recordDuplicate(alert.id);
    expect(updated?.dedupCount).toBe(2);
  });

  // ─── Escalation state ──────────────────────────────────────────────

  it('setEscalation persists policy/step/nextEscalationAt on the alert', async () => {
    const alert = await store.create(makeAlert());
    const next = new Date(Date.now() + 60_000).toISOString();
    const updated = await store.setEscalation(alert.id, { escalationPolicyId: 'policy-1', escalationStep: 0, nextEscalationAt: next });
    expect(updated?.escalationPolicyId).toBe('policy-1');
    expect(updated?.nextEscalationAt).toBe(next);
  });

  it('listDueEscalations returns alerts whose nextEscalationAt has passed', async () => {
    const alert = await store.create(makeAlert());
    await store.setEscalation(alert.id, { escalationPolicyId: 'p1', escalationStep: 0, nextEscalationAt: new Date(Date.now() - 1000).toISOString() });
    const future = await store.create(makeAlert());
    await store.setEscalation(future.id, { escalationPolicyId: 'p1', escalationStep: 0, nextEscalationAt: new Date(Date.now() + 60_000).toISOString() });

    const due = await store.listDueEscalations();
    expect(due.map((a) => a.id)).toContain(alert.id);
    expect(due.map((a) => a.id)).not.toContain(future.id);
  });

  it('autoEscalate transitions an open alert to escalated', async () => {
    const alert = await store.create(makeAlert());
    const escalated = await store.autoEscalate(alert);
    expect(escalated.status).toBe('escalated');
    expect(escalated.escalationLevel).toBe(1);
  });

  it('autoEscalate bumps level for an already-escalated alert without re-transitioning', async () => {
    const alert = await store.create(makeAlert());
    const escalated = await store.escalate(alert.id);
    const bumped = await store.autoEscalate(escalated);
    expect(bumped.status).toBe('escalated');
    expect(bumped.escalationLevel).toBe(2);
  });

  it('autoEscalate leaves a resolved alert unchanged', async () => {
    const alert = await store.create(makeAlert());
    const resolved = await store.resolve(alert.id, 'user-1');
    const result = await store.autoEscalate(resolved);
    expect(result.status).toBe('resolved');
  });
});

describe('alertFingerprint (moved from the removed DedupStore)', () => {
  it('generates consistent fingerprints for same inputs', () => {
    const fp1 = alertFingerprint('rule-1', 'high', { ip: '1.2.3.4' });
    const fp2 = alertFingerprint('rule-1', 'high', { ip: '1.2.3.4' });
    expect(fp1).toBe(fp2);
  });

  it('generates different fingerprints for different rules', () => {
    const fp1 = alertFingerprint('rule-1', 'high', { ip: '1.2.3.4' });
    const fp2 = alertFingerprint('rule-2', 'high', { ip: '1.2.3.4' });
    expect(fp1).not.toBe(fp2);
  });

  it('generates different fingerprints for different severities', () => {
    const fp1 = alertFingerprint('rule-1', 'high');
    const fp2 = alertFingerprint('rule-1', 'critical');
    expect(fp1).not.toBe(fp2);
  });

  it('generates different fingerprints for different sources', () => {
    const fp1 = alertFingerprint('rule-1', 'high', { ip: '1.2.3.4' });
    const fp2 = alertFingerprint('rule-1', 'high', { ip: '5.6.7.8' });
    expect(fp1).not.toBe(fp2);
  });

  it('sorts source keys for consistent hashing', () => {
    const fp1 = alertFingerprint('rule-1', 'high', { a: 1, b: 2 });
    const fp2 = alertFingerprint('rule-1', 'high', { b: 2, a: 1 });
    expect(fp1).toBe(fp2);
  });

  it('handles empty source', () => {
    const fp1 = alertFingerprint('rule-1', 'high');
    const fp2 = alertFingerprint('rule-1', 'high', undefined);
    expect(fp1).toBe(fp2);
  });
});
