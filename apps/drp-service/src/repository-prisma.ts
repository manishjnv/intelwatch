import type { PrismaClient, Prisma, DrpAsset as DbAsset, DrpScan as DbScan } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import type { MonitoredAsset, AssetType, ScanResult, DRPAlertType } from './schemas/drp.js';
import { isUuid, dbCall } from './repository.js';

/** Strips these keys from a Prisma create-input, producing the payload safe for `updateMany` (never re-sets id/tenantId/createdAt). */
export function omitKeys<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...obj } as Record<string, unknown>;
  for (const k of keys) delete copy[k as string];
  return copy as Omit<T, K>;
}

// ─── Asset ───────────────────────────────────────────────────────────

function toDbAsset(row: MonitoredAsset): Prisma.DrpAssetUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    value: row.value,
    displayName: row.displayName,
    enabled: row.enabled,
    scanFrequencyHours: row.scanFrequencyHours,
    lastScannedAt: row.lastScannedAt ? new Date(row.lastScannedAt) : null,
    alertCount: row.alertCount,
    criticality: row.criticality,
    tags: row.tags,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function fromDbAsset(r: DbAsset): MonitoredAsset {
  return {
    id: r.id,
    tenantId: r.tenantId,
    type: r.type as AssetType,
    value: r.value,
    displayName: r.displayName,
    enabled: r.enabled,
    scanFrequencyHours: r.scanFrequencyHours,
    lastScannedAt: r.lastScannedAt ? r.lastScannedAt.toISOString() : null,
    alertCount: r.alertCount,
    criticality: r.criticality,
    tags: r.tags,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function createAssetRepoOps(prisma: PrismaClient) {
  return {
    async getAsset(tenantId: string, id: string): Promise<MonitoredAsset | null> {
      if (!isUuid(tenantId) || !isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.drpAsset.findFirst({ where: { id, tenantId } });
        return row ? fromDbAsset(row) : null;
      });
    },
    async upsertAsset(asset: MonitoredAsset): Promise<MonitoredAsset> {
      if (!isUuid(asset.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbAsset(asset);
      const updateData = omitKeys(data, ['id', 'tenantId', 'createdAt']);
      return dbCall(async () => {
        const res = await prisma.drpAsset.updateMany({ where: { id: asset.id, tenantId: asset.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.drpAsset.create({ data });
          } catch (err) {
            if (isUniqueViolation(err)) throw new AppError(409, 'Already exists', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.drpAsset.findFirst({ where: { id: asset.id, tenantId: asset.tenantId } });
        return fromDbAsset(saved!);
      });
    },
    async deleteAsset(tenantId: string, id: string): Promise<boolean> {
      if (!isUuid(tenantId) || !isUuid(id)) return false;
      return dbCall(async () => {
        const result = await prisma.drpAsset.deleteMany({ where: { id, tenantId } });
        return result.count > 0;
      });
    },
    async listAssets(tenantId: string): Promise<MonitoredAsset[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpAsset.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
        return rows.map(fromDbAsset);
      });
    },
    async countAssets(tenantId: string): Promise<number> {
      if (!isUuid(tenantId)) return 0;
      return dbCall(async () => prisma.drpAsset.count({ where: { tenantId } }));
    },
  };
}

// ─── Scan ────────────────────────────────────────────────────────────

function toDbScan(row: ScanResult): Prisma.DrpScanUncheckedCreateInput {
  return {
    id: row.id,
    tenantId: row.tenantId,
    assetId: row.assetId,
    scanType: row.scanType,
    status: row.status,
    findingsCount: row.findingsCount,
    alertsCreated: row.alertsCreated,
    startedAt: new Date(row.startedAt),
    completedAt: row.completedAt ? new Date(row.completedAt) : null,
    durationMs: row.durationMs,
  };
}

function fromDbScan(r: DbScan): ScanResult {
  return {
    id: r.id,
    tenantId: r.tenantId,
    assetId: r.assetId,
    scanType: r.scanType as DRPAlertType,
    status: r.status as ScanResult['status'],
    findingsCount: r.findingsCount,
    alertsCreated: r.alertsCreated,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    durationMs: r.durationMs,
  };
}

export function createScanRepoOps(prisma: PrismaClient) {
  return {
    async getScan(tenantId: string, id: string): Promise<ScanResult | null> {
      if (!isUuid(tenantId) || !isUuid(id)) return null;
      return dbCall(async () => {
        const row = await prisma.drpScan.findFirst({ where: { id, tenantId } });
        return row ? fromDbScan(row) : null;
      });
    },
    async upsertScan(scan: ScanResult): Promise<ScanResult> {
      if (!isUuid(scan.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      const data = toDbScan(scan);
      const updateData = omitKeys(data, ['id', 'tenantId']);
      return dbCall(async () => {
        const res = await prisma.drpScan.updateMany({ where: { id: scan.id, tenantId: scan.tenantId }, data: updateData });
        if (res.count === 0) {
          try {
            await prisma.drpScan.create({ data });
          } catch (err) {
            if (isUniqueViolation(err)) throw new AppError(409, 'Already exists', 'CONFLICT');
            throw err;
          }
        }
        const saved = await prisma.drpScan.findFirst({ where: { id: scan.id, tenantId: scan.tenantId } });
        return fromDbScan(saved!);
      });
    },
    async listScans(tenantId: string): Promise<ScanResult[]> {
      if (!isUuid(tenantId)) return [];
      return dbCall(async () => {
        const rows = await prisma.drpScan.findMany({ where: { tenantId }, orderBy: { startedAt: 'desc' } });
        return rows.map(fromDbScan);
      });
    },
  };
}

/** Prisma P2002 = unique constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
