/**
 * P2 Advanced Routes (#11-15)
 * AI analysis, rule templates, confidence decay, batch re-correlation, graph sync.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { CorrelationStore } from '../schemas/correlation.js';
import { BatchStartInputSchema } from '../schemas/correlation.js';
import type { AIPatternDetectionService } from '../services/ai-pattern-detection.js';
import type { RuleTemplateService } from '../services/rule-templates.js';
import type { ConfidenceDecayService } from '../services/confidence-decay.js';
import type { BatchRecorrelationService } from '../services/batch-recorrelation.js';
import type { GraphIntegrationService } from '../services/graph-integration.js';

export interface AdvancedRouteDeps {
  store: CorrelationStore;
  aiPatternDetection: AIPatternDetectionService;
  ruleTemplates: RuleTemplateService;
  confidenceDecay: ConfidenceDecayService;
  batchRecorrelation: BatchRecorrelationService;
  graphIntegration: GraphIntegrationService;
}

export function advancedRoutes(deps: AdvancedRouteDeps) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const { store, aiPatternDetection, ruleTemplates, confidenceDecay,
      batchRecorrelation, graphIntegration } = deps;

    // ── #11 AI Pattern Detection ────────────────────────────────

    // POST /api/v1/correlations/ai-analyze
    app.post('/ai-analyze', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;

      if (!aiPatternDetection.isEnabled()) {
        return reply.status(200).send({ data: null, message: 'AI correlation disabled' });
      }

      const iocs = Array.from(store.getTenantIOCs(tenantId).values());
      const results = Array.from(store.getTenantResults(tenantId).values());
      const campaigns = Array.from(store.getTenantCampaigns(tenantId).values());

      const analysis = await aiPatternDetection.analyze(iocs, results, campaigns);

      return reply.status(200).send({
        data: analysis,
        spend: aiPatternDetection.getSpendStats(),
      });
    });

    // ── #12 Rule Templates ──────────────────────────────────────

    // GET /api/v1/correlations/templates
    app.get('/templates', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      const templates = ruleTemplates.listTemplates();
      return reply.status(200).send({ data: templates, total: templates.length });
    });

    // GET /api/v1/correlations/templates/:id/evaluate
    app.get('/templates/:id/evaluate', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };

      const iocs = store.getTenantIOCs(user.tenantId);
      const results = Array.from(store.getTenantResults(user.tenantId).values());

      const match = ruleTemplates.evaluateTemplate(id, iocs, results);
      if (!match) {
        throw new AppError(404, `Template not found or no conditions matched: ${id}`, 'TEMPLATE_NOT_FOUND');
      }

      return reply.status(200).send({ data: match });
    });

    // ── #13 Confidence Decay ────────────────────────────────────

    // POST /api/v1/correlations/decay
    app.post('/decay', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const results = store.getTenantResults(user.tenantId);
      const iocs = store.getTenantIOCs(user.tenantId);

      const decayed = confidenceDecay.applyDecay(results, iocs);

      return reply.status(200).send({
        data: decayed,
        total: decayed.length,
        belowThreshold: decayed.filter((d) => d.decayedConfidence < 0.3).length,
      });
    });

    // ── #14 Batch Re-correlation ────────────────────────────────

    // POST /api/v1/correlations/batch
    app.post('/batch', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = BatchStartInputSchema.parse(req.body);

      const job = batchRecorrelation.startBatch(user.tenantId, {
        algorithms: input.algorithms,
        ruleTemplateId: input.ruleTemplateId,
      });

      return reply.status(201).send({ data: job });
    });

    // GET /api/v1/correlations/batch/:id
    app.get('/batch/:id', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const job = batchRecorrelation.getBatchProgress(id);
      if (!job) throw new AppError(404, `Batch job not found: ${id}`, 'BATCH_NOT_FOUND');
      return reply.status(200).send({ data: job });
    });

    // DELETE /api/v1/correlations/batch/:id
    app.delete('/batch/:id', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const cancelled = batchRecorrelation.cancelBatch(id);
      if (!cancelled) throw new AppError(404, `Batch job not found: ${id}`, 'BATCH_NOT_FOUND');
      return reply.status(200).send({ data: { cancelled: true } });
    });

    // ── #15 Graph Integration ───────────────────────────────────

    // POST /api/v1/correlations/graph-sync
    app.post('/graph-sync', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);

      if (!graphIntegration.isEnabled()) {
        return reply.status(200).send({ data: null, message: 'Graph sync disabled' });
      }

      const results = Array.from(store.getTenantResults(user.tenantId).values())
        .filter((r) => !r.suppressed);
      const iocs = store.getTenantIOCs(user.tenantId);

      const syncResult = await graphIntegration.pushCorrelations(user.tenantId, results, iocs);

      return reply.status(200).send({ data: syncResult });
    });
  };
}
