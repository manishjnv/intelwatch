/**
 * @module consumption-tracker
 * @description Tracks per-tenant item consumption for Command Center cost attribution.
 * Uses UNIQUE constraint on (tenant_id, item_id, item_type) for dedup.
 */

import type { PrismaClient } from '@prisma/client';

export interface ConsumptionRecord {
  tenantId: string;
  itemId: string;
  itemType: 'article' | 'ioc' | 'report';
}

export interface TenantConsumptionStats {
  tenantId: string;
  totalItems: number;
  totalCostUsd: number;
  byProvider: Record<string, { count: number; costUsd: number }>;
  byItemType: Record<string, { count: number; costUsd: number }>;
}

export class ConsumptionTracker {
  private readonly db: any;
  constructor(private readonly prisma: PrismaClient) {
    this.db = prisma as any;
  }

  /**
   * Record that a tenant consumed an item (idempotent via UNIQUE constraint).
   * Returns true if new record created, false if already existed.
   */
  async trackConsumption(record: ConsumptionRecord): Promise<boolean> {
    try {
      await this.db.tenantItemConsumption.create({
        data: {
          tenantId: record.tenantId,
          itemId: record.itemId,
          itemType: record.itemType,
        },
      });
      return true;
    } catch (err: unknown) {
      // P2002 = unique constraint violation → already tracked
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return false;
      }
      throw err;
    }
  }

  /** Batch track multiple items (ignores duplicates) */
  async trackBatch(records: ConsumptionRecord[]): Promise<number> {
    let created = 0;
    for (const record of records) {
      const isNew = await this.trackConsumption(record);
      if (isNew) created++;
    }
    return created;
  }

  /** Get a tenant's consumption stats for a given period */
  async getTenantStats(tenantId: string, since: Date): Promise<TenantConsumptionStats> {
    // Get consumption records joined with cost data
    const consumptions = await this.prisma.$queryRaw<Array<{
      item_type: string;
      provider: string | null;
      item_count: bigint;
      total_cost: number | null;
    }>>`
      SELECT
        c.item_type,
        p.provider,
        COUNT(DISTINCT c.item_id)::bigint AS item_count,
        COALESCE(SUM(p.cost_usd), 0)::float AS total_cost
      FROM tenant_item_consumption c
      LEFT JOIN ai_processing_costs p
        ON c.item_id = p.item_id AND c.item_type = p.item_type
      WHERE c.tenant_id = ${tenantId}
        AND c.consumed_at >= ${since}
      GROUP BY c.item_type, p.provider
    `;

    const byProvider: Record<string, { count: number; costUsd: number }> = {};
    const byItemType: Record<string, { count: number; costUsd: number }> = {};
    let totalItems = 0;
    let totalCostUsd = 0;

    for (const row of consumptions) {
      const count = Number(row.item_count);
      const cost = row.total_cost ?? 0;

      // Aggregate by provider
      const prov = row.provider ?? 'unknown';
      if (!byProvider[prov]) byProvider[prov] = { count: 0, costUsd: 0 };
      byProvider[prov]!.count += count;
      byProvider[prov]!.costUsd += cost;

      // Aggregate by item type
      if (!byItemType[row.item_type]) byItemType[row.item_type] = { count: 0, costUsd: 0 };
      byItemType[row.item_type]!.count += count;
      byItemType[row.item_type]!.costUsd += cost;

      totalItems += count;
      totalCostUsd += cost;
    }

    return {
      tenantId,
      totalItems,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      byProvider,
      byItemType,
    };
  }

  /** Get consumption count for a tenant in the current month */
  async getMonthlyCount(tenantId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await this.db.tenantItemConsumption.count({
      where: {
        tenantId,
        consumedAt: { gte: startOfMonth },
      },
    });
    return count;
  }
}
