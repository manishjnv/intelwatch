/**
 * Source Triangulation — Independence-weighted corroboration.
 *
 * Most TIPs count raw sighting numbers. Two feeds scraping the same upstream blog
 * are NOT independent corroboration. This module tracks co-occurrence patterns
 * between feeds and discounts correlated sources when boosting confidence.
 *
 * Key idea: build a feed-pair overlap matrix. If feed A and feed B report the same
 * IOCs >70% of the time, they're likely sourced from the same upstream. Discount
 * their combined weight to ~1.2x instead of 2x.
 */

export interface FeedPairKey {
  feedA: string;
  feedB: string;
}

export interface OverlapStats {
  sharedIOCs: number;
  totalA: number;
  totalB: number;
  overlapRatio: number; // |A∩B| / min(|A|, |B|)
  independenceWeight: number; // 0.0 (identical) → 1.0 (fully independent)
}

export interface TriangulationResult {
  effectiveSources: number; // Independence-weighted source count
  rawSourceCount: number;
  independenceScores: Map<string, number>; // feedId → independence score (0-1)
  triangulatedConfidence: number; // Final boosted confidence
  isGenuineCorroboration: boolean; // effectiveSources >= 2.0
}

const HIGH_OVERLAP_THRESHOLD = 0.70;
const LOW_OVERLAP_THRESHOLD = 0.20;

export class SourceTriangulation {
  // feed-pair → set of shared IOC values
  private readonly pairCooccurrence = new Map<string, Set<string>>();
  // feed → set of all IOC values it reported
  private readonly feedIOCs = new Map<string, Set<string>>();

  /**
   * Record that a feed reported an IOC. Call for every sighting.
   */
  recordSighting(feedId: string, iocValue: string): void {
    let feedSet = this.feedIOCs.get(feedId);
    if (!feedSet) {
      feedSet = new Set();
      this.feedIOCs.set(feedId, feedSet);
    }
    feedSet.add(iocValue);
  }

  /**
   * Record co-occurrence: two feeds both reported the same IOC.
   */
  recordCooccurrence(feedA: string, feedB: string, iocValue: string): void {
    const key = pairKey(feedA, feedB);
    let shared = this.pairCooccurrence.get(key);
    if (!shared) {
      shared = new Set();
      this.pairCooccurrence.set(key, shared);
    }
    shared.add(iocValue);
  }

  /**
   * Get overlap statistics between two feeds.
   */
  getOverlap(feedA: string, feedB: string): OverlapStats {
    const setA = this.feedIOCs.get(feedA);
    const setB = this.feedIOCs.get(feedB);
    const totalA = setA?.size ?? 0;
    const totalB = setB?.size ?? 0;

    if (totalA === 0 || totalB === 0) {
      return { sharedIOCs: 0, totalA, totalB, overlapRatio: 0, independenceWeight: 1.0 };
    }

    const shared = this.pairCooccurrence.get(pairKey(feedA, feedB));
    const sharedCount = shared?.size ?? 0;
    const minTotal = Math.min(totalA, totalB);
    const overlapRatio = sharedCount / minTotal;

    // Independence weight: 1.0 at low overlap, decays toward 0.2 at high overlap
    const independenceWeight = overlapToIndependence(overlapRatio);

    return { sharedIOCs: sharedCount, totalA, totalB, overlapRatio, independenceWeight };
  }

  /**
   * Calculate triangulated confidence for an IOC reported by multiple feeds.
   * Uses independence-weighted effective source count instead of raw count.
   */
  triangulate(
    _iocValue: string,
    reportingFeedIds: string[],
    baseConfidence: number,
  ): TriangulationResult {
    const rawSourceCount = reportingFeedIds.length;

    if (rawSourceCount <= 1) {
      return {
        effectiveSources: rawSourceCount,
        rawSourceCount,
        independenceScores: new Map(reportingFeedIds.map((f) => [f, 1.0])),
        triangulatedConfidence: clamp(baseConfidence),
        isGenuineCorroboration: false,
      };
    }

    // Calculate pairwise independence for each feed
    const independenceScores = new Map<string, number>();

    for (const feedId of reportingFeedIds) {
      let minIndependence = 1.0;

      for (const otherFeed of reportingFeedIds) {
        if (feedId === otherFeed) continue;
        const overlap = this.getOverlap(feedId, otherFeed);
        minIndependence = Math.min(minIndependence, overlap.independenceWeight);
      }

      independenceScores.set(feedId, minIndependence);
    }

    // Effective sources = sum of independence weights (first source always counts as 1)
    const sorted = [...independenceScores.entries()].sort((a, b) => b[1] - a[1]);
    let effectiveSources = 1.0; // First source always counts fully
    for (let i = 1; i < sorted.length; i++) {
      effectiveSources += sorted[i]![1];
    }

    // Confidence boost using effective (not raw) source count
    // Same logarithmic formula as corroboration but with effective count
    const boost = 1 + 0.15 * Math.log(Math.max(1, effectiveSources));
    const triangulatedConfidence = clamp(baseConfidence * boost);

    return {
      effectiveSources: Math.round(effectiveSources * 100) / 100,
      rawSourceCount,
      independenceScores,
      triangulatedConfidence,
      isGenuineCorroboration: effectiveSources >= 2.0,
    };
  }

  /** Reset all state (for testing) */
  clear(): void {
    this.pairCooccurrence.clear();
    this.feedIOCs.clear();
  }
}

/** Canonical pair key (alphabetically sorted to avoid A-B vs B-A duplication) */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Map overlap ratio (0-1) to independence weight (0.2-1.0) */
function overlapToIndependence(ratio: number): number {
  if (ratio <= LOW_OVERLAP_THRESHOLD) return 1.0;
  if (ratio >= HIGH_OVERLAP_THRESHOLD) return 0.2;
  // Linear interpolation between thresholds
  const t = (ratio - LOW_OVERLAP_THRESHOLD) / (HIGH_OVERLAP_THRESHOLD - LOW_OVERLAP_THRESHOLD);
  return 1.0 - t * 0.8;
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}
