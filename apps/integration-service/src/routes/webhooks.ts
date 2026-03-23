import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import { PaginationSchema } from '../schemas/integration.js';
import type { IntegrationStore } from '../services/integration-store.js';
import type { WebhookService } from '../services/webhook-service.js';
import type { TriggerEvent } from '../schemas/integration.js';

export interface WebhookRouteDeps {
  store: IntegrationStore;
  webhookService: WebhookService;
}

/** Build webhook route handler. */
export function webhookRoutes(deps: WebhookRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { store, webhookService } = deps;

    const auth = async (req: FastifyRequest, reply: FastifyReply) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
      }
      try {
        const payload = verifyAccessToken(header.slice(7));
        (req as unknown as Record<string, unknown>).user = payload;
      } catch {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      }
    };

    const getTenant = (req: FastifyRequest): string => {
      const user = (req as unknown as Record<string, unknown>).user as { tenantId?: string } | undefined;
      if (!user?.tenantId) throw new AppError(403, 'No tenant context', 'NO_TENANT');
      return user.tenantId;
    };

    // ─── Trigger webhook ──────────────────────────────────────

    app.post('/:id/trigger', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      if (!integration.webhookConfig) throw new AppError(400, 'Not a webhook integration', 'NOT_WEBHOOK');

      const body = req.body as { event?: string; payload?: Record<string, unknown> };
      const event = (body.event ?? 'alert.created') as TriggerEvent;
      const payload = body.payload ?? {};

      const result = await webhookService.send(
        id, tenantId, integration.webhookConfig, event, payload,
      );
      return reply.send({ data: result });
    });

    // ─── Test webhook ─────────────────────────────────────────

    app.post('/:id/test-webhook', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      if (!integration.webhookConfig) throw new AppError(400, 'Not a webhook integration', 'NOT_WEBHOOK');

      const result = await webhookService.testWebhook(integration.webhookConfig);
      return reply.send({ data: result });
    });

    // ─── Dead Letter Queue ────────────────────────────────────

    app.get('/dlq', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = PaginationSchema.parse(req.query);
      const result = store.listDLQ(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.post('/dlq/:id/retry', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const delivery = store.retryDLQ(id, tenantId);
      if (!delivery) throw new AppError(404, 'DLQ item not found', 'NOT_FOUND');
      return reply.send({ data: delivery });
    });
  };
}
