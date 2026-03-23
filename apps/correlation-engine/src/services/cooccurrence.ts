/**
 * #1 — Multi-dimensional IOC Co-occurrence Detection
 * Sliding-window Jaccard similarity on feed source sets.
 * Detects IOCs appearing together across 2+ sources within configurable time window.
 */
import { randomUUID } from 'crypto';
import type {
  CorrelatedIOC, CorrelationResult, CorrelatedEntity,
} from '../schemas/correlation.js';

export interface CooccurrenceConfig {
  windowHours: number;
  minSources: number;
}

export interface CooccurrencePair {
  iocA: string;
  iocB: string;
  jaccardScore: number;
  sharedFeeds: string[];
  totalFeeds: number;
}

export class CooccurrenceService {
  constructor(private readonly config: CooccurrenceConfig = { windowHours: 24, minSources: 2 }) {}

  /** Compute Jaccard similarity between two feed source sets */
  jaccard(setA: string[], setB: string[]): number {
    if (setA.length === 0 && setB.length === 0) return 0;
    const a = new Set(setA);
    const b = new Set(setB);
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /** Find co-occurring IOC pairs within the sliding time window */
  detectCooccurrences(tenantId: string, iocs: Map<string, CorrelatedIOC>): CooccurrencePair[] {
    const now = Date.now();
    const windowMs = this.config.windowHours * 3600 * 1000;
    const pairs: CooccurrencePair[] = [];

    // Filter IOCs within the time window
    const recentIOCs: CorrelatedIOC[] = [];
    for (const ioc of iocs.values()) {
      if (ioc.tenantId !== tenantId) continue;
      const lastSeen = new Date(ioc.lastSeen).getTime();
      if (now - lastSeen <= windowMs) {
        recentIOCs.push(ioc);
      }
    }

    // Pairwise Jaccard comparison on feed source sets
    for (let i = 0; i < recentIOCs.length; i++) {
      for (let j = i + 1; j < recentIOCs.length; j++) {
        const a = recentIOCs[i]!;
        const b = recentIOCs[j]!;

        if (a.sourceFeedIds.length < this.config.minSources) continue;
        if (b.sourceFeedIds.length < this.config.minSources) continue;

        const score = this.jaccard(a.sourceFeedIds, b.sourceFeedIds);
        if (score > 0) {
          const sharedFeeds = a.sourceFeedIds.filter((f) => b.sourceFeedIds.includes(f));
          pairs.push({
            iocA: a.id,
            iocB: b.id,
            jaccardScore: Math.round(score * 1000) / 1000,
            sharedFeeds,
            totalFeeds: new Set([...a.sourceFeedIds, ...b.sourceFeedIds]).size,
          });
        }
      }
    }

    return pairs.sort((a, b) => b.jaccardScore - a.jaccardScore);
  }

  /** Convert co-occurrence pairs to CorrelationResults */
  toCorrelationResults(
    tenantId: string,
    pairs: CooccurrencePair[],
    iocs: Map<string, CorrelatedIOC>,
  ): CorrelationResult[] {
    return pairs.map((pair) => {
      const iocA = iocs.get(pair.iocA);
      const iocB = iocs.get(pair.iocB);
      const entities: CorrelatedEntity[] = [];
      if (iocA) {
        entities.push({
          entityId: iocA.id, entityType: 'ioc', label: iocA.value,
          role: 'primary', confidence: pair.jaccardScore,
        });
      }
      if (iocB) {
        entities.push({
          entityId: iocB.id, entityType: 'ioc', label: iocB.value,
          role: 'related', confidence: pair.jaccardScore,
        });
      }

      const severity = pair.jaccardScore >= 0.8 ? 'HIGH'
        : pair.jaccardScore >= 0.5 ? 'MEDIUM'
        : 'LOW';

      return {
        id: randomUUID(),
        tenantId,
        correlationType: 'cooccurrence' as const,
        severity: severity as 'HIGH' | 'MEDIUM' | 'LOW',
        confidence: pair.jaccardScore,
        entities,
        metadata: {
          jaccardScore: pair.jaccardScore,
          sharedFeeds: pair.sharedFeeds,
          totalFeeds: pair.totalFeeds,
        },
        suppressed: false,
        ruleId: 'cooccurrence-jaccard',
        createdAt: new Date().toISOString(),
      };
    });
  }
}
