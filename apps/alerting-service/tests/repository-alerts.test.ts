/**
 * Alert/AlertHistory/AlertGroup repository unit tests — mocked PrismaClient (Step 3 S155).
 * Mirrors tests/repository.test.ts: UUID short-circuiting, Date<->ISO mapping, tenant
 * validation, DB_UNAVAILABLE mapping, and expectStatus-scoped updates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { createAlertRepo, createAlertHistoryRepo, createAlertGroupRepo } from '../src/repository-prisma-alerts.js';
import type { Alert } from '../src/services/alert-store.js';
import type { HistoryEntry } from '../src/services/alert-history.js';
import type { AlertGroup } from '../src/services/alert-group-store.js';

function createMockPrisma() {
  return {
    alert: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    alertHistoryEntry: { findMany: vi.fn(), create: vi.fn() },
    alertGroup: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

const TENANT = randomUUID();

function makeAlert(overrides?: Partial<Alert>): Alert {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    ruleId: 'rule-1',
    ruleName: 'Test Rule',
    tenantId: TENANT,
    severity: 'high',
    status: 'open',
    title: 'T',
    description: '',
    source: {},
    fingerprint: null,
    dedupCount: 1,
    lastSeenAt: now,
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    suppressedUntil: null,
    suppressReason: null,
    escalationLevel: 0,
    escalatedAt: null,
    escalationPolicyId: null,
    escalationStep: 0,
    nextEscalationAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function dbRowFrom(alert: Alert): Record<string, unknown> {
  return {
    ...alert,
    lastSeenAt: new Date(alert.lastSeenAt),
    acknowledgedAt: alert.acknowledgedAt ? new Date(alert.acknowledgedAt) : null,
    resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : null,
    suppressedUntil: alert.suppressedUntil ? new Date(alert.suppressedUntil) : null,
    escalatedAt: alert.escalatedAt ? new Date(alert.escalatedAt) : null,
    nextEscalationAt: alert.nextEscalationAt ? new Date(alert.nextEscalationAt) : null,
    createdAt: new Date(alert.createdAt),
    updatedAt: new Date(alert.updatedAt),
  };
}

describe('alert repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createAlertRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createAlertRepo(db as unknown as PrismaClient);
  });

  it('list passes where: { tenantId } and orders newest first', async () => {
    db.alert.findMany.mockResolvedValue([]);
    await repo.list(TENANT);
    expect(db.alert.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT }, orderBy: { createdAt: 'desc' } });
  });

  it('non-UUID tenantId short-circuits list to [] without calling Prisma', async () => {
    expect(await repo.list('default')).toEqual([]);
    expect(db.alert.findMany).not.toHaveBeenCalled();
  });

  it('non-UUID id short-circuits get to null without calling Prisma', async () => {
    expect(await repo.get('not-a-uuid')).toBeNull();
    expect(db.alert.findUnique).not.toHaveBeenCalled();
  });

  it('maps Date fields to ISO strings on read', async () => {
    const alert = makeAlert({ acknowledgedAt: new Date().toISOString() });
    db.alert.findUnique.mockResolvedValue(dbRowFrom(alert));
    const result = await repo.get(alert.id);
    expect(result!.acknowledgedAt).toBe(alert.acknowledgedAt);
    expect(result!.createdAt).toBe(alert.createdAt);
  });

  it('maps ISO strings to Date on insert (create data)', async () => {
    const alert = makeAlert();
    db.alert.create.mockResolvedValue(dbRowFrom(alert));
    await repo.insert(alert);
    const call = db.alert.create.mock.calls[0]![0];
    expect(call.data.lastSeenAt).toBeInstanceOf(Date);
    expect(call.data.lastSeenAt.toISOString()).toBe(alert.lastSeenAt);
  });

  it('insert with a non-UUID tenantId throws 400 VALIDATION_ERROR without calling Prisma', async () => {
    const alert = makeAlert({ tenantId: 'default' });
    await expect(repo.insert(alert)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(db.alert.create).not.toHaveBeenCalled();
  });

  it('update with expectStatus scopes the updateMany where clause to that status', async () => {
    const alert = makeAlert();
    db.alert.updateMany.mockResolvedValue({ count: 1 });
    db.alert.findUnique.mockResolvedValue(dbRowFrom({ ...alert, status: 'acknowledged' }));
    await repo.update(alert.id, { status: 'acknowledged' }, 'open');
    expect(db.alert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: alert.id, status: 'open' } }),
    );
  });

  it('update returns null when no row matched expectStatus (optimistic FSM check)', async () => {
    db.alert.updateMany.mockResolvedValue({ count: 0 });
    const result = await repo.update(randomUUID(), { status: 'resolved' }, 'open');
    expect(result).toBeNull();
    expect(db.alert.findUnique).not.toHaveBeenCalled();
  });

  it('non-UUID id short-circuits update to null without calling Prisma', async () => {
    expect(await repo.update('nope', { status: 'resolved' })).toBeNull();
    expect(db.alert.updateMany).not.toHaveBeenCalled();
  });

  it('incrementDedup uses an atomic increment and returns the refreshed row', async () => {
    const alert = makeAlert({ dedupCount: 1 });
    db.alert.updateMany.mockResolvedValue({ count: 1 });
    db.alert.findUnique.mockResolvedValue(dbRowFrom({ ...alert, dedupCount: 2 }));
    const now = new Date();
    const result = await repo.incrementDedup(alert.id, now);
    expect(db.alert.updateMany).toHaveBeenCalledWith({
      where: { id: alert.id },
      data: { dedupCount: { increment: 1 }, lastSeenAt: now },
    });
    expect(result!.dedupCount).toBe(2);
  });

  it('listDueEscalations filters nextEscalationAt <= now, ordered ascending, limited', async () => {
    db.alert.findMany.mockResolvedValue([]);
    const now = new Date();
    await repo.listDueEscalations(now, 10);
    expect(db.alert.findMany).toHaveBeenCalledWith({
      where: { nextEscalationAt: { lte: now } },
      orderBy: { nextEscalationAt: 'asc' },
      take: 10,
    });
  });

  it('unsuppressExpired issues one updateMany and returns the count', async () => {
    db.alert.updateMany.mockResolvedValue({ count: 3 });
    const now = new Date();
    const count = await repo.unsuppressExpired(now);
    expect(count).toBe(3);
    expect(db.alert.updateMany).toHaveBeenCalledWith({
      where: { status: 'suppressed', suppressedUntil: { lte: now } },
      data: { status: 'open', suppressedUntil: null, suppressReason: null },
    });
  });

  it('Prisma rejecting maps to AppError 503 DB_UNAVAILABLE', async () => {
    db.alert.findMany.mockRejectedValue(new Error('connection refused'));
    await expect(repo.list(TENANT)).rejects.toBeInstanceOf(AppError);
    await expect(repo.list(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });
});

describe('alert history repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createAlertHistoryRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createAlertHistoryRepo(db as unknown as PrismaClient);
  });

  function makeEntry(overrides?: Partial<HistoryEntry & { tenantId: string }>): HistoryEntry & { tenantId: string } {
    return {
      id: randomUUID(),
      tenantId: TENANT,
      alertId: randomUUID(),
      action: 'created',
      fromStatus: null,
      toStatus: 'open',
      actor: 'system',
      reason: null,
      metadata: {},
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it('append maps timestamp to createdAt on write', async () => {
    const entry = makeEntry();
    db.alertHistoryEntry.create.mockResolvedValue({ ...entry, createdAt: new Date(entry.timestamp) });
    await repo.append(entry);
    const call = db.alertHistoryEntry.create.mock.calls[0]![0];
    expect(call.data.createdAt).toBeInstanceOf(Date);
  });

  it('append with a non-UUID alertId throws 400 without calling Prisma', async () => {
    const entry = makeEntry({ alertId: 'not-a-uuid' });
    await expect(repo.append(entry)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(db.alertHistoryEntry.create).not.toHaveBeenCalled();
  });

  it('listByAlert orders oldest first', async () => {
    db.alertHistoryEntry.findMany.mockResolvedValue([]);
    const alertId = randomUUID();
    await repo.listByAlert(alertId);
    expect(db.alertHistoryEntry.findMany).toHaveBeenCalledWith({ where: { alertId }, orderBy: { createdAt: 'asc' } });
  });

  it('non-UUID alertId short-circuits listByAlert to [] without calling Prisma', async () => {
    expect(await repo.listByAlert('nope')).toEqual([]);
    expect(db.alertHistoryEntry.findMany).not.toHaveBeenCalled();
  });
});

describe('alert group repo', () => {
  let db: MockPrisma;
  let repo: ReturnType<typeof createAlertGroupRepo>;

  beforeEach(() => {
    db = createMockPrisma();
    repo = createAlertGroupRepo(db as unknown as PrismaClient);
  });

  function makeGroup(overrides?: Partial<AlertGroup>): AlertGroup {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      fingerprint: 'fp-1',
      ruleId: 'rule-1',
      tenantId: TENANT,
      severity: 'high',
      title: 'T',
      alertIds: ['a1'],
      firstAlertAt: now,
      lastAlertAt: now,
      status: 'active',
      ...overrides,
    };
  }

  it('findActive filters by tenant/fingerprint/status active, newest first', async () => {
    db.alertGroup.findFirst.mockResolvedValue(null);
    await repo.findActive(TENANT, 'fp-1');
    expect(db.alertGroup.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, fingerprint: 'fp-1', status: 'active' },
      orderBy: { firstAlertAt: 'desc' },
    });
  });

  it('appendAlert pushes into alertIds and bumps lastAlertAt', async () => {
    const group = makeGroup();
    db.alertGroup.updateMany.mockResolvedValue({ count: 1 });
    db.alertGroup.findUnique.mockResolvedValue({ ...group, alertIds: [...group.alertIds, 'a2'], firstAlertAt: new Date(group.firstAlertAt), lastAlertAt: new Date() });
    const now = new Date();
    await repo.appendAlert(group.id, 'a2', now);
    expect(db.alertGroup.updateMany).toHaveBeenCalledWith({
      where: { id: group.id },
      data: { alertIds: { push: 'a2' }, lastAlertAt: now },
    });
  });

  it('setStatus updates the status column', async () => {
    const group = makeGroup();
    db.alertGroup.updateMany.mockResolvedValue({ count: 1 });
    db.alertGroup.findUnique.mockResolvedValue({ ...group, status: 'resolved', firstAlertAt: new Date(group.firstAlertAt), lastAlertAt: new Date(group.lastAlertAt) });
    await repo.setStatus(group.id, 'resolved');
    expect(db.alertGroup.updateMany).toHaveBeenCalledWith({ where: { id: group.id }, data: { status: 'resolved' } });
  });

  it('insert with a non-UUID tenantId throws 400 without calling Prisma', async () => {
    const group = makeGroup({ tenantId: 'default' });
    await expect(repo.insert(group)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(db.alertGroup.create).not.toHaveBeenCalled();
  });

  it('Prisma rejecting maps to AppError 503 DB_UNAVAILABLE', async () => {
    db.alertGroup.findMany.mockRejectedValue(new Error('down'));
    await expect(repo.list(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });
});
