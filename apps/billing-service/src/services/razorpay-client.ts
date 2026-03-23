import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { AppError } from '@etip/shared-utils';

export interface RazorpayClientConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface RazorpayCustomer {
  id: string;
  name: string;
  email: string;
  contact?: string;
}

export interface RazorpaySubscription {
  id: string;
  planId?: string;
  customerId?: string;
  status: string;
  currentStart?: number;
  currentEnd?: number;
  quantity?: number;
}

export interface RazorpayOrder {
  id: string;
  amount: number;  // in paise
  currency: string;
  receipt?: string;
}

export interface ParsedWebhookEvent {
  event: string;
  subscriptionId?: string;
  customerId?: string;
  paymentId?: string;
  paymentAmount?: number;
  orderId?: string;
  raw: unknown;
}

/** Wrapper around the Razorpay Node.js SDK. Handles customer, subscription, order operations, and webhook verification. */
export class RazorpayClient {
  private readonly rz: Razorpay;
  private readonly webhookSecret: string;

  constructor(config: RazorpayClientConfig) {
    this.rz = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
    this.webhookSecret = config.webhookSecret;
  }

  // ── Customer ─────────────────────────────────────────────────────

  /** Create a Razorpay customer for a tenant. */
  async createCustomer(opts: { name: string; email: string; tenantId: string; contact?: string }): Promise<RazorpayCustomer> {
    try {
      type CustCreate = (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
      const customer = await (this.rz.customers.create as unknown as CustCreate)({
        name: opts.name,
        email: opts.email,
        contact: opts.contact ?? '',
        notes: { tenantId: opts.tenantId },
      });
      return { id: customer['id'] as string ?? '', name: customer['name'] as string ?? '', email: customer['email'] as string ?? '', contact: customer['contact'] as string | undefined };
    } catch (err) {
      throw new AppError(502, 'Failed to create Razorpay customer', 'RAZORPAY_ERROR', { cause: String(err) });
    }
  }

  // ── Subscription ──────────────────────────────────────────────────

  /**
   * Create a Razorpay subscription for a tenant.
   * quantity defaults to 1 (per-tenant subscription).
   */
  async createSubscription(opts: { customerId: string; planId: string; quantity?: number }): Promise<RazorpaySubscription> {
    try {
      type SubCreate = (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
      const sub = await (this.rz.subscriptions.create as unknown as SubCreate)({
        plan_id: opts.planId,
        customer_id: opts.customerId,
        total_count: 120, // 10 years max
        quantity: opts.quantity ?? 1,
        notify_info: { notify_phone: 0, notify_email: 1 },
      });
      return this.mapSubscription(sub);
    } catch (err) {
      throw new AppError(502, 'Failed to create Razorpay subscription', 'RAZORPAY_ERROR', { cause: String(err) });
    }
  }

  /** Cancel a Razorpay subscription by id. */
  async cancelSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
    try {
      type SubCancel = (id: string, cancelAtCycleEnd?: boolean) => Promise<Record<string, unknown>>;
      const sub = await (this.rz.subscriptions.cancel as unknown as SubCancel)(subscriptionId, true);
      return this.mapSubscription(sub);
    } catch (err) {
      throw new AppError(502, 'Failed to cancel Razorpay subscription', 'RAZORPAY_ERROR', { cause: String(err) });
    }
  }

  /** Fetch a Razorpay subscription by id. */
  async getSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
    try {
      type SubFetch = (id: string) => Promise<Record<string, unknown>>;
      const sub = await (this.rz.subscriptions.fetch as unknown as SubFetch)(subscriptionId);
      return this.mapSubscription(sub);
    } catch (err) {
      throw new AppError(502, 'Failed to fetch Razorpay subscription', 'RAZORPAY_ERROR', { cause: String(err) });
    }
  }

  // ── Order ─────────────────────────────────────────────────────────

  /** Create a Razorpay order for a one-time payment. Amount is in INR (converted to paise internally). */
  async createOrder(opts: { amountInr: number; currency?: string; receipt?: string }): Promise<RazorpayOrder> {
    try {
      type OrderCreate = (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
      const order = await (this.rz.orders.create as unknown as OrderCreate)({
        amount: Math.round(opts.amountInr * 100), // paise
        currency: opts.currency ?? 'INR',
        receipt: opts.receipt ?? `rcpt_${Date.now()}`,
      });
      return {
        id: order['id'] as string,
        amount: order['amount'] as number,
        currency: order['currency'] as string,
        receipt: order['receipt'] as string | undefined,
      };
    } catch (err) {
      throw new AppError(502, 'Failed to create Razorpay order', 'RAZORPAY_ERROR', { cause: String(err) });
    }
  }

  // ── Webhook ───────────────────────────────────────────────────────

  /**
   * Verify Razorpay webhook HMAC-SHA256 signature.
   * Razorpay sends: X-Razorpay-Signature: HMAC-SHA256(body, webhookSecret)
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature) return false;
    try {
      const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  /** Parse a validated Razorpay webhook event body into a structured object. */
  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    const json = JSON.parse(rawBody) as Record<string, unknown>;
    const event = json['event'] as string;
    const payload = (json['payload'] ?? {}) as Record<string, unknown>;

    const subEntity = (payload['subscription'] as Record<string, unknown> | undefined)?.['entity'] as Record<string, unknown> | undefined;
    const payEntity = (payload['payment'] as Record<string, unknown> | undefined)?.['entity'] as Record<string, unknown> | undefined;

    return {
      event,
      subscriptionId: subEntity?.['id'] as string | undefined,
      customerId: (subEntity?.['customer_id'] ?? payEntity?.['customer_id']) as string | undefined,
      paymentId: payEntity?.['id'] as string | undefined,
      paymentAmount: payEntity?.['amount'] as number | undefined,
      orderId: payEntity?.['order_id'] as string | undefined,
      raw: json,
    };
  }

  // ── Payment methods (informational) ──────────────────────────────

  /** Return the list of Razorpay payment methods available (static list — no API call needed). */
  getAvailablePaymentMethods(): { method: string; label: string }[] {
    return [
      { method: 'card', label: 'Credit / Debit Card' },
      { method: 'netbanking', label: 'Net Banking' },
      { method: 'upi', label: 'UPI' },
      { method: 'wallet', label: 'Wallet (Paytm, PhonePe, etc.)' },
      { method: 'emi', label: 'EMI (Credit Card)' },
    ];
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private mapSubscription(sub: Record<string, unknown>): RazorpaySubscription {
    return {
      id: sub['id'] as string,
      planId: sub['plan_id'] as string | undefined,
      customerId: sub['customer_id'] as string | undefined,
      status: sub['status'] as string,
      currentStart: sub['current_start'] as number | undefined,
      currentEnd: sub['current_end'] as number | undefined,
      quantity: sub['quantity'] as number | undefined,
    };
  }
}
