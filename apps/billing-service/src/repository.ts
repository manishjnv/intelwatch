/**
 * BillingRepository — Prisma-backed persistence for billing-service.
 *
 * Replaces the in-memory Maps from DECISION-013 with durable Postgres storage.
 * Each method maps 1:1 to a store operation, preserving the same API contract.
 */
import type { PrismaClient } from '@prisma/client';
import type { PlanId } from './schemas/billing.js';
import type { TenantPlanState } from './services/plan-store.js';
import type { TenantUsage } from './services/usage-store.js';
import type { Invoice, InvoiceStatus, InvoiceListResult } from './services/invoice-store.js';
import type { Coupon, DiscountType } from './services/coupon-store.js';
import type { GracePeriodState } from './services/upgrade-flow.js';

// ── Plan Subscription ─────────────────────────────────────────────────

export class SubscriptionRepo {
  constructor(private readonly db: PrismaClient) {}

  async getTenantPlan(tenantId: string): Promise<TenantPlanState | null> {
    const row = await this.db.tenantSubscription.findUnique({ where: { tenantId } });
    if (!row) return null;
    return this.toTenantPlanState(row);
  }

  async upsertTenantPlan(state: TenantPlanState): Promise<TenantPlanState> {
    const row = await this.db.tenantSubscription.upsert({
      where: { tenantId: state.tenantId },
      create: {
        tenantId: state.tenantId,
        plan: state.planId as never,
        status: state.status,
        previousPlan: state.previousPlanId as never ?? undefined,
        scheduledPlan: state.scheduledPlanId as never ?? undefined,
        scheduledPlanAt: state.scheduledPlanEffectiveAt,
        razorpayCustomerId: state.razorpayCustomerId,
        razorpaySubId: state.razorpaySubscriptionId,
        trialEndsAt: state.trialEndsAt,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
      },
      update: {
        plan: state.planId as never,
        status: state.status,
        previousPlan: state.previousPlanId as never ?? undefined,
        scheduledPlan: state.scheduledPlanId as never ?? null,
        scheduledPlanAt: state.scheduledPlanEffectiveAt ?? null,
        razorpayCustomerId: state.razorpayCustomerId,
        razorpaySubId: state.razorpaySubscriptionId,
        trialEndsAt: state.trialEndsAt,
        currentPeriodStart: state.currentPeriodStart,
        currentPeriodEnd: state.currentPeriodEnd,
      },
    });
    return this.toTenantPlanState(row);
  }

  async getAllTenantPlans(): Promise<TenantPlanState[]> {
    const rows = await this.db.tenantSubscription.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map((r) => this.toTenantPlanState(r));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toTenantPlanState(row: any): TenantPlanState {
    return {
      tenantId: row.tenantId,
      planId: row.plan as PlanId,
      previousPlanId: row.previousPlan as PlanId | undefined,
      status: row.status as TenantPlanState['status'],
      scheduledPlanId: row.scheduledPlan as PlanId | undefined,
      scheduledPlanEffectiveAt: row.scheduledPlanAt ?? undefined,
      razorpayCustomerId: row.razorpayCustomerId ?? undefined,
      razorpaySubscriptionId: row.razorpaySubId ?? undefined,
      trialEndsAt: row.trialEndsAt ?? undefined,
      currentPeriodStart: row.currentPeriodStart ?? undefined,
      currentPeriodEnd: row.currentPeriodEnd ?? undefined,
      updatedAt: row.updatedAt,
    };
  }
}

// ── Usage ─────────────────────────────────────────────────────────────

export class UsageRepo {
  constructor(private readonly db: PrismaClient) {}

  async getUsage(tenantId: string, period: string): Promise<TenantUsage | null> {
    const row = await this.db.billingUsageRecord.findUnique({
      where: { tenantId_period: { tenantId, period } },
    });
    if (!row) return null;
    return this.toTenantUsage(row);
  }

  async upsertUsage(tenantId: string, period: string, data: Partial<TenantUsage>): Promise<TenantUsage> {
    const row = await this.db.billingUsageRecord.upsert({
      where: { tenantId_period: { tenantId, period } },
      create: {
        tenantId,
        period,
        apiCalls: data.api_calls ?? 0,
        iocsIngested: data.iocs_ingested ?? 0,
        enrichments: data.enrichments ?? 0,
        storageKb: data.storage_kb ?? 0,
        periodStart: data.periodStart ?? new Date(),
      },
      update: {
        apiCalls: data.api_calls,
        iocsIngested: data.iocs_ingested,
        enrichments: data.enrichments,
        storageKb: data.storage_kb,
      },
    });
    return this.toTenantUsage(row);
  }

  async incrementUsage(
    tenantId: string,
    period: string,
    field: 'apiCalls' | 'iocsIngested' | 'enrichments' | 'storageKb',
    count: number,
  ): Promise<TenantUsage> {
    // Ensure the record exists first
    await this.db.billingUsageRecord.upsert({
      where: { tenantId_period: { tenantId, period } },
      create: { tenantId, period, [field]: count },
      update: { [field]: { increment: count } },
    });
    const row = await this.db.billingUsageRecord.findUniqueOrThrow({
      where: { tenantId_period: { tenantId, period } },
    });
    return this.toTenantUsage(row);
  }

  async getAllUsage(): Promise<TenantUsage[]> {
    const rows = await this.db.billingUsageRecord.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map((r) => this.toTenantUsage(r));
  }

  async resetMonthly(tenantId: string, period: string): Promise<void> {
    await this.db.billingUsageRecord.updateMany({
      where: { tenantId, period },
      data: { apiCalls: 0, iocsIngested: 0, enrichments: 0 },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toTenantUsage(row: any): TenantUsage {
    return {
      tenantId: row.tenantId,
      api_calls: row.apiCalls,
      iocs_ingested: row.iocsIngested,
      enrichments: row.enrichments,
      storage_kb: row.storageKb,
      periodStart: row.periodStart,
      lastUpdated: row.updatedAt,
    };
  }
}

// ── Invoice ───────────────────────────────────────────────────────────

export class InvoiceRepo {
  constructor(private readonly db: PrismaClient) {}

  async createInvoice(data: {
    tenantId: string;
    planId: string;
    amountInr: number;
    gstAmountInr: number;
    totalAmountInr: number;
    periodStart: Date;
    periodEnd: Date;
    gstNumber?: string;
  }): Promise<Invoice> {
    const row = await this.db.billingInvoice.create({ data });
    return this.toInvoice(row);
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    const row = await this.db.billingInvoice.findUnique({ where: { id } });
    if (!row) return null;
    return this.toInvoice(row);
  }

  async listInvoices(
    tenantId: string,
    opts: { status?: InvoiceStatus; page?: number; limit?: number },
  ): Promise<InvoiceListResult> {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const where = {
      tenantId,
      ...(opts.status ? { status: opts.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.db.billingInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.billingInvoice.count({ where }),
    ]);
    return { data: data.map((r) => this.toInvoice(r)), total, page, limit };
  }

  async updateInvoiceStatus(
    id: string,
    status: InvoiceStatus,
    opts?: { razorpayPaymentId?: string; razorpayOrderId?: string },
  ): Promise<Invoice> {
    const row = await this.db.billingInvoice.update({
      where: { id },
      data: {
        status,
        razorpayPayId: opts?.razorpayPaymentId,
        razorpayOrderId: opts?.razorpayOrderId,
        paidAt: status === 'paid' ? new Date() : undefined,
      },
    });
    return this.toInvoice(row);
  }

  async findByOrderId(orderId: string): Promise<Invoice | undefined> {
    const row = await this.db.billingInvoice.findFirst({
      where: { razorpayOrderId: orderId },
    });
    if (!row) return undefined;
    return this.toInvoice(row);
  }

  async getRevenueMetrics(): Promise<{
    totalRevenueInr: number;
    paidInvoiceCount: number;
    pendingInvoiceCount: number;
    cancelledInvoiceCount: number;
  }> {
    const [paid, pending, cancelled] = await Promise.all([
      this.db.billingInvoice.aggregate({
        where: { status: 'paid' },
        _sum: { amountInr: true },
        _count: true,
      }),
      this.db.billingInvoice.count({ where: { status: 'pending' } }),
      this.db.billingInvoice.count({ where: { status: 'cancelled' } }),
    ]);
    return {
      totalRevenueInr: paid._sum.amountInr ?? 0,
      paidInvoiceCount: paid._count,
      pendingInvoiceCount: pending,
      cancelledInvoiceCount: cancelled,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toInvoice(row: any): Invoice {
    return {
      id: row.id,
      tenantId: row.tenantId,
      planId: row.planId as PlanId,
      status: row.status as InvoiceStatus,
      amountInr: row.amountInr,
      gstAmountInr: row.gstAmountInr,
      totalAmountInr: row.totalAmountInr,
      gstNumber: row.gstNumber ?? undefined,
      razorpayPaymentId: row.razorpayPayId ?? undefined,
      razorpayOrderId: row.razorpayOrderId ?? undefined,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ── Coupon ─────────────────────────────────────────────────────────────

export class CouponRepo {
  constructor(private readonly db: PrismaClient) {}

  async createCoupon(data: {
    code: string;
    discountType: string;
    discountValue: number;
    maxUses: number;
    expiresAt: Date;
    applicablePlans?: string[];
  }): Promise<Coupon> {
    const row = await this.db.billingCoupon.create({
      data: {
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxUses: data.maxUses,
        expiresAt: data.expiresAt,
        applicablePlans: data.applicablePlans ?? [],
      },
    });
    return this.toCoupon(row);
  }

  async getCoupon(code: string): Promise<Coupon | null> {
    const row = await this.db.billingCoupon.findUnique({ where: { code } });
    if (!row) return null;
    return this.toCoupon(row);
  }

  async incrementUsage(code: string): Promise<void> {
    await this.db.billingCoupon.update({
      where: { code },
      data: { usageCount: { increment: 1 } },
    });
  }

  async listCoupons(): Promise<Coupon[]> {
    const rows = await this.db.billingCoupon.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.toCoupon(r));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toCoupon(row: any): Coupon {
    return {
      code: row.code,
      discountType: row.discountType as DiscountType,
      discountValue: row.discountValue,
      maxUses: row.maxUses,
      usageCount: row.usageCount,
      expiresAt: row.expiresAt,
      applicablePlans: row.applicablePlans?.length > 0 ? row.applicablePlans as PlanId[] : undefined,
      createdAt: row.createdAt,
    };
  }
}

// ── Grace Period ──────────────────────────────────────────────────────

export class GracePeriodRepo {
  constructor(private readonly db: PrismaClient) {}

  async getActive(tenantId: string): Promise<GracePeriodState | null> {
    const row = await this.db.billingGracePeriod.findFirst({
      where: { tenantId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;
    return {
      tenantId: row.tenantId,
      metric: row.metric,
      activatedAt: row.activatedAt,
      expiresAt: row.expiresAt,
      active: new Date() < row.expiresAt,
    };
  }

  async activate(tenantId: string, metric: string, expiresAt: Date): Promise<GracePeriodState> {
    // Deactivate any existing grace period
    await this.db.billingGracePeriod.updateMany({
      where: { tenantId, active: true },
      data: { active: false },
    });
    const row = await this.db.billingGracePeriod.create({
      data: { tenantId, metric, activatedAt: new Date(), expiresAt, active: true },
    });
    return {
      tenantId: row.tenantId,
      metric: row.metric,
      activatedAt: row.activatedAt,
      expiresAt: row.expiresAt,
      active: true,
    };
  }
}
