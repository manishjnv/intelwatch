import { describe, it, expect, beforeEach } from 'vitest';
import { FeedPolicyStore } from '../src/services/feed-policy-store.js';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FEED_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FEED_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_TENANT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('FeedPolicyStore', () => {
  let store: FeedPolicyStore;

  beforeEach(() => {
    store = new FeedPolicyStore();
  });

  // ── getPolicy ──────────────────────────────────────────────────────────────
  describe('getPolicy', () => {
    it('returns null for an unknown feed', () => {
      expect(store.getPolicy(TENANT, FEED_A)).toBeNull();
    });

    it('returns the policy after setPolicy', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 50 });
      const p = store.getPolicy(TENANT, FEED_A);
      expect(p).not.toBeNull();
      expect(p!.dailyLimit).toBe(50);
    });

    it('is tenant-isolated — different tenant cannot see the policy', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 50 });
      expect(store.getPolicy(OTHER_TENANT, FEED_A)).toBeNull();
    });
  });

  // ── getOrInit ──────────────────────────────────────────────────────────────
  describe('getOrInit', () => {
    it('auto-creates defaults when no policy exists', () => {
      const p = store.getOrInit(TENANT, FEED_A);
      expect(p.feedId).toBe(FEED_A);
      expect(p.tenantId).toBe(TENANT);
      expect(p.dailyLimit).toBe(100);
      expect(p.aiEnabled).toBe(true);
      expect(p.currentDayCount).toBe(0);
      expect(p.category).toBe('news_feed');
    });

    it('uses provided category when initialising', () => {
      const p = store.getOrInit(TENANT, FEED_A, 'ioc_feed');
      expect(p.category).toBe('ioc_feed');
    });

    it('returns existing policy without overwriting on second call', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 25, category: 'vuln_feed' });
      const p = store.getOrInit(TENANT, FEED_A, 'ioc_feed'); // category arg ignored
      expect(p.dailyLimit).toBe(25);
      expect(p.category).toBe('vuln_feed');
    });

    it('persists the auto-created policy for subsequent getPolicy calls', () => {
      store.getOrInit(TENANT, FEED_A);
      expect(store.getPolicy(TENANT, FEED_A)).not.toBeNull();
    });
  });

  // ── setPolicy ──────────────────────────────────────────────────────────────
  describe('setPolicy', () => {
    it('creates a policy with supplied fields', () => {
      const p = store.setPolicy(TENANT, FEED_A, { dailyLimit: 200, aiEnabled: false, category: 'ioc_feed' });
      expect(p.dailyLimit).toBe(200);
      expect(p.aiEnabled).toBe(false);
      expect(p.category).toBe('ioc_feed');
    });

    it('preserves currentDayCount and lastResetAt on update', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 50 });
      store.incrementCount(TENANT, FEED_A, 30);
      const before = store.getPolicy(TENANT, FEED_A)!;

      store.setPolicy(TENANT, FEED_A, { dailyLimit: 75 }); // only change limit
      const after = store.getPolicy(TENANT, FEED_A)!;

      expect(after.currentDayCount).toBe(before.currentDayCount); // preserved
      expect(after.dailyLimit).toBe(75);
    });

    it('partial update — only provided fields change', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 50, aiEnabled: false, category: 'vuln_feed' });
      store.setPolicy(TENANT, FEED_A, { aiEnabled: true }); // only aiEnabled
      const p = store.getPolicy(TENANT, FEED_A)!;
      expect(p.dailyLimit).toBe(50);   // unchanged
      expect(p.category).toBe('vuln_feed'); // unchanged
      expect(p.aiEnabled).toBe(true);  // updated
    });
  });

  // ── isCapReached ───────────────────────────────────────────────────────────
  describe('isCapReached', () => {
    it('returns false when no policy exists', () => {
      expect(store.isCapReached(TENANT, FEED_A)).toBe(false);
    });

    it('returns false when dailyLimit is 0 (unlimited)', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 0 });
      store.incrementCount(TENANT, FEED_A, 9999);
      expect(store.isCapReached(TENANT, FEED_A)).toBe(false);
    });

    it('returns false when count is below the limit', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 100 });
      store.incrementCount(TENANT, FEED_A, 50);
      expect(store.isCapReached(TENANT, FEED_A)).toBe(false);
    });

    it('returns true when count equals the limit', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 100 });
      store.incrementCount(TENANT, FEED_A, 100);
      expect(store.isCapReached(TENANT, FEED_A)).toBe(true);
    });

    it('returns true when count exceeds the limit', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 10 });
      store.incrementCount(TENANT, FEED_A, 15);
      expect(store.isCapReached(TENANT, FEED_A)).toBe(true);
    });
  });

  // ── incrementCount ─────────────────────────────────────────────────────────
  describe('incrementCount', () => {
    it('increases currentDayCount', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 100 });
      store.incrementCount(TENANT, FEED_A, 5);
      store.incrementCount(TENANT, FEED_A, 3);
      expect(store.getPolicy(TENANT, FEED_A)!.currentDayCount).toBe(8);
    });

    it('is a no-op when no policy exists', () => {
      expect(() => store.incrementCount(TENANT, FEED_A, 10)).not.toThrow();
    });

    it('is a no-op for n <= 0', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 100 });
      store.incrementCount(TENANT, FEED_A, 0);
      store.incrementCount(TENANT, FEED_A, -5);
      expect(store.getPolicy(TENANT, FEED_A)!.currentDayCount).toBe(0);
    });
  });

  // ── resetCount ─────────────────────────────────────────────────────────────
  describe('resetCount', () => {
    it('resets currentDayCount to 0 and updates lastResetAt', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 100 });
      store.incrementCount(TENANT, FEED_A, 60);
      const before = store.getPolicy(TENANT, FEED_A)!.lastResetAt;

      const p = store.resetCount(TENANT, FEED_A);

      expect(p.currentDayCount).toBe(0);
      expect(p.lastResetAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws 404 when no policy exists', () => {
      expect(() => store.resetCount(TENANT, FEED_A)).toThrow('No policy found');
    });
  });

  // ── resetAll ───────────────────────────────────────────────────────────────
  describe('resetAll', () => {
    it('resets counts for all policies and returns the count', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 100 });
      store.setPolicy(TENANT, FEED_B, { dailyLimit: 200 });
      store.setPolicy(OTHER_TENANT, FEED_A, { dailyLimit: 50 });
      store.incrementCount(TENANT, FEED_A, 80);
      store.incrementCount(TENANT, FEED_B, 150);
      store.incrementCount(OTHER_TENANT, FEED_A, 40);

      const n = store.resetAll();

      expect(n).toBe(3);
      expect(store.getPolicy(TENANT, FEED_A)!.currentDayCount).toBe(0);
      expect(store.getPolicy(TENANT, FEED_B)!.currentDayCount).toBe(0);
      expect(store.getPolicy(OTHER_TENANT, FEED_A)!.currentDayCount).toBe(0);
    });

    it('returns 0 when no policies exist', () => {
      expect(store.resetAll()).toBe(0);
    });
  });

  // ── listPolicies ───────────────────────────────────────────────────────────
  describe('listPolicies', () => {
    it('returns all policies for a tenant', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 50 });
      store.setPolicy(TENANT, FEED_B, { dailyLimit: 75 });
      store.setPolicy(OTHER_TENANT, FEED_A, { dailyLimit: 10 }); // different tenant

      const list = store.listPolicies(TENANT);
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.feedId)).toContain(FEED_A);
      expect(list.map((p) => p.feedId)).toContain(FEED_B);
    });

    it('returns empty array when tenant has no policies', () => {
      expect(store.listPolicies(TENANT)).toEqual([]);
    });
  });

  // ── deletePolicy ───────────────────────────────────────────────────────────
  describe('deletePolicy', () => {
    it('removes the policy and returns true', () => {
      store.setPolicy(TENANT, FEED_A, { dailyLimit: 50 });
      expect(store.deletePolicy(TENANT, FEED_A)).toBe(true);
      expect(store.getPolicy(TENANT, FEED_A)).toBeNull();
    });

    it('returns false when policy does not exist', () => {
      expect(store.deletePolicy(TENANT, FEED_A)).toBe(false);
    });
  });
});
