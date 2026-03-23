import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { AIPatternRecognition } from '../services/ai-pattern-recognition.js';
import type { HuntPlaybooks } from '../services/hunt-playbooks.js';
import type { HuntScoring } from '../services/hunt-scoring.js';
import type { BulkImport } from '../services/bulk-import.js';
import type { HuntExport } from '../services/hunt-export.js';

export interface P2RouteDeps {
  patternRecognition: AIPatternRecognition;
  playbooks: HuntPlaybooks;
  huntScoring: HuntScoring;
  bulkImport: BulkImport;
  huntExport: HuntExport;
}

const BulkImportSchema = z.object({
  format: z.enum(['csv', 'stix']),
  content: z.string().min(1).max(1_000_000),
});

const CompleteStepSchema = z.object({
  stepId: z.string().min(1),
  result: z.string().max(5000).optional(),
});

/** P2 routes: pattern recognition, playbooks, scoring, import, export. */
export function p2Routes(deps: P2RouteDeps) {
  const { patternRecognition, playbooks, huntScoring, bulkImport, huntExport } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {
    // ─── Pattern Recognition (#11) ────────────────────────

    app.post(
      '/:huntId/patterns',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const result = await patternRecognition.analyze(user.tenantId, huntId);
        return reply.send({ data: result });
      },
    );

    // ─── Playbooks (#12) ──────────────────────────────────

    app.get(
      '/playbooks',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const category = (req.query as Record<string, string>).category;
        const list = playbooks.listPlaybooks(category);
        return reply.send({ data: list, total: list.length });
      },
    );

    app.get(
      '/playbooks/:playbookId',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const { playbookId } = req.params as { playbookId: string };
        const playbook = playbooks.getPlaybook(playbookId);
        if (!playbook) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Playbook not found' } });
        }
        return reply.send({ data: playbook });
      },
    );

    app.post(
      '/:huntId/playbook/:playbookId/start',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const { huntId, playbookId } = req.params as { huntId: string; playbookId: string };
        const execution = playbooks.startExecution(playbookId, huntId);
        return reply.status(201).send({ data: execution });
      },
    );

    app.post(
      '/:huntId/playbook/step',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const { huntId } = req.params as { huntId: string };
        const { stepId, result } = CompleteStepSchema.parse(req.body);
        const execution = playbooks.completeStep(huntId, stepId, result);
        return reply.send({ data: execution });
      },
    );

    app.get(
      '/:huntId/playbook/progress',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const { huntId } = req.params as { huntId: string };
        const execution = playbooks.getExecution(huntId);
        const progress = playbooks.getProgress(huntId);
        return reply.send({ data: { execution, progress } });
      },
    );

    // ─── Scoring (#13) ────────────────────────────────────

    app.get(
      '/:huntId/score',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const score = huntScoring.scoreHunt(user.tenantId, huntId);
        return reply.send({ data: score });
      },
    );

    app.get(
      '/prioritized',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const ranked = huntScoring.prioritize(user.tenantId);
        return reply.send({ data: ranked, total: ranked.length });
      },
    );

    // ─── Bulk Import (#14) ────────────────────────────────

    app.post(
      '/:huntId/import',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId } = req.params as { huntId: string };
        const { format, content } = BulkImportSchema.parse(req.body);

        let rows;
        if (format === 'csv') {
          rows = bulkImport.parseCsv(content);
        } else {
          rows = bulkImport.parseStixIndicators(JSON.parse(content));
        }

        const result = bulkImport.importCsv(user.tenantId, huntId, user.userId, rows);
        return reply.send({ data: result });
      },
    );

    // ─── Export (#15) ─────────────────────────────────────

    app.get(
      '/:huntId/export/:format',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { huntId, format } = req.params as { huntId: string; format: string };
        const result = huntExport.export(
          user.tenantId, huntId,
          format as Parameters<typeof huntExport.export>[2],
        );
        return reply
          .header('Content-Type', result.mimeType)
          .header('Content-Disposition', `attachment; filename="${result.filename}"`)
          .send(result.content);
      },
    );
  };
}
