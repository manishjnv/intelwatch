import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageStore } from '../src/services/usage-store.js';
import { InvoiceStore } from '../src/services/invoice-store.js';
import { CouponStore } from '../src/services/coupon-store.js';
import type { UsageRepo, InvoiceRepo, CouponRepo } from '../src/repository.js';
import type { TenantUsage } from '../src/services/usage-store.js';
import type { Invoice, InvoiceListResult } from '../src/services/invoice-store.js';
import type { Coupon } from '../src/services/coupon-store.js';

// ── Mock helpers ────────────────────────────────────────────────────────

function makeMockUsageRepo(overrides?: Partial<UsageRepo>): UsageRepo {
  return {
    getUsage: vi.fn().mockResolvedValue(null),
    upsertUsage: vi.fn().mockResolvedValue(null),
    incrementUsage: vi.fn().mockResolvedValue({
      tenantId: 't1', api_calls: 5, iocs_ingested: 0, enrichments: 0,
      storage_kb: 0, periodStart: new Date(), lastUpdated: new Date(),
    } satisfies TenantUsage),
    getAllUsage: vi.fn().mockResolvedValue([]),
    resetMonthly: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UsageRepo;
}

function makeMockInvoiceRepo(overrides?: Partial<InvoiceRepo>): InvoiceRepo {
  const fakeInvoice: Invoice = {
    id: 'inv_db_001', tenantId: 't1', planId: 'starter', status: 'pending',
    amountInr: 5000, gstAmountInr: 900, totalAmountInr: 5900,
    periodStart: new Date(), periodEnd: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
  };
  return {
    createInvoice: vi.fn().mockResolvedValue(fakeInvoice),
    getInvoiceById: vi.fn().mockResolvedValue(fakeInvoice),
    listInvoices: vi.fn().mockResolvedValue({ data: [fakeInvoice], total: 1, page: 1, limit: 20 } satisfies InvoiceListResult),
    updateInvoiceStatus: vi.fn().mockResolvedValue({ ...fakeInvoice, status: 'paid' }),
    findByOrderId: vi.fn().mockResolvedValue(fakeInvoice),
    getRevenueMetrics: vi.fn().mockResolvedValue({
      totalRevenueInr: 50000, paidInvoiceCount: 5,
      pendingInvoiceCount: 2, cancelledInvoiceCount: 1,
    }),
    ...overrides,
  } as unknown as InvoiceRepo;
}

function makeMockCouponRepo(overrides?: Partial<CouponRepo>): CouponRepo {
  const fakeCoupon: Coupon = {
    code: 'DB10', discountType: 'percentage', discountValue: 10,
    maxUses: 100, usageCount: 0, expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
  };
  return {
    createCoupon: vi.fn().mockResolvedValue(fakeCoupon),
    getCoupon: vi.fn().mockResolvedValue(fakeCoupon),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    listCoupons: vi.fn().mockResolvedValue([fakeCoupon]),
    ...overrides,
  } as unknown as CouponRepo;
}

// ── UsageStore dual-mode ────────────────────────────────────────────────

describe('UsageStore dual-mode', () => {
  it('uses repo.incrementUsage when repo is provided', async () => {
    const repo = makeMockUsageRepo();
    const store = new UsageStore(repo);
    const result = await store.trackUsage('t1', 'api_call', 5);
    expect(repo.incrementUsage).toHaveBeenCalledOnce();
    expect(result.api_calls).toBe(5);
  });

  it('falls back to in-memory when repo throws on trackUsage', async () => {
    const repo = makeMockUsageRepo({
      incrementUsage: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const store = new UsageStore(repo);
    const result = await store.trackUsage('t1', 'api_call', 3);
    expect(result.api_calls).toBe(3);
  });

  it('uses repo.getUsage when repo is provided and returns data', async () => {
    const dbUsage: TenantUsage = {
      tenantId: 't1', api_calls: 42, iocs_ingested: 10, enrichments: 5,
      storage_kb: 1024, periodStart: new Date(), lastUpdated: new Date(),
    };
    const repo = makeMockUsageRepo({ getUsage: vi.fn().mockResolvedValue(dbUsage) });
    const store = new UsageStore(repo);
    const result = await store.getUsage('t1');
    expect(result.api_calls).toBe(42);
  });

  it('falls back to in-memory for getUsage when repo throws', async () => {
    const repo = makeMockUsageRepo({
      getUsage: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    const store = new UsageStore(repo);
    const result = await store.getUsage('t1');
    expect(result.api_calls).toBe(0); // fresh in-memory
  });

  it('calls repo.resetMonthly and returns fresh data', async () => {
    const resetUsage: TenantUsage = {
      tenantId: 't1', api_calls: 0, iocs_ingested: 0, enrichments: 0,
      storage_kb: 512, periodStart: new Date(), lastUpdated: new Date(),
    };
    const repo = makeMockUsageRepo({
      resetMonthly: vi.fn().mockResolvedValue(undefined),
      getUsage: vi.fn().mockResolvedValue(resetUsage),
    });
    const store = new UsageStore(repo);
    const result = await store.resetMonthly('t1');
    expect(repo.resetMonthly).toHaveBeenCalledOnce();
    expect(result.api_calls).toBe(0);
  });
});

// ── InvoiceStore dual-mode ──────────────────────────────────────────────

describe('InvoiceStore dual-mode', () => {
  it('delegates createInvoice to repo when available', async () => {
    const repo = makeMockInvoiceRepo();
    const store = new InvoiceStore(repo);
    const inv = await store.createInvoice({
      tenantId: 't1', planId: 'starter', amountInr: 5000,
      periodStart: new Date(), periodEnd: new Date(),
    });
    expect(repo.createInvoice).toHaveBeenCalledOnce();
    expect(inv.id).toBe('inv_db_001');
  });

  it('falls back to in-memory when repo.createInvoice throws', async () => {
    const repo = makeMockInvoiceRepo({
      createInvoice: vi.fn().mockRejectedValue(new Error('constraint')),
    });
    const store = new InvoiceStore(repo);
    const inv = await store.createInvoice({
      tenantId: 't1', planId: 'starter', amountInr: 5000,
      periodStart: new Date(), periodEnd: new Date(),
    });
    expect(inv.id).toMatch(/^inv_/);
    expect(inv.tenantId).toBe('t1');
  });

  it('delegates listInvoices to repo', async () => {
    const repo = makeMockInvoiceRepo();
    const store = new InvoiceStore(repo);
    const result = await store.listInvoices('t1', { page: 1 });
    expect(repo.listInvoices).toHaveBeenCalledOnce();
    expect(result.total).toBe(1);
  });

  it('delegates updateInvoiceStatus to repo', async () => {
    const repo = makeMockInvoiceRepo();
    const store = new InvoiceStore(repo);
    const inv = await store.updateInvoiceStatus('inv_db_001', 'paid');
    expect(repo.updateInvoiceStatus).toHaveBeenCalledOnce();
    expect(inv.status).toBe('paid');
  });

  it('delegates getRevenueMetrics to repo', async () => {
    const repo = makeMockInvoiceRepo();
    const store = new InvoiceStore(repo);
    const metrics = await store.getRevenueMetrics();
    expect(repo.getRevenueMetrics).toHaveBeenCalledOnce();
    expect(metrics.totalRevenueInr).toBe(50000);
  });

  it('delegates findByOrderId to repo', async () => {
    const repo = makeMockInvoiceRepo();
    const store = new InvoiceStore(repo);
    const inv = await store.findByOrderId('order_123');
    expect(repo.findByOrderId).toHaveBeenCalledWith('order_123');
    expect(inv?.id).toBe('inv_db_001');
  });
});

// ── CouponStore dual-mode ───────────────────────────────────────────────

describe('CouponStore dual-mode', () => {
  it('delegates createCoupon to repo', async () => {
    const repo = makeMockCouponRepo();
    const store = new CouponStore(repo);
    const coupon = await store.createCoupon({
      code: 'DB10', discountType: 'percentage', discountValue: 10,
      maxUses: 100, expiresAt: new Date(Date.now() + 86400000),
    });
    expect(repo.createCoupon).toHaveBeenCalledOnce();
    expect(coupon.code).toBe('DB10');
  });

  it('validates coupon via repo.getCoupon', async () => {
    const repo = makeMockCouponRepo();
    const store = new CouponStore(repo);
    const result = await store.validateCoupon('DB10');
    expect(result.valid).toBe(true);
    expect(repo.getCoupon).toHaveBeenCalledWith('DB10');
  });

  it('applies coupon and calls repo.incrementUsage', async () => {
    const repo = makeMockCouponRepo();
    const store = new CouponStore(repo);
    const result = await store.applyCoupon('DB10', 't1', 10000);
    expect(repo.incrementUsage).toHaveBeenCalledWith('DB10');
    expect(result.discountAmountInr).toBe(1000); // 10% of 10000
  });

  it('delegates listCoupons to repo', async () => {
    const repo = makeMockCouponRepo();
    const store = new CouponStore(repo);
    const list = await store.listCoupons();
    expect(repo.listCoupons).toHaveBeenCalledOnce();
    expect(list).toHaveLength(1);
  });

  it('delegates getCoupon to repo', async () => {
    const repo = makeMockCouponRepo();
    const store = new CouponStore(repo);
    const coupon = await store.getCoupon('DB10');
    expect(repo.getCoupon).toHaveBeenCalledWith('DB10');
    expect(coupon.code).toBe('DB10');
  });
});
