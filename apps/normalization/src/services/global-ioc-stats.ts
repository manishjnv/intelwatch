/**
 * @module GlobalIocStatsService
 * @description Aggregated stats for global IOCs (DECISION-029 Phase C).
 */
import type { PrismaClient } from '@prisma/client';

export interface GlobalIocStats {
  totalIocs: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byLifecycle: Record<string, number>;
  byStixTier: Record<string, number>;
  warninglistFiltered: number;
  avgConfidence: number;
  avgEnrichmentQuality: number;
  last24h: { created: number; enriched: number; corroborated: number };
}

export interface CorroborationLeader {
  ioc: { id: string; iocType: string; normalizedValue: string; confidence: number; crossFeedCorroboration: number };
  feedSources: string[];
  sightingCount: number;
}

export class GlobalIocStatsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getGlobalStats(): Promise<GlobalIocStats> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [allIocs, last24hCreated, last24hEnriched, last24hCorroborated] = await Promise.all([
      this.prisma.globalIoc.findMany({
        select: {
          iocType: true,
          severity: true,
          lifecycle: true,
          stixConfidenceTier: true,
          confidence: true,
          enrichmentQuality: true,
          warninglistMatch: true,
        },
      }),
      this.prisma.globalIoc.count({ where: { createdAt: { gte: since } } }),
      this.prisma.globalIoc.count({ where: { enrichmentQuality: { gt: 0 }, updatedAt: { gte: since } } }),
      this.prisma.globalIoc.count({ where: { crossFeedCorroboration: { gt: 1 }, updatedAt: { gte: since } } }),
    ]);

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byLifecycle: Record<string, number> = {};
    const byStixTier: Record<string, number> = {};
    let warninglistFiltered = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;
    let enrichmentSum = 0;
    let enrichmentCount = 0;

    for (const ioc of allIocs) {
      byType[ioc.iocType] = (byType[ioc.iocType] ?? 0) + 1;
      if (ioc.severity) bySeverity[ioc.severity] = (bySeverity[ioc.severity] ?? 0) + 1;
      byLifecycle[ioc.lifecycle] = (byLifecycle[ioc.lifecycle] ?? 0) + 1;
      if (ioc.stixConfidenceTier) {
        byStixTier[ioc.stixConfidenceTier] = (byStixTier[ioc.stixConfidenceTier] ?? 0) + 1;
      }
      if (ioc.warninglistMatch) {
        warninglistFiltered++;
      } else {
        confidenceSum += ioc.confidence;
        confidenceCount++;
      }
      if (ioc.enrichmentQuality != null && ioc.enrichmentQuality > 0) {
        enrichmentSum += ioc.enrichmentQuality;
        enrichmentCount++;
      }
    }

    return {
      totalIocs: allIocs.length,
      byType,
      bySeverity,
      byLifecycle,
      byStixTier,
      warninglistFiltered,
      avgConfidence: confidenceCount > 0 ? Math.round(confidenceSum / confidenceCount) : 0,
      avgEnrichmentQuality: enrichmentCount > 0 ? Math.round(enrichmentSum / enrichmentCount) : 0,
      last24h: {
        created: last24hCreated,
        enriched: last24hEnriched,
        corroborated: last24hCorroborated,
      },
    };
  }

  async getTopIocs(limit: number = 20) {
    return this.prisma.globalIoc.findMany({
      where: { warninglistMatch: null },
      orderBy: [{ confidence: 'desc' }, { crossFeedCorroboration: 'desc' }],
      take: limit,
    });
  }

  async getCorroborationLeaders(limit: number = 20): Promise<CorroborationLeader[]> {
    const iocs = await this.prisma.globalIoc.findMany({
      where: { crossFeedCorroboration: { gt: 1 } },
      orderBy: { crossFeedCorroboration: 'desc' },
      take: limit,
    });

    return iocs.map((ioc) => ({
      ioc: {
        id: ioc.id,
        iocType: ioc.iocType,
        normalizedValue: ioc.normalizedValue,
        confidence: ioc.confidence,
        crossFeedCorroboration: ioc.crossFeedCorroboration,
      },
      feedSources: (ioc.sightingSources as string[]) ?? [],
      sightingCount: ioc.crossFeedCorroboration,
    }));
  }
}
