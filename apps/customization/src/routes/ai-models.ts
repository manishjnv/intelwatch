import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AiModelStore } from '../services/ai-model-store.js';
import type { PlanTierService } from '../services/plan-tiers.js';
import { CostEstimator } from '../services/cost-estimator.js';
import { PLAN_SUBTASK_CONFIGS } from '../services/plan-tiers.js';
import {
  SetTaskModelSchema,
  SetBudgetSchema,
  TaskParamSchema,
  UsageQuerySchema,
  ApplyPlanSchema,
  CostEstimateQuerySchema,
  type AiPlan,
  type AiModel,
} from '../schemas/customization.js';

export interface AiModelRouteDeps {
  aiModelStore: AiModelStore;
  planTierService?: PlanTierService;
}

const costEstimator = new CostEstimator();

export function aiModelRoutes(deps: AiModelRouteDeps) {
  const { aiModelStore, planTierService } = deps;

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

    // ── CTI Subtask & Plan Tier routes ──────────────────────────────

    /** GET /ai/recommended — ★ recommended model + fallback for each of the 12 subtasks. */
    app.get('/recommended', async (_req: FastifyRequest, reply: FastifyReply) => {
      const recommended = aiModelStore.listRecommended();
      return reply.send({ data: recommended, total: recommended.length });
    });

    /** GET /ai/subtasks — Current subtask model config for tenant. */
    app.get('/subtasks', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const mappings = aiModelStore.getSubtaskMappings(tenantId);
      return reply.send({ data: mappings, total: mappings.length });
    });

    /** GET /ai/plans — List all 4 plan tiers with metadata. */
    app.get('/plans', async (_req: FastifyRequest, reply: FastifyReply) => {
      if (!planTierService) return reply.status(503).send({ error: { code: 'NOT_AVAILABLE', message: 'Plan tier service not configured' } });
      const plans = planTierService.listPlans();
      return reply.send({ data: plans, total: plans.length });
    });

    /** POST /ai/plans/apply — Apply a plan tier (sets all 12 subtasks at once). */
    app.post('/plans/apply', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!planTierService) return reply.status(503).send({ error: { code: 'NOT_AVAILABLE', message: 'Plan tier service not configured' } });
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId   = (req.headers['x-user-id']   as string) || 'unknown';
      const { plan } = ApplyPlanSchema.parse(req.body);
      if (plan === 'custom') {
        return reply.status(400).send({
          error: { code: 'PLAN_CUSTOM_BULK_NOT_ALLOWED', message: 'Custom plan cannot be applied in bulk — set each subtask via PUT /ai/subtasks/:subtask' },
        });
      }
      const mappings = planTierService.applyPlan(tenantId, plan as Exclude<AiPlan, 'custom'>, aiModelStore, userId);
      return reply.send({ data: mappings, plan, total: mappings.length });
    });

    /** GET /ai/cost-estimate?plan=professional&articles=1000 — Monthly cost prediction. */
    app.get('/cost-estimate', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { plan, articles } = CostEstimateQuerySchema.parse(req.query);

      let subtaskModels: Record<string, AiModel>;
      if (plan === 'custom') {
        const mappings = aiModelStore.getSubtaskMappings(tenantId);
        subtaskModels = Object.fromEntries(mappings.map((m) => [m.subtask, m.model]));
      } else {
        const configs = PLAN_SUBTASK_CONFIGS[plan as Exclude<AiPlan, 'custom'>];
        subtaskModels = Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, v.model]));
      }

      const estimate = costEstimator.estimate(subtaskModels, articles);
      return reply.send({ data: estimate });
    });
  };
}
