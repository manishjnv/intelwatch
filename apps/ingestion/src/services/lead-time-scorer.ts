/**
 * Predictive Lead-time Scorer — Measures how early each feed reports IOCs.
 *
 * Feeds that report IOCs 48 hours before they appear in mainstream feeds are
 * exponentially more valuable than feeds that lag. This module tracks the
 * "first seen" timestamp per IOC across all feeds and calculates each feed's
 * average lead time.
 *
 * Surfaced as "Early Warning Score" in the UI — a key competitive differentiator.
 */

export interface IOCFirstSeen {
  iocValue: string;
  iocType: string;
  firstGlobalSeenAt: Date;
  feedTimestamps: Map<string, Date>; // feedId → when that feed first reported it
}

export interface FeedLeadTimeStats {
  feedId: string;
  avgLeadTimeHours: number; // Positive = ahead of median, negative = behind
  medianLeadTimeHours: number;
  earlyWarningScore: number; // 0-100, based on how often this feed is first
  firstReportRate: number; // % of IOCs this feed reported first
  totalIOCsTracked: number;
  leadTimeDistribution: { ahead: number; onTime: number; behind: number };
}

export interface LeadTimeEvent {
  feedId: string;
  iocValue: string;
  iocType: string;
  leadTimeHours: number; // Positive = this feed was first by N hours
  isFirst: boolean;
}

const MIN_IOCS_FOR_SCORING = 5; // Need at least 5 IOCs to compute meaningful stats

export class LeadTimeScorer {
  // iocKey → first-seen tracking
  private readonly iocTracker = new Map<string, IOCFirstSeen>();
  // feedId → (iocKey → lead time hours)
  private readonly feedLeadTimes = new Map<string, Map<string, number>>();
  // feedId → count of IOCs where this feed was the first reporter
  private readonly firstReportCounts = new Map<string, number>();

  /**
   * Record that a feed reported an IOC at a given time.
   * Returns a LeadTimeEvent if this is useful for analytics.
   */
  recordSighting(
    feedId: string,
    iocValue: string,
    iocType: string,
    seenAt: Date = new Date(),
  ): LeadTimeEvent {
    const iocKey = `${iocType}:${iocValue}`;

    let tracking = this.iocTracker.get(iocKey);
    if (!tracking) {
      tracking = {
        iocValue,
        iocType,
        firstGlobalSeenAt: seenAt,
        feedTimestamps: new Map(),
      };
      this.iocTracker.set(iocKey, tracking);
    }

    // Record this feed's first sighting (only first time matters)
    if (!tracking.feedTimestamps.has(feedId)) {
      tracking.feedTimestamps.set(feedId, seenAt);

      // Update global first-seen if this feed is earlier
      if (seenAt < tracking.firstGlobalSeenAt) {
        tracking.firstGlobalSeenAt = seenAt;
      }

      // Recalculate lead times for ALL feeds that reported this IOC
      this.recalculateLeadTimes(tracking);
    }

    const feedTime = tracking.feedTimestamps.get(feedId)!;
    const leadTimeHours = -hoursBetween(tracking.firstGlobalSeenAt, feedTime);
    const isFirst = feedTime.getTime() === tracking.firstGlobalSeenAt.getTime();

    return { feedId, iocValue, iocType, leadTimeHours, isFirst };
  }

  /**
   * Get lead-time statistics for a feed.
   */
  getFeedStats(feedId: string): FeedLeadTimeStats {
    const leadTimeMap = this.feedLeadTimes.get(feedId);
    const leadTimes = leadTimeMap ? [...leadTimeMap.values()] : [];

    if (leadTimes.length < MIN_IOCS_FOR_SCORING) {
      return {
        feedId,
        avgLeadTimeHours: 0,
        medianLeadTimeHours: 0,
        earlyWarningScore: 50,
        firstReportRate: 0,
        totalIOCsTracked: leadTimes.length,
        leadTimeDistribution: { ahead: 0, onTime: 0, behind: 0 },
      };
    }

    const sorted = [...leadTimes].sort((a, b) => a - b);
    const avg = leadTimes.reduce((sum, t) => sum + t, 0) / leadTimes.length;
    const median = sorted[Math.floor(sorted.length / 2)]!;

    const behind = leadTimes.filter((t) => t < -1).length;
    const onTime = leadTimes.filter((t) => t >= -1 && t <= 1).length;
    const ahead = leadTimes.length - behind - onTime;

    const firstCount = this.firstReportCounts.get(feedId) ?? 0;
    const firstReportRate = firstCount / leadTimes.length;
    const earlyWarningScore = computeEarlyWarningScore(avg, firstReportRate);

    return {
      feedId,
      avgLeadTimeHours: round(avg),
      medianLeadTimeHours: round(median),
      earlyWarningScore,
      firstReportRate: round(firstReportRate),
      totalIOCsTracked: leadTimes.length,
      leadTimeDistribution: { ahead, onTime, behind },
    };
  }

  /**
   * Rank all feeds by early warning score.
   */
  rankFeeds(): FeedLeadTimeStats[] {
    const feedIds = [...this.feedLeadTimes.keys()];
    return feedIds
      .map((id) => this.getFeedStats(id))
      .sort((a, b) => b.earlyWarningScore - a.earlyWarningScore);
  }

  clear(): void {
    this.iocTracker.clear();
    this.feedLeadTimes.clear();
    this.firstReportCounts.clear();
  }

  private recalculateLeadTimes(tracking: IOCFirstSeen): void {
    const iocKey = `${tracking.iocType}:${tracking.iocValue}`;

    // If only one feed reported this IOC, use 0 as lead time (no comparison)
    // For meaningful lead times, need at least 2 feeds
    const hasMulitpleFeeds = tracking.feedTimestamps.size >= 2;

    // Find the second-earliest timestamp for meaningful "ahead" calculation
    let secondEarliest = tracking.firstGlobalSeenAt;
    if (hasMulitpleFeeds) {
      const sorted = [...tracking.feedTimestamps.values()].sort((a, b) => a.getTime() - b.getTime());
      secondEarliest = sorted[1]!; // Second feed's timestamp
    }

    // Reset first-report counts for this IOC across all feeds
    for (const [feedId, feedTime] of tracking.feedTimestamps) {
      // Lead time: positive = ahead of second-earliest, negative = behind first
      let leadTime: number;
      if (feedTime.getTime() === tracking.firstGlobalSeenAt.getTime() && hasMulitpleFeeds) {
        // This is the first reporter — lead time = distance to second reporter
        leadTime = hoursBetween(tracking.firstGlobalSeenAt, secondEarliest);
      } else {
        // This feed is behind — negative lead time from first
        leadTime = -hoursBetween(tracking.firstGlobalSeenAt, feedTime);
      }

      let feedMap = this.feedLeadTimes.get(feedId);
      if (!feedMap) {
        feedMap = new Map();
        this.feedLeadTimes.set(feedId, feedMap);
      }

      feedMap.set(iocKey, leadTime);
    }

    // Recalculate first-report counts for all feeds
    this.recalculateFirstCounts();
  }

  private recalculateFirstCounts(): void {
    this.firstReportCounts.clear();
    for (const tracking of this.iocTracker.values()) {
      if (tracking.feedTimestamps.size < 2) continue;
      for (const [feedId, feedTime] of tracking.feedTimestamps) {
        if (feedTime.getTime() === tracking.firstGlobalSeenAt.getTime()) {
          this.firstReportCounts.set(feedId, (this.firstReportCounts.get(feedId) ?? 0) + 1);
        }
      }
    }
  }
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

function computeEarlyWarningScore(avgLeadTimeHours: number, firstReportRate: number): number {
  // Lead time component: log scale, 48h early = 100, 0h = 50, -48h late = 0
  let timeScore: number;
  if (avgLeadTimeHours >= 0) {
    timeScore = 50 + Math.min(50, 50 * Math.log1p(avgLeadTimeHours) / Math.log1p(48));
  } else {
    timeScore = 50 - Math.min(50, 50 * Math.log1p(-avgLeadTimeHours) / Math.log1p(48));
  }

  // First report rate component: 0-100
  const rateScore = firstReportRate * 100;

  // Weighted: 60% time, 40% rate
  const score = timeScore * 0.6 + rateScore * 0.4;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function round(val: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}
