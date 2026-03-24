import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { RuleStore } from '../services/rule-store.js';
import type { RuleEngine } from '../services/rule-engine.js';
import {
  CreateRuleSchema,
  UpdateRuleSchema,
  ListRulesQuerySchema,
  type CreateRuleDto,
  type UpdateRuleDto,
  type ListRulesQuery,
} from '../schemas/alert.js';
import { validate } from '../utils/validate.js';

export interface RuleRouteDeps {
  ruleStore: RuleStore;
  ruleEngine: RuleEngine;
}

export function ruleRoutes(deps: RuleRouteDeps) {
  const { ruleStore, ruleEngine } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/alerts/rules — Create alert rule
    app.post('/', async (req: FastifyRequest<{ Body: CreateRuleDto }>, reply: FastifyReply) => {
      const body = validate(CreateRuleSchema, req.body);
      const rule = ruleStore.create(body);
      return reply.status(201).send({ data: rule });
    });

    // GET /api/v1/alerts/rules — List rules
    app.get('/', async (req: FastifyRequest<{ Querystring: ListRulesQuery }>, reply: FastifyReply) => {
      const query = validate(ListRulesQuerySchema, req.query);
      const result = ruleStore.list(query.tenantId, {
        type: query.type,
        severity: query.severity,
        enabled: query.enabled,
        page: query.page,
        limit: query.limit,
      });

      return reply.send({
        data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    });

    // GET /api/v1/alerts/rules/:id — Get rule detail
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const rule = ruleStore.getById(req.params.id);
      if (!rule) throw new AppError(404, `Rule not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: rule });
    });

    // PUT /api/v1/alerts/rules/:id — Update rule
    app.put('/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: UpdateRuleDto }>, reply: FastifyReply) => {
      const body = validate(UpdateRuleSchema, req.body);
      const rule = ruleStore.update(req.params.id, body);
      if (!rule) throw new AppError(404, `Rule not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: rule });
    });

    // DELETE /api/v1/alerts/rules/:id — Delete rule
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = ruleStore.delete(req.params.id);
      if (!deleted) throw new AppError(404, `Rule not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });

    // PUT /api/v1/alerts/rules/:id/toggle — Enable/disable rule
    app.put(
      '/:id/toggle',
      async (req: FastifyRequest<{ Params: { id: string }; Body: { enabled: boolean } }>, reply: FastifyReply) => {
        const { enabled } = req.body ?? {};
        if (typeof enabled !== 'boolean') {
          throw new AppError(400, 'Field "enabled" (boolean) is required', 'VALIDATION_ERROR');
        }
        const rule = ruleStore.toggle(req.params.id, enabled);
        if (!rule) throw new AppError(404, `Rule not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: rule });
      },
    );

    // POST /api/v1/alerts/rules/:id/test — Dry-run rule against recent data
    app.post(
      '/:id/test',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const rule = ruleStore.getById(req.params.id);
        if (!rule) throw new AppError(404, `Rule not found: ${req.params.id}`, 'NOT_FOUND');

        const result = ruleEngine.evaluate(rule);
        return reply.send({
          data: {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            wouldTrigger: result.triggered,
            reason: result.reason,
            bufferSize: ruleEngine.getBufferSize(rule.tenantId),
          },
        });
      },
    );
  };
}
