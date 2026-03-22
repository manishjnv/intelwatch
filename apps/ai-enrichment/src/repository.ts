import type { PrismaClient, Ioc, Prisma } from '@prisma/client';

export class EnrichmentRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Find IOC by ID (tenant-scoped) */
  async findById(iocId: string, tenantId: string): Promise<Ioc | null> {
    return this.db.ioc.findFirst({ where: { id: iocId, tenantId } });
  }

  /** Find IOC by ID (no tenant scope — for worker internal use) */
  async findByIdInternal(iocId: string): Promise<Ioc | null> {
    return this.db.ioc.findUnique({ where: { id: iocId } });
  }

  /** Update IOC with enrichment data + enrichedAt timestamp */
  async updateEnrichment(
    iocId: string,
    enrichmentData: object,
    enrichedAt: Date,
  ): Promise<Ioc> {
    return this.db.ioc.update({
      where: { id: iocId },
      data: {
        enrichmentData: enrichmentData as Prisma.InputJsonValue,
        enrichedAt,
      },
    });
  }

  /** Find IOCs pending enrichment (enrichedAt is null, lifecycle not archived/revoked) */
  async findPendingEnrichment(limit: number): Promise<Ioc[]> {
    return this.db.ioc.findMany({
      where: {
        enrichedAt: null,
        lifecycle: { notIn: ['archived', 'revoked', 'false_positive'] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /** Update IOC confidence score (called by confidence feedback loop) */
  async updateConfidence(iocId: string, confidence: number): Promise<void> {
    await this.db.ioc.update({
      where: { id: iocId },
      data: { confidence: Math.round(Math.min(100, Math.max(0, confidence))) },
    });
  }

  /** Find IOCs with stale enrichment data (#15 re-enrichment scheduler) */
  async findStaleEnrichment(
    ttlHoursMap: Record<string, number>,
    limit: number,
  ): Promise<Ioc[]> {
    // Use the minimum TTL to cast a wide net, then filter per-type in JS
    const minTtl = Math.min(...Object.values(ttlHoursMap), 24);
    const cutoff = new Date(Date.now() - minTtl * 60 * 60 * 1000);

    const candidates = await this.db.ioc.findMany({
      where: {
        enrichedAt: { not: null, lt: cutoff },
        lifecycle: { notIn: ['archived', 'revoked', 'false_positive'] },
      },
      orderBy: { confidence: 'desc' }, // High-confidence IOCs first
      take: limit * 3, // Over-fetch since per-type filter will reduce
    });

    const now = Date.now();
    return candidates
      .filter(ioc => {
        const ttl = ttlHoursMap[ioc.iocType] ?? 72;
        const ageHours = (now - (ioc.enrichedAt as Date).getTime()) / (60 * 60 * 1000);
        return ageHours > ttl;
      })
      .slice(0, limit);
  }

  /** Count IOCs by enrichment status */
  async getEnrichmentStats(): Promise<{
    total: number;
    enriched: number;
    pending: number;
  }> {
    const [total, enriched] = await this.db.$transaction([
      this.db.ioc.count(),
      this.db.ioc.count({ where: { enrichedAt: { not: null } } }),
    ]);
    return { total, enriched, pending: total - enriched };
  }
}
