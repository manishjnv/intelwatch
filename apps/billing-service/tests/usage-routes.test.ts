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

describe('Usage Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  describe('GET /api/v1/billing/usage', () => {
    it('200 — returns zero usage for new tenant', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/usage', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.api_calls).toBe(0);
    });

    it('200 — returns accumulated usage', async () => {
      // Track some usage first
      await app.inject({ method: 'POST', url: '/api/v1/billing/usage/track', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: { metric: 'api_call', count: 50 } });
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/usage', headers: { 'x-tenant-id': 't1' } });
      const body = JSON.parse(res.body);
      expect(body.data.api_calls).toBe(50);
    });
  });

  describe('POST /api/v1/billing/usage/track', () => {
    it('201 — tracks api_call usage', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/billing/usage/track', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: { metric: 'api_call', count: 10 } });
      expect(res.statusCode).toBe(201);
    });

    it('400 — invalid metric name', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/billing/usage/track', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: { metric: 'invalid_metric', count: 1 } });
      expect(res.statusCode).toBe(400);
    });

    it('400 — missing count field', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/billing/usage/track', headers: { 'x-tenant-id': 't1', 'content-type': 'application/json' }, payload: { metric: 'api_call' } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/billing/usage/limits', () => {
    it('200 — returns limits vs current usage with percentages', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/usage/limits', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.planId).toBe('free');
      expect(body.data.metrics.api_calls).toBeDefined();
      expect(body.data.metrics.api_calls.limit).toBeDefined();
      expect(body.data.metrics.api_calls.used).toBeDefined();
      expect(body.data.metrics.api_calls.percent).toBeDefined();
    });
  });

  describe('GET /api/v1/billing/usage/history', () => {
    it('200 — returns usage history (may be empty)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/usage/history', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/billing/alerts', () => {
    it('200 — returns empty alerts when usage is low', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/alerts', headers: { 'x-tenant-id': 't1' } });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('tenant A cannot see tenant B usage', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/billing/usage/track', headers: { 'x-tenant-id': 'tA', 'content-type': 'application/json' }, payload: { metric: 'api_call', count: 999 } });
      const res = await app.inject({ method: 'GET', url: '/api/v1/billing/usage', headers: { 'x-tenant-id': 'tB' } });
      const body = JSON.parse(res.body);
      expect(body.data.api_calls).toBe(0);
    });
  });
});
