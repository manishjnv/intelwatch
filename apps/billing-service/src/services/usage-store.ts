import type { UsageMetric } from '../schemas/billing.js';
import type { UsageRepo } from '../repository.js';

/** Aggregated usage counters for a tenant. */
export interface TenantUsage {
  tenantId: string;
  api_calls: number;
  iocs_ingested: number;
  enrichments: number;
  storage_kb: number;
  periodStart: Date;
  lastUpdated: Date;
}

/** Limits map keyed by usage field name. -1 means unlimited. */
export interface UsageLimits {
  api_calls: number;
  iocs_ingested: number;
  enrichments: number;
  storage_kb: number;
}

/** A usage alert threshold crossing. */
export interface UsageAlert {
  metric: keyof UsageLimits;
  threshold: 80 | 90 | 100;
  used: number;
  limit: number;
  percent: number;
}

/** A historical snapshot of usage at a point in time. */
export interface UsageSnapshot extends TenantUsage {
  recordedAt: Date;
}

const METRIC_FIELD_MAP: Record<UsageMetric, keyof TenantUsage> = {
  api_call: 'api_calls',
  ioc_ingested: 'iocs_ingested',
  enrichment: 'enrichments',
  storage_kb: 'storage_kb',
};

/** Map UsageMetric to Prisma column names for incrementUsage. */
const METRIC_PRISMA_FIELD_MAP: Record<UsageMetric, 'apiCalls' | 'iocsIngested' | 'enrichments' | 'storageKb'> = {
  api_call: 'apiCalls',
  ioc_ingested: 'iocsIngested',
  enrichment: 'enrichments',
  storage_kb: 'storageKb',
};

/** Current period string in YYYY-MM format. */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dual-mode usage metering store. Prisma-backed when repo provided, in-memory fallback. */
export class UsageStore {
  private readonly usageMap = new Map<string, TenantUsage>();
  private readonly historyMap = new Map<string, UsageSnapshot[]>();
  private readonly repo?: UsageRepo;

  constructor(repo?: UsageRepo) {
    this.repo = repo;
  }

  private getOrCreate(tenantId: string): TenantUsage {
    if (!this.usageMap.has(tenantId)) {
      this.usageMap.set(tenantId, {
        tenantId,
        api_calls: 0,
        iocs_ingested: 0,
        enrichments: 0,
        storage_kb: 0,
        periodStart: new Date(),
        lastUpdated: new Date(),
      });
    }
    return this.usageMap.get(tenantId)!;
  }

  /** Increment a usage metric by the given count for a tenant. */
  async trackUsage(tenantId: string, metric: UsageMetric, count: number): Promise<TenantUsage> {
    if (this.repo) {
      try {
        const prismaField = METRIC_PRISMA_FIELD_MAP[metric];
        return await this.repo.incrementUsage(tenantId, currentPeriod(), prismaField, count);
      } catch { /* fall through to in-memory */ }
    }
    const usage = this.getOrCreate(tenantId);
    const field = METRIC_FIELD_MAP[metric];
    const usageRec = usage as unknown as Record<string, number>;
    usageRec[field as string] = (usageRec[field as string] ?? 0) + count;
    usage.lastUpdated = new Date();
    return usage;
  }

  /** Get the current usage snapshot for a tenant. */
  async getUsage(tenantId: string): Promise<TenantUsage> {
    if (this.repo) {
      try {
        const row = await this.repo.getUsage(tenantId, currentPeriod());
        if (row) return row;
      } catch { /* fall through */ }
    }
    return this.getOrCreate(tenantId);
  }

  /**
   * Calculate usage percentage for a metric.
   * Returns 0 for unlimited limits (-1).
   */
  getUsagePercent(tenantId: string, field: keyof UsageLimits, limit: number): number {
    if (limit === -1) return 0;
    const usage = this.getOrCreate(tenantId);
    const used = usage[field] as number;
    return Math.round((used / limit) * 100);
  }

  /** Returns true if usage has exceeded the limit. Always false for unlimited (-1). */
  isOverLimit(tenantId: string, field: keyof UsageLimits, limit: number): boolean {
    if (limit === -1) return false;
    const usage = this.getOrCreate(tenantId);
    return (usage[field] as number) > limit;
  }

  /**
   * Return alerts for any metric crossing 80%, 90%, or 100% thresholds.
   * Unlimited metrics (-1) are never alerted.
   */
  getAlertThresholds(tenantId: string, limits: UsageLimits): UsageAlert[] {
    const usage = this.getOrCreate(tenantId);
    const alerts: UsageAlert[] = [];
    const fields: (keyof UsageLimits)[] = ['api_calls', 'iocs_ingested', 'enrichments', 'storage_kb'];

    for (const field of fields) {
      const limit = limits[field];
      if (limit === -1) continue;
      const used = usage[field] as number;
      const percent = Math.round((used / limit) * 100);

      // Check from highest to lowest — report only the highest crossing
      const thresholds: (80 | 90 | 100)[] = [100, 90, 80];
      for (const threshold of thresholds) {
        if (percent >= threshold) {
          alerts.push({ metric: field, threshold, used, limit, percent });
          break;
        }
      }
    }
    return alerts;
  }

  /** Save the current usage as a historical snapshot. */
  recordSnapshot(tenantId: string): void {
    const usage = this.getOrCreate(tenantId);
    const snapshots = this.historyMap.get(tenantId) ?? [];
    snapshots.push({ ...usage, recordedAt: new Date() });
    // Keep last 90 snapshots
    if (snapshots.length > 90) snapshots.splice(0, snapshots.length - 90);
    this.historyMap.set(tenantId, snapshots);
  }

  /** Get usage history for the last N days. */
  getUsageHistory(tenantId: string, days: number): UsageSnapshot[] {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const snapshots = this.historyMap.get(tenantId) ?? [];
    return snapshots.filter((s) => s.recordedAt >= cutoff);
  }

  /**
   * Reset per-period counters (api_calls, iocs_ingested, enrichments).
   * storage_kb is cumulative and not reset.
   */
  async resetMonthly(tenantId: string): Promise<TenantUsage> {
    if (this.repo) {
      try {
        await this.repo.resetMonthly(tenantId, currentPeriod());
        const row = await this.repo.getUsage(tenantId, currentPeriod());
        if (row) return row;
      } catch { /* fall through */ }
    }
    const usage = this.getOrCreate(tenantId);
    usage.api_calls = 0;
    usage.iocs_ingested = 0;
    usage.enrichments = 0;
    usage.periodStart = new Date();
    usage.lastUpdated = new Date();
    return usage;
  }

  /** Get all tenant usage data (for admin dashboard). */
  async getAllUsage(): Promise<TenantUsage[]> {
    if (this.repo) {
      try { return await this.repo.getAllUsage(); } catch { /* fall through */ }
    }
    return Array.from(this.usageMap.values());
  }
}
