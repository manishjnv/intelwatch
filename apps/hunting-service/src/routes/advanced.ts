import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { HypothesisEngine } from '../services/hypothesis-engine.js';
import type { AISuggestions } from '../services/ai-suggestions.js';
import type { TimelineService } from '../services/timeline-service.js';
import type { EvidenceCollection } from '../services/evidence-collection.js';
import type { Collaboration } from '../services/collaboration.js';
import { HYPOTHESIS_VERDICTS } from '../services/hypothesis-engine.js';
import { EVIDENCE_TYPES } from '../services/evidence-collection.js';
import { EntityTypeSchema, PaginationSchema } from '../schemas/hunting.js';

export interface AdvancedRouteDeps {
  hypothesisEngine: HypothesisEngine;
  aiSuggestions: AISuggestions;
  timelineService: TimelineService;
  evidenceCollection: EvidenceCollection;
  collaboration: Collaboration;
}

const CreateHypothesisSchema = z.object({
  statement: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(5000),
  mitreTechniques: z.array(z.string().max(20)).max(50).default([]),
});

const SetVerdictSchema = z.object({
  verdict: z.enum(HYPOTHESIS_VERDICTS),
});

const AddEvidenceSchema = z.object({
  type: z.enum(EVIDENCE_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  sourceUrl: z.string().max(2048).optional(),
  entityType: EntityTypeSchema.optional(),
  entityValue: z.string().max(2048).optional(),
  data: z.record(z.unknown()).default({}),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

const AddCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
});

const ShareSchema = z.object({
  userId: z.string().min(1),
  permission: z.enum(['view', 'edit']).default('view'),
});

const ReassignSchema = z.object({
  userId: z.string().min(1),
});

/** P1 advanced routes: hypothesis, suggestions, timeline, evidence, collaboration. */
export function advancedRoutes(deps: AdvancedRouteDeps) {
  const {
    hypothesisEngine, aiSuggestions, timelineService,
    evidenceCollection, collaboration,
  } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {
    // ─── Hypotheses (#6) ──────────────────────────────────

    app.post(
      '/:huntId/hypotheses',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const input = CreateHypothesisSchema.parse(req.body);
        const h = hypothesisEngine.create(user.tenantId, huntId, user.userId, input);
        return reply.status(201).send({ data: h });
      },
    );

    app.get(
      '/:huntId/hypotheses',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const list = hypothesisEngine.list(user.tenantId, huntId);
        return reply.send({ data: list, total: list.length });
      },
    );

    app.patch(
      '/:huntId/hypotheses/:hypothesisId/verdict',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, hypothesisId } = req.params as { huntId: string; hypothesisId: string };
        const { verdict } = SetVerdictSchema.parse(req.body);
        const h = hypothesisEngine.setVerdict(user.tenantId, huntId, hypothesisId, user.userId, verdict);
        return reply.send({ data: h });
      },
    );

    app.post(
      '/:huntId/hypotheses/:hypothesisId/evidence/:evidenceId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, hypothesisId, evidenceId } = req.params as {
          huntId: string; hypothesisId: string; evidenceId: string;
        };
        const h = hypothesisEngine.linkEvidence(user.tenantId, huntId, hypothesisId, evidenceId);
        return reply.send({ data: h });
      },
    );

    app.delete(
      '/:huntId/hypotheses/:hypothesisId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, hypothesisId } = req.params as { huntId: string; hypothesisId: string };
        hypothesisEngine.delete(user.tenantId, huntId, hypothesisId);
        return reply.status(204).send();
      },
    );

    // ─── AI Suggestions (#7) ──────────────────────────────

    app.get(
      '/:huntId/suggestions',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const result = await aiSuggestions.getSuggestions(user.tenantId, huntId);
        return reply.send({ data: result });
      },
    );

    // ─── Timeline (#8) ────────────────────────────────────

    app.get(
      '/:huntId/timeline',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { page, limit } = PaginationSchema.parse(req.query);
        const q = req.query as Record<string, string>;
        const filter = {
          types: q.types ? q.types.split(',') : undefined,
          userId: q.userId,
          from: q.from,
          to: q.to,
        };
        const result = timelineService.getTimeline(user.tenantId, huntId, filter, page, limit);
        return reply.send({ data: result });
      },
    );

    app.get(
      '/:huntId/timeline/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const stats = timelineService.getStats(user.tenantId, huntId);
        return reply.send({ data: stats });
      },
    );

    // ─── Evidence (#9) ────────────────────────────────────

    app.post(
      '/:huntId/evidence',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const input = AddEvidenceSchema.parse(req.body);
        const item = evidenceCollection.add(user.tenantId, huntId, user.userId, input);
        return reply.status(201).send({ data: item });
      },
    );

    app.get(
      '/:huntId/evidence',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { page, limit } = PaginationSchema.parse(req.query);
        const typeFilter = (req.query as Record<string, string>).type as Parameters<typeof evidenceCollection.list>[2];
        const result = evidenceCollection.list(user.tenantId, huntId, typeFilter, page, limit);
        return reply.send(result);
      },
    );

    app.get(
      '/:huntId/evidence/summary',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const summary = evidenceCollection.getSummary(user.tenantId, huntId);
        return reply.send({ data: summary });
      },
    );

    app.delete(
      '/:huntId/evidence/:evidenceId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, evidenceId } = req.params as { huntId: string; evidenceId: string };
        evidenceCollection.delete(user.tenantId, huntId, evidenceId);
        return reply.status(204).send();
      },
    );

    // ─── Collaboration (#10) ──────────────────────────────

    app.post(
      '/:huntId/comments',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { content, parentId } = AddCommentSchema.parse(req.body);
        const comment = collaboration.addComment(user.tenantId, huntId, user.userId, content, parentId);
        return reply.status(201).send({ data: comment });
      },
    );

    app.get(
      '/:huntId/comments',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const threaded = collaboration.getThreadedComments(user.tenantId, huntId);
        return reply.send({ data: threaded });
      },
    );

    app.delete(
      '/:huntId/comments/:commentId',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, commentId } = req.params as { huntId: string; commentId: string };
        collaboration.deleteComment(user.tenantId, huntId, commentId, user.userId);
        return reply.status(204).send();
      },
    );

    app.post(
      '/:huntId/share',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { userId: targetUserId, permission } = ShareSchema.parse(req.body);
        const entry = collaboration.share(user.tenantId, huntId, user.userId, targetUserId, permission);
        return reply.status(201).send({ data: entry });
      },
    );

    app.get(
      '/:huntId/shares',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const shares = collaboration.listShares(user.tenantId, huntId);
        return reply.send({ data: shares, total: shares.length });
      },
    );

    app.post(
      '/:huntId/reassign',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { userId: newAssignee } = ReassignSchema.parse(req.body);
        const session = collaboration.reassign(user.tenantId, huntId, newAssignee);
        return reply.send({ data: session });
      },
    );

    app.get(
      '/:huntId/collaboration/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const stats = collaboration.getStats(user.tenantId, huntId);
        return reply.send({ data: stats });
      },
    );
  };
}
