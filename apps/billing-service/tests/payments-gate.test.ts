import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig, paymentsEnabled } from '../src/config.js';
import { PlanStore } from '../src/services/plan-store.js';
import { RazorpayClient } from '../src/services/razorpay-client.js';
import { InvoiceStore } from '../src/services/invoice-store.js';

vi.mock('razorpay', () => ({ default: vi.fn().mockImplementation(() => ({ customers: { create: vi.fn() }, subscriptions: { create: vi.fn(), cancel: vi.fn(), fetch: vi.fn() }, orders: { create: vi.fn() }, plans: { create: vi.fn(), all: vi.fn().mockResolvedValue({ items: [] }) } })) }));

// Roadmap STEP_00B U5: Razorpay is deferred (DECISION-031).
describe('paymentsEnabled', () => {
  it('is off in production by default, on in dev/test', () => {
    expect(paymentsEnabled({ TI_NODE_ENV: 'production' })).toBe(false);
    expect(paymentsEnabled({ TI_NODE_ENV: 'test' })).toBe(true);
    expect(paymentsEnabled({ TI_NODE_ENV: 'production', TI_RAZORPAY_ENABLED: 'true' })).toBe(true);
    expect(paymentsEnabled({ TI_NODE_ENV: 'test', TI_RAZORPAY_ENABLED: 'false' })).toBe(false);
  });

  it('refuses enabling payments in production with placeholder keys', () => {
    expect(() => loadConfig({ TI_NODE_ENV: 'production', TI_RAZORPAY_ENABLED: 'true' })).toThrow(/placeholder/);
    expect(() => loadConfig({ TI_NODE_ENV: 'production' })).not.toThrow();
  });
});

describe('payment routes when disabled', () => {
  async function build() {
    const planStore = new PlanStore();
    const invoiceStore = new InvoiceStore();
    const razorpayClient = new RazorpayClient({ keyId: 'rzp_test', keySecret: 's'.repeat(32), webhookSecret: 'w'.repeat(32) });
    const config = loadConfig({ TI_NODE_ENV: 'production', TI_LOG_LEVEL: 'silent' });
    return buildApp({
      config,
      planDeps: { planStore },
      subscriptionDeps: { razorpayClient, planStore },
      webhookDeps: { razorpayClient, invoiceStore, planStore },
    });
  }

  it.each([
    '/api/v1/billing/webhooks/razorpay',
    '/api/v1/billing/checkout',
    '/api/v1/billing/subscriptions',
    '/api/v1/billing/subscriptions/cancel',
    // percent-encoded paths: the router decodes these, so the gate must too
    '/api/v1/billing/che%63kout',
    '/api/v1/billing/webhooks/r%61zorpay',
    '/api/v1/billing/subscriptions/c%61ncel',
  ])('POST %s → 503 PAYMENTS_DISABLED', async (url) => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url, payload: {} });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('PAYMENTS_DISABLED');
    await app.close();
  });

  it('leaves read routes working', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/billing/plans' });
    expect(res.statusCode).not.toBe(503);
    await app.close();
  });
});
