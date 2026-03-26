import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlanStore } from '../src/services/plan-store.js';
import { UsageStore } from '../src/services/usage-store.js';
import { RazorpayClient } from '../src/services/razorpay-client.js';
import { InvoiceStore } from '../src/services/invoice-store.js';
import { UpgradeFlow } from '../src/services/upgrade-flow.js';
import { CouponStore } from '../src/services/coupon-store.js';

vi.mock('razorpay', () => ({ default: vi.fn().mockImplementation(() => ({ customers: { create: vi.fn() }, subscriptions: { create: vi.fn(), cancel: vi.fn(), fetch: vi.fn() }, orders: { create: vi.fn() }, plans: { create: vi.fn(), all: vi.fn().mockResolvedValue({ items: [] }) } })) }));

async function buildTestApp() {
  const planStore = new PlanStore();
  const usageStore = new UsageStore();
  const invoiceStore = new InvoiceStore();
  const razorpayClient = new RazorpayClient({ keyId: 'rzp_test', keySecret: 's'.repeat(32), webhookSecret: 'w'.repeat(32) });
  const upgradeFlow = new UpgradeFlow(planStore, invoiceStore);
  const couponStore = new CouponStore();
  return buildApp({
    config: { TI_NODE_ENV: 'test', TI_BILLING_PORT: 3019, TI_BILLING_HOST: '0.0.0.0', TI_REDIS_URL: 'redis://localhost:6379', TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!', TI_CORS_ORIGINS: 'http://localhost:3002', TI_RATE_LIMIT_WINDOW_MS: 60000, TI_RATE_LIMIT_MAX: 1000, TI_LOG_LEVEL: 'silent', TI_RAZORPAY_KEY_ID: 'rzp_test', TI_RAZORPAY_KEY_SECRET: 's'.repeat(32), TI_RAZORPAY_WEBHOOK_SECRET: 'w'.repeat(32) },
    planDeps: { planStore },
    usageDeps: { usageStore, planStore },
    subscriptionDeps: { razorpayClient, planStore },
    invoiceDeps: { invoiceStore },
    upgradeDeps: { upgradeFlow },
    p0Deps: { couponStore, planStore, usageStore },
    adminDeps: { invoiceStore, planStore, usageStore },
  });
}

describe('Admin Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  describe('GET /api/v1/billing/admin/dashboard', () => {
    it('200 — returns revenue/MRR/churn metrics', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/admin/dashboard', headers: { 'x-tenant-id': 'admin_t' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.totalRevenueInr).toBeGreaterThanOrEqual(0);
      expect(body.data.mrrInr).toBeGreaterThanOrEqual(0);
      expect(body.data.planDistribution).toBeDefined();
      expect(body.data.activeSubscriptions).toBeGreaterThanOrEqual(0);
    });

    it('200 — reflects paid invoices in revenue', async () => {
      // Create and pay an invoice directly in store
      const planStore = new PlanStore();
      const invoiceStore = new InvoiceStore();
      const usageStore = new UsageStore();
      const inv = await invoiceStore.createInvoice({ tenantId: 'tx', planId: 'starter', amountInr: 4999, periodStart: new Date(), periodEnd: new Date() });
      await invoiceStore.updateInvoiceStatus(inv.id, 'paid');
      const razorpayClient = new RazorpayClient({ keyId: 'k', keySecret: 's'.repeat(32), webhookSecret: 'w'.repeat(32) });
      const upgradeFlow = new UpgradeFlow(planStore, invoiceStore);
      const couponStore = new CouponStore();
      const richApp = await buildApp({
        config: { TI_NODE_ENV: 'test', TI_BILLING_PORT: 3019, TI_BILLING_HOST: '0.0.0.0', TI_REDIS_URL: 'redis://localhost:6379', TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!', TI_CORS_ORIGINS: 'http://localhost:3002', TI_RATE_LIMIT_WINDOW_MS: 60000, TI_RATE_LIMIT_MAX: 1000, TI_LOG_LEVEL: 'silent', TI_RAZORPAY_KEY_ID: 'k', TI_RAZORPAY_KEY_SECRET: 's'.repeat(32), TI_RAZORPAY_WEBHOOK_SECRET: 'w'.repeat(32) },
        planDeps: { planStore },
        usageDeps: { usageStore, planStore },
        subscriptionDeps: { razorpayClient, planStore },
        invoiceDeps: { invoiceStore },
        upgradeDeps: { upgradeFlow },
        p0Deps: { couponStore, planStore, usageStore },
        adminDeps: { invoiceStore, planStore, usageStore },
      });
      const res = await richApp.inject({ method: 'GET', url: '/api/v1/billing/admin/dashboard', headers: { 'x-tenant-id': 'admin_t' } });
      const body = JSON.parse(res.body);
      expect(body.data.totalRevenueInr).toBe(4999);
    });

    it('includes plan distribution breakdown', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/admin/dashboard', headers: { 'x-tenant-id': 'admin_t' } });
      const body = JSON.parse(res.body);
      expect(body.data.planDistribution).toHaveProperty('free');
      expect(body.data.planDistribution).toHaveProperty('starter');
    });
  });
});
