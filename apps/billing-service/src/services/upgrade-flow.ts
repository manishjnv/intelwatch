import { AppError } from '@etip/shared-utils';
import type { PlanStore } from './plan-store.js';
import type { InvoiceStore, Invoice } from './invoice-store.js';
import type { PlanId } from '../schemas/billing.js';

const PLAN_TIER: Record<PlanId, number> = { free: 0, starter: 1, teams: 2, enterprise: 3 };

/** Grace period configuration: 72 hours of overage tolerance before hard cutoff. */
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000;

/** Active grace period record for a tenant. */
export interface GracePeriodState {
  tenantId: string;
  metric: string;
  activatedAt: Date;
  expiresAt: Date;
  active: boolean;
}

/** Result of an upgrade preview calculation. */
export interface UpgradePreview {
  fromPlan: PlanId;
  toPlan: PlanId;
  proratedAmountInr: number;
  fullMonthAmountInr: number;
  daysRemaining: number;
  effectiveDate: Date;
}

/** Result of executing an upgrade. */
export interface UpgradeResult {
  newPlanId: PlanId;
  previousPlanId: PlanId;
  invoice: Invoice;
  effectiveAt: Date;
}

/** Result of scheduling a downgrade. */
export interface DowngradeResult {
  currentPlanId: PlanId;
  scheduledPlanId: PlanId;
  effectiveAt: Date;
}

/**
 * Handles plan upgrade, downgrade, proration, grace periods,
 * and feature gate enforcement.
 */
export class UpgradeFlow {
  private readonly gracePeriods = new Map<string, GracePeriodState>();

  constructor(
    private readonly planStore: PlanStore,
    private readonly invoiceStore: InvoiceStore,
  ) {}

  // ── Preview ───────────────────────────────────────────────────────

  /**
   * Preview the cost and timing of upgrading to a target plan.
   * Throws SAME_PLAN if already on this plan.
   * Throws DOWNGRADE_NOT_ALLOWED if target tier is lower.
   */
  async previewUpgrade(tenantId: string, targetPlanId: PlanId, now: Date = new Date()): Promise<UpgradePreview> {
    const state = await this.planStore.getTenantPlan(tenantId);
    const fromTier = PLAN_TIER[state.planId];
    const toTier = PLAN_TIER[targetPlanId];

    if (state.planId === targetPlanId) {
      throw new AppError(400, 'Already on this plan', 'SAME_PLAN');
    }
    if (toTier < fromTier) {
      throw new AppError(400, 'Use downgrade endpoint to move to a lower plan', 'DOWNGRADE_NOT_ALLOWED');
    }

    const targetPlan = this.planStore.getPlanById(targetPlanId);
    const daysInMonth = 30;
    const dayOfMonth = now.getDate();
    const daysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);
    const proratedAmountInr = this.calculateProration(targetPlan.priceInr, now, this.monthEnd(now));

    return {
      fromPlan: state.planId,
      toPlan: targetPlanId,
      proratedAmountInr,
      fullMonthAmountInr: targetPlan.priceInr,
      daysRemaining,
      effectiveDate: now,
    };
  }

  // ── Upgrade ───────────────────────────────────────────────────────

  /**
   * Execute a plan upgrade. Creates a prorated invoice.
   * Throws SAME_PLAN or DOWNGRADE_USE_DOWNGRADE for invalid transitions.
   */
  async upgradePlan(
    tenantId: string,
    targetPlanId: PlanId,
    opts: { razorpaySubscriptionId?: string; couponDiscount?: number } = {},
  ): Promise<UpgradeResult> {
    const state = await this.planStore.getTenantPlan(tenantId);
    const fromTier = PLAN_TIER[state.planId];
    const toTier = PLAN_TIER[targetPlanId];

    if (state.planId === targetPlanId) {
      throw new AppError(400, 'Already on this plan', 'SAME_PLAN');
    }
    if (toTier < fromTier) {
      throw new AppError(400, 'Use downgrade endpoint to move to a lower plan', 'DOWNGRADE_USE_DOWNGRADE');
    }

    const targetPlan = this.planStore.getPlanById(targetPlanId);
    const now = new Date();
    let amountInr = this.calculateProration(targetPlan.priceInr, now, this.monthEnd(now));
    if (opts.couponDiscount) amountInr = Math.max(0, amountInr - opts.couponDiscount);

    const invoice = this.invoiceStore.createInvoice({
      tenantId,
      planId: targetPlanId,
      amountInr,
      periodStart: now,
      periodEnd: this.monthEnd(now),
    });

    const newState = await this.planStore.setTenantPlan(tenantId, targetPlanId);
    if (opts.razorpaySubscriptionId) {
      await this.planStore.setRazorpayIds(tenantId, newState.razorpayCustomerId ?? '', opts.razorpaySubscriptionId);
    }

    return {
      newPlanId: targetPlanId,
      previousPlanId: state.planId,
      invoice,
      effectiveAt: now,
    };
  }

  // ── Downgrade ─────────────────────────────────────────────────────

  /**
   * Schedule a plan downgrade to take effect at end of current billing period.
   * The tenant stays on the current plan until then.
   */
  async downgradePlan(tenantId: string, targetPlanId: PlanId): Promise<DowngradeResult> {
    const state = await this.planStore.getTenantPlan(tenantId);
    const fromTier = PLAN_TIER[state.planId];
    const toTier = PLAN_TIER[targetPlanId];

    if (state.planId === targetPlanId) {
      throw new AppError(400, 'Already on this plan', 'SAME_PLAN');
    }
    if (toTier >= fromTier) {
      throw new AppError(400, 'Use upgrade endpoint to move to a higher plan', 'UPGRADE_USE_UPGRADE');
    }

    const effectiveAt = this.monthEnd(new Date());
    await this.planStore.scheduleDowngrade(tenantId, targetPlanId, effectiveAt);

    return { currentPlanId: state.planId, scheduledPlanId: targetPlanId, effectiveAt };
  }

  // ── Grace period ──────────────────────────────────────────────────

  /** Activate a grace period for a tenant that has exceeded a plan limit. */
  activateGracePeriod(tenantId: string, metric: string): GracePeriodState {
    const now = new Date();
    const state: GracePeriodState = {
      tenantId,
      metric,
      activatedAt: now,
      expiresAt: new Date(now.getTime() + GRACE_PERIOD_MS),
      active: true,
    };
    this.gracePeriods.set(tenantId, state);
    return state;
  }

  /** Get the current grace period state for a tenant. Returns inactive state if none. */
  getGracePeriod(tenantId: string): GracePeriodState & { active: boolean } {
    const state = this.gracePeriods.get(tenantId);
    if (!state) {
      return { tenantId, metric: '', activatedAt: new Date(), expiresAt: new Date(), active: false };
    }
    // Check if expired
    state.active = new Date() < state.expiresAt;
    return state;
  }

  /** Returns true if the tenant is currently in an active grace period. */
  isInGracePeriod(tenantId: string): boolean {
    return this.getGracePeriod(tenantId).active;
  }

  // ── Proration ─────────────────────────────────────────────────────

  /** Calculate prorated amount based on days remaining in the billing period. */
  calculateProration(monthlyPriceInr: number, from: Date, periodEnd: Date): number {
    if (monthlyPriceInr === 0) return 0;
    const msRemaining = periodEnd.getTime() - from.getTime();
    const msInMonth = 30 * 24 * 3600 * 1000;
    const fraction = Math.min(1, Math.max(0, msRemaining / msInMonth));
    return Math.round(monthlyPriceInr * fraction);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private monthEnd(from: Date): Date {
    const end = new Date(from);
    end.setDate(1);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0); // last day of current month
    end.setHours(23, 59, 59, 999);
    return end;
  }
}
