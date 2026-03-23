import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlanStore } from '../src/services/plan-store.js';
import { UsageStore } from '../src/services/usage-store.js';
import { RazorpayClient } from '../src/services/razorpay-client.js';
import { InvoiceStore } from '../src/services/invoice-store.js';
import { UpgradeFlow } from '../src/services/upgrade-flow.js';
import { CouponStore } from '../src/services/coupon-store.js';

vi.mock('razorpay', () => ({ default: vi.fn().mockImplementation(() => ({ customers: { create: vi.fn() }, subscriptions: { create: vi.fn(), cancel: vi.fn(), fetch: vi.fn() }, orders: { create: vi.fn() }, plans: { create: vi.fn(), all: vi.fn().mockResolvedValue({ items: [] }) } })) }));

import { vi } from 'vitest';

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

describe('Plan Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  describe('GET /api/v1/billing/plans', () => {
    it('200 — returns all 4 plans', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(4);
    });

    it('includes plan limits in response', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans' });
      const body = JSON.parse(res.body);
      const freePlan = body.data.find((p: { id: string }) => p.id === 'free');
      expect(freePlan.limits).toBeDefined();
    });
  });

  describe('GET /api/v1/billing/plans/:planId', () => {
    it('200 — returns specific plan', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans/starter' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.id).toBe('starter');
    });

    it('404 — unknown plan id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans/unknown_tier' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/billing/plans/compare', () => {
    it('200 — returns comparison matrix', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans/compare' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.plans).toHaveLength(4);
      expect(body.data.features).toBeDefined();
    });
  });

  describe('GET /api/v1/billing/plans/tenant/plan', () => {
    it('200 — returns free plan for new tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans/tenant/plan', headers: { 'x-tenant-id': 'new_t' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.planId).toBe('free');
    });
  });

  describe('POST /api/v1/billing/plans/tenant/plan', () => {
    it('201 — assigns plan to tenant', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/billing/plans/tenant/plan', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: { planId: 'starter' } });
      expect(res.statusCode).toBe(201);
    });

    it('400 — invalid plan id', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/billing/plans/tenant/plan', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: { planId: 'invalid_plan' } });
      expect(res.statusCode).toBe(400);
    });
  });
});
