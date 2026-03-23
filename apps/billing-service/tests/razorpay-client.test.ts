import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RazorpayClient } from '../src/services/razorpay-client.js';

// Mock the razorpay SDK so tests don't hit the network
vi.mock('razorpay', () => {
  const mockRazorpay = vi.fn().mockImplementation(() => ({
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cust_mock123', email: 'test@example.com', name: 'Test Corp' }),
      fetch: vi.fn().mockResolvedValue({ id: 'cust_mock123' }),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({
        id: 'sub_mock123',
        plan_id: 'plan_starter',
        status: 'created',
        customer_id: 'cust_mock123',
      }),
      cancel: vi.fn().mockResolvedValue({ id: 'sub_mock123', status: 'cancelled' }),
      fetch: vi.fn().mockResolvedValue({ id: 'sub_mock123', status: 'active' }),
    },
    orders: {
      create: vi.fn().mockResolvedValue({ id: 'order_mock123', amount: 499900, currency: 'INR' }),
    },
    plans: {
      create: vi.fn().mockResolvedValue({ id: 'plan_mock123', interval: 1, period: 'monthly' }),
      all: vi.fn().mockResolvedValue({ items: [] }),
    },
  }));
  return { default: mockRazorpay };
});

describe('RazorpayClient', () => {
  let client: RazorpayClient;

  beforeEach(() => {
    client = new RazorpayClient({
      keyId: 'rzp_test_mock',
      keySecret: 'mock_secret_32chars_paddedXXXXXXXX',
      webhookSecret: 'webhook_secret_mock_padded_32chars',
    });
  });

  // ── Customer management ─────────────────────────────────────────
  describe('createCustomer', () => {
    it('creates a customer and returns id', async () => {
      const customer = await client.createCustomer({ name: 'Test Corp', email: 'test@example.com', tenantId: 't1' });
      expect(customer.id).toBe('cust_mock123');
      expect(customer.email).toBe('test@example.com');
    });

    it('throws RAZORPAY_ERROR on SDK failure', async () => {
      const { default: Razorpay } = await import('razorpay');
      vi.mocked(Razorpay).mockImplementationOnce(() => ({
        customers: { create: vi.fn().mockRejectedValue(new Error('Network error')), fetch: vi.fn() },
        subscriptions: { create: vi.fn(), cancel: vi.fn(), fetch: vi.fn() },
        orders: { create: vi.fn() },
        plans: { create: vi.fn(), all: vi.fn().mockResolvedValue({ items: [] }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any);
      const failClient = new RazorpayClient({ keyId: 'k', keySecret: 's'.repeat(32), webhookSecret: 'w'.repeat(32) });
      await expect(failClient.createCustomer({ name: 'x', email: 'x@x.com', tenantId: 't1' })).rejects.toThrow();
    });
  });

  // ── Subscription management ─────────────────────────────────────
  describe('createSubscription', () => {
    it('creates a subscription and returns sub id', async () => {
      const sub = await client.createSubscription({ customerId: 'cust_mock123', planId: 'starter', quantity: 1 });
      expect(sub.id).toBe('sub_mock123');
      expect(sub.status).toBe('created');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels a subscription', async () => {
      const result = await client.cancelSubscription('sub_mock123');
      expect(result.status).toBe('cancelled');
    });
  });

  describe('getSubscription', () => {
    it('fetches subscription by id', async () => {
      const sub = await client.getSubscription('sub_mock123');
      expect(sub.id).toBe('sub_mock123');
      expect(sub.status).toBe('active');
    });
  });

  // ── Order management ────────────────────────────────────────────
  describe('createOrder', () => {
    it('creates an order with INR amount in paise', async () => {
      const order = await client.createOrder({ amountInr: 4999, currency: 'INR', receipt: 'inv_001' });
      expect(order.id).toBe('order_mock123');
      expect(order.amount).toBe(499900); // paise
    });
  });

  // ── Webhook verification ────────────────────────────────────────
  describe('verifyWebhookSignature', () => {
    it('returns true for a valid HMAC-SHA256 signature', () => {
      const crypto = require('node:crypto');
      const secret = 'webhook_secret_mock_padded_32chars';
      const body = JSON.stringify({ event: 'subscription.charged' });
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      expect(client.verifyWebhookSignature(body, sig)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(client.verifyWebhookSignature('{"event":"test"}', 'bad_sig')).toBe(false);
    });

    it('returns false for empty signature', () => {
      expect(client.verifyWebhookSignature('{"event":"test"}', '')).toBe(false);
    });
  });

  // ── Webhook event handling ──────────────────────────────────────
  describe('parseWebhookEvent', () => {
    it('parses subscription.charged event', () => {
      const payload = { event: 'subscription.charged', payload: { subscription: { entity: { id: 'sub_1' } }, payment: { entity: { id: 'pay_1', amount: 499900 } } } };
      const parsed = client.parseWebhookEvent(JSON.stringify(payload));
      expect(parsed.event).toBe('subscription.charged');
      expect(parsed.subscriptionId).toBe('sub_1');
    });

    it('parses subscription.cancelled event', () => {
      const payload = { event: 'subscription.cancelled', payload: { subscription: { entity: { id: 'sub_2' } } } };
      const parsed = client.parseWebhookEvent(JSON.stringify(payload));
      expect(parsed.event).toBe('subscription.cancelled');
    });

    it('parses payment.captured event', () => {
      const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_2', amount: 499900, order_id: 'ord_1' } } } };
      const parsed = client.parseWebhookEvent(JSON.stringify(payload));
      expect(parsed.event).toBe('payment.captured');
    });

    it('handles unknown event gracefully', () => {
      const payload = { event: 'unknown.event', payload: {} };
      const parsed = client.parseWebhookEvent(JSON.stringify(payload));
      expect(parsed.event).toBe('unknown.event');
    });
  });
});
