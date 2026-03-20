import { describe, it, expect, beforeEach } from 'vitest';
import { LeadTimeScorer } from '../src/services/lead-time-scorer.js';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe('LeadTimeScorer', () => {
  let scorer: LeadTimeScorer;

  beforeEach(() => {
    scorer = new LeadTimeScorer();
  });

  describe('recordSighting', () => {
    it('marks first reporter as isFirst', () => {
      const event = scorer.recordSighting('feed-a', '1.2.3.4', 'ip', hoursAgo(24));
      expect(event.isFirst).toBe(true);
      expect(event.feedId).toBe('feed-a');
    });

    it('marks later reporter as not first', () => {
      scorer.recordSighting('feed-a', '1.2.3.4', 'ip', hoursAgo(24));
      const event = scorer.recordSighting('feed-b', '1.2.3.4', 'ip', hoursAgo(12));
      expect(event.isFirst).toBe(false);
    });

    it('calculates lead time between feeds', () => {
      scorer.recordSighting('feed-a', '1.2.3.4', 'ip', hoursAgo(48));
      const event = scorer.recordSighting('feed-b', '1.2.3.4', 'ip', hoursAgo(24));
      expect(event.leadTimeHours).toBeLessThan(0); // feed-b is behind
    });

    it('only records first sighting per feed per IOC', () => {
      scorer.recordSighting('feed-a', '1.2.3.4', 'ip', hoursAgo(48));
      scorer.recordSighting('feed-a', '1.2.3.4', 'ip', hoursAgo(12)); // Duplicate — ignored

      const stats = scorer.getFeedStats('feed-a');
      expect(stats.totalIOCsTracked).toBe(1); // Still just 1
    });
  });

  describe('getFeedStats', () => {
    it('returns neutral score for insufficient data', () => {
      scorer.recordSighting('feed-a', '1.2.3.4', 'ip', hoursAgo(24));

      const stats = scorer.getFeedStats('feed-a');
      expect(stats.earlyWarningScore).toBe(50); // Default neutral
      expect(stats.totalIOCsTracked).toBe(1);
    });

    it('gives high score to consistently early feed', () => {
      // feed-a always reports first (48h early), feed-b always late
      const baseTime = Date.now();
      for (let i = 0; i < 10; i++) {
        scorer.recordSighting('feed-a', `ioc-${i}`, 'ip', new Date(baseTime - 72 * 3600_000));
        scorer.recordSighting('feed-b', `ioc-${i}`, 'ip', new Date(baseTime - 24 * 3600_000));
      }

      const statsA = scorer.getFeedStats('feed-a');
      const statsB = scorer.getFeedStats('feed-b');

      expect(statsA.earlyWarningScore).toBeGreaterThan(statsB.earlyWarningScore);
      // feed-a has positive lead times (it's ahead), feed-b has negative (behind)
      expect(statsA.avgLeadTimeHours).toBeGreaterThan(0);
      expect(statsB.avgLeadTimeHours).toBeLessThan(0);
    });

    it('tracks lead time distribution', () => {
      const baseTime = Date.now();
      // 6 IOCs where feed-a is 24h earlier than feed-b
      for (let i = 0; i < 6; i++) {
        scorer.recordSighting('feed-a', `early-${i}`, 'ip', new Date(baseTime - 48 * 3600_000));
        scorer.recordSighting('feed-b', `early-${i}`, 'ip', new Date(baseTime - 24 * 3600_000));
      }
      // 2 IOCs where feed-a is same time as feed-b
      for (let i = 0; i < 2; i++) {
        scorer.recordSighting('feed-a', `ontime-${i}`, 'ip', new Date(baseTime - 24 * 3600_000));
        scorer.recordSighting('feed-b', `ontime-${i}`, 'ip', new Date(baseTime - 24 * 3600_000));
      }

      const stats = scorer.getFeedStats('feed-a');
      // feed-a is ahead on 6 IOCs (>1h lead) and on-time for 2
      expect(stats.leadTimeDistribution.ahead).toBeGreaterThanOrEqual(6);
      expect(stats.totalIOCsTracked).toBe(8);
    });

    it('returns zero stats for unknown feed', () => {
      const stats = scorer.getFeedStats('unknown');
      expect(stats.totalIOCsTracked).toBe(0);
      expect(stats.earlyWarningScore).toBe(50);
    });
  });

  describe('rankFeeds', () => {
    it('ranks feeds by early warning score', () => {
      // Feed A: always first
      for (let i = 0; i < 8; i++) {
        scorer.recordSighting('feed-a', `ioc-${i}`, 'ip', hoursAgo(72));
        scorer.recordSighting('feed-b', `ioc-${i}`, 'ip', hoursAgo(24));
        scorer.recordSighting('feed-c', `ioc-${i}`, 'ip', hoursAgo(1));
      }

      const ranked = scorer.rankFeeds();
      expect(ranked.length).toBe(3);
      expect(ranked[0].feedId).toBe('feed-a'); // Earliest = ranked first
      expect(ranked[2].feedId).toBe('feed-c'); // Latest = ranked last
    });

    it('returns empty array when no feeds tracked', () => {
      expect(scorer.rankFeeds()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      scorer.recordSighting('feed-a', '1.2.3.4', 'ip');
      scorer.clear();
      expect(scorer.getFeedStats('feed-a').totalIOCsTracked).toBe(0);
    });
  });
});
