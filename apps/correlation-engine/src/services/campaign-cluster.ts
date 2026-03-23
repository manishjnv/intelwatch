/**
 * #5 — Campaign Auto-Clustering (DBSCAN)
 * Feature-vector DBSCAN on 4 dimensions: infra overlap, temporal proximity,
 * TTP similarity, feed overlap. Produces CampaignCluster results.
 */
import { randomUUID } from 'crypto';
import type {
  CorrelatedIOC, CampaignCluster, FeatureVector, Severity,
} from '../schemas/correlation.js';
import { CooccurrenceService } from './cooccurrence.js';
import { TTPSimilarityService } from './ttp-similarity.js';

export interface DBSCANConfig {
  epsilon: number;   // Distance threshold (0-1)
  minPoints: number; // Minimum cluster size
  weights: { infra: number; temporal: number; ttp: number; feed: number };
}

const DEFAULT_CONFIG: DBSCANConfig = {
  epsilon: 0.3,
  minPoints: 3,
  weights: { infra: 0.30, temporal: 0.20, ttp: 0.30, feed: 0.20 },
};

const NOISE = -1;

export class CampaignClusterService {
  private readonly config: DBSCANConfig;
  private readonly cooccurrence: CooccurrenceService;
  private readonly ttpSimilarity: TTPSimilarityService;

  constructor(
    config: Partial<DBSCANConfig> = {},
    cooccurrence?: CooccurrenceService,
    ttpSimilarity?: TTPSimilarityService,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cooccurrence = cooccurrence ?? new CooccurrenceService();
    this.ttpSimilarity = ttpSimilarity ?? new TTPSimilarityService();
  }

  /** Compute feature vector for an IOC */
  computeFeatureVector(ioc: CorrelatedIOC, allIOCs: CorrelatedIOC[]): FeatureVector {
    // Infrastructure: proportion of IOCs sharing any infra attribute
    let infraShared = 0;
    for (const other of allIOCs) {
      if (other.id === ioc.id) continue;
      if ((ioc.asn && ioc.asn === other.asn) ||
          (ioc.cidrPrefix && ioc.cidrPrefix === other.cidrPrefix) ||
          (ioc.registrar && ioc.registrar === other.registrar)) {
        infraShared++;
      }
    }
    const infraOverlap = allIOCs.length > 1 ? infraShared / (allIOCs.length - 1) : 0;

    // Temporal: how close in time to other IOCs (normalized)
    const iocTime = new Date(ioc.firstSeen).getTime();
    const timeDiffs = allIOCs
      .filter((o) => o.id !== ioc.id)
      .map((o) => Math.abs(iocTime - new Date(o.firstSeen).getTime()));
    const maxDiff = Math.max(...timeDiffs, 1);
    const avgDiff = timeDiffs.length > 0
      ? timeDiffs.reduce((s, d) => s + d, 0) / timeDiffs.length
      : maxDiff;
    const temporalProximity = 1 - Math.min(1, avgDiff / maxDiff);

    // TTP similarity: average Dice coefficient against all others with techniques
    const othersWithTTPs = allIOCs.filter((o) => o.id !== ioc.id && o.mitreAttack.length > 0);
    let ttpSum = 0;
    for (const other of othersWithTTPs) {
      ttpSum += this.ttpSimilarity.diceCoefficient(ioc.mitreAttack, other.mitreAttack);
    }
    const ttpSimilarity = othersWithTTPs.length > 0 ? ttpSum / othersWithTTPs.length : 0;

    // Feed overlap: average Jaccard on feed sources
    const othersWithFeeds = allIOCs.filter((o) => o.id !== ioc.id && o.sourceFeedIds.length > 0);
    let feedSum = 0;
    for (const other of othersWithFeeds) {
      feedSum += this.cooccurrence.jaccard(ioc.sourceFeedIds, other.sourceFeedIds);
    }
    const feedOverlap = othersWithFeeds.length > 0 ? feedSum / othersWithFeeds.length : 0;

    return {
      infraOverlap: Math.round(infraOverlap * 1000) / 1000,
      temporalProximity: Math.round(temporalProximity * 1000) / 1000,
      ttpSimilarity: Math.round(ttpSimilarity * 1000) / 1000,
      feedOverlap: Math.round(feedOverlap * 1000) / 1000,
    };
  }

  /** Weighted distance between two feature vectors (0 = identical, 1 = max distance) */
  distance(a: FeatureVector, b: FeatureVector): number {
    const w = this.config.weights;
    return (
      w.infra * Math.abs(a.infraOverlap - b.infraOverlap) +
      w.temporal * Math.abs(a.temporalProximity - b.temporalProximity) +
      w.ttp * Math.abs(a.ttpSimilarity - b.ttpSimilarity) +
      w.feed * Math.abs(a.feedOverlap - b.feedOverlap)
    );
  }

  /** DBSCAN clustering algorithm */
  dbscan(points: FeatureVector[]): number[] {
    const n = points.length;
    const labels = new Array<number>(n).fill(0);
    let clusterId = 0;

    for (let i = 0; i < n; i++) {
      if (labels[i] !== 0) continue;

      const neighbors = this.regionQuery(points, i);
      if (neighbors.length < this.config.minPoints) {
        labels[i] = NOISE;
        continue;
      }

      clusterId++;
      labels[i] = clusterId;

      const seedSet = [...neighbors];
      for (let j = 0; j < seedSet.length; j++) {
        const q = seedSet[j]!;
        if (labels[q] === NOISE) labels[q] = clusterId;
        if (labels[q] !== 0) continue;

        labels[q] = clusterId;
        const qNeighbors = this.regionQuery(points, q);
        if (qNeighbors.length >= this.config.minPoints) {
          for (const nb of qNeighbors) {
            if (!seedSet.includes(nb)) seedSet.push(nb);
          }
        }
      }
    }

    return labels;
  }

  /** Find all points within epsilon distance (includes the point itself per DBSCAN spec) */
  private regionQuery(points: FeatureVector[], idx: number): number[] {
    const neighbors: number[] = [idx]; // DBSCAN includes the point itself
    for (let i = 0; i < points.length; i++) {
      if (i === idx) continue;
      if (this.distance(points[idx]!, points[i]!) <= this.config.epsilon) {
        neighbors.push(i);
      }
    }
    return neighbors;
  }

  /** Run DBSCAN on tenant IOCs and produce campaign clusters */
  detectCampaigns(tenantId: string, iocs: Map<string, CorrelatedIOC>): CampaignCluster[] {
    const tenantIOCs = Array.from(iocs.values()).filter((i) => i.tenantId === tenantId);
    if (tenantIOCs.length < this.config.minPoints) return [];

    const features = tenantIOCs.map((ioc) => this.computeFeatureVector(ioc, tenantIOCs));
    const labels = this.dbscan(features);

    // Group by cluster label
    const clusterMap = new Map<number, number[]>();
    for (let i = 0; i < labels.length; i++) {
      if (labels[i]! <= 0) continue; // Skip noise
      const list = clusterMap.get(labels[i]!) ?? [];
      list.push(i);
      clusterMap.set(labels[i]!, list);
    }

    const campaigns: CampaignCluster[] = [];
    for (const [, indices] of clusterMap) {
      const clusterIOCs = indices.map((i) => tenantIOCs[i]!);
      const avgFeature = this.averageFeatureVector(indices.map((i) => features[i]!));
      const avgConf = clusterIOCs.reduce((s, c) => s + c.confidence, 0) / clusterIOCs.length;
      const maxSev = this.maxSeverity(clusterIOCs.map((c) => c.severity));

      campaigns.push({
        id: randomUUID(),
        tenantId,
        name: `Campaign-${randomUUID().slice(0, 8)}`,
        entityIds: clusterIOCs.map((c) => c.id),
        featureVector: avgFeature,
        avgConfidence: Math.round(avgConf * 100) / 100,
        maxSeverity: maxSev,
        detectedAt: new Date().toISOString(),
      });
    }

    return campaigns;
  }

  private averageFeatureVector(vectors: FeatureVector[]): FeatureVector {
    if (vectors.length === 0) {
      return { infraOverlap: 0, temporalProximity: 0, ttpSimilarity: 0, feedOverlap: 0 };
    }
    const sum = vectors.reduce(
      (acc, v) => ({
        infraOverlap: acc.infraOverlap + v.infraOverlap,
        temporalProximity: acc.temporalProximity + v.temporalProximity,
        ttpSimilarity: acc.ttpSimilarity + v.ttpSimilarity,
        feedOverlap: acc.feedOverlap + v.feedOverlap,
      }),
      { infraOverlap: 0, temporalProximity: 0, ttpSimilarity: 0, feedOverlap: 0 },
    );
    const n = vectors.length;
    return {
      infraOverlap: Math.round((sum.infraOverlap / n) * 1000) / 1000,
      temporalProximity: Math.round((sum.temporalProximity / n) * 1000) / 1000,
      ttpSimilarity: Math.round((sum.ttpSimilarity / n) * 1000) / 1000,
      feedOverlap: Math.round((sum.feedOverlap / n) * 1000) / 1000,
    };
  }

  private maxSeverity(severities: string[]): Severity {
    const order: Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    let max = 0;
    for (const s of severities) {
      const idx = order.indexOf(s as Severity);
      if (idx > max) max = idx;
    }
    return order[max]!;
  }
}
