import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { PlanStore } from '../src/services/plan-store.js';
import { UsageStore } from '../src/services/usage-store.js';
import { RazorpayClient } from '../src/services/razorpay-client.js';
import { InvoiceStore } from '../src/services/invoice-store.js';
import { UpgradeFlow } from '../src/services/upgrade-flow.js';
import { CouponStore } from '../src/services/coupon-store.js';

vi.mock('razorpay', () => ({ default: vi.fn().mockImplementation(() => ({ customers: { create: vi.fn() }, subscriptions: { create: vi.fn(), cancel: vi.fn(), fetch: vi.fn() }, orders: { create: vi.fn() }, plans: { create: vi.fn(), all: vi.fn().mockResolvedValue({ items: [] }) } })) }));

async function buildTestApp(planStore?: PlanStore) {
  const ps = planStore ?? new PlanStore();
  const usageStore = new UsageStore();
  const invoiceStore = new InvoiceStore();
  const razorpayClient = new RazorpayClient({ keyId: 'rzp_test', keySecret: 's'.repeat(32), webhookSecret: 'w'.repeat(32) });
  const upgradeFlow = new UpgradeFlow(ps, invoiceStore);
  const couponStore = new CouponStore();
  return buildApp({
    config: { TI_NODE_ENV: 'test', TI_BILLING_PORT: 3019, TI_BILLING_HOST: '0.0.0.0', TI_REDIS_URL: 'redis://localhost:6379', TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!', TI_CORS_ORIGINS: 'http://localhost:3002', TI_RATE_LIMIT_WINDOW_MS: 60000, TI_RATE_LIMIT_MAX: 1000, TI_LOG_LEVEL: 'silent', TI_RAZORPAY_KEY_ID: 'rzp_test', TI_RAZORPAY_KEY_SECRET: 's'.repeat(32), TI_RAZORPAY_WEBHOOK_SECRET: 'w'.repeat(32) },
    planDeps: { planStore: ps },
    usageDeps: { usageStore, planStore: ps },
    subscriptionDeps: { razorpayClient, planStore: ps },
    invoiceDeps: { invoiceStore },
    upgradeDeps: { upgradeFlow },
    p0Deps: { couponStore, planStore: ps, usageStore },
    adminDeps: { invoiceStore, planStore: ps, usageStore },
  });
}

describe('Upgrade/Downgrade Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  describe('GET /api/v1/billing/upgrade/preview', () => {
    it('200 — returns upgrade preview for free → starter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/billing/upgrade/preview?targetPlan=starter',
        headers: { 'x-tenant-id': 't1' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.fromPlan).toBe('free');
      expect(body.data.toPlan).toBe('starter');
      expect(body.data.proratedAmountInr).toBeGreaterThanOrEqual(0);
    });

    it('400 — missing targetPlan query param', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/upgrade/preview', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/billing/upgrade', () => {
    it('200 — upgrades free tenant to starter', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        headers: { 'x-tenant-id': 't_up', 'content-type': 'application/json' },
        payload: { planId: 'starter', razorpaySubscriptionId: 'sub_new' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.newPlanId).toBe('starter');
    });

    it('400 — same plan upgrade', async () => {
      const planStore = new PlanStore();
      planStore.setTenantPlan('t_same', 'starter');
      const sameApp = await buildTestApp(planStore);
      const res = await sameApp.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        headers: { 'x-tenant-id': 't_same', 'content-type': 'application/json' },
        payload: { planId: 'starter' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/billing/downgrade', () => {
    it('200 — schedules downgrade from teams to starter', async () => {
      const planStore = new PlanStore();
      planStore.setTenantPlan('t_down', 'teams');
      const downApp = await buildTestApp(planStore);
      const res = await downApp.inject({
        method: 'POST',
        url: '/api/v1/billing/downgrade',
        headers: { 'x-tenant-id': 't_down', 'content-type': 'application/json' },
        payload: { planId: 'starter' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.scheduledPlanId).toBe('starter');
    });
  });

  describe('GET /api/v1/billing/upgrade-prompts', () => {
    it('200 — returns upgrade prompts', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/upgrade-prompts', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});
