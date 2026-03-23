import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { AlertManager } from '../services/alert-manager.js';
import type { SignalAggregator } from '../services/signal-aggregator.js';
import type { ConfidenceScorer } from '../services/confidence-scorer.js';
import type { EvidenceChainBuilder } from '../services/evidence-chain.js';
import {
  AlertFilterSchema,
  ChangeAlertStatusSchema,
  AssignAlertSchema,
  TriageAlertSchema,
  AlertFeedbackSchema,
} from '../schemas/drp.js';

export interface AlertRouteDeps {
  alertManager: AlertManager;
  signalAggregator: SignalAggregator;
  confidenceScorer: ConfidenceScorer;
  evidenceChain: EvidenceChainBuilder;
}

/** Alert management routes — list, get, triage, assign, feedback. */
export function alertRoutes(deps: AlertRouteDeps) {
  const { alertManager, signalAggregator, evidenceChain } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {

    // GET /alerts — List DRP alerts
    app.get(
      '/alerts',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const filters = AlertFilterSchema.parse(req.query);
        const { page, limit, ...rest } = filters;
        const result = alertManager.list(user.tenantId, page, limit, rest);
        return reply.send(result);
      },
    );

    // GET /alerts/stats — Alert statistics
    app.get(
      '/alerts/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const stats = alertManager.getStats(user.tenantId);
        return reply.send({ data: stats });
      },
    );

    // GET /alerts/:id — Get single alert
    app.get(
      '/alerts/:id',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const alert = alertManager.get(user.tenantId, id);
        return reply.send({ data: alert });
      },
    );

    // PATCH /alerts/:id/status — Change alert status
    app.patch(
      '/alerts/:id/status',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const { status, notes } = ChangeAlertStatusSchema.parse(req.body);
        const alert = alertManager.changeStatus(user.tenantId, id, status, notes);
        return reply.send({ data: alert });
      },
    );

    // PATCH /alerts/:id/assign — Assign alert to analyst
    app.patch(
      '/alerts/:id/assign',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const { userId } = AssignAlertSchema.parse(req.body);
        const alert = alertManager.assign(user.tenantId, id, userId);
        return reply.send({ data: alert });
      },
    );

    // POST /alerts/:id/triage — Triage alert
    app.post(
      '/alerts/:id/triage',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const input = TriageAlertSchema.parse(req.body);
        const alert = alertManager.triage(user.tenantId, id, input);
        return reply.send({ data: alert });
      },
    );

    // POST /alerts/:id/feedback — Submit TP/FP verdict (#2)
    app.post(
      '/alerts/:id/feedback',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const input = AlertFeedbackSchema.parse(req.body);

        // Verify alert exists
        alertManager.get(user.tenantId, id);

        // Record feedback and update signal stats
        signalAggregator.recordFeedback(user.tenantId, id, input.verdict);

        // If false_positive, transition alert status
        if (input.verdict === 'false_positive') {
          try {
            alertManager.changeStatus(user.tenantId, id, 'false_positive', input.reason);
          } catch {
            // Transition may not be valid from current state — that's ok
          }
        }

        return reply.send({
          data: {
            alertId: id,
            verdict: input.verdict,
            signalStatsUpdated: true,
            recordedAt: new Date().toISOString(),
          },
        });
      },
    );

    // ─── Dashboard endpoints ──────────────────────────

    // GET /stats — Global DRP stats
    app.get(
      '/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const alertStats = alertManager.getStats(user.tenantId);
        return reply.send({ data: alertStats });
      },
    );

    // GET /confidence/:alertId — Confidence breakdown (#1)
    app.get(
      '/confidence/:alertId',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { alertId } = req.params as { alertId: string };
        const alert = alertManager.get(user.tenantId, alertId);
        return reply.send({
          data: {
            alertId: alert.id,
            confidence: alert.confidence,
            reasons: alert.confidenceReasons,
          },
        });
      },
    );

    // GET /signals — Signal success rates (#2)
    app.get(
      '/signals',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const stats = signalAggregator.getSignalStats(user.tenantId);
        return reply.send({ data: stats });
      },
    );

    // GET /evidence/:alertId — Evidence chain (#3)
    app.get(
      '/evidence/:alertId',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { alertId } = req.params as { alertId: string };
        const chain = evidenceChain.getChain(user.tenantId, alertId);
        if (!chain) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence chain not found' } });
        }
        return reply.send({ data: chain });
      },
    );
  };
}
