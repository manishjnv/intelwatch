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

describe('Invoice Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let invoiceStore: InvoiceStore;

  beforeEach(async () => {
    invoiceStore = new InvoiceStore();
    app = await buildTestApp();
  });

  describe('GET /api/v1/billing/invoices', () => {
    it('200 — returns empty list for new tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/invoices', headers: { 'x-tenant-id': 'new_t' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });
  });

  describe('GET /api/v1/billing/invoices/:id', () => {
    it('404 — unknown invoice id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/invoices/inv_notfound', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/billing/invoices/:id/receipt', () => {
    it('404 — receipt for unknown invoice', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/invoices/inv_notfound/receipt', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/billing/invoices/:id/resend', () => {
    it('404 — resend for unknown invoice', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/billing/invoices/inv_notfound/resend', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: {} });
      expect(res.statusCode).toBe(404);
    });
  });
});
