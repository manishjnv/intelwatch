import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { TakedownGenerator } from '../services/takedown-generator.js';
import type { AlertExporter } from '../services/alert-exporter.js';
import type { RogueAppDetector } from '../services/rogue-app-detector.js';
import type { RiskAggregator } from '../services/risk-aggregator.js';
import type { CrossAlertCorrelation } from '../services/cross-correlation.js';
import type { AlertManager } from '../services/alert-manager.js';
import {
  TakedownRequestSchema,
  AlertExportSchema,
  RogueAppScanSchema,
  CorrelateAlertsSchema,
} from '../schemas/p1-p2.js';

export interface P2RouteDeps {
  takedownGenerator: TakedownGenerator;
  alertExporter: AlertExporter;
  rogueAppDetector: RogueAppDetector;
  riskAggregator: RiskAggregator;
  crossCorrelation: CrossAlertCorrelation;
  alertManager: AlertManager;
}

/** P2 improvement routes (#11-15). */
export function p2Routes(deps: P2RouteDeps) {
  const { takedownGenerator, alertExporter, rogueAppDetector, riskAggregator, crossCorrelation, alertManager } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {

    // #11 POST /alerts/:id/takedown — Generate takedown request
    app.post(
      '/alerts/:id/takedown',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const input = TakedownRequestSchema.parse(req.body);
        const alert = alertManager.get(user.tenantId, id);
        const takedown = takedownGenerator.generate(
          user.tenantId,
          alert,
          input.platform,
          input.contactOverride,
          input.includeEvidence,
          input.language,
        );
        return reply.status(201).send({ data: takedown });
      },
    );

    // #12 GET /alerts/export — Export alerts in CSV/JSON/STIX
    app.get(
      '/alerts/export',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = AlertExportSchema.parse(req.query);
        const result = alertExporter.export(
          user.tenantId,
          input.format,
          input.filter,
          input.maxRecords,
        );
        return reply
          .header('Content-Type', result.contentType)
          .header('Content-Disposition', `attachment; filename="${result.filename}"`)
          .send(result.content);
      },
    );

    // #13 POST /detect/rogue-apps — Rogue mobile app detection
    app.post(
      '/detect/rogue-apps',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = RogueAppScanSchema.parse(req.body);
        const result = rogueAppDetector.scan(
          user.tenantId,
          input.appName,
          input.packageName,
          input.stores,
        );
        return reply.send({ data: result });
      },
    );

    // #14 GET /assets/:id/risk — Per-asset risk aggregation
    app.get(
      '/assets/:id/risk',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const risk = riskAggregator.calculate(user.tenantId, id);
        return reply.send({ data: risk });
      },
    );

    // #15 POST /analytics/correlate — Cross-alert correlation + graph push
    app.post(
      '/analytics/correlate',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = CorrelateAlertsSchema.parse(req.body);
        const result = crossCorrelation.correlate(
          user.tenantId,
          input.alertIds,
          input.autoDetect,
          input.minClusterSize,
          input.pushToGraph,
        );
        return reply.send({ data: result });
      },
    );
  };
}
