import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { BatchTyposquatScanner } from '../services/batch-typosquat.js';
import type { AIAlertEnricher } from '../services/ai-enrichment.js';
import type { BulkTriageService } from '../services/bulk-triage.js';
import type { TrendingAnalysisService } from '../services/trending-analysis.js';
import type { SocialImpersonationDetector } from '../services/social-impersonation.js';
import type { AlertManager } from '../services/alert-manager.js';
import {
  BatchTyposquatSchema,
  AIEnrichAlertSchema,
  BulkTriageSchema,
  TrendingQuerySchema,
  SocialScanSchema,
} from '../schemas/p1-p2.js';

export interface P1RouteDeps {
  batchTyposquat: BatchTyposquatScanner;
  aiEnricher: AIAlertEnricher;
  bulkTriage: BulkTriageService;
  trendingAnalysis: TrendingAnalysisService;
  socialDetector: SocialImpersonationDetector;
  alertManager: AlertManager;
}

/** P1 improvement routes (#6-10). */
export function p1Routes(deps: P1RouteDeps) {
  const { batchTyposquat, aiEnricher, bulkTriage, trendingAnalysis, socialDetector, alertManager } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {

    // #6 POST /detect/typosquat/batch — Batch multi-domain typosquat scan
    app.post(
      '/detect/typosquat/batch',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = BatchTyposquatSchema.parse(req.body);
        const report = batchTyposquat.scan(
          user.tenantId,
          input.domains,
          input.methods,
          input.maxCandidatesPerDomain,
          input.dedup,
        );
        return reply.send({ data: report });
      },
    );

    // #7 POST /alerts/:id/enrich — AI alert enrichment
    app.post(
      '/alerts/:id/enrich',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const { forceRefresh } = AIEnrichAlertSchema.parse(req.body ?? {});
        const alert = alertManager.get(user.tenantId, id);
        const result = aiEnricher.enrich(user.tenantId, alert, forceRefresh);
        return reply.send({ data: result });
      },
    );

    // #8 POST /alerts/bulk-triage — Bulk alert triage
    app.post(
      '/alerts/bulk-triage',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = BulkTriageSchema.parse(req.body);
        const result = bulkTriage.triage(
          user.tenantId,
          input.alertIds,
          input.filter,
          input.action,
        );
        return reply.send({ data: result });
      },
    );

    // #9 GET /analytics/trending — Trending risk analysis
    app.get(
      '/analytics/trending',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = TrendingQuerySchema.parse(req.query);
        const analysis = trendingAnalysis.analyze(
          user.tenantId,
          input.period,
          input.granularity,
          input.alertType,
          input.assetId,
        );
        return reply.send({ data: analysis });
      },
    );

    // #10 POST /detect/social — Social media impersonation scan
    app.post(
      '/detect/social',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = SocialScanSchema.parse(req.body);
        const result = socialDetector.scan(
          user.tenantId,
          input.brandName,
          input.handles,
          input.platforms,
        );
        return reply.send({ data: result });
      },
    );
  };
}
