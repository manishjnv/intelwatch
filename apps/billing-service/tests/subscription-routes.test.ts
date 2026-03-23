import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlanStore } from '../src/services/plan-store.js';
import { UsageStore } from '../src/services/usage-store.js';
import { RazorpayClient } from '../src/services/razorpay-client.js';
import { InvoiceStore } from '../src/services/invoice-store.js';
import { UpgradeFlow } from '../src/services/upgrade-flow.js';
import { CouponStore } from '../src/services/coupon-store.js';

vi.mock('razorpay', () => ({
  default: vi.fn().mockImplementation(() => ({
    customers: { create: vi.fn().mockResolvedValue({ id: 'cust_t1', email: 'test@t.com', name: 'T1' }) },
    subscriptions: {
      create: vi.fn().mockResolvedValue({ id: 'sub_t1', plan_id: 'plan_starter', status: 'created', customer_id: 'cust_t1' }),
      cancel: vi.fn().mockResolvedValue({ id: 'sub_t1', status: 'cancelled' }),
      fetch: vi.fn().mockResolvedValue({ id: 'sub_t1', status: 'active' }),
    },
    orders: { create: vi.fn().mockResolvedValue({ id: 'ord_t1', amount: 499900, currency: 'INR' }) },
    plans: { create: vi.fn().mockResolvedValue({ id: 'plan_mock' }), all: vi.fn().mockResolvedValue({ items: [] }) },
  })),
}));

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

describe('Subscription Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  describe('POST /api/v1/billing/subscriptions', () => {
    it('201 — creates a subscription for starter plan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/subscriptions',
        headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' },
        payload: { planId: 'starter', customerName: 'Acme Corp', customerEmail: 'admin@acme.com' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.subscriptionId).toBeDefined();
    });

    it('400 — missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/subscriptions',
        headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' },
        payload: { planId: 'starter' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 — invalid plan id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/subscriptions',
        headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' },
        payload: { planId: 'gold_tier', customerName: 'Acme', customerEmail: 'a@b.com' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/billing/subscriptions', () => {
    it('200 — returns null subscription for new tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/subscriptions', headers: { 'x-tenant-id': 'new_t' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeNull();
    });
  });

  describe('POST /api/v1/billing/subscriptions/cancel', () => {
    it('200 — cancels existing subscription', async () => {
      // Create first
      await app.inject({
        method: 'POST',
        url: '/api/v1/billing/subscriptions',
        headers: { 'x-tenant-id': 't_cancel', 'content-type': 'application/json' },
        payload: { planId: 'starter', customerName: 'Cancel Me', customerEmail: 'cancel@me.com' },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/subscriptions/cancel',
        headers: { 'x-tenant-id': 't_cancel', 'content-type': 'application/json' },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it('404 — no subscription to cancel', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/subscriptions/cancel',
        headers: { 'x-tenant-id': 'no_sub_t', 'content-type': 'application/json' },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/billing/checkout', () => {
    it('201 — returns checkout order for valid plan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/checkout',
        headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' },
        payload: { planId: 'starter' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.orderId).toBeDefined();
      expect(body.data.amount).toBeGreaterThan(0);
      expect(body.data.currency).toBe('INR');
    });
  });

  describe('GET /api/v1/billing/payment-methods', () => {
    it('200 — returns available payment methods', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/payment-methods', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});
