import { describe, it, expect, beforeEach } from 'vitest';
import { UpgradeFlow } from '../src/services/upgrade-flow.js';
import { PlanStore } from '../src/services/plan-store.js';
import { InvoiceStore } from '../src/services/invoice-store.js';

describe('UpgradeFlow', () => {
  let planStore: PlanStore;
  let invoiceStore: InvoiceStore;
  let flow: UpgradeFlow;

  beforeEach(() => {
    planStore = new PlanStore();
    invoiceStore = new InvoiceStore();
    flow = new UpgradeFlow(planStore, invoiceStore);
  });

  // ── Upgrade preview ─────────────────────────────────────────────
  describe('previewUpgrade', () => {
    it('calculates proration for free → starter upgrade', async () => {
      await planStore.setTenantPlan('t1', 'free');
      const preview = await flow.previewUpgrade('t1', 'starter', new Date('2026-03-15'));
      expect(preview.fromPlan).toBe('free');
      expect(preview.toPlan).toBe('starter');
      expect(preview.proratedAmountInr).toBeGreaterThanOrEqual(0);
      expect(preview.effectiveDate).toBeDefined();
    });

    it('calculates proration for starter → pro upgrade', async () => {
      await planStore.setTenantPlan('t1', 'starter');
      const preview = await flow.previewUpgrade('t1', 'pro', new Date('2026-03-01'));
      expect(preview.fromPlan).toBe('starter');
      expect(preview.toPlan).toBe('pro');
      expect(preview.proratedAmountInr).toBeGreaterThan(0);
    });

    it('throws SAME_PLAN when upgrading to same plan', async () => {
      await planStore.setTenantPlan('t1', 'pro');
      await expect(flow.previewUpgrade('t1', 'pro', new Date())).rejects.toThrow('Already on this plan');
    });

    it('throws DOWNGRADE_NOT_ALLOWED via previewUpgrade', async () => {
      await planStore.setTenantPlan('t1', 'pro');
      await expect(flow.previewUpgrade('t1', 'starter', new Date())).rejects.toThrow();
    });
  });

  // ── Upgrade execution ───────────────────────────────────────────
  describe('upgradePlan', () => {
    it('upgrades free → starter successfully', async () => {
      await planStore.setTenantPlan('t1', 'free');
      const result = await flow.upgradePlan('t1', 'starter', { razorpaySubscriptionId: 'sub_123' });
      expect(result.newPlanId).toBe('starter');
      expect(result.previousPlanId).toBe('free');
      expect(result.invoice).toBeDefined();
    });

    it('creates an invoice on successful upgrade', async () => {
      await planStore.setTenantPlan('t1', 'free');
      const result = await flow.upgradePlan('t1', 'starter', { razorpaySubscriptionId: 'sub_123' });
      expect(result.invoice.planId).toBe('starter');
    });

    it('throws SAME_PLAN when on the same plan', async () => {
      await planStore.setTenantPlan('t1', 'starter');
      await expect(flow.upgradePlan('t1', 'starter', {})).rejects.toThrow('Already on this plan');
    });

    it('throws DOWNGRADE_USE_DOWNGRADE when trying to go to lower tier', async () => {
      await planStore.setTenantPlan('t1', 'pro');
      await expect(flow.upgradePlan('t1', 'starter', {})).rejects.toThrow();
    });
  });

  // ── Downgrade execution ─────────────────────────────────────────
  describe('downgradePlan', () => {
    it('schedules a downgrade to take effect at period end', async () => {
      await planStore.setTenantPlan('t1', 'pro');
      const result = await flow.downgradePlan('t1', 'starter');
      expect(result.scheduledPlanId).toBe('starter');
      expect(result.effectiveAt).toBeDefined();
      // Current plan remains pro until end of billing period
      expect((await planStore.getTenantPlan('t1')).planId).toBe('pro');
    });

    it('throws UPGRADE_USE_UPGRADE when trying to go to higher tier', async () => {
      await planStore.setTenantPlan('t1', 'starter');
      await expect(flow.downgradePlan('t1', 'pro')).rejects.toThrow();
    });
  });

  // ── Grace period ────────────────────────────────────────────────
  describe('grace period', () => {
    it('activates grace period when plan limit is exceeded', async () => {
      await planStore.setTenantPlan('t1', 'free');
      flow.activateGracePeriod('t1', 'api_calls');
      const grace = flow.getGracePeriod('t1');
      expect(grace.active).toBe(true);
      expect(grace.metric).toBe('api_calls');
      expect(grace.expiresAt).toBeDefined();
    });

    it('returns inactive grace period when not set', () => {
      const grace = flow.getGracePeriod('new_tenant');
      expect(grace.active).toBe(false);
    });

    it('grace period expires after configured duration', () => {
      flow.activateGracePeriod('t1', 'api_calls');
      const grace = flow.getGracePeriod('t1');
      const expiresAt = new Date(grace.expiresAt!);
      const now = new Date();
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  // ── Proration calculation ───────────────────────────────────────
  describe('calculateProration', () => {
    it('full month proration when upgrading on day 1', () => {
      const amount = flow.calculateProration(14999, new Date('2026-03-01'), new Date('2026-03-31'));
      expect(amount).toBeCloseTo(14999, -2);
    });

    it('half month proration when upgrading mid-month', () => {
      const amount = flow.calculateProration(14999, new Date('2026-03-15'), new Date('2026-03-31'));
      expect(amount).toBeLessThan(14999);
      expect(amount).toBeGreaterThan(0);
    });

    it('free plan always prorates to 0', () => {
      const amount = flow.calculateProration(0, new Date('2026-03-01'), new Date('2026-03-31'));
      expect(amount).toBe(0);
    });
  });
});
