import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { PlanStore } from '../src/services/plan-store.js';
import { UsageStore } from '../src/services/usage-store.js';
import { RazorpayClient } from '../src/services/razorpay-client.js';
import { InvoiceStore } from '../src/services/invoice-store.js';
import { UpgradeFlow } from '../src/services/upgrade-flow.js';
import { CouponStore } from '../src/services/coupon-store.js';

vi.mock('razorpay', () => ({ default: vi.fn().mockImplementation(() => ({ customers: { create: vi.fn() }, subscriptions: { create: vi.fn(), cancel: vi.fn(), fetch: vi.fn() }, orders: { create: vi.fn() }, plans: { create: vi.fn(), all: vi.fn().mockResolvedValue({ items: [] }) } })) }));

const WEBHOOK_SECRET = 'w'.repeat(32);

function makeSignature(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

async function buildTestApp() {
  const planStore = new PlanStore();
  const usageStore = new UsageStore();
  const invoiceStore = new InvoiceStore();
  const razorpayClient = new RazorpayClient({ keyId: 'rzp_test', keySecret: 's'.repeat(32), webhookSecret: WEBHOOK_SECRET });
  const upgradeFlow = new UpgradeFlow(planStore, invoiceStore);
  const couponStore = new CouponStore();
  return buildApp({
    config: { TI_NODE_ENV: 'test', TI_BILLING_PORT: 3019, TI_BILLING_HOST: '0.0.0.0', TI_REDIS_URL: 'redis://localhost:6379', TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!', TI_SERVICE_JWT_SECRET: 'dev-service-secret!!', TI_CORS_ORIGINS: 'http://localhost:3002', TI_RATE_LIMIT_WINDOW_MS: 60000, TI_RATE_LIMIT_MAX: 1000, TI_LOG_LEVEL: 'silent', TI_RAZORPAY_KEY_ID: 'rzp_test', TI_RAZORPAY_KEY_SECRET: 's'.repeat(32), TI_RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET },
    planDeps: { planStore },
    usageDeps: { usageStore, planStore },
    subscriptionDeps: { razorpayClient, planStore },
    invoiceDeps: { invoiceStore },
    upgradeDeps: { upgradeFlow },
    webhookDeps: { razorpayClient, invoiceStore, planStore },
    p0Deps: { couponStore, planStore, usageStore },
    adminDeps: { invoiceStore, planStore, usageStore },
  });
}

describe('Webhook Routes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  describe('POST /api/v1/billing/webhooks/razorpay', () => {
    it('200 — accepts subscription.charged with valid signature', async () => {
      const payload = JSON.stringify({
        event: 'subscription.charged',
        payload: {
          subscription: { entity: { id: 'sub_123', customer_id: 'cust_123' } },
          payment: { entity: { id: 'pay_123', amount: 499900, order_id: 'ord_123' } },
        },
      });
      const sig = makeSignature(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhooks/razorpay',
        headers: { 'x-razorpay-signature': sig, 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it('401 — rejects invalid signature', async () => {
      const payload = JSON.stringify({ event: 'subscription.charged', payload: {} });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhooks/razorpay',
        headers: { 'x-razorpay-signature': 'invalid_sig', 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it('401 — rejects missing signature header', async () => {
      const payload = JSON.stringify({ event: 'subscription.charged', payload: {} });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhooks/razorpay',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it('200 — accepts subscription.cancelled and updates plan to free', async () => {
      const payload = JSON.stringify({
        event: 'subscription.cancelled',
        payload: { subscription: { entity: { id: 'sub_123', customer_id: 'cust_123' } } },
      });
      const sig = makeSignature(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhooks/razorpay',
        headers: { 'x-razorpay-signature': sig, 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it('200 — accepts payment.captured event', async () => {
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_456', amount: 499900, order_id: 'ord_456' } } },
      });
      const sig = makeSignature(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhooks/razorpay',
        headers: { 'x-razorpay-signature': sig, 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });

    it('200 — ignores unknown event gracefully', async () => {
      const payload = JSON.stringify({ event: 'unknown.future.event', payload: {} });
      const sig = makeSignature(payload);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/webhooks/razorpay',
        headers: { 'x-razorpay-signature': sig, 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
