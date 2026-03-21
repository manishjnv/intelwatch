/**
 * C3: Campaign co-occurrence detection.
 * Identifies IOCs that travel together across multiple feeds — likely same campaign.
 * Groups by shared threatActors or malwareFamilies seen in 2+ independent feeds.
 */

import type { PrismaClient } from '@prisma/client';

export interface CampaignCluster {
  clusterId: string;
  label: string;
  sharedSignal: string;
  sharedValue: string;
  feedCount: number;
  iocCount: number;
  iocs: Array<{
    id: string;
    iocType: string;
    normalizedValue: string;
    confidence: number;
    severity: string;
    feedSourceId: string | null;
  }>;
  firstSeen: Date;
  lastSeen: Date;
}

/** Detects campaign clusters within a tenant's IOCs. */
export class CampaignDetector {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Find IOC clusters that share threat actors or malware families across 2+ feeds.
   * Returns clusters sorted by IOC count descending.
   */
  async detectCampaigns(tenantId: string, minFeeds: number = 2, limit: number = 20): Promise<CampaignCluster[]> {
    // Fetch IOCs with non-empty threat context (candidates for campaign grouping)
    const candidates = await this.prisma.ioc.findMany({
      where: {
        tenantId,
        lifecycle: { notIn: ['archived', 'false_positive', 'revoked'] },
        OR: [
          { threatActors: { isEmpty: false } },
          { malwareFamilies: { isEmpty: false } },
        ],
      },
      select: {
        id: true, iocType: true, normalizedValue: true, confidence: true,
        severity: true, feedSourceId: true, threatActors: true,
        malwareFamilies: true, firstSeen: true, lastSeen: true,
      },
      orderBy: { lastSeen: 'desc' },
      take: 5000, // Cap for performance
    });

    const clusters: Map<string, CampaignCluster> = new Map();

    // Group by shared threat actors
    this.groupBySharedSignal(candidates, 'threatActors', 'threat_actor', clusters);

    // Group by shared malware families
    this.groupBySharedSignal(candidates, 'malwareFamilies', 'malware_family', clusters);

    // Filter: must have IOCs from minFeeds different feeds
    const filtered = [...clusters.values()]
      .filter((c) => c.feedCount >= minFeeds && c.iocCount >= 3)
      .sort((a, b) => b.iocCount - a.iocCount)
      .slice(0, limit);

    return filtered;
  }

  /** Groups IOCs by a shared array field value, building campaign clusters. */
  private groupBySharedSignal(
    iocs: Array<{
      id: string; iocType: string; normalizedValue: string; confidence: number;
      severity: string; feedSourceId: string | null; threatActors: string[];
      malwareFamilies: string[]; firstSeen: Date; lastSeen: Date;
    }>,
    field: 'threatActors' | 'malwareFamilies',
    signalType: string,
    clusters: Map<string, CampaignCluster>,
  ): void {
    // Build inverted index: signalValue → IOCs
    const index: Map<string, typeof iocs> = new Map();
    for (const ioc of iocs) {
      const values = ioc[field];
      for (const val of values) {
        const key = val.toLowerCase();
        if (!index.has(key)) index.set(key, []);
        index.get(key)!.push(ioc);
      }
    }

    // Convert groups with 3+ IOCs into clusters
    for (const [signalValue, groupIocs] of index) {
      if (groupIocs.length < 3) continue;

      const feeds = new Set(groupIocs.map((i) => i.feedSourceId).filter(Boolean));
      const clusterId = `${signalType}:${signalValue}`;

      if (clusters.has(clusterId)) continue; // Already created from earlier field

      const dates = groupIocs.map((i) => i.lastSeen.getTime());
      clusters.set(clusterId, {
        clusterId,
        label: signalValue,
        sharedSignal: signalType,
        sharedValue: signalValue,
        feedCount: feeds.size,
        iocCount: groupIocs.length,
        iocs: groupIocs.map((i) => ({
          id: i.id, iocType: i.iocType, normalizedValue: i.normalizedValue,
          confidence: i.confidence, severity: i.severity, feedSourceId: i.feedSourceId,
        })),
        firstSeen: new Date(Math.min(...groupIocs.map((i) => i.firstSeen.getTime()))),
        lastSeen: new Date(Math.max(...dates)),
      });
    }
  }
}
