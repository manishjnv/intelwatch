/**
 * @module command-center-queries
 * @description Query service for Command Center dashboard data.
 * Provides global stats (super-admin) and tenant stats (tenant-admin).
 */

import type { PrismaClient } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────

export interface DateRange {
  since: Date;
  until: Date;
}

export interface GlobalStats {
  totalCostUsd: number;
  totalItemsProcessed: number;
  byDay: Array<{ date: string; costUsd: number; itemCount: number }>;
  byProvider: Record<string, { costUsd: number; itemCount: number }>;
  byModel: Record<string, { costUsd: number; itemCount: number }>;
  bySubtask: Record<string, { costUsd: number; itemCount: number }>;
}

export interface TenantStats {
  tenantId: string;
  totalConsumed: number;
  totalAttributedCostUsd: number;
  byProvider: Record<string, { count: number; costUsd: number }>;
  byItemType: Record<string, { count: number; costUsd: number }>;
  byDay: Array<{ date: string; count: number; costUsd: number }>;
}

export interface TenantListEntry {
  tenantId: string;
  itemsConsumed: number;
  attributedCostUsd: number;
}

export interface QueueStats {
  pendingItems: number;
  processingRate: number;
  bySubtask: Record<string, number>;
}

// ── Query Service ─────────────────────────────────────────────────

export class CommandCenterQueries {
  constructor(private readonly prisma: PrismaClient) {}

  /** Global processing stats — super-admin only */
  async getGlobalStats(range: DateRange): Promise<GlobalStats> {
    // Aggregate totals
    const totals = await this.prisma.aiProcessingCost.aggregate({
      where: { processedAt: { gte: range.since, lte: range.until } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    });

    // By day
    const byDayRaw = await this.prisma.$queryRaw<Array<{
      day: string;
      cost: number;
      cnt: bigint;
    }>>`
      SELECT
        to_char(processed_at, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::bigint AS cnt
      FROM ai_processing_costs
      WHERE processed_at >= ${range.since} AND processed_at <= ${range.until}
      GROUP BY day
      ORDER BY day
    `;

    // By provider
    const byProviderRaw = await this.prisma.$queryRaw<Array<{
      provider: string;
      cost: number;
      cnt: bigint;
    }>>`
      SELECT
        provider,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::bigint AS cnt
      FROM ai_processing_costs
      WHERE processed_at >= ${range.since} AND processed_at <= ${range.until}
      GROUP BY provider
    `;

    // By model
    const byModelRaw = await this.prisma.$queryRaw<Array<{
      model: string;
      cost: number;
      cnt: bigint;
    }>>`
      SELECT
        model,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::bigint AS cnt
      FROM ai_processing_costs
      WHERE processed_at >= ${range.since} AND processed_at <= ${range.until}
      GROUP BY model
    `;

    // By subtask
    const bySubtaskRaw = await this.prisma.$queryRaw<Array<{
      subtask: string;
      cost: number;
      cnt: bigint;
    }>>`
      SELECT
        subtask,
        COALESCE(SUM(cost_usd), 0)::float AS cost,
        COUNT(*)::bigint AS cnt
      FROM ai_processing_costs
      WHERE processed_at >= ${range.since} AND processed_at <= ${range.until}
      GROUP BY subtask
    `;

    return {
      totalCostUsd: totals._sum.costUsd ?? 0,
      totalItemsProcessed: totals._count,
      byDay: byDayRaw.map(r => ({ date: r.day, costUsd: r.cost, itemCount: Number(r.cnt) })),
      byProvider: Object.fromEntries(byProviderRaw.map(r => [r.provider, { costUsd: r.cost, itemCount: Number(r.cnt) }])),
      byModel: Object.fromEntries(byModelRaw.map(r => [r.model, { costUsd: r.cost, itemCount: Number(r.cnt) }])),
      bySubtask: Object.fromEntries(bySubtaskRaw.map(r => [r.subtask, { costUsd: r.cost, itemCount: Number(r.cnt) }])),
    };
  }

  /** Tenant-specific consumption stats */
  async getTenantStats(tenantId: string, range: DateRange): Promise<TenantStats> {
    // By day
    const byDayRaw = await this.prisma.$queryRaw<Array<{
      day: string;
      cnt: bigint;
      cost: number;
    }>>`
      SELECT
        to_char(c.consumed_at, 'YYYY-MM-DD') AS day,
        COUNT(DISTINCT c.item_id)::bigint AS cnt,
        COALESCE(SUM(p.cost_usd), 0)::float AS cost
      FROM tenant_item_consumption c
      LEFT JOIN ai_processing_costs p
        ON c.item_id = p.item_id AND c.item_type = p.item_type
      WHERE c.tenant_id = ${tenantId}
        AND c.consumed_at >= ${range.since}
        AND c.consumed_at <= ${range.until}
      GROUP BY day
      ORDER BY day
    `;

    // By provider
    const byProviderRaw = await this.prisma.$queryRaw<Array<{
      provider: string;
      cnt: bigint;
      cost: number;
    }>>`
      SELECT
        COALESCE(p.provider, 'none') AS provider,
        COUNT(DISTINCT c.item_id)::bigint AS cnt,
        COALESCE(SUM(p.cost_usd), 0)::float AS cost
      FROM tenant_item_consumption c
      LEFT JOIN ai_processing_costs p
        ON c.item_id = p.item_id AND c.item_type = p.item_type
      WHERE c.tenant_id = ${tenantId}
        AND c.consumed_at >= ${range.since}
        AND c.consumed_at <= ${range.until}
      GROUP BY p.provider
    `;

    // By item type
    const byItemTypeRaw = await this.prisma.$queryRaw<Array<{
      item_type: string;
      cnt: bigint;
      cost: number;
    }>>`
      SELECT
        c.item_type,
        COUNT(DISTINCT c.item_id)::bigint AS cnt,
        COALESCE(SUM(p.cost_usd), 0)::float AS cost
      FROM tenant_item_consumption c
      LEFT JOIN ai_processing_costs p
        ON c.item_id = p.item_id AND c.item_type = p.item_type
      WHERE c.tenant_id = ${tenantId}
        AND c.consumed_at >= ${range.since}
        AND c.consumed_at <= ${range.until}
      GROUP BY c.item_type
    `;

    const totalConsumed = byDayRaw.reduce((sum, r) => sum + Number(r.cnt), 0);
    const totalCost = byDayRaw.reduce((sum, r) => sum + r.cost, 0);

    return {
      tenantId,
      totalConsumed,
      totalAttributedCostUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
      byProvider: Object.fromEntries(byProviderRaw.map(r => [r.provider, { count: Number(r.cnt), costUsd: r.cost }])),
      byItemType: Object.fromEntries(byItemTypeRaw.map(r => [r.item_type, { count: Number(r.cnt), costUsd: r.cost }])),
      byDay: byDayRaw.map(r => ({ date: r.day, count: Number(r.cnt), costUsd: r.cost })),
    };
  }

  /** All tenants with consumption (super-admin only) */
  async getTenantList(range: DateRange): Promise<TenantListEntry[]> {
    const raw = await this.prisma.$queryRaw<Array<{
      tenant_id: string;
      items: bigint;
      cost: number;
    }>>`
      SELECT
        c.tenant_id,
        COUNT(DISTINCT c.item_id)::bigint AS items,
        COALESCE(SUM(p.cost_usd), 0)::float AS cost
      FROM tenant_item_consumption c
      LEFT JOIN ai_processing_costs p
        ON c.item_id = p.item_id AND c.item_type = p.item_type
      WHERE c.consumed_at >= ${range.since}
        AND c.consumed_at <= ${range.until}
      GROUP BY c.tenant_id
      ORDER BY cost DESC
    `;

    return raw.map(r => ({
      tenantId: r.tenant_id,
      itemsConsumed: Number(r.items),
      attributedCostUsd: Math.round(r.cost * 1_000_000) / 1_000_000,
    }));
  }
}
