import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { RazorpayClient } from '../services/razorpay-client.js';
import type { InvoiceStore } from '../services/invoice-store.js';
import type { PlanStore } from '../services/plan-store.js';

export interface WebhookRouteDeps {
  razorpayClient: RazorpayClient;
  invoiceStore: InvoiceStore;
  planStore: PlanStore;
}

/**
 * Razorpay webhook handler.
 * Verifies HMAC-SHA256 signature before processing any event.
 * Events handled:
 *   - subscription.charged  → mark invoice paid
 *   - subscription.cancelled → downgrade tenant to free
 *   - payment.captured      → mark order-related invoice paid
 *   - payment.failed        → mark invoice failed
 *   - unknown events        → silently acknowledged
 */
export function webhookRoutes(deps: WebhookRouteDeps) {
  const { razorpayClient, invoiceStore, planStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /webhooks/razorpay — Razorpay webhook endpoint. */
    app.post('/razorpay', async (req: FastifyRequest, reply: FastifyReply) => {
      const signature = req.headers['x-razorpay-signature'] as string | undefined;
      if (!signature) {
        throw new AppError(401, 'Missing webhook signature', 'WEBHOOK_SIGNATURE_MISSING');
      }

      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const valid = razorpayClient.verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        throw new AppError(401, 'Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID');
      }

      const event = razorpayClient.parseWebhookEvent(rawBody);
      req.log.info({ event: event.event, subscriptionId: event.subscriptionId }, 'Razorpay webhook received');

      switch (event.event) {
        case 'subscription.charged': {
          // Mark any pending invoice for this subscription as paid
          if (event.paymentId) {
            const allTenants = await planStore.getAllTenantPlans();
            const tenant = allTenants.find((t) => t.razorpaySubscriptionId === event.subscriptionId);
            if (tenant) {
              const invoices = invoiceStore.listInvoices(tenant.tenantId, { status: 'pending' });
              for (const inv of invoices.data) {
                invoiceStore.updateInvoiceStatus(inv.id, 'paid', {
                  razorpayPaymentId: event.paymentId,
                });
              }
            }
          }
          break;
        }

        case 'subscription.cancelled': {
          // Find the tenant with this subscription and downgrade to free
          const allTenants = await planStore.getAllTenantPlans();
          const tenant = allTenants.find((t) => t.razorpaySubscriptionId === event.subscriptionId);
          if (tenant) {
            await planStore.setTenantPlan(tenant.tenantId, 'free');
            req.log.info({ tenantId: tenant.tenantId }, 'Tenant downgraded to free on subscription cancellation');
          }
          break;
        }

        case 'payment.captured': {
          // Try to reconcile with an order-based invoice
          if (event.orderId) {
            const invoice = invoiceStore.findByOrderId(event.orderId);
            if (invoice) {
              invoiceStore.updateInvoiceStatus(invoice.id, 'paid', {
                razorpayPaymentId: event.paymentId,
                razorpayOrderId: event.orderId,
              });
            }
          }
          break;
        }

        case 'payment.failed': {
          if (event.orderId) {
            const invoice = invoiceStore.findByOrderId(event.orderId);
            if (invoice) {
              invoiceStore.updateInvoiceStatus(invoice.id, 'failed');
            }
          }
          break;
        }

        default:
          // Unknown / future events — acknowledge and ignore
          req.log.debug({ event: event.event }, 'Unhandled Razorpay webhook event — acknowledged');
          break;
      }

      return reply.send({ received: true });
    });
  };
}
