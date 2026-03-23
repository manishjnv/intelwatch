import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import { z } from 'zod';
import {
  PaginationSchema,
  AuditQuerySchema,
  RotateCredentialsSchema,
  CreateRoutingRuleSchema,
  UpdateRoutingRuleSchema,
} from '../schemas/integration.js';
import type { HealthScoring } from '../services/health-scoring.js';
import type { AuditTrail } from '../services/audit-trail.js';
import type { RateLimitTracker } from '../services/rate-limit-tracker.js';
import type { CredentialRotationService } from '../services/credential-rotation.js';
import type { AlertRoutingEngine } from '../services/alert-routing-engine.js';
import type { IntegrationStore } from '../services/integration-store.js';

export interface P2RouteDeps {
  store: IntegrationStore;
  healthScoring: HealthScoring;
  auditTrail: AuditTrail;
  rateLimitTracker: RateLimitTracker;
  credentialRotation: CredentialRotationService;
  alertRoutingEngine: AlertRoutingEngine;
}

/** Build P2 route handlers for improvements #11-#15. */
export function p2Routes(deps: P2RouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { store, healthScoring, auditTrail, rateLimitTracker, credentialRotation, alertRoutingEngine } = deps;

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

    const getActor = (req: FastifyRequest): string => {
      const user = (req as unknown as Record<string, unknown>).user as { userId?: string } | undefined;
      return user?.userId ?? 'unknown';
    };

    // ═══════════════════════════════════════════════════════════════
    // P2 #11: Health Scoring
    // ═══════════════════════════════════════════════════════════════

    app.get('/:id/health-score', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const score = healthScoring.calculateScore(id, tenantId);
      if (!score) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      return reply.send({ data: score });
    });

    app.get('/:id/health-history', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const history = healthScoring.getHistory(id, tenantId);
      if (!history) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      return reply.send({ data: history });
    });

    // ═══════════════════════════════════════════════════════════════
    // P2 #12: Audit Trail
    // ═══════════════════════════════════════════════════════════════

    app.get('/audit-log', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = AuditQuerySchema.parse(req.query);
      const result = auditTrail.query(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    // ═══════════════════════════════════════════════════════════════
    // P2 #13: Rate Limit Dashboard
    // ═══════════════════════════════════════════════════════════════

    app.get('/:id/rate-limits', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      const dashboard = rateLimitTracker.getDashboard(id);
      return reply.send({ data: dashboard });
    });

    // ═══════════════════════════════════════════════════════════════
    // P2 #14: Credential Rotation
    // ═══════════════════════════════════════════════════════════════

    app.post('/:id/credentials/rotate', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = RotateCredentialsSchema.parse(req.body);
      const record = credentialRotation.rotate(id, tenantId, input);

      // Audit log the rotation
      auditTrail.record({
        tenantId,
        integrationId: id,
        action: 'credentials.rotated',
        actor: getActor(req),
        details: { gracePeriodMinutes: input.gracePeriodMinutes },
      });

      return reply.status(201).send({ data: record });
    });

    app.get('/:id/credentials/rotation-history', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const integration = store.getIntegration(id, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      const query = PaginationSchema.parse(req.query);
      const result = credentialRotation.getRotationHistory(id, tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    // ═══════════════════════════════════════════════════════════════
    // P2 #15: Alert Routing Rules
    // ═══════════════════════════════════════════════════════════════

    app.post('/routing-rules', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateRoutingRuleSchema.parse(req.body);
      const rule = alertRoutingEngine.createRule(tenantId, input);

      auditTrail.record({
        tenantId,
        integrationId: null,
        action: 'rule.created',
        actor: getActor(req),
        details: { ruleName: rule.name },
        newValue: { id: rule.id, name: rule.name, priority: rule.priority },
      });

      return reply.status(201).send({ data: rule });
    });

    app.get('/routing-rules', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = PaginationSchema.extend({
        enabled: z.coerce.boolean().optional(),
      }).parse(req.query);
      const result = alertRoutingEngine.listRules(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.get('/routing-rules/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const rule = alertRoutingEngine.getRule(id, tenantId);
      if (!rule) throw new AppError(404, 'Routing rule not found', 'NOT_FOUND');
      return reply.send({ data: rule });
    });

    app.put('/routing-rules/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = UpdateRoutingRuleSchema.parse(req.body);
      const updated = alertRoutingEngine.updateRule(id, tenantId, input);
      if (!updated) throw new AppError(404, 'Routing rule not found', 'NOT_FOUND');

      auditTrail.record({
        tenantId,
        integrationId: null,
        action: 'rule.updated',
        actor: getActor(req),
        details: { ruleId: id },
      });

      return reply.send({ data: updated });
    });

    app.delete('/routing-rules/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const deleted = alertRoutingEngine.deleteRule(id, tenantId);
      if (!deleted) throw new AppError(404, 'Routing rule not found', 'NOT_FOUND');

      auditTrail.record({
        tenantId,
        integrationId: null,
        action: 'rule.deleted',
        actor: getActor(req),
        details: { ruleId: id },
      });

      return reply.status(204).send();
    });

    app.post('/routing-rules/:id/dry-run', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const body = req.body as { payload: Record<string, unknown> };
      if (!body.payload) throw new AppError(400, 'Missing payload for dry-run', 'MISSING_PAYLOAD');
      const result = alertRoutingEngine.dryRun(id, tenantId, body.payload);
      if (!result) throw new AppError(404, 'Routing rule not found', 'NOT_FOUND');
      return reply.send({ data: result });
    });

    app.put('/routing-rules/reorder', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const body = req.body as { ordering: Array<{ ruleId: string; priority: number }> };
      if (!Array.isArray(body.ordering)) throw new AppError(400, 'Missing ordering array', 'MISSING_ORDERING');
      const updated = alertRoutingEngine.reorderRules(tenantId, body.ordering);
      return reply.send({ data: updated });
    });
  };
}
