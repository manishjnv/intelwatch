import { describe, it, expect, beforeEach } from 'vitest';
import { FeedQuotaStore, type BillingPlanId } from '../src/services/feed-quota-store.js';

const TENANT_A = '10c895c3-80ba-4f8d-b48d-9e90d26b781b';
const TENANT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ADMIN = 'admin-user-1';

describe('FeedQuotaStore', () => {
  let store: FeedQuotaStore;

  beforeEach(() => {
    store = new FeedQuotaStore();
  });

  // ── Plan quota definitions ──────────────────────────────────

  describe('listPlanQuotas', () => {
    it('returns 4 plan tiers', () => {
      expect(store.listPlanQuotas()).toHaveLength(4);
    });

    it('plans are in order: free, starter, teams, enterprise', () => {
      const ids = store.listPlanQuotas().map((p) => p.planId);
      expect(ids).toEqual(['free', 'starter', 'teams', 'enterprise']);
    });

    it('free tier has maxFeeds=3', () => {
      const free = store.getPlanQuota('free');
      expect(free.feedQuota.maxFeeds).toBe(3);
    });

    it('starter tier has maxFeeds=10', () => {
      const starter = store.getPlanQuota('starter');
      expect(starter.feedQuota.maxFeeds).toBe(10);
    });

    it('teams tier has maxFeeds=25', () => {
      const teams = store.getPlanQuota('teams');
      expect(teams.feedQuota.maxFeeds).toBe(25);
    });

    it('enterprise tier has maxFeeds=-1 (unlimited)', () => {
      const enterprise = store.getPlanQuota('enterprise');
      expect(enterprise.feedQuota.maxFeeds).toBe(-1);
    });
  });

  describe('getPlanQuota', () => {
    it('returns correct minFetchInterval for each plan', () => {
      expect(store.getPlanQuota('free').feedQuota.minFetchInterval).toBe('0 */4 * * *');
      expect(store.getPlanQuota('starter').feedQuota.minFetchInterval).toBe('0 */2 * * *');
      expect(store.getPlanQuota('teams').feedQuota.minFetchInterval).toBe('*/30 * * * *');
      expect(store.getPlanQuota('enterprise').feedQuota.minFetchInterval).toBe('*/15 * * * *');
    });

    it('returns correct retentionDays for each plan', () => {
      expect(store.getPlanQuota('free').feedQuota.retentionDays).toBe(7);
      expect(store.getPlanQuota('starter').feedQuota.retentionDays).toBe(30);
      expect(store.getPlanQuota('teams').feedQuota.retentionDays).toBe(90);
      expect(store.getPlanQuota('enterprise').feedQuota.retentionDays).toBe(-1);
    });

    it('free tier has 3 default feeds', () => {
      const free = store.getPlanQuota('free');
      expect(free.feedQuota.defaultFeedNames).toHaveLength(3);
      expect(free.feedQuota.defaultFeedNames).toContain('The Hacker News');
    });

    it('starter/teams/enterprise have 10 default feeds', () => {
      for (const plan of ['starter', 'teams', 'enterprise'] as BillingPlanId[]) {
        expect(store.getPlanQuota(plan).feedQuota.defaultFeedNames).toHaveLength(10);
      }
    });

    it('throws 404 for unknown plan', () => {
      expect(() => store.getPlanQuota('invalid' as BillingPlanId)).toThrow('Unknown plan');
    });
  });

  describe('updatePlanQuota', () => {
    it('updates maxFeeds for a plan', () => {
      store.updatePlanQuota('starter', { maxFeeds: 15 });
      expect(store.getPlanQuota('starter').feedQuota.maxFeeds).toBe(15);
    });

    it('updates minFetchInterval', () => {
      store.updatePlanQuota('free', { minFetchInterval: '0 */6 * * *' });
      expect(store.getPlanQuota('free').feedQuota.minFetchInterval).toBe('0 */6 * * *');
    });

    it('preserves unchanged fields', () => {
      const before = store.getPlanQuota('teams').feedQuota.retentionDays;
      store.updatePlanQuota('teams', { maxFeeds: 30 });
      expect(store.getPlanQuota('teams').feedQuota.retentionDays).toBe(before);
    });
  });

  // ── Tenant plan assignment ──────────────────────────────────

  describe('getTenantPlan', () => {
    it('defaults to Free for unassigned tenant', () => {
      const plan = store.getTenantPlan(TENANT_A);
      expect(plan.planId).toBe('free');
      expect(plan.assignedBy).toBe('system');
    });
  });

  describe('getTenantFeedQuota', () => {
    it('returns Free quota for unassigned tenant', () => {
      const quota = store.getTenantFeedQuota(TENANT_A);
      expect(quota.planId).toBe('free');
      expect(quota.maxFeeds).toBe(3);
    });

    it('returns correct quota after plan assignment', () => {
      store.assignPlan(TENANT_A, 'enterprise', ADMIN);
      const quota = store.getTenantFeedQuota(TENANT_A);
      expect(quota.planId).toBe('enterprise');
      expect(quota.maxFeeds).toBe(-1);
    });
  });

  describe('assignPlan', () => {
    it('assigns a plan and returns assignment + previous', () => {
      const result = store.assignPlan(TENANT_A, 'starter', ADMIN);
      expect(result.assignment.planId).toBe('starter');
      expect(result.previousPlanId).toBe('free');
    });

    it('can re-assign a different plan', () => {
      store.assignPlan(TENANT_A, 'starter', ADMIN);
      const result = store.assignPlan(TENANT_A, 'teams', ADMIN);
      expect(result.previousPlanId).toBe('starter');
      expect(result.assignment.planId).toBe('teams');
    });

    it('throws for invalid plan ID', () => {
      expect(() => store.assignPlan(TENANT_A, 'invalid' as BillingPlanId, ADMIN))
        .toThrow('Invalid plan');
    });

    it('tenant isolation — assigning A does not affect B', () => {
      store.assignPlan(TENANT_A, 'enterprise', ADMIN);
      expect(store.getTenantPlan(TENANT_B).planId).toBe('free');
    });
  });

  describe('isUpgrade', () => {
    it('free → starter is upgrade', () => {
      expect(store.isUpgrade('free', 'starter')).toBe(true);
    });

    it('starter → free is not upgrade', () => {
      expect(store.isUpgrade('starter', 'free')).toBe(false);
    });

    it('free → enterprise is upgrade', () => {
      expect(store.isUpgrade('free', 'enterprise')).toBe(true);
    });

    it('enterprise → teams is not upgrade', () => {
      expect(store.isUpgrade('enterprise', 'teams')).toBe(false);
    });

    it('same plan is not upgrade', () => {
      expect(store.isUpgrade('starter', 'starter')).toBe(false);
    });
  });

  describe('getNextPlan', () => {
    it('free → starter', () => {
      expect(store.getNextPlan('free')).toBe('starter');
    });

    it('enterprise → null', () => {
      expect(store.getNextPlan('enterprise')).toBeNull();
    });
  });

  describe('listAllAssignments', () => {
    it('empty when no assignments', () => {
      expect(store.listAllAssignments()).toHaveLength(0);
    });

    it('lists assigned tenants', () => {
      store.assignPlan(TENANT_A, 'starter', ADMIN);
      store.assignPlan(TENANT_B, 'teams', ADMIN);
      expect(store.listAllAssignments()).toHaveLength(2);
    });
  });

  describe('isValidPlanId', () => {
    it('accepts valid IDs', () => {
      expect(FeedQuotaStore.isValidPlanId('free')).toBe(true);
      expect(FeedQuotaStore.isValidPlanId('enterprise')).toBe(true);
    });

    it('rejects invalid IDs', () => {
      expect(FeedQuotaStore.isValidPlanId('pro')).toBe(false);
      expect(FeedQuotaStore.isValidPlanId('')).toBe(false);
    });
  });
});
