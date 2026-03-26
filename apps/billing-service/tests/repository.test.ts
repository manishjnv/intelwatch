/**
 * BillingRepository unit tests — mocked PrismaClient.
 * Each repo class (SubscriptionRepo, UsageRepo, InvoiceRepo, CouponRepo, GracePeriodRepo)
 * is tested independently with varied mock return values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionRepo, UsageRepo, InvoiceRepo, CouponRepo, GracePeriodRepo } from '../src/repository.js';

// ── Mock PrismaClient factory ─────────────────────────────────────────

function createMockPrisma() {
  return {
    tenantSubscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    billingUsageRecord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    billingInvoice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    billingCoupon: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    billingGracePeriod: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

// ── SubscriptionRepo ──────────────────────────────────────────────────

describe('SubscriptionRepo', () => {
  let db: MockPrisma;
  let repo: SubscriptionRepo;

  beforeEach(() => {
    db = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new SubscriptionRepo(db as any);
  });

  describe('getTenantPlan', () => {
    it('returns null when no subscription exists', async () => {
      db.tenantSubscription.findUnique.mockResolvedValue(null);
      const result = await repo.getTenantPlan('t1');
      expect(result).toBeNull();
      expect(db.tenantSubscription.findUnique).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    });

    it('maps DB row to TenantPlanState', async () => {
      db.tenantSubscription.findUnique.mockResolvedValue({
        tenantId: 't1',
        plan: 'starter',
        status: 'active',
        previousPlan: 'free',
        scheduledPlan: null,
        scheduledPlanAt: null,
        razorpayCustomerId: 'cust_abc',
        razorpaySubId: 'sub_123',
        trialEndsAt: null,
        currentPeriodStart: new Date('2026-03-01'),
        currentPeriodEnd: new Date('2026-03-31'),
        updatedAt: new Date('2026-03-15'),
      });
      const state = await repo.getTenantPlan('t1');
      expect(state).not.toBeNull();
      expect(state!.planId).toBe('starter');
      expect(state!.previousPlanId).toBe('free');
      expect(state!.razorpayCustomerId).toBe('cust_abc');
      expect(state!.razorpaySubscriptionId).toBe('sub_123');
    });

    it('handles enterprise plan with scheduled downgrade', async () => {
      const scheduledAt = new Date('2026-04-01');
      db.tenantSubscription.findUnique.mockResolvedValue({
        tenantId: 't2',
        plan: 'enterprise',
        status: 'active',
        previousPlan: 'pro',
        scheduledPlan: 'pro',
        scheduledPlanAt: scheduledAt,
        razorpayCustomerId: null,
        razorpaySubId: null,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        updatedAt: new Date(),
      });
      const state = await repo.getTenantPlan('t2');
      expect(state!.scheduledPlanId).toBe('pro');
      expect(state!.scheduledPlanEffectiveAt).toEqual(scheduledAt);
    });
  });

  describe('upsertTenantPlan', () => {
    it('creates new subscription record', async () => {
      const input = {
        tenantId: 't1',
        planId: 'starter' as const,
        status: 'active' as const,
        updatedAt: new Date(),
      };
      db.tenantSubscription.upsert.mockResolvedValue({
        tenantId: 't1',
        plan: 'starter',
        status: 'active',
        previousPlan: null,
        scheduledPlan: null,
        scheduledPlanAt: null,
        razorpayCustomerId: null,
        razorpaySubId: null,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        updatedAt: new Date(),
      });
      const result = await repo.upsertTenantPlan(input);
      expect(result.planId).toBe('starter');
      expect(db.tenantSubscription.upsert).toHaveBeenCalledOnce();
    });
  });

  describe('getAllTenantPlans', () => {
    it('returns sorted list of all subscriptions', async () => {
      db.tenantSubscription.findMany.mockResolvedValue([
        { tenantId: 't1', plan: 'pro', status: 'active', previousPlan: null, scheduledPlan: null, scheduledPlanAt: null, razorpayCustomerId: null, razorpaySubId: null, trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, updatedAt: new Date() },
        { tenantId: 't2', plan: 'free', status: 'active', previousPlan: null, scheduledPlan: null, scheduledPlanAt: null, razorpayCustomerId: null, razorpaySubId: null, trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, updatedAt: new Date() },
      ]);
      const plans = await repo.getAllTenantPlans();
      expect(plans).toHaveLength(2);
      expect(plans[0].planId).toBe('pro');
      expect(plans[1].planId).toBe('free');
    });

    it('returns empty array when no subscriptions exist', async () => {
      db.tenantSubscription.findMany.mockResolvedValue([]);
      const plans = await repo.getAllTenantPlans();
      expect(plans).toHaveLength(0);
    });
  });
});

// ── UsageRepo ─────────────────────────────────────────────────────────

describe('UsageRepo', () => {
  let db: MockPrisma;
  let repo: UsageRepo;

  beforeEach(() => {
    db = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new UsageRepo(db as any);
  });

  describe('getUsage', () => {
    it('returns null when no record exists', async () => {
      db.billingUsageRecord.findUnique.mockResolvedValue(null);
      const result = await repo.getUsage('t1', '2026-03');
      expect(result).toBeNull();
    });

    it('maps DB row to TenantUsage', async () => {
      db.billingUsageRecord.findUnique.mockResolvedValue({
        tenantId: 't1',
        period: '2026-03',
        apiCalls: 150,
        iocsIngested: 500,
        enrichments: 30,
        storageKb: 1024,
        periodStart: new Date('2026-03-01'),
        updatedAt: new Date('2026-03-15'),
      });
      const usage = await repo.getUsage('t1', '2026-03');
      expect(usage!.api_calls).toBe(150);
      expect(usage!.iocs_ingested).toBe(500);
      expect(usage!.enrichments).toBe(30);
      expect(usage!.storage_kb).toBe(1024);
    });
  });

  describe('incrementUsage', () => {
    it('increments apiCalls and returns updated usage', async () => {
      db.billingUsageRecord.upsert.mockResolvedValue({});
      db.billingUsageRecord.findUniqueOrThrow.mockResolvedValue({
        tenantId: 't1',
        period: '2026-03',
        apiCalls: 10,
        iocsIngested: 0,
        enrichments: 0,
        storageKb: 0,
        periodStart: new Date(),
        updatedAt: new Date(),
      });
      const usage = await repo.incrementUsage('t1', '2026-03', 'apiCalls', 5);
      expect(usage.api_calls).toBe(10);
      expect(db.billingUsageRecord.upsert).toHaveBeenCalledOnce();
    });
  });

  describe('resetMonthly', () => {
    it('calls updateMany with zeroed counters', async () => {
      db.billingUsageRecord.updateMany.mockResolvedValue({ count: 1 });
      await repo.resetMonthly('t1', '2026-03');
      expect(db.billingUsageRecord.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't1', period: '2026-03' },
        data: { apiCalls: 0, iocsIngested: 0, enrichments: 0 },
      });
    });
  });
});

// ── InvoiceRepo ───────────────────────────────────────────────────────

describe('InvoiceRepo', () => {
  let db: MockPrisma;
  let repo: InvoiceRepo;

  beforeEach(() => {
    db = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new InvoiceRepo(db as any);
  });

  describe('createInvoice', () => {
    it('creates and returns mapped invoice', async () => {
      const now = new Date();
      db.billingInvoice.create.mockResolvedValue({
        id: 'inv-1',
        tenantId: 't1',
        planId: 'starter',
        status: 'pending',
        amountInr: 4999,
        gstAmountInr: 900,
        totalAmountInr: 5899,
        gstNumber: null,
        razorpayPayId: null,
        razorpayOrderId: null,
        periodStart: now,
        periodEnd: now,
        createdAt: now,
        updatedAt: now,
        paidAt: null,
      });
      const invoice = await repo.createInvoice({
        tenantId: 't1',
        planId: 'starter',
        amountInr: 4999,
        gstAmountInr: 900,
        totalAmountInr: 5899,
        periodStart: now,
        periodEnd: now,
      });
      expect(invoice.id).toBe('inv-1');
      expect(invoice.amountInr).toBe(4999);
      expect(invoice.status).toBe('pending');
    });
  });

  describe('listInvoices', () => {
    it('returns paginated invoices with total count', async () => {
      db.billingInvoice.findMany.mockResolvedValue([
        { id: 'inv-1', tenantId: 't1', planId: 'starter', status: 'paid', amountInr: 4999, gstAmountInr: 900, totalAmountInr: 5899, gstNumber: null, razorpayPayId: 'pay_1', razorpayOrderId: null, periodStart: new Date(), periodEnd: new Date(), createdAt: new Date(), updatedAt: new Date(), paidAt: new Date() },
      ]);
      db.billingInvoice.count.mockResolvedValue(1);
      const result = await repo.listInvoices('t1', { page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('filters by status when provided', async () => {
      db.billingInvoice.findMany.mockResolvedValue([]);
      db.billingInvoice.count.mockResolvedValue(0);
      await repo.listInvoices('t1', { status: 'paid' });
      expect(db.billingInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1', status: 'paid' } }),
      );
    });
  });

  describe('updateInvoiceStatus', () => {
    it('updates status and sets paidAt for paid status', async () => {
      db.billingInvoice.update.mockResolvedValue({
        id: 'inv-1',
        tenantId: 't1',
        planId: 'starter',
        status: 'paid',
        amountInr: 4999,
        gstAmountInr: 900,
        totalAmountInr: 5899,
        gstNumber: null,
        razorpayPayId: 'pay_abc',
        razorpayOrderId: null,
        periodStart: new Date(),
        periodEnd: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        paidAt: new Date(),
      });
      const invoice = await repo.updateInvoiceStatus('inv-1', 'paid', { razorpayPaymentId: 'pay_abc' });
      expect(invoice.status).toBe('paid');
      expect(invoice.razorpayPaymentId).toBe('pay_abc');
      expect(db.billingInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({ status: 'paid', razorpayPayId: 'pay_abc' }),
        }),
      );
    });
  });

  describe('getRevenueMetrics', () => {
    it('aggregates revenue from paid invoices', async () => {
      db.billingInvoice.aggregate.mockResolvedValue({ _sum: { amountInr: 50000 }, _count: 5 });
      db.billingInvoice.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
      const metrics = await repo.getRevenueMetrics();
      expect(metrics.totalRevenueInr).toBe(50000);
      expect(metrics.paidInvoiceCount).toBe(5);
      expect(metrics.pendingInvoiceCount).toBe(3);
      expect(metrics.cancelledInvoiceCount).toBe(1);
    });

    it('returns zero revenue when no paid invoices', async () => {
      db.billingInvoice.aggregate.mockResolvedValue({ _sum: { amountInr: null }, _count: 0 });
      db.billingInvoice.count.mockResolvedValue(0);
      const metrics = await repo.getRevenueMetrics();
      expect(metrics.totalRevenueInr).toBe(0);
      expect(metrics.paidInvoiceCount).toBe(0);
    });
  });

  describe('findByOrderId', () => {
    it('returns undefined when no match', async () => {
      db.billingInvoice.findFirst.mockResolvedValue(null);
      const result = await repo.findByOrderId('order_xyz');
      expect(result).toBeUndefined();
    });
  });
});

// ── CouponRepo ────────────────────────────────────────────────────────

describe('CouponRepo', () => {
  let db: MockPrisma;
  let repo: CouponRepo;

  beforeEach(() => {
    db = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new CouponRepo(db as any);
  });

  describe('createCoupon', () => {
    it('creates and returns mapped coupon', async () => {
      const expiresAt = new Date('2026-12-31');
      db.billingCoupon.create.mockResolvedValue({
        id: 'c1',
        code: 'SAVE20',
        discountType: 'percentage',
        discountValue: 20,
        maxUses: 100,
        usageCount: 0,
        applicablePlans: [],
        expiresAt,
        createdAt: new Date(),
      });
      const coupon = await repo.createCoupon({
        code: 'SAVE20',
        discountType: 'percentage',
        discountValue: 20,
        maxUses: 100,
        expiresAt,
      });
      expect(coupon.code).toBe('SAVE20');
      expect(coupon.discountType).toBe('percentage');
      expect(coupon.discountValue).toBe(20);
    });
  });

  describe('getCoupon', () => {
    it('returns null for non-existent coupon', async () => {
      db.billingCoupon.findUnique.mockResolvedValue(null);
      const result = await repo.getCoupon('MISSING');
      expect(result).toBeNull();
    });

    it('maps applicablePlans correctly', async () => {
      db.billingCoupon.findUnique.mockResolvedValue({
        id: 'c1',
        code: 'PROONLY',
        discountType: 'flat',
        discountValue: 1000,
        maxUses: 50,
        usageCount: 5,
        applicablePlans: ['pro', 'enterprise'],
        expiresAt: new Date('2026-12-31'),
        createdAt: new Date(),
      });
      const coupon = await repo.getCoupon('PROONLY');
      expect(coupon!.applicablePlans).toEqual(['pro', 'enterprise']);
    });
  });

  describe('incrementUsage', () => {
    it('calls update with increment', async () => {
      db.billingCoupon.update.mockResolvedValue({});
      await repo.incrementUsage('SAVE20');
      expect(db.billingCoupon.update).toHaveBeenCalledWith({
        where: { code: 'SAVE20' },
        data: { usageCount: { increment: 1 } },
      });
    });
  });
});

// ── GracePeriodRepo ───────────────────────────────────────────────────

describe('GracePeriodRepo', () => {
  let db: MockPrisma;
  let repo: GracePeriodRepo;

  beforeEach(() => {
    db = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new GracePeriodRepo(db as any);
  });

  describe('getActive', () => {
    it('returns null when no active grace period', async () => {
      db.billingGracePeriod.findFirst.mockResolvedValue(null);
      const result = await repo.getActive('t1');
      expect(result).toBeNull();
    });

    it('returns active grace period with correct expiry check', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      db.billingGracePeriod.findFirst.mockResolvedValue({
        tenantId: 't1',
        metric: 'api_calls',
        activatedAt: new Date(),
        expiresAt: futureDate,
      });
      const result = await repo.getActive('t1');
      expect(result!.active).toBe(true);
      expect(result!.metric).toBe('api_calls');
    });

    it('returns inactive for expired grace period', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      db.billingGracePeriod.findFirst.mockResolvedValue({
        tenantId: 't1',
        metric: 'api_calls',
        activatedAt: new Date(Date.now() - 172800000),
        expiresAt: pastDate,
      });
      const result = await repo.getActive('t1');
      expect(result!.active).toBe(false);
    });
  });

  describe('activate', () => {
    it('deactivates existing and creates new grace period', async () => {
      db.billingGracePeriod.updateMany.mockResolvedValue({ count: 1 });
      const expiresAt = new Date(Date.now() + 259200000);
      db.billingGracePeriod.create.mockResolvedValue({
        tenantId: 't1',
        metric: 'enrichments',
        activatedAt: new Date(),
        expiresAt,
        active: true,
      });
      const result = await repo.activate('t1', 'enrichments', expiresAt);
      expect(result.active).toBe(true);
      expect(result.metric).toBe('enrichments');
      expect(db.billingGracePeriod.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 't1', active: true },
        data: { active: false },
      });
    });
  });
});
