import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AiModelStore } from '../services/ai-model-store.js';
import {
  SetTaskModelSchema,
  SetBudgetSchema,
  TaskParamSchema,
  UsageQuerySchema,
} from '../schemas/customization.js';

export interface AiModelRouteDeps {
  aiModelStore: AiModelStore;
}

export function aiModelRoutes(deps: AiModelRouteDeps) {
  const { aiModelStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /ai/models — List available AI models. */
    app.get('/models', async (_req: FastifyRequest, reply: FastifyReply) => {
      const models = aiModelStore.listAvailableModels();
      return reply.send({ data: models });
    });

    /** GET /ai/tasks — Get task-to-model mapping. */
    app.get('/tasks', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const mappings = aiModelStore.getTaskMappings(tenantId);
      return reply.send({ data: mappings, total: mappings.length });
    });

    /** PUT /ai/tasks/:task — Set model for a task. */
    app.put('/tasks/:task', async (req: FastifyRequest<{ Params: { task: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const { task } = TaskParamSchema.parse(req.params);
      const input = SetTaskModelSchema.parse(req.body);
      const mapping = aiModelStore.setTaskModel(tenantId, task, input, userId);
      return reply.send({ data: mapping });
    });

    /** GET /ai/budget — Get token budget config. */
    app.get('/budget', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const budget = aiModelStore.getBudget(tenantId);
      return reply.send({ data: budget });
    });

    /** PUT /ai/budget — Update token budget. */
    app.put('/budget', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || 'unknown';
      const input = SetBudgetSchema.parse(req.body);
      const budget = aiModelStore.setBudget(tenantId, input, userId);
      return reply.send({ data: budget });
    });

    /** GET /ai/usage — Get usage stats. */
    app.get('/usage', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { period } = UsageQuerySchema.parse(req.query);
      const stats = aiModelStore.getUsageStats(tenantId, period);
      return reply.send({ data: stats });
    });
  };
}
