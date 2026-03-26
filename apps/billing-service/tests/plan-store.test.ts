import { describe, it, expect, beforeEach } from 'vitest';
import {
  PlanStore,
  PLAN_DEFINITIONS,
  PlanId,
} from '../src/services/plan-store.js';

describe('PlanStore', () => {
  let store: PlanStore;

  beforeEach(() => {
    store = new PlanStore();
  });

  // ── Plan definitions ────────────────────────────────────────────
  describe('getPlanById', () => {
    it('returns free plan definition', () => {
      const plan = store.getPlanById('free');
      expect(plan.id).toBe('free');
      expect(plan.priceInr).toBe(0);
      expect(plan.limits.iocQueriesPerDay).toBe(100);
    });

    it('returns starter plan definition', () => {
      const plan = store.getPlanById('starter');
      expect(plan.id).toBe('starter');
      expect(plan.priceInr).toBeGreaterThan(0);
      expect(plan.limits.iocQueriesPerDay).toBeGreaterThan(100);
    });

    it('returns teams plan definition', () => {
      const plan = store.getPlanById('teams');
      expect(plan.id).toBe('teams');
      expect(plan.limits.maxUsers).toBeGreaterThan(10);
    });

    it('returns enterprise plan definition', () => {
      const plan = store.getPlanById('enterprise');
      expect(plan.id).toBe('enterprise');
      expect(plan.limits.maxUsers).toBe(-1); // unlimited
    });

    it('throws NOT_FOUND for unknown plan', () => {
      expect(() => store.getPlanById('unknown' as PlanId)).toThrow('Plan not found');
    });
  });

  describe('listPlans', () => {
    it('returns all 4 plans in tier order', () => {
      const plans = store.listPlans();
      expect(plans).toHaveLength(4);
      expect(plans.map((p) => p.id)).toEqual(['free', 'starter', 'teams', 'enterprise']);
    });
  });

  describe('PLAN_DEFINITIONS', () => {
    it('free plan has correct limits', () => {
      const free = PLAN_DEFINITIONS.free;
      expect(free.limits.maxFeeds).toBe(3);
      expect(free.limits.maxUsers).toBe(2);
      expect(free.limits.iocStorageK).toBe(10);
    });

    it('starter plan has correct limits', () => {
      const starter = PLAN_DEFINITIONS.starter;
      expect(starter.limits.maxFeeds).toBe(10);
      expect(starter.limits.maxUsers).toBe(10);
    });

    it('teams plan has 25 max feeds', () => {
      const teams = PLAN_DEFINITIONS.teams;
      expect(teams.limits.maxFeeds).toBe(25);
    });

    it('enterprise plan has unlimited everything', () => {
      const ent = PLAN_DEFINITIONS.enterprise;
      expect(ent.limits.maxFeeds).toBe(-1);
      expect(ent.limits.maxUsers).toBe(-1);
    });
  });

  // ── Tenant plan state ───────────────────────────────────────────
  describe('getTenantPlan', () => {
    it('defaults to free for new tenant', async () => {
      const state = await store.getTenantPlan('t1');
      expect(state.planId).toBe('free');
      expect(state.status).toBe('active');
    });

    it('returns the set plan for existing tenant', async () => {
      await store.setTenantPlan('t1', 'starter');
      const state = await store.getTenantPlan('t1');
      expect(state.planId).toBe('starter');
    });

    it('isolates tenant plans', async () => {
      await store.setTenantPlan('t1', 'teams');
      await store.setTenantPlan('t2', 'starter');
      expect((await store.getTenantPlan('t1')).planId).toBe('teams');
      expect((await store.getTenantPlan('t2')).planId).toBe('starter');
    });
  });

  describe('setTenantPlan', () => {
    it('sets a valid plan', async () => {
      const state = await store.setTenantPlan('t1', 'teams');
      expect(state.planId).toBe('teams');
      expect(state.updatedAt).toBeDefined();
    });

    it('throws INVALID_PLAN for unknown plan id', async () => {
      await expect(store.setTenantPlan('t1', 'gold' as PlanId)).rejects.toThrow('Plan not found');
    });

    it('records previous plan id on upgrade', async () => {
      await store.setTenantPlan('t1', 'starter');
      const state = await store.setTenantPlan('t1', 'teams');
      expect(state.previousPlanId).toBe('starter');
    });
  });

  // ── Feature checks ──────────────────────────────────────────────
  describe('isFeatureAllowed', () => {
    it('free plan: graph_visualization not allowed', async () => {
      await store.setTenantPlan('t1', 'free');
      expect(await store.isFeatureAllowed('t1', 'graph_visualization')).toBe(false);
    });

    it('teams plan: graph_visualization allowed', async () => {
      await store.setTenantPlan('t1', 'teams');
      expect(await store.isFeatureAllowed('t1', 'graph_visualization')).toBe(true);
    });

    it('free plan: dark_web_monitoring not allowed', async () => {
      await store.setTenantPlan('t1', 'free');
      expect(await store.isFeatureAllowed('t1', 'dark_web_monitoring')).toBe(false);
    });

    it('enterprise plan: all features allowed', async () => {
      await store.setTenantPlan('t1', 'enterprise');
      expect(await store.isFeatureAllowed('t1', 'graph_visualization')).toBe(true);
      expect(await store.isFeatureAllowed('t1', 'dark_web_monitoring')).toBe(true);
      expect(await store.isFeatureAllowed('t1', 'api_access')).toBe(true);
    });

    it('starter plan: api_access allowed', async () => {
      await store.setTenantPlan('t1', 'starter');
      expect(await store.isFeatureAllowed('t1', 'api_access')).toBe(true);
    });
  });

  // ── Plan comparison ─────────────────────────────────────────────
  describe('comparePlans', () => {
    it('returns all plans for comparison', () => {
      const comparison = store.comparePlans();
      expect(comparison.plans).toHaveLength(4);
      expect(comparison.features).toBeDefined();
    });

    it('shows feature availability per plan', () => {
      const comparison = store.comparePlans();
      const graphFeature = comparison.features.find((f) => f.key === 'graph_visualization');
      expect(graphFeature).toBeDefined();
      expect(graphFeature!.availability.free).toBe(false);
      expect(graphFeature!.availability.teams).toBe(true);
    });
  });
});
