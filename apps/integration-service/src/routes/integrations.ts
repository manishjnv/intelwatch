import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import {
  CreateIntegrationSchema,
  UpdateIntegrationSchema,
  IntegrationQuerySchema,
  PaginationSchema,
} from '../schemas/integration.js';
import type { IntegrationStore } from '../services/integration-store.js';
import type { SiemAdapter } from '../services/siem-adapter.js';
import type { TicketingService } from '../services/ticketing-service.js';
import type { HealthDashboard } from '../services/health-dashboard.js';
import type { IntegrationRateLimiter } from '../services/rate-limiter.js';

export interface IntegrationRouteDeps {
  store: IntegrationStore;
  siemAdapter: SiemAdapter;
  ticketingService: TicketingService;
  healthDashboard?: HealthDashboard;
  rateLimiter?: IntegrationRateLimiter;
}

/** Build integration CRUD route handler. */
export function integrationRoutes(deps: IntegrationRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { store, siemAdapter, ticketingService, healthDashboard, rateLimiter } = deps;

    // Auth preHandler
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

    // ─── CRUD ────────────────────────────────────────────────

    app.post('/', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateIntegrationSchema.parse(req.body);
      const integration = store.createIntegration(tenantId, input);
      return reply.status(201).send({ data: integration });
    });

    app.get('/', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = IntegrationQuerySchema.parse(req.query);
      const result = store.listIntegrations(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.get('/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      return reply.send({ data: integration });
    });

    app.put('/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = UpdateIntegrationSchema.parse(req.body);
      const updated = store.updateIntegration(id, tenantId, input);
      if (!updated) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      return reply.send({ data: updated });
    });

    app.delete('/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const deleted = store.deleteIntegration(id, tenantId);
      if (!deleted) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      return reply.status(204).send();
    });

    // ─── Test connection ──────────────────────────────────────

    app.post('/:id/test', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');

      let result: { success: boolean; message: string };
      if (integration.siemConfig) {
        result = await siemAdapter.testConnection(integration.siemConfig);
      } else if (integration.ticketingConfig) {
        result = await ticketingService.testConnection(integration.ticketingConfig);
      } else {
        result = { success: false, message: 'No SIEM or ticketing config found' };
      }

      return reply.send({ data: result });
    });

    // ─── Logs ──────────────────────────────────────────────────

    app.get('/:id/logs', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');

      const query = PaginationSchema.parse(req.query);
      const result = store.listLogs(id, tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    // ─── Stats ─────────────────────────────────────────────────

    app.get('/stats', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const stats = store.getStats(tenantId);
      return reply.send({ data: stats });
    });

    // ─── SIEM Push ─────────────────────────────────────────────

    app.post('/:id/push', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      if (!integration.siemConfig) throw new AppError(400, 'Not a SIEM integration', 'NOT_SIEM');

      const body = req.body as { event: string; payload: Record<string, unknown> };
      if (!body.payload) throw new AppError(400, 'Missing payload', 'MISSING_PAYLOAD');

      // P0 #4: Rate limit check before pushing
      if (rateLimiter) rateLimiter.checkOrThrow(id);

      const event = (body.event ?? 'ioc.created') as 'alert.created' | 'ioc.created' | 'alert.updated' | 'alert.closed' | 'ioc.updated' | 'correlation.match' | 'drp.alert.created' | 'hunt.completed';
      const result = await siemAdapter.push(
        id, tenantId, integration.siemConfig, body.payload,
        integration.fieldMappings, event,
      );
      return reply.send({ data: result });
    });

    // ─── P0 #5: Health Dashboard ──────────────────────────────

    app.get('/health/dashboard', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      if (!healthDashboard) throw new AppError(503, 'Health dashboard not available', 'NOT_AVAILABLE');
      const summary = healthDashboard.getSummary(tenantId);
      return reply.send({ data: summary });
    });

    app.get('/:id/health', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      if (!healthDashboard) throw new AppError(503, 'Health dashboard not available', 'NOT_AVAILABLE');
      const health = healthDashboard.getIntegrationHealth(id, tenantId);
      if (!health) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      return reply.send({ data: health });
    });
  };
}
