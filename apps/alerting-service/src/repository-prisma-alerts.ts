import type { PrismaClient, Prisma, Alert as DbAlert, AlertHistoryEntry as DbAlertHistoryEntry, AlertGroup as DbAlertGroup } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import type { Alert } from './services/alert-store.js';
import type { AlertStatus } from './schemas/alert.js';
import type { HistoryEntry } from './services/alert-history.js';
import type { AlertGroup } from './services/alert-group-store.js';
import { isUuid, dbCall, type AlertRepo, type AlertHistoryRepo, type AlertGroupRepo, type AlertPatch } from './repository.js';

// ─── Alert ─────────────────────────────────────────────────────────

function toDbAlert(row: Alert): Prisma.AlertUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    source: row.source as unknown as Prisma.InputJsonValue, // app source is a free-form record
    fingerprint: row.fingerprint,
    dedupCount: row.dedupCount,
    lastSeenAt: new Date(row.lastSeenAt),
    acknowledgedBy: row.acknowledgedBy,
    acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt) : null,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
    suppressedUntil: row.suppressedUntil ? new Date(row.suppressedUntil) : null,
    suppressReason: row.suppressReason,
    escalationLevel: row.escalationLevel,
    escalatedAt: row.escalatedAt ? new Date(row.escalatedAt) : null,
    escalationPolicyId: row.escalationPolicyId,
    escalationStep: row.escalationStep,
    nextEscalationAt: row.nextEscalationAt ? new Date(row.nextEscalationAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbAlert(r: DbAlert): Alert {
  return {
    id: r.id,
    tenantId: r.tenantId,
    ruleId: r.ruleId,
    ruleName: r.ruleName,
    severity: r.severity as Alert['severity'],
    status: r.status as AlertStatus,
    title: r.title,
    description: r.description,
    source: r.source as unknown as Record<string, unknown>, // stored as validated Json — cast back
    fingerprint: r.fingerprint,
    dedupCount: r.dedupCount,
    lastSeenAt: r.lastSeenAt.toISOString(),
    acknowledgedBy: r.acknowledgedBy,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    resolvedBy: r.resolvedBy,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    suppressedUntil: r.suppressedUntil ? r.suppressedUntil.toISOString() : null,
    suppressReason: r.suppressReason,
    escalationLevel: r.escalationLevel,
    escalatedAt: r.escalatedAt ? r.escalatedAt.toISOString() : null,
    escalationPolicyId: r.escalationPolicyId,
    escalationStep: r.escalationStep,
    nextEscalationAt: r.nextEscalationAt ? r.nextEscalationAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Builds the Alert patch data Prisma needs, converting ISO date fields back to Date. */
function toDbPatch(patch: AlertPatch): Prisma.AlertUncheckedUpdateManyInput {
  const data: Prisma.AlertUncheckedUpdateManyInput = { ...patch } as Prisma.AlertUncheckedUpdateManyInput;
  if (patch.source !== undefined) data.source = patch.source as unknown as Prisma.InputJsonValue;
  if ('lastSeenAt' in patch) data.lastSeenAt = new Date(patch.lastSeenAt!);
  if ('acknowledgedAt' in patch) data.acknowledgedAt = patch.acknowledgedAt ? new Date(patch.acknowledgedAt) : null;
  if ('resolvedAt' in patch) data.resolvedAt = patch.resolvedAt ? new Date(patch.resolvedAt) : null;
  if ('suppressedUntil' in patch) data.suppressedUntil = patch.suppressedUntil ? new Date(patch.suppressedUntil) : null;
  if ('escalatedAt' in patch) data.escalatedAt = patch.escalatedAt ? new Date(patch.escalatedAt) : null;
  if ('nextEscalationAt' in patch) data.nextEscalationAt = patch.nextEscalationAt ? new Date(patch.nextEscalationAt) : null;
  if ('updatedAt' in patch) data.updatedAt = new Date(patch.updatedAt!);
  return data;
}

export function createAlertRepo(prisma: PrismaClient): AlertRepo {
  return {
    async get(id) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.alert.findUnique({ where: { id } });
        return row ? fromDbAlert(row) : null;
      });
    },
    async insert(row) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbAlert(row);
      return dbCall(async () => {
        const saved = await prisma.alert.create({ data });
        return fromDbAlert(saved);
      });
    },
    async update(id, patch, expectStatus) {
      if (!isUuid(id)) return null;
      const data = toDbPatch(patch);
      return dbCall(async () => {
        const where = expectStatus !== undefined ? { id, status: expectStatus } : { id };
        const result = await prisma.alert.updateMany({ where, data });
        if (result.count === 0) return null;
        const row = await prisma.alert.findUnique({ where: { id } });
        return row ? fromDbAlert(row) : null;
      });
    },
    async list(tenantId) {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alert.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbAlert);
      });
    },
    async count(tenantId) {
      if (!isUuid(tenantId)) return 0;
      return dbCall(async () => prisma.alert.count({ where: { tenantId } }));
    },
    async findByFingerprint(tenantId, fingerprint, since) {
      if (!isUuid(tenantId)) return null;
      return dbCall(async () => {
        const row = await prisma.alert.findFirst({
          where: { tenantId, fingerprint, lastSeenAt: { gte: since } },
          orderBy: { lastSeenAt: 'desc' },
        });
        return row ? fromDbAlert(row) : null;
      });
    },
    async incrementDedup(id, now) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const result = await prisma.alert.updateMany({
          where: { id },
          data: { dedupCount: { increment: 1 }, lastSeenAt: now },
        });
        if (result.count === 0) return null;
        const row = await prisma.alert.findUnique({ where: { id } });
        return row ? fromDbAlert(row) : null;
      });
    },
    async listDueEscalations(now, limit) {
      return dbCall(async () => {
        const rows = await prisma.alert.findMany({
          where: { nextEscalationAt: { lte: now } },
          orderBy: { nextEscalationAt: 'asc' },
          take: limit,
        });
        return rows.map(fromDbAlert);
      });
    },
    async unsuppressExpired(now) {
      return dbCall(async () => {
        const result = await prisma.alert.updateMany({
          where: { status: 'suppressed', suppressedUntil: { lte: now } },
          data: { status: 'open', suppressedUntil: null, suppressReason: null },
        });
        return result.count;
      });
    },
  };
}

// ─── AlertHistoryEntry ─────────────────────────────────────────────

function toDbHistory(entry: HistoryEntry & { tenantId: string }): Prisma.AlertHistoryEntryUncheckedCreateInput {
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    alertId: entry.alertId,
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actor: entry.actor,
    reason: entry.reason,
    metadata: entry.metadata as unknown as Prisma.InputJsonValue,
    createdAt: new Date(entry.timestamp),
  };
}

function fromDbHistory(r: DbAlertHistoryEntry): HistoryEntry {
  return {
    id: r.id,
    alertId: r.alertId,
    action: r.action,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    actor: r.actor,
    reason: r.reason,
    metadata: r.metadata as unknown as Record<string, unknown>,
    timestamp: r.createdAt.toISOString(),
  };
}

export function createAlertHistoryRepo(prisma: PrismaClient): AlertHistoryRepo {
  return {
    async append(entry) {
      if (!isUuid(entry.tenantId) || !isUuid(entry.alertId)) {
        throw new AppError(400, 'tenantId and alertId must be UUIDs', 'VALIDATION_ERROR');
      }
      const data = toDbHistory(entry);
      return dbCall(async () => {
        const saved = await prisma.alertHistoryEntry.create({ data });
        return fromDbHistory(saved);
      });
    },
    async listByAlert(alertId) {
      if (!isUuid(alertId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alertHistoryEntry.findMany({ where: { alertId }, orderBy: { createdAt: 'asc' } });
        return rows.map(fromDbHistory);
      });
    },
  };
}

// ─── AlertGroup ────────────────────────────────────────────────────

function toDbGroup(row: AlertGroup): Prisma.AlertGroupUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fingerprint: row.fingerprint,
    ruleId: row.ruleId,
    severity: row.severity,
    title: row.title,
    alertIds: row.alertIds,
    firstAlertAt: new Date(row.firstAlertAt),
    lastAlertAt: new Date(row.lastAlertAt),
    status: row.status,
  };
}

function fromDbGroup(r: DbAlertGroup): AlertGroup {
  return {
    id: r.id,
    tenantId: r.tenantId,
    fingerprint: r.fingerprint,
    ruleId: r.ruleId,
    severity: r.severity,
    title: r.title,
    alertIds: r.alertIds,
    firstAlertAt: r.firstAlertAt.toISOString(),
    lastAlertAt: r.lastAlertAt.toISOString(),
    status: r.status as AlertGroup['status'],
  };
}

export function createAlertGroupRepo(prisma: PrismaClient): AlertGroupRepo {
  return {
    async get(id) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.alertGroup.findUnique({ where: { id } });
        return row ? fromDbGroup(row) : null;
      });
    },
    async insert(row) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbGroup(row);
      return dbCall(async () => {
        const saved = await prisma.alertGroup.create({ data });
        return fromDbGroup(saved);
      });
    },
    async list(tenantId) {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alertGroup.findMany({ where: { tenantId }, orderBy: { lastAlertAt: 'desc' } });
        return rows.map(fromDbGroup);
      });
    },
    async findActive(tenantId, fingerprint) {
      if (!isUuid(tenantId)) return null;
      return dbCall(async () => {
        const row = await prisma.alertGroup.findFirst({
          where: { tenantId, fingerprint, status: 'active' },
          orderBy: { firstAlertAt: 'desc' },
        });
        return row ? fromDbGroup(row) : null;
      });
    },
    async appendAlert(id, alertId, now) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const result = await prisma.alertGroup.updateMany({
          where: { id },
          data: { alertIds: { push: alertId }, lastAlertAt: now },
        });
        if (result.count === 0) return null;
        const row = await prisma.alertGroup.findUnique({ where: { id } });
        return row ? fromDbGroup(row) : null;
      });
    },
    async setStatus(id, status) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const result = await prisma.alertGroup.updateMany({ where: { id }, data: { status } });
        if (result.count === 0) return null;
        const row = await prisma.alertGroup.findUnique({ where: { id } });
        return row ? fromDbGroup(row) : null;
      });
    },
  };
}
