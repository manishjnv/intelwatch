import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { AppError } from '@etip/shared-utils';
import type { GraphRepository } from '../repository.js';
import type { BidirectionalService } from '../services/bidirectional.js';
import type { ClusterDetectionService } from '../services/cluster-detection.js';
import type { ImpactRadiusService } from '../services/impact-radius.js';
import type { GraphDiffService } from '../services/graph-diff.js';
import type { ExpandNodeService } from '../services/expand-node.js';
import type { StixExportService } from '../services/stix-export.js';
import type { GraphSearchService } from '../services/graph-search.js';
import type { AuditTrailService } from '../services/audit-trail.js';
import type { RelationshipTrendingService } from '../services/relationship-trending.js';
import {
  NodeRelationshipsQuerySchema,
  ClusterDetectionQuerySchema,
  ImpactQuerySchema,
  TimelineQuerySchema,
  ExpandQuerySchema,
  StixExportInputSchema,
  GraphSearchQuerySchema,
  RelationshipParamsSchema,
  UpdateRelationshipSchema,
  AuditQuerySchema,
} from '../schemas/search.js';
import type { RelationshipType } from '../schemas/graph.js';

/** Dependency bag for all extended route services. */
export interface ExtendedRouteDeps {
  repo: GraphRepository;
  bidirectional: BidirectionalService;
  clusterDetection: ClusterDetectionService;
  impactRadius: ImpactRadiusService;
  graphDiff: GraphDiffService;
  expandNode: ExpandNodeService;
  stixExport: StixExportService;
  graphSearch: GraphSearchService;
  auditTrail: AuditTrailService;
  trending?: RelationshipTrendingService;
}

/** Creates a Fastify plugin with all P1+P2 improvement routes. */
export function graphExtendedRoutes(deps: ExtendedRouteDeps) {
  return async function routes(app: FastifyInstance): Promise<void> {

    // ─── #6 GET /nodes/:id/relationships — Bidirectional ───────────
    app.get('/nodes/:id/relationships', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const query = NodeRelationshipsQuerySchema.parse(req.query);
      const result = await deps.bidirectional.getNodeRelationships(
        user.tenantId, id, query.type, query.direction, query.limit,
      );
      return reply.send({ data: result });
    });

    // ─── #7 GET /clusters — Cluster Detection ──────────────────────
    app.get('/clusters', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = ClusterDetectionQuerySchema.parse(req.query);
      const result = await deps.clusterDetection.detectClusters(
        user.tenantId, query.minSize, query.nodeType, query.limit,
      );
      return reply.send({ data: result });
    });

    // ─── #8 GET /nodes/:id/impact — Impact Radius ──────────────────
    app.get('/nodes/:id/impact', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const query = ImpactQuerySchema.parse(req.query);
      const result = await deps.impactRadius.calculate(user.tenantId, id, query.depth);
      return reply.send({ data: result });
    });

    // ─── #10 GET /nodes/:id/timeline — Graph Diff ──────────────────
    app.get('/nodes/:id/timeline', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const query = TimelineQuerySchema.parse(req.query);
      const result = await deps.graphDiff.getTimeline(user.tenantId, id, query.days);
      return reply.send({ data: result });
    });

    // ─── #11 GET /nodes/:id/expand — Expand Node ───────────────────
    app.get('/nodes/:id/expand', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const query = ExpandQuerySchema.parse(req.query);
      const result = await deps.expandNode.expand(
        user.tenantId, id, query.limit, query.offset, query.nodeType,
      );
      return reply.send({ data: result });
    });

    // ─── #12 POST /export/stix — STIX 2.1 Export ───────────────────
    app.post('/export/stix', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = StixExportInputSchema.parse(req.body);
      const bundle = await deps.stixExport.exportBundle(
        user.tenantId, input.nodeId, input.nodeIds, input.depth,
      );
      return reply.send(bundle);
    });

    // ─── #13 GET /search — Graph Search ────────────────────────────
    app.get('/search', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = GraphSearchQuerySchema.parse(req.query);
      const result = await deps.graphSearch.search(
        user.tenantId, query.q, query.nodeType,
        query.minRisk, query.maxRisk, query.page, query.limit,
      );
      return reply.send({ data: result });
    });

    // ─── #14 GET /relationships/:fromId/:type/:toId — Read ─────────
    app.get('/relationships/:fromId/:type/:toId', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const params = RelationshipParamsSchema.parse(req.params);
      const edge = await deps.repo.getRelationship(
        user.tenantId, params.fromId, params.type as RelationshipType, params.toId,
      );
      if (!edge) throw new AppError(404, 'Relationship not found', 'REL_NOT_FOUND');
      return reply.send({ data: edge });
    });

    // ─── #14 PUT /relationships/:fromId/:type/:toId — Update ───────
    app.put('/relationships/:fromId/:type/:toId', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const params = RelationshipParamsSchema.parse(req.params);
      const updates = UpdateRelationshipSchema.parse(req.body);

      // #20: Capture old confidence for trending before update
      let oldConfidence: number | undefined;
      if (deps.trending && updates.confidence !== undefined) {
        const existing = await deps.repo.getRelationship(
          user.tenantId, params.fromId, params.type as RelationshipType, params.toId,
        );
        if (existing) oldConfidence = existing.confidence;
      }

      const edge = await deps.repo.updateRelationship(
        user.tenantId, params.fromId, params.type as RelationshipType, params.toId,
        updates as Record<string, unknown>,
      );
      if (!edge) throw new AppError(404, 'Relationship not found', 'REL_NOT_FOUND');

      // #20: Record confidence change for trending
      if (deps.trending && oldConfidence !== undefined && updates.confidence !== undefined) {
        deps.trending.record(
          params.fromId, params.type as RelationshipType, params.toId,
          oldConfidence, updates.confidence,
          (updates.source as 'auto-detected' | 'analyst-confirmed') ?? 'auto-detected',
          user.sub,
        );
      }

      return reply.send({ data: edge });
    });

    // ─── #14 DELETE /relationships/:fromId/:type/:toId — Delete ─────
    app.delete('/relationships/:fromId/:type/:toId', {
      preHandler: [authenticate, rbac('graph:delete')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const params = RelationshipParamsSchema.parse(req.params);
      const deleted = await deps.repo.deleteRelationship(
        user.tenantId, params.fromId, params.type as RelationshipType, params.toId,
      );
      if (!deleted) throw new AppError(404, 'Relationship not found', 'REL_NOT_FOUND');
      return reply.status(204).send();
    });

    // ─── #15 GET /propagation/audit — Audit Trail List ──────────────
    app.get('/propagation/audit', {
      preHandler: [authenticate, rbac('graph:admin')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = AuditQuerySchema.parse(req.query);
      const result = deps.auditTrail.list(user.tenantId, query.limit, query.nodeId);
      return reply.send({ data: result });
    });
  };
}
