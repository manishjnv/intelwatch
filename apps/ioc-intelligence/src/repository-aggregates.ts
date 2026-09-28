import type { PrismaClient } from '@prisma/client';

/** Aggregation queries split out of repository.ts (400-line limit). */

export interface FeedStats {
  feedSourceId: string; total: number; avgConfidence: number;
  falsePositiveCount: number; revokedCount: number;
}

export interface TenantIocSummary { tenantId: string; iocCount: number; lastUpdatedAt: Date | null }

/** B3: Per-feed accuracy aggregation. */
export async function feedStats(prisma: PrismaClient, tenantId: string): Promise<FeedStats[]> {
  const feeds = await prisma.ioc.groupBy({
    by: ['feedSourceId'],
    where: { tenantId, feedSourceId: { not: null } },
    orderBy: { feedSourceId: 'asc' },
    _count: { _all: true },
    _avg: { confidence: true },
  });

  const results: FeedStats[] = [];
  for (const f of feeds) {
    if (!f.feedSourceId) continue;
    const fpCount = await prisma.ioc.count({
      where: { tenantId, feedSourceId: f.feedSourceId, lifecycle: 'false_positive' },
    });
    const revokedCount = await prisma.ioc.count({
      where: { tenantId, feedSourceId: f.feedSourceId, lifecycle: 'revoked' },
    });
    results.push({
      feedSourceId: f.feedSourceId,
      total: f._count._all,
      avgConfidence: Math.round(f._avg.confidence ?? 0),
      falsePositiveCount: fpCount,
      revokedCount,
    });
  }
  return results;
}

/** Per-tenant IOC counts + latest update time. Cross-tenant — service-auth callers only. */
export async function iocCountsByTenant(prisma: PrismaClient): Promise<TenantIocSummary[]> {
  const groups = await prisma.ioc.groupBy({
    by: ['tenantId'],
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return groups.map((g) => ({ tenantId: g.tenantId, iocCount: g._count._all, lastUpdatedAt: g._max.updatedAt }));
}
