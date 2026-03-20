import { describe, it, expect, beforeEach } from 'vitest';
import { AttributionTracker } from '../src/services/attribution-tracker.js';

const TENANT = 'tenant-1';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe('AttributionTracker', () => {
  let tracker: AttributionTracker;

  beforeEach(() => {
    tracker = new AttributionTracker();
  });

  describe('addAttribution', () => {
    it('creates a new chain for first attribution', () => {
      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a',
        feedName: 'AlienVault OTX',
        reportedAt: hoursAgo(24),
        context: ['IP observed in C2 communication with Cobalt Strike beacon'],
        tlp: 'GREEN',
      });

      expect(chain.totalSources).toBe(1);
      expect(chain.primaryAttribution.isOriginalSource).toBe(true);
      expect(chain.primaryAttribution.feedId).toBe('feed-a');
      expect(chain.effectiveTLP).toBe('GREEN');
      expect(chain.mergedContexts).toHaveLength(1);
    });

    it('appends attribution to existing chain', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(24), context: ['C2 communication'], tlp: 'GREEN',
      });

      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(12), context: ['Associated with APT29 infrastructure'], tlp: 'AMBER',
      });

      expect(chain.totalSources).toBe(2);
      expect(chain.mergedContexts).toHaveLength(2);
      expect(chain.allAttributions[1].isOriginalSource).toBe(false);
    });

    it('deduplicates identical context strings', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(24), context: ['C2 beacon traffic observed'], tlp: 'GREEN',
      });

      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(12), context: ['C2 beacon traffic observed', 'New unique context'], tlp: 'GREEN',
      });

      expect(chain.mergedContexts).toHaveLength(2); // Duplicate removed
      expect(chain.allAttributions[1].uniqueContext).toEqual(['New unique context']);
    });

    it('upgrades effective TLP to most restrictive', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(24), context: ['ctx'], tlp: 'GREEN',
      });

      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(12), context: ['ctx2'], tlp: 'RED',
      });

      expect(chain.effectiveTLP).toBe('RED');
    });

    it('updates primary attribution when earlier source is found', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(12), context: ['ctx-b'], tlp: 'GREEN',
      });

      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(48), context: ['ctx-a'], tlp: 'GREEN',
      });

      expect(chain.primaryAttribution.feedId).toBe('feed-a');
      expect(chain.primaryAttribution.isOriginalSource).toBe(true);
      // Previous primary demoted
      expect(chain.allAttributions[0].isOriginalSource).toBe(false);
    });

    it('tracks timespan correctly', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(48), context: ['ctx'], tlp: 'GREEN',
      });

      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(2), context: ['ctx2'], tlp: 'GREEN',
      });

      expect(chain.timespan.firstReported.getTime()).toBeLessThan(chain.timespan.lastReported.getTime());
    });
  });

  describe('mergeAttributions', () => {
    it('merges multiple IOC attributions at once', () => {
      const decisions = tracker.mergeAttributions(
        [{ value: '1.2.3.4', type: 'ip' }, { value: 'evil.com', type: 'domain' }],
        TENANT, 'feed-a', 'Feed A', hoursAgo(24),
        ['Linked to APT29'], 'AMBER',
      );

      expect(decisions).toHaveLength(2);
      expect(decisions[0].action).toBe('create_new');
      expect(decisions[1].action).toBe('create_new');
    });

    it('merges into existing chains', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(48), context: ['Original context'], tlp: 'GREEN',
      });

      const decisions = tracker.mergeAttributions(
        [{ value: '1.2.3.4', type: 'ip' }],
        TENANT, 'feed-b', 'Feed B', hoursAgo(12),
        ['New context from feed B'], 'AMBER',
      );

      expect(decisions[0].action).toBe('merge');
      expect(decisions[0].contextAdded).toEqual(['New context from feed B']);
      expect(decisions[0].tlpChanged).toBe(true);
    });
  });

  describe('getChain + getContributors', () => {
    it('returns null for unknown IOC', () => {
      expect(tracker.getChain('unknown', 'ip', TENANT)).toBeNull();
    });

    it('returns contributors sorted by time', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(12), context: ['ctx-b'], tlp: 'GREEN',
      });
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(48), context: ['ctx-a'], tlp: 'GREEN',
      });

      const contributors = tracker.getContributors('1.2.3.4', 'ip', TENANT);
      expect(contributors[0].feedId).toBe('feed-a'); // Earlier first
      expect(contributors[1].feedId).toBe('feed-b');
    });
  });

  describe('getChainsForTenant', () => {
    it('returns all chains for a tenant', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'f', feedName: 'F', reportedAt: new Date(), context: ['a'], tlp: 'GREEN',
      });
      tracker.addAttribution('evil.com', 'domain', TENANT, {
        feedId: 'f', feedName: 'F', reportedAt: new Date(), context: ['b'], tlp: 'GREEN',
      });
      tracker.addAttribution('5.6.7.8', 'ip', 'tenant-other', {
        feedId: 'f', feedName: 'F', reportedAt: new Date(), context: ['c'], tlp: 'GREEN',
      });

      const chains = tracker.getChainsForTenant(TENANT);
      expect(chains).toHaveLength(2);
    });
  });

  describe('context normalization', () => {
    it('deduplicates context with different casing/whitespace', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-a', feedName: 'Feed A',
        reportedAt: hoursAgo(24), context: ['C2 beacon observed'], tlp: 'GREEN',
      });

      const chain = tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'feed-b', feedName: 'Feed B',
        reportedAt: hoursAgo(12), context: ['  c2 beacon  observed  '], tlp: 'GREEN',
      });

      expect(chain.mergedContexts).toHaveLength(1); // Normalized dedup
      expect(chain.allAttributions[1].uniqueContext).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      tracker.addAttribution('1.2.3.4', 'ip', TENANT, {
        feedId: 'f', feedName: 'F', reportedAt: new Date(), context: ['x'], tlp: 'GREEN',
      });
      tracker.clear();
      expect(tracker.getChain('1.2.3.4', 'ip', TENANT)).toBeNull();
    });
  });
});
