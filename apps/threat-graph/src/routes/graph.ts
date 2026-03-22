import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { GraphService } from '../service.js';
import {
  CreateNodeInputSchema, CreateRelationshipSchema,
  NHopQuerySchema, PathQuerySchema, ClusterQuerySchema,
  PropagateInputSchema,
} from '../schemas/graph.js';

/** Creates a Fastify plugin factory with all graph API routes. */
export function graphRoutes(service: GraphService) {
  return async function routes(app: FastifyInstance): Promise<void> {

    // ─── POST /nodes — Create/upsert a graph node ────────────────
    app.post('/nodes', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = CreateNodeInputSchema.parse(req.body);
      const node = await service.createNode(user.tenantId, input);
      return reply.status(201).send({ data: node });
    });

    // ─── GET /nodes/:id — Get node by ID ─────────────────────────
    app.get('/nodes/:id', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const node = await service.getNode(user.tenantId, id);
      return reply.send({ data: node });
    });

    // ─── DELETE /nodes/:id — Delete a node ───────────────────────
    app.delete('/nodes/:id', {
      preHandler: [authenticate, rbac('graph:delete')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      await service.deleteNode(user.tenantId, id);
      return reply.status(204).send();
    });

    // ─── POST /relationships — Create a relationship ─────────────
    app.post('/relationships', {
      preHandler: [authenticate, rbac('graph:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = CreateRelationshipSchema.parse(req.body);
      const edge = await service.createRelationship(user.tenantId, input);
      return reply.status(201).send({ data: edge });
    });

    // ─── GET /entity/:id — N-hop neighbors ───────────────────────
    app.get('/entity/:id', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const query = NHopQuerySchema.parse(req.query);
      const subgraph = await service.getEntityNeighbors(
        user.tenantId, id, query.hops, query.nodeTypes, query.limit,
      );
      return reply.send({ data: subgraph });
    });

    // ─── GET /path — Shortest path between two entities ──────────
    app.get('/path', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const query = PathQuerySchema.parse(req.query);
      const pathResult = await service.findPath(user.tenantId, query.from, query.to, query.maxDepth);
      return reply.send({ data: pathResult });
    });

    // ─── GET /cluster/:id — Full entity cluster ──────────────────
    app.get('/cluster/:id', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };
      const query = ClusterQuerySchema.parse(req.query);
      const cluster = await service.getCluster(user.tenantId, id, query.depth, query.limit);
      return reply.send({ data: cluster });
    });

    // ─── POST /propagate — Trigger risk propagation (admin) ──────
    app.post('/propagate', {
      preHandler: [authenticate, rbac('graph:admin')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const input = PropagateInputSchema.parse(req.body);
      const result = await service.triggerPropagation(user.tenantId, input.nodeId, input.maxDepth);
      return reply.send({ data: result });
    });

    // ─── GET /stats — Graph statistics ───────────────────────────
    app.get('/stats', {
      preHandler: [authenticate, rbac('graph:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const stats = await service.getStats(user.tenantId);
      return reply.send({ data: stats });
    });
  };
}
