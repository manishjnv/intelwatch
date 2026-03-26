import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { CreateSubscriptionSchema, CancelSubscriptionSchema, CreateCheckoutSchema } from '../schemas/billing.js';
import type { RazorpayClient } from '../services/razorpay-client.js';
import type { PlanStore } from '../services/plan-store.js';
import { PLAN_DEFINITIONS } from '../services/plan-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface SubscriptionRouteDeps {
  razorpayClient: RazorpayClient;
  planStore: PlanStore;
}

/** Subscription management routes: create, get, cancel, checkout, payment methods. */
export function subscriptionRoutes(deps: SubscriptionRouteDeps) {
  const { razorpayClient, planStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /subscriptions — create a Razorpay subscription for a tenant. */
    app.post('/subscriptions', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(CreateSubscriptionSchema, req.body);

      // Validate plan exists and is not free
      const planDef = planStore.getPlanById(input.planId);
      if (input.planId === 'free') {
        throw new AppError(400, 'Cannot create subscription for free plan', 'FREE_PLAN_NOT_BILLABLE');
      }

      // Create Razorpay customer
      const customer = await razorpayClient.createCustomer({
        name: input.customerName,
        email: input.customerEmail,
        tenantId,
      });

      // Create Razorpay subscription
      const sub = await razorpayClient.createSubscription({
        customerId: customer.id,
        planId: planDef.razorpayPlanId || `plan_${input.planId}`,
      });

      // Store IDs
      await planStore.setRazorpayIds(tenantId, customer.id, sub.id);

      return reply.status(201).send({
        data: {
          subscriptionId: sub.id,
          customerId: customer.id,
          planId: input.planId,
          status: sub.status,
        },
      });
    });

    /** GET /subscriptions — get current subscription for the tenant. */
    app.get('/subscriptions', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const state = await planStore.getTenantPlan(tenantId);

      if (!state.razorpaySubscriptionId) {
        return reply.send({ data: null });
      }

      // Fetch live status from Razorpay
      const sub = await razorpayClient.getSubscription(state.razorpaySubscriptionId);
      return reply.send({ data: sub });
    });

    /** POST /subscriptions/cancel — cancel the current subscription. */
    app.post('/subscriptions/cancel', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(CancelSubscriptionSchema, req.body ?? {});
      const state = await planStore.getTenantPlan(tenantId);

      if (!state.razorpaySubscriptionId) {
        throw new AppError(404, 'No active subscription found', 'SUBSCRIPTION_NOT_FOUND');
      }

      const result = await razorpayClient.cancelSubscription(state.razorpaySubscriptionId);

      if (!input.cancelAtPeriodEnd) {
        // Immediate downgrade to free
        await planStore.setTenantPlan(tenantId, 'free');
      }

      return reply.send({ data: { status: result.status, cancelAtPeriodEnd: input.cancelAtPeriodEnd } });
    });

    /** POST /checkout — create a Razorpay order for plan purchase. */
    app.post('/checkout', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(CreateCheckoutSchema, req.body);
      const planDef = PLAN_DEFINITIONS[input.planId];

      const order = await razorpayClient.createOrder({
        amountInr: planDef.priceInr,
        currency: 'INR',
        receipt: `checkout_${tenantId}_${Date.now()}`,
      });

      return reply.status(201).send({
        data: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          planId: input.planId,
          keyId: process.env['TI_RAZORPAY_KEY_ID'],
        },
      });
    });

    /** GET /payment-methods — list available Razorpay payment methods. */
    app.get('/payment-methods', async (_req: FastifyRequest, reply: FastifyReply) => {
      const methods = razorpayClient.getAvailablePaymentMethods();
      return reply.send({ data: methods });
    });
  };
}
