import { Prisma } from '@prisma/client';
import type {
  PrismaClient,
  DrpAlert as DbAlert,
  DrpTakedown as DbTakedown,
  DrpAlertFeedback as DbFeedback,
} from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import type { DRPAlert, DRPAlertType, DRPAlertStatus, DRPSeverity, EvidenceChain, AlertFeedback } from './schemas/drp.js';
import type { AIEnrichmentResult, TakedownRequest } from './schemas/p1-p2.js';
import { isUuid, dbCall } from './repository.js';
import { isUniqueViolation, createAssetRepoOps, createScanRepoOps, omitKeys } from './repository-prisma.js';

// ─── Alert (+ embedded AI enrichment / evidence chain) ──────────────

function toDbAlert(row: DRPAlert): Prisma.DrpAlertUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    assetId: row.assetId,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    evidence: row.evidence as unknown as Prisma.InputJsonValue,
    confidence: row.confidence,
    confidenceReasons: row.confidenceReasons as unknown as Prisma.InputJsonValue,
    signalIds: row.signalIds,
    assignedTo: row.assignedTo,
    triageNotes: row.triageNotes,
    tags: row.tags,
    detectedValue: row.detectedValue,
    sourceUrl: row.sourceUrl,
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbAlert(r: DbAlert): DRPAlert {
  return {
    id: r.id,
    tenantId: r.tenantId,
    assetId: r.assetId,
    type: r.type as DRPAlertType,
    severity: r.severity as DRPSeverity,
    status: r.status as DRPAlertStatus,
    title: r.title,
    description: r.description,
    evidence: r.evidence as unknown as DRPAlert['evidence'],
    confidence: r.confidence,
    confidenceReasons: r.confidenceReasons as unknown as DRPAlert['confidenceReasons'],
    signalIds: r.signalIds,
    assignedTo: r.assignedTo,
    triageNotes: r.triageNotes,
    tags: r.tags,
    detectedValue: r.detectedValue,
    sourceUrl: r.sourceUrl,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createAlertRepoOps(prisma: PrismaClient) {
  return {
    async getAlert(tenantId: string, id: string): Promise<DRPAlert | null> {
      if (!isUuid(tenantId) || !isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.drpAlert.findFirst({ where: { id, tenantId } });
        return row ? fromDbAlert(row) : null;
      });
    },
    async upsertAlert(alert: DRPAlert): Promise<DRPAlert> {
      if (!isUuid(alert.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbAlert(alert);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.drpAlert.updateMany({ where: { id: alert.id, tenantId: alert.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.drpAlert.create({ data });
          } catch (err) {
            if (isUniqueViolation(err)) throw new AppError(409, 'Already exists', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.drpAlert.findFirst({ where: { id: alert.id, tenantId: alert.tenantId } });
        return fromDbAlert(saved!);
      });
    },
    async listAlerts(tenantId: string): Promise<DRPAlert[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpAlert.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
        return rows.map(fromDbAlert);
      });
    },
    async listAlertsByAsset(tenantId: string, assetId: string): Promise<DRPAlert[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpAlert.findMany({ where: { tenantId, assetId }, orderBy: { updatedAt: 'desc' } });
        return rows.map(fromDbAlert);
      });
    },
    async setAiEnrichment(tenantId: string, alertId: string, result: AIEnrichmentResult): Promise<void> {
      if (!isUuid(tenantId) || !isUuid(alertId)) return;
      await dbCall(async () => {
        await prisma.drpAlert.updateMany({
          where: { id: alertId, tenantId },
          data: { aiEnrichment: result as unknown as Prisma.InputJsonValue },
        });
      });
    },
    async getAiEnrichment(tenantId: string, alertId: string): Promise<AIEnrichmentResult | null> {
      if (!isUuid(tenantId) || !isUuid(alertId)) return null;
      return dbCall(async () => {
        const row = await prisma.drpAlert.findFirst({ where: { id: alertId, tenantId }, select: { aiEnrichment: true } });
        return row?.aiEnrichment ? (row.aiEnrichment as unknown as AIEnrichmentResult) : null;
      });
    },
    async setEvidenceChain(tenantId: string, chain: EvidenceChain): Promise<void> {
      if (!isUuid(tenantId) || !isUuid(chain.alertId)) return;
      await dbCall(async () => {
        await prisma.drpAlert.updateMany({
          where: { id: chain.alertId, tenantId },
          data: { evidenceChain: chain as unknown as Prisma.InputJsonValue },
        });
      });
    },
    async getEvidenceChain(tenantId: string, alertId: string): Promise<EvidenceChain | null> {
      if (!isUuid(tenantId) || !isUuid(alertId)) return null;
      return dbCall(async () => {
        const row = await prisma.drpAlert.findFirst({ where: { id: alertId, tenantId }, select: { evidenceChain: true } });
        return row?.evidenceChain ? (row.evidenceChain as unknown as EvidenceChain) : null;
      });
    },
    async listEvidenceChains(tenantId: string): Promise<EvidenceChain[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpAlert.findMany({
          where: { tenantId, evidenceChain: { not: Prisma.JsonNull } },
          select: { evidenceChain: true },
        });
        return rows
          .map((r) => r.evidenceChain as unknown as EvidenceChain | null)
          .filter((c): c is EvidenceChain => c !== null);
      });
    },
  };
}

// ─── Takedown ────────────────────────────────────────────────────────

function toDbTakedown(row: TakedownRequest): Prisma.DrpTakedownUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alertId: row.alertId,
    platform: row.platform,
    status: row.status,
    subject: row.subject,
    body: row.body,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    evidence: row.evidence as unknown as Prisma.InputJsonValue,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbTakedown(r: DbTakedown): TakedownRequest {
  return {
    id: r.id,
    tenantId: r.tenantId,
    alertId: r.alertId,
    platform: r.platform,
    status: r.status as TakedownRequest['status'],
    subject: r.subject,
    body: r.body,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    evidence: r.evidence as unknown as TakedownRequest['evidence'],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createTakedownRepoOps(prisma: PrismaClient) {
  return {
    async getTakedown(tenantId: string, id: string): Promise<TakedownRequest | null> {
      if (!isUuid(tenantId) || !isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.drpTakedown.findFirst({ where: { id, tenantId } });
        return row ? fromDbTakedown(row) : null;
      });
    },
    async upsertTakedown(takedown: TakedownRequest): Promise<TakedownRequest> {
      if (!isUuid(takedown.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbTakedown(takedown);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.drpTakedown.updateMany({ where: { id: takedown.id, tenantId: takedown.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.drpTakedown.create({ data });
          } catch (err) {
            if (isUniqueViolation(err)) throw new AppError(409, 'Record id already in use', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.drpTakedown.findFirst({ where: { id: takedown.id, tenantId: takedown.tenantId } });
        return fromDbTakedown(saved!);
      });
    },
    async listTakedownsByAlert(tenantId: string, alertId: string): Promise<TakedownRequest[]> {
      if (!isUuid(tenantId) || !isUuid(alertId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpTakedown.findMany({ where: { tenantId, alertId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbTakedown);
      });
    },
    async listTakedowns(tenantId: string): Promise<TakedownRequest[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpTakedown.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbTakedown);
      });
    },
  };
}

// ─── Feedback ────────────────────────────────────────────────────────

function toDbFeedback(row: AlertFeedback): Prisma.DrpAlertFeedbackUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    alertId: row.alertId,
    verdict: row.verdict,
    reason: row.reason,
    userId: row.userId,
    createdAt: new Date(row.createdAt),
  };
}

function fromDbFeedback(r: DbFeedback): AlertFeedback {
  return {
    id: r.id,
    tenantId: r.tenantId,
    alertId: r.alertId,
    verdict: r.verdict as AlertFeedback['verdict'],
    reason: r.reason,
    userId: r.userId,
    createdAt: r.createdAt.toISOString(),
  };
}

export function createFeedbackRepoOps(prisma: PrismaClient) {
  return {
    async addFeedback(feedback: AlertFeedback): Promise<AlertFeedback> {
      if (!isUuid(feedback.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbFeedback(feedback);
      return dbCall(async () => {
        const saved = await prisma.drpAlertFeedback.create({ data });
        return fromDbFeedback(saved);
      });
    },
    async listFeedback(tenantId: string): Promise<AlertFeedback[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpAlertFeedback.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
        return rows.map(fromDbFeedback);
      });
    },
  };
}

/** Builds the full Postgres-backed DrpRepo (Step 3 S158). */
export function createPrismaDrpRepo(prisma: PrismaClient): import('./repository.js').DrpRepo {
  return {
    ...createAssetRepoOps(prisma),
    ...createAlertRepoOps(prisma),
    ...createScanRepoOps(prisma),
    ...createTakedownRepoOps(prisma),
    ...createFeedbackRepoOps(prisma),
  };
}
