import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { CorrelationStore } from '../schemas/correlation.js';
import {
  ListCorrelationsQuerySchema, FeedbackInputSchema,
  CampaignListQuerySchema,
} from '../schemas/correlation.js';
import type { CooccurrenceService } from '../services/cooccurrence.js';
import type { InfrastructureClusterService } from '../services/infrastructure-cluster.js';
import type { TemporalWaveService } from '../services/temporal-wave.js';
import type { CampaignClusterService } from '../services/campaign-cluster.js';
import type { DiamondModelService } from '../services/diamond-model.js';
import type { KillChainService } from '../services/kill-chain.js';
import type { FPSuppressionService } from '../services/fp-suppression.js';
import type { ConfidenceScoringService } from '../services/confidence-scoring.js';

export interface CorrelationRouteDeps {
  store: CorrelationStore;
  cooccurrence: CooccurrenceService;
  infraCluster: InfrastructureClusterService;
  temporalWave: TemporalWaveService;
  campaignCluster: CampaignClusterService;
  diamondModel: DiamondModelService;
  killChain: KillChainService;
  fpSuppression: FPSuppressionService;
  confidenceScoring: ConfidenceScoringService;
  windowHours: number;
  confidenceThreshold: number;
}

export function correlationRoutes(deps: CorrelationRouteDeps) {
  return async function routes(app: FastifyInstance): Promise<void> {
    const {
      store, cooccurrence, infraCluster, temporalWave,
      campaignCluster, diamondModel, killChain, fpSuppression,
      windowHours, confidenceThreshold,
    } = deps;

    // GET /api/v1/correlations — List results
    app.get('/', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = ListCorrelationsQuerySchema.parse(req.query);
      const results = store.getTenantResults(user.tenantId);

      let items = Array.from(results.values());

      if (query.type) items = items.filter((r) => r.correlationType === query.type);
      if (query.severity) items = items.filter((r) => r.severity === query.severity);
      if (query.suppressed !== undefined) {
        const showSuppressed = query.suppressed === 'true';
        items = items.filter((r) => r.suppressed === showSuppressed);
      }

      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const total = items.length;
      const start = (query.page - 1) * query.limit;
      const paged = items.slice(start, start + query.limit);

      return reply.status(200).send({ data: paged, total, page: query.page, limit: query.limit });
    });

    // GET /api/v1/correlations/stats — Statistics
    app.get('/stats', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const results = Array.from(store.getTenantResults(user.tenantId).values());

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      let suppressedCount = 0;

      for (const r of results) {
        byType[r.correlationType] = (byType[r.correlationType] ?? 0) + 1;
        bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
        if (r.suppressed) suppressedCount++;
      }

      return reply.status(200).send({
        data: {
          total: results.length,
          byType,
          bySeverity,
          suppressedCount,
          campaignCount: store.getTenantCampaigns(user.tenantId).size,
          waveCount: store.getTenantWaves(user.tenantId).length,
        },
      });
    });

    // GET /api/v1/correlations/:id — Single result
    app.get('/:id', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const result = store.getTenantResults(user.tenantId).get(id);
      if (!result) throw new AppError(404, `Correlation not found: ${id}`, 'CORRELATION_NOT_FOUND');
      return reply.status(200).send({ data: result });
    });

    // POST /api/v1/correlations/run — Trigger manual correlation
    app.post('/run', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;
      const iocs = store.getTenantIOCs(tenantId);

      // Run all correlation algorithms
      const coocPairs = cooccurrence.detectCooccurrences(tenantId, iocs);
      const coocResults = cooccurrence.toCorrelationResults(tenantId, coocPairs, iocs);

      const infraClusters = infraCluster.detectClusters(tenantId, iocs);
      const infraResults = infraCluster.toCorrelationResults(tenantId, infraClusters, iocs);

      const waves = temporalWave.detectWaves(tenantId, iocs, windowHours);
      const tenantWaves = store.getTenantWaves(tenantId);
      tenantWaves.push(...waves);

      const campaigns = campaignCluster.detectCampaigns(tenantId, iocs);
      const campaignMap = store.getTenantCampaigns(tenantId);
      for (const c of campaigns) campaignMap.set(c.id, c);

      // Merge all results, filter by confidence threshold
      const allResults = [...coocResults, ...infraResults];
      const filtered = allResults.filter((r) => r.confidence >= confidenceThreshold);

      // Apply FP suppression
      const ruleStats = store.getTenantRuleStats(tenantId);
      const suppressed = fpSuppression.applySuppression(filtered, ruleStats);

      // Store results
      const resultsMap = store.getTenantResults(tenantId);
      for (const r of suppressed) resultsMap.set(r.id, r);

      return reply.status(200).send({
        data: {
          correlationsFound: suppressed.length,
          campaignsDetected: campaigns.length,
          wavesDetected: waves.length,
          suppressed: suppressed.filter((r) => r.suppressed).length,
        },
      });
    });

    // GET /api/v1/correlations/campaigns — List campaigns
    app.get('/campaigns', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = CampaignListQuerySchema.parse(req.query);
      const campaigns = Array.from(store.getTenantCampaigns(user.tenantId).values());

      campaigns.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
      const total = campaigns.length;
      const start = (query.page - 1) * query.limit;
      const paged = campaigns.slice(start, start + query.limit);

      return reply.status(200).send({ data: paged, total, page: query.page, limit: query.limit });
    });

    // GET /api/v1/correlations/campaigns/:id — Campaign detail
    app.get('/campaigns/:id', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const campaign = store.getTenantCampaigns(user.tenantId).get(id);
      if (!campaign) throw new AppError(404, `Campaign not found: ${id}`, 'CAMPAIGN_NOT_FOUND');
      return reply.status(200).send({ data: campaign });
    });

    // GET /api/v1/correlations/waves — Temporal waves
    app.get('/waves', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const waves = store.getTenantWaves(user.tenantId);
      return reply.status(200).send({ data: waves, total: waves.length });
    });

    // GET /api/v1/correlations/diamond/:id — Diamond Model
    app.get('/diamond/:id', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const result = store.getTenantResults(user.tenantId).get(id);
      if (!result) throw new AppError(404, `Correlation not found: ${id}`, 'CORRELATION_NOT_FOUND');

      const iocs = store.getTenantIOCs(user.tenantId);
      const iocTypeMap = new Map<string, string>();
      for (const ioc of iocs.values()) iocTypeMap.set(ioc.id, ioc.iocType);

      const mappings = diamondModel.mapCorrelation(result.entities, iocTypeMap);
      const isComplete = diamondModel.isCompleteDiamond(mappings);
      const distribution = diamondModel.facetDistribution(mappings);

      return reply.status(200).send({ data: { mappings, isComplete, distribution } });
    });

    // GET /api/v1/correlations/kill-chain — Kill Chain coverage
    app.get('/kill-chain', {
      preHandler: [authenticate, rbac('alert:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const iocs = store.getTenantIOCs(user.tenantId);
      const coverage = killChain.computeCoverage(user.tenantId, iocs);
      return reply.status(200).send({ data: coverage });
    });

    // POST /api/v1/correlations/:id/feedback — FP/TP feedback
    app.post('/:id/feedback', {
      preHandler: [authenticate, rbac('alert:create')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const input = FeedbackInputSchema.parse(req.body);

      const result = store.getTenantResults(user.tenantId).get(id);
      if (!result) throw new AppError(404, `Correlation not found: ${id}`, 'CORRELATION_NOT_FOUND');

      const feedbackStore = store.getTenantFeedback(user.tenantId);
      const ruleStats = store.getTenantRuleStats(user.tenantId);

      const feedback = fpSuppression.recordFeedback(
        user.tenantId, id, input.verdict, user.sub,
        feedbackStore, ruleStats, result.ruleId, input.reason,
      );

      return reply.status(201).send({ data: feedback });
    });
  };
}
