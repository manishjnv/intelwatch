/**
 * @module GlobalPipelineRoutes
 * @description REST routes for global pipeline health, pause/resume, retrigger.
 * Super_admin only, gated by TI_GLOBAL_PROCESSING_ENABLED.
 * DECISION-029 Phase C.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { GlobalPipelineOrchestrator } from '../services/global-pipeline-orchestrator.js';
import { GLOBAL_QUEUE_NAMES } from '../services/global-pipeline-orchestrator.js';
import { authenticate, rbac } from '../plugins/auth.js';

const RetriggerParamsSchema = z.object({
  queueName: z.string().min(1),
});

function requireGlobalEnabled(): void {
  if (process.env['TI_GLOBAL_PROCESSING_ENABLED'] !== 'true') {
    throw new AppError(503, 'Global processing is not enabled', 'GLOBAL_PROCESSING_DISABLED');
  }
}

export function globalPipelineRoutes(orchestrator: GlobalPipelineOrchestrator) {
  return async function (app: FastifyInstance): Promise<void> {

    /** GET /global-pipeline/health — Queue health + 24h pipeline stats */
    app.get('/health', {
      preHandler: [authenticate, rbac('admin:read')],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const health = await orchestrator.getQueueHealth();
      return reply.send({ data: health });
    });

    /** POST /global-pipeline/retrigger/:queueName — Retrigger failed jobs */
    app.post('/retrigger/:queueName', {
      preHandler: [authenticate, rbac('admin:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const { queueName } = RetriggerParamsSchema.parse(req.params);

      // Validate queue name is a global queue
      if (!GLOBAL_QUEUE_NAMES.includes(queueName as typeof GLOBAL_QUEUE_NAMES[number])) {
        throw new AppError(400, `Invalid global queue: ${queueName}`, 'INVALID_QUEUE');
      }

      const count = await orchestrator.retriggerFailed(queueName);
      return reply.send({ data: { retriggered: count } });
    });

    /** POST /global-pipeline/pause — Emergency pause all global queues */
    app.post('/pause', {
      preHandler: [authenticate, rbac('admin:write')],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      await orchestrator.pauseGlobalPipeline();
      return reply.send({ data: { status: 'paused' } });
    });

    /** POST /global-pipeline/resume — Resume all global queues */
    app.post('/resume', {
      preHandler: [authenticate, rbac('admin:write')],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      await orchestrator.resumeGlobalPipeline();
      return reply.send({ data: { status: 'resumed' } });
    });
  };
}
