import type {
  PrismaClient,
  Prisma,
  AlertRule as DbAlertRule,
  AlertChannel as DbAlertChannel,
  AlertEscalationPolicy as DbAlertEscalationPolicy,
  AlertMaintenanceWindow as DbAlertMaintenanceWindow,
} from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import type { RuleCondition, AlertSeverity, ChannelConfig, ChannelType, EscalationStep } from './schemas/alert.js';
import type { AlertRule } from './services/rule-store.js';
import type { NotificationChannel } from './services/channel-store.js';
import type { EscalationPolicy } from './services/escalation-store.js';
import type { MaintenanceWindow } from './services/maintenance-store.js';
import type { ChannelCrypto } from './services/channel-crypto.js';
import { isUuid, dbCall, type Repo } from './repository.js';

/** Prisma P2002 = unique constraint violation. */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Strips these keys from a Prisma create-input, producing the payload safe for `updateMany` (never re-sets id/tenantId/createdAt). */
function omitKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...obj } as Record<string, unknown>;
  for (const k of keys) delete copy[k as string];
  return copy as Omit<T, K>;
}

// ─── AlertRule ─────────────────────────────────────────────────────

function toDbRule(row: AlertRule): Prisma.AlertRuleUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    severity: row.severity,
    condition: row.condition as unknown as Prisma.InputJsonValue, // app condition is a Zod-validated discriminated union
    enabled: row.enabled,
    channelIds: row.channelIds,
    escalationPolicyId: row.escalationPolicyId,
    cooldownMinutes: row.cooldownMinutes,
    tags: row.tags,
    lastTriggeredAt: row.lastTriggeredAt ? new Date(row.lastTriggeredAt) : null,
    triggerCount: row.triggerCount,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbRule(r: DbAlertRule): AlertRule {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    description: r.description,
    severity: r.severity as AlertSeverity,
    condition: r.condition as unknown as RuleCondition, // stored as validated Json — cast back
    enabled: r.enabled,
    channelIds: r.channelIds,
    escalationPolicyId: r.escalationPolicyId,
    cooldownMinutes: r.cooldownMinutes,
    tags: r.tags,
    lastTriggeredAt: r.lastTriggeredAt ? r.lastTriggeredAt.toISOString() : null,
    triggerCount: r.triggerCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createRuleRepo(prisma: PrismaClient): Repo<AlertRule> {
  return {
    async list(tenantId) {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alertRule.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbRule);
      });
    },
    async get(id) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.alertRule.findUnique({ where: { id } });
        return row ? fromDbRule(row) : null;
      });
    },
    async save(row) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbRule(row);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.alertRule.updateMany({ where: { id: row.id, tenantId: row.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.alertRule.create({ data });
          } catch (err) {
            if (isP2002(err)) throw new AppError(409, 'Record id already in use', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.alertRule.findFirst({ where: { id: row.id, tenantId: row.tenantId } });
        return fromDbRule(saved!);
      });
    },
    async delete(id) {
      if (!isUuid(id)) return false;
      return dbCall(async () => {
        const result = await prisma.alertRule.deleteMany({ where: { id } });
        return result.count > 0;
      });
    },
  };
}

// ─── AlertChannel ──────────────────────────────────────────────────

function toDbChannel(row: NotificationChannel, crypto: ChannelCrypto): Prisma.AlertChannelUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    type: row.type,
    configEnc: crypto.encrypt(row.config), // plaintext config never reaches Prisma
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt ? new Date(row.lastTestedAt) : null,
    lastTestSuccess: row.lastTestSuccess,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbChannel(r: DbAlertChannel, crypto: ChannelCrypto): NotificationChannel {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    type: r.type as ChannelType,
    config: crypto.decrypt<ChannelConfig>(r.configEnc),
    enabled: r.enabled,
    lastTestedAt: r.lastTestedAt ? r.lastTestedAt.toISOString() : null,
    lastTestSuccess: r.lastTestSuccess,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createChannelRepo(prisma: PrismaClient, crypto: ChannelCrypto): Repo<NotificationChannel> {
  return {
    async list(tenantId) {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alertChannel.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map((r) => fromDbChannel(r, crypto));
      });
    },
    async get(id) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.alertChannel.findUnique({ where: { id } });
        return row ? fromDbChannel(row, crypto) : null;
      });
    },
    async save(row) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbChannel(row, crypto);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.alertChannel.updateMany({ where: { id: row.id, tenantId: row.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.alertChannel.create({ data });
          } catch (err) {
            if (isP2002(err)) throw new AppError(409, 'Record id already in use', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.alertChannel.findFirst({ where: { id: row.id, tenantId: row.tenantId } });
        return fromDbChannel(saved!, crypto);
      });
    },
    async delete(id) {
      if (!isUuid(id)) return false;
      return dbCall(async () => {
        const result = await prisma.alertChannel.deleteMany({ where: { id } });
        return result.count > 0;
      });
    },
  };
}

// ─── AlertEscalationPolicy ─────────────────────────────────────────

function toDbEscalation(row: EscalationPolicy): Prisma.AlertEscalationPolicyUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    steps: row.steps as unknown as Prisma.InputJsonValue, // Zod-validated EscalationStep[]
    repeatAfterMinutes: row.repeatAfterMinutes,
    enabled: row.enabled,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbEscalation(r: DbAlertEscalationPolicy): EscalationPolicy {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    steps: r.steps as unknown as EscalationStep[], // stored as validated Json — cast back
    repeatAfterMinutes: r.repeatAfterMinutes,
    enabled: r.enabled,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createEscalationRepo(prisma: PrismaClient): Repo<EscalationPolicy> {
  return {
    async list(tenantId) {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alertEscalationPolicy.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbEscalation);
      });
    },
    async get(id) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.alertEscalationPolicy.findUnique({ where: { id } });
        return row ? fromDbEscalation(row) : null;
      });
    },
    async save(row) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbEscalation(row);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.alertEscalationPolicy.updateMany({ where: { id: row.id, tenantId: row.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.alertEscalationPolicy.create({ data });
          } catch (err) {
            if (isP2002(err)) throw new AppError(409, 'Record id already in use', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.alertEscalationPolicy.findFirst({ where: { id: row.id, tenantId: row.tenantId } });
        return fromDbEscalation(saved!);
      });
    },
    async delete(id) {
      if (!isUuid(id)) return false;
      return dbCall(async () => {
        const result = await prisma.alertEscalationPolicy.deleteMany({ where: { id } });
        return result.count > 0;
      });
    },
  };
}

// ─── AlertMaintenanceWindow ────────────────────────────────────────

function toDbMaintenance(row: MaintenanceWindow): Prisma.AlertMaintenanceWindowUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    startAt: new Date(row.startAt),
    endAt: new Date(row.endAt),
    suppressAllRules: row.suppressAllRules,
    ruleIds: row.ruleIds,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbMaintenance(r: DbAlertMaintenanceWindow): MaintenanceWindow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    suppressAllRules: r.suppressAllRules,
    ruleIds: r.ruleIds,
    reason: r.reason,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createMaintenanceRepo(prisma: PrismaClient): Repo<MaintenanceWindow> {
  return {
    async list(tenantId) {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.alertMaintenanceWindow.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbMaintenance);
      });
    },
    async get(id) {
      if (!isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.alertMaintenanceWindow.findUnique({ where: { id } });
        return row ? fromDbMaintenance(row) : null;
      });
    },
    async save(row) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbMaintenance(row);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.alertMaintenanceWindow.updateMany({ where: { id: row.id, tenantId: row.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.alertMaintenanceWindow.create({ data });
          } catch (err) {
            if (isP2002(err)) throw new AppError(409, 'Record id already in use', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.alertMaintenanceWindow.findFirst({ where: { id: row.id, tenantId: row.tenantId } });
        return fromDbMaintenance(saved!);
      });
    },
    async delete(id) {
      if (!isUuid(id)) return false;
      return dbCall(async () => {
        const result = await prisma.alertMaintenanceWindow.deleteMany({ where: { id } });
        return result.count > 0;
      });
    },
  };
}
