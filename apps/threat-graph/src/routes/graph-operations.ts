import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { AppError } from '@etip/shared-utils';
import type { NodeMergeService } from '../services/node-merge.js';
import type { BatchImportService } from '../services/batch-import.js';
import type { DecayCronService } from '../services/decay-cron.js';
import type { LayoutPresetsService } from '../services/layout-presets.js';
import type { RelationshipTrendingService } from '../services/relationship-trending.js';
import type { GraphRepository } from '../repository.js';
import {
  MergeNodesInputSchema, SplitNodeInputSchema,
  BatchImportInputSchema, CreateLayoutInputSchema,
} from '../schemas/operations.js';
import { RelationshipParamsSchema } from '../schemas/search.js';
import type { RelationshipType } from '../schemas/graph.js';

/** Dependency bag for operation routes. */
export interface OperationRouteDeps {
  repo: GraphRepository;
  nodeMerge: NodeMergeService;
  batchImport: BatchImportService;
  decayCron: DecayCronService;
  layoutPresets: LayoutPresetsService;
  trending: RelationshipTrendingService;
}

/** Creates a Fastify plugin with all #16-20 improvement routes. */
export function graphOperationRoutes(deps: OperationRouteDeps) {
  return async function routes(app: FastifyInstance): Promise<void> {

    // ─── #16 POST /nodes/merge — Merge two nodes ──────────────────
    app.post('/nodes/merge', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = MergeNodesInputSchema.parse(req.body);
      const result = await deps.nodeMerge.mergeNodes(user.tenantId, input);
      return reply.send({ data: result });
    });

    // ─── #16 POST /nodes/split — Split a node ─────────────────────
    app.post('/nodes/split', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = SplitNodeInputSchema.parse(req.body);
      const result = await deps.nodeMerge.splitNode(user.tenantId, input);
      return reply.status(201).send({ data: result });
    });

    // ─── #17 POST /batch — Batch import ────────────────────────────
    app.post('/batch', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = BatchImportInputSchema.parse(req.body);
      const result = await deps.batchImport.importBatch(user.tenantId, input);
      return reply.send({ data: result });
    });

    // ─── #18 POST /decay/trigger — Manual decay trigger ────────────
    app.post('/decay/trigger', {
      preHandler: [authenticate, rbac('graph:admin')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const result = await deps.decayCron.triggerDecay(user.tenantId);
      return reply.send({ data: result });
    });

    // ─── #18 GET /decay/status — Decay cron status ─────────────────
    app.get('/decay/status', {
      preHandler: [authenticate, rbac('graph:admin')],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      const status = deps.decayCron.getStatus();
      return reply.send({ data: status });
    });

    // ─── #19 POST /layouts — Create layout preset ──────────────────
    app.post('/layouts', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = CreateLayoutInputSchema.parse(req.body);
      const preset = deps.layoutPresets.create(user.tenantId, user.sub, input);
      return reply.status(201).send({ data: preset });
    });

    // ─── #19 GET /layouts — List layout presets ────────────────────
    app.get('/layouts', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const result = deps.layoutPresets.list(user.tenantId);
      return reply.send({ data: result });
    });

    // ─── #19 GET /layouts/:id — Get layout preset ──────────────────
    app.get('/layouts/:id', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const preset = deps.layoutPresets.getById(user.tenantId, id);
      if (!preset) throw new AppError(404, 'Layout preset not found', 'PRESET_NOT_FOUND');
      return reply.send({ data: preset });
    });

    // ─── #19 DELETE /layouts/:id — Delete layout preset ────────────
    app.delete('/layouts/:id', {
      preHandler: [authenticate, rbac('graph:delete')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const deleted = deps.layoutPresets.delete(user.tenantId, id);
      if (!deleted) throw new AppError(404, 'Layout preset not found', 'PRESET_NOT_FOUND');
      return reply.status(204).send();
    });

    // ─── #20 GET /relationships/:fromId/:type/:toId/trending ───────
    app.get('/relationships/:fromId/:type/:toId/trending', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const params = RelationshipParamsSchema.parse(req.params);
      const edge = await deps.repo.getRelationship(
        user.tenantId, params.fromId, params.type as RelationshipType, params.toId,
      );
      if (!edge) throw new AppError(404, 'Relationship not found', 'REL_NOT_FOUND');

      const result = deps.trending.getTrending(
        params.fromId, params.type as RelationshipType, params.toId, edge.confidence,
      );
      return reply.send({ data: result });
    });
  };
}
