import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { HealthChecker } from '../services/health-checker.js';
import type { ProgressTracker } from '../services/progress-tracker.js';

export interface PipelineRouteDeps {
  healthChecker: HealthChecker;
  progressTracker: ProgressTracker;
}

export function pipelineRoutes(deps: PipelineRouteDeps) {
  const { healthChecker, progressTracker } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /pipeline/health — Check full pipeline health. */
    app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
      const result = await healthChecker.checkPipeline();
      return reply.send({ data: result });
    });

    /** GET /pipeline/stages — List all pipeline stages. */
    app.get('/stages', async (_req: FastifyRequest, reply: FastifyReply) => {
      const stages = healthChecker.getStages();
      return reply.send({ data: stages, total: stages.length });
    });

    /** GET /pipeline/readiness — Run readiness checks. */
    app.get('/readiness', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const result = await progressTracker.runReadinessChecks(tenantId);
      return reply.send({ data: result });
    });
  };
}
