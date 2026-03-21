import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type { ActorService } from '../service.js';
import type { ActorServiceP2 } from '../service-p2.js';
import { authenticate, rbac, getUser } from '../plugins/auth.js';
import {
  ListActorsSchema, CreateActorSchema, UpdateActorSchema,
  SearchActorsSchema, ExportActorsSchema, ActorParamsSchema,
  LinkedIocsSchema, TimelineSchema,
} from '../schemas/actor.js';
import { z } from 'zod';

const CompareSchema = z.object({ a: z.string().uuid(), b: z.string().uuid() });

/** Returns a Fastify plugin that registers all threat actor routes under /api/v1/actors. */
export function actorRoutes(service: ActorService, serviceP2: ActorServiceP2): FastifyPluginCallback {
  return (app: FastifyInstance, _opts: unknown, done: (err?: Error) => void) => {
    // ── List actors (paginated, filtered) ────────────────────
    app.get('/', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const input = ListActorsSchema.parse(req.query);
      const result = await service.listActors(user.tenantId, input);
      return reply.send(result);
    });

    // ── Create actor ─────────────────────────────────────────
    app.post('/', { preHandler: [authenticate, rbac('ioc:write')] }, async (req, reply) => {
      const user = getUser(req);
      const input = CreateActorSchema.parse(req.body);
      const actor = await service.createActor(user.tenantId, input);
      return reply.status(201).send({ data: actor });
    });

    // ── Search actors ────────────────────────────────────────
    app.get('/search', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const input = SearchActorsSchema.parse(req.query);
      const result = await service.searchActors(user.tenantId, input);
      return reply.send(result);
    });

    // ── Stats ────────────────────────────────────────────────
    app.get('/stats', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const stats = await service.getStats(user.tenantId);
      return reply.send({ data: stats });
    });

    // ── Export actors ────────────────────────────────────────
    app.get('/export', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const input = ExportActorsSchema.parse(req.query);
      const result = await service.exportActors(user.tenantId, input);
      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.content);
    });

    // ── Get actor by ID ──────────────────────────────────────
    app.get('/:id', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const actor = await service.getActor(user.tenantId, id);
      return reply.send({ data: actor });
    });

    // ── Update actor ─────────────────────────────────────────
    app.put('/:id', { preHandler: [authenticate, rbac('ioc:write')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const input = UpdateActorSchema.parse(req.body);
      const actor = await service.updateActor(user.tenantId, id, input);
      return reply.send({ data: actor });
    });

    // ── Soft-delete actor ────────────────────────────────────
    app.delete('/:id', { preHandler: [authenticate, rbac('ioc:write')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      await service.deleteActor(user.tenantId, id);
      return reply.status(204).send();
    });

    // ── Linked IOCs ──────────────────────────────────────────
    app.get('/:id/iocs', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const input = LinkedIocsSchema.parse(req.query);
      const result = await service.getLinkedIocs(user.tenantId, id, input);
      return reply.send(result);
    });

    // ── Timeline ─────────────────────────────────────────────
    app.get('/:id/timeline', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const input = TimelineSchema.parse(req.query);
      const result = await service.getTimeline(user.tenantId, id, input);
      return reply.send({ data: result });
    });

    // ── MITRE ATT&CK summary ────────────────────────────────
    app.get('/:id/mitre', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getMitreSummary(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ═══ P0 ACCURACY IMPROVEMENTS ════════════════════════════

    // ── A1: Explainable attribution ──────────────────────────
    app.get('/:id/attribution', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getExplainableAttribution(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── A2: Alias suggestions ────────────────────────────────
    app.get('/:id/aliases', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getAliasSuggestions(user.tenantId, id);
      return reply.send({ data: result, total: result.length });
    });

    // ── A3: Corroboration ────────────────────────────────────
    app.get('/:id/corroboration', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getCorroboration(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── B1: Dormancy status ──────────────────────────────────
    app.get('/:id/dormancy', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getDormancyStatus(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── C2: Scored links ─────────────────────────────────────
    app.get('/:id/links', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const input = LinkedIocsSchema.parse(req.query);
      const result = await service.getScoredLinks(user.tenantId, id, input.limit);
      return reply.send(result);
    });

    // ═══ P1 ACCURACY IMPROVEMENTS ════════════════════════════

    // ── A4: Attribution decay ────────────────────────────────
    app.get('/:id/decay', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getAttributionDecay(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── B2: TTP evolution ────────────────────────────────────
    app.get('/:id/ttp-evolution', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getTtpEvolution(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── C1: Shared infrastructure ────────────────────────────
    app.get('/:id/shared-infra', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getSharedInfrastructure(user.tenantId, id);
      return reply.send({ data: result, total: result.length });
    });

    // ── D1: Provenance ───────────────────────────────────────
    app.get('/:id/provenance', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getActorProvenance(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── D2: MITRE heatmap ────────────────────────────────────
    app.get('/:id/mitre-heatmap', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await service.getMitreHeatmap(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ═══ P2 ACCURACY IMPROVEMENTS ════════════════════════════

    // ── A5: Diamond Model ────────────────────────────────────
    app.get('/:id/diamond', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await serviceP2.getDiamondModel(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── B3: False flag alerts ────────────────────────────────
    app.get('/:id/false-flags', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await serviceP2.getFalseFlagAlerts(user.tenantId, id);
      return reply.send({ data: result, total: result.length });
    });

    // ── C3: Victimology prediction ───────────────────────────
    app.get('/:id/predictions', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = ActorParamsSchema.parse(req.params);
      const result = await serviceP2.getVictimologyPrediction(user.tenantId, id);
      return reply.send({ data: result });
    });

    // ── D3: Actor comparison ─────────────────────────────────
    app.get('/compare', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const { a, b } = CompareSchema.parse(req.query);
      const result = await serviceP2.getActorComparison(user.tenantId, a, b);
      return reply.send({ data: result });
    });

    // ── D4: Feed actor accuracy ──────────────────────────────
    app.get('/feed-accuracy', { preHandler: [authenticate, rbac('ioc:read')] }, async (req, reply) => {
      const user = getUser(req);
      const result = await serviceP2.getFeedActorAccuracy(user.tenantId);
      return reply.send({ data: result, total: result.length });
    });

    done();
  };
}
