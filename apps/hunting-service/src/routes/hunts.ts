import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { HuntSessionManager } from '../services/hunt-session-manager.js';
import type { HuntQueryBuilder } from '../services/hunt-query-builder.js';
import type { IOCPivotChains } from '../services/ioc-pivot-chains.js';
import type { SavedHuntLibrary } from '../services/saved-hunt-library.js';
import type { CorrelationIntegration } from '../services/correlation-integration.js';
import {
  CreateHuntSchema,
  UpdateHuntSchema,
  AddEntitySchema,
  ChangeStatusSchema,
  PaginationSchema,
  ExecuteQuerySchema,
  PivotRequestSchema,
  CreateTemplateSchema,
} from '../schemas/hunting.js';

export interface HuntRouteDeps {
  sessionManager: HuntSessionManager;
  queryBuilder: HuntQueryBuilder;
  pivotChains: IOCPivotChains;
  huntLibrary: SavedHuntLibrary;
  correlationIntegration: CorrelationIntegration;
}

/** Hunt session CRUD + query + pivot + template + correlation routes. */
export function huntRoutes(deps: HuntRouteDeps) {
  const {
    sessionManager,
    queryBuilder,
    pivotChains,
    huntLibrary,
    correlationIntegration,
  } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {
    // ─── Hunt Sessions ──────────────────────────────────────

    app.post(
      '/',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = CreateHuntSchema.parse(req.body);

        let template;
        if (input.templateId) {
          template = huntLibrary.get(user.tenantId, input.templateId);
          huntLibrary.incrementUsage(user.tenantId, input.templateId);
        }

        const session = sessionManager.create(user.tenantId, user.userId, input, template);
        return reply.status(201).send({ data: session });
      },
    );

    app.get(
      '/',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { page, limit } = PaginationSchema.parse(req.query);
        const status = (req.query as Record<string, string>).status;
        const result = sessionManager.list(user.tenantId, page, limit, status);
        return reply.send(result);
      },
    );

    app.get(
      '/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const stats = sessionManager.getStats(user.tenantId);
        return reply.send({ data: stats });
      },
    );

    app.get(
      '/:huntId',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const session = sessionManager.get(user.tenantId, huntId);
        return reply.send({ data: session });
      },
    );

    app.put(
      '/:huntId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const updates = UpdateHuntSchema.parse(req.body);
        const session = sessionManager.update(user.tenantId, huntId, user.userId, updates);
        return reply.send({ data: session });
      },
    );

    app.patch(
      '/:huntId/status',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { status } = ChangeStatusSchema.parse(req.body);
        const session = sessionManager.changeStatus(user.tenantId, huntId, user.userId, status);
        return reply.send({ data: session });
      },
    );

    // ─── Entities ───────────────────────────────────────────

    app.post(
      '/:huntId/entities',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const input = AddEntitySchema.parse(req.body);
        const entity = sessionManager.addEntity(user.tenantId, huntId, user.userId, input);
        return reply.status(201).send({ data: entity });
      },
    );

    app.delete(
      '/:huntId/entities/:entityId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, entityId } = req.params as { huntId: string; entityId: string };
        sessionManager.removeEntity(user.tenantId, huntId, user.userId, entityId);
        return reply.status(204).send();
      },
    );

    // ─── Query Execution ────────────────────────────────────

    app.post(
      '/:huntId/query',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const input = ExecuteQuerySchema.parse(req.body);

        const validation = queryBuilder.validateQuery(input.query);
        if (!validation.valid) {
          return reply.status(400).send({
            error: { code: 'INVALID_QUERY', message: 'Query validation failed', details: validation.errors },
          });
        }

        const dsl = queryBuilder.buildEsDsl(input.query, user.tenantId);
        const name = input.name ?? `Query ${new Date().toISOString()}`;
        sessionManager.recordQuery(user.tenantId, huntId, input.query, name, 0);

        return reply.send({ data: { dsl, queryName: name } });
      },
    );

    // ─── Pivot Chains ───────────────────────────────────────

    app.post(
      '/:huntId/pivot',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        // Verify hunt exists
        sessionManager.get(user.tenantId, huntId);

        const pivotReq = PivotRequestSchema.parse(req.body);
        const result = await pivotChains.executePivot(user.tenantId, pivotReq);

        return reply.send({ data: result });
      },
    );

    // ─── Correlation Leads ──────────────────────────────────

    app.get(
      '/:huntId/correlations',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const leads = correlationIntegration.getHuntLeads(user.tenantId, huntId);
        return reply.send({ data: leads, total: leads.length });
      },
    );

    app.post(
      '/:huntId/correlations/auto-link',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const linked = await correlationIntegration.autoLinkCorrelations(user.tenantId, huntId);
        return reply.send({ data: linked, total: linked.length });
      },
    );

    app.get(
      '/:huntId/correlations/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const stats = correlationIntegration.getLeadStats(user.tenantId, huntId);
        return reply.send({ data: stats });
      },
    );

    // ─── Templates ──────────────────────────────────────────

    app.post(
      '/templates',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = CreateTemplateSchema.parse(req.body);
        const template = huntLibrary.create(user.tenantId, user.userId, input);
        return reply.status(201).send({ data: template });
      },
    );

    app.get(
      '/templates',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { page, limit } = PaginationSchema.parse(req.query);
        const category = (req.query as Record<string, string>).category;
        const result = huntLibrary.list(
          user.tenantId, page, limit,
          category as Parameters<typeof huntLibrary.list>[3],
        );
        return reply.send(result);
      },
    );

    app.get(
      '/templates/:templateId',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { templateId } = req.params as { templateId: string };
        const template = huntLibrary.get(user.tenantId, templateId);
        return reply.send({ data: template });
      },
    );

    app.delete(
      '/templates/:templateId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { templateId } = req.params as { templateId: string };
        huntLibrary.delete(user.tenantId, templateId);
        return reply.status(204).send();
      },
    );

    app.post(
      '/templates/:templateId/clone',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { templateId } = req.params as { templateId: string };
        const { name } = (req.body as { name: string }) ?? {};
        if (!name) {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'name is required' },
          });
        }
        const clone = huntLibrary.clone(user.tenantId, templateId, user.userId, name);
        return reply.status(201).send({ data: clone });
      },
    );
  };
}
