import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { InvoiceListQuerySchema } from '../schemas/billing.js';
import type { InvoiceStore } from '../services/invoice-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface InvoiceRouteDeps {
  invoiceStore: InvoiceStore;
}

/** Invoice management routes: list, get, receipt download, resend. */
export function invoiceRoutes(deps: InvoiceRouteDeps) {
  const { invoiceStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /invoices — list invoices for the tenant (paginated). */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const query = validate(InvoiceListQuerySchema, req.query);
      const result = await invoiceStore.listInvoices(tenantId, {
        status: query.status,
        page: query.page,
        limit: query.limit,
      });
      return reply.send({ data: result.data, total: result.total, page: result.page, limit: result.limit });
    });

    /** GET /invoices/:id — get a specific invoice. */
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const invoice = await invoiceStore.getInvoiceById(req.params.id);
      // Tenant isolation: ensure invoice belongs to this tenant
      if (invoice.tenantId !== tenantId) {
        throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      }
      return reply.send({ data: invoice });
    });

    /** GET /invoices/:id/receipt — GST receipt for a paid invoice. */
    app.get('/:id/receipt', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const invoice = await invoiceStore.getInvoiceById(req.params.id);
      if (invoice.tenantId !== tenantId) {
        throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      }
      const receipt = await invoiceStore.generateReceipt(req.params.id);
      return reply.send({ data: receipt });
    });

    /**
     * POST /invoices/:id/resend — trigger resend of invoice email.
     * Simulated: logs and returns success (real email via notification service).
     */
    app.post('/:id/resend', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const invoice = await invoiceStore.getInvoiceById(req.params.id);
      if (invoice.tenantId !== tenantId) {
        throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      }
      // In production: publish to notification queue. Simulated for now.
      req.log.info({ invoiceId: invoice.id, tenantId }, 'Invoice resend requested');
      return reply.send({ data: { invoiceId: invoice.id, queued: true } });
    });
  };
}
