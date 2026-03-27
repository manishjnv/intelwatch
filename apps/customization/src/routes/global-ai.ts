/**
 * @module routes/global-ai
 * @description Super-admin routes for global AI model configuration.
 * All routes gated by TI_GLOBAL_PROCESSING_ENABLED.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { GlobalAiStore, RECOMMENDED_MODELS, type AiModelName, type ConfidenceModelType } from '../services/global-ai-store.js';
import { CostPredictor, type SubtaskCostConfig } from '../services/cost-predictor.js';

export interface GlobalAiRouteDeps {
  globalAiStore: GlobalAiStore;
  costPredictor: CostPredictor;
  /** Override for test injection. If not set, reads from env. */
  featureEnabled?: boolean;
}

function assertFeatureEnabled(enabled?: boolean): void {
  const isEnabled = enabled ?? process.env.TI_GLOBAL_PROCESSING_ENABLED === 'true';
  if (!isEnabled) {
    throw new AppError(503, 'Global processing is not enabled', 'FEATURE_DISABLED');
  }
}

function assertAdmin(req: FastifyRequest): string {
  const role = req.headers['x-user-role'] as string | undefined;
  if (role !== 'super_admin') {
    throw new AppError(403, 'Forbidden: super_admin required', 'FORBIDDEN');
  }
  return (req.headers['x-user-id'] as string) || 'unknown';
}

export function globalAiRoutes(deps: GlobalAiRouteDeps) {
  const { globalAiStore, costPredictor, featureEnabled } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /ai/global — Full config + recommendations + cost estimate. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      assertFeatureEnabled(featureEnabled);
      assertAdmin(req);

      const { config, recommendations } = await globalAiStore.getConfigWithRecommendations();
      const costConfig: SubtaskCostConfig[] = config.map((c) => ({
        category: c.category, subtask: c.subtask, model: c.model,
      }));
      const costEstimate = costPredictor.estimateMonthlyCost(costConfig, {
        articlesPerMonth: 10_000, iocsPerMonth: 5_000,
      });

      return reply.send({ data: { config, recommendations, costEstimate } });
    });

    /** PUT /ai/global/:category/:subtask — Set model for one subtask. */
    app.put<{ Params: { category: string; subtask: string }; Body: { model: string } }>(
      '/:category/:subtask',
      async (req, reply) => {
        assertFeatureEnabled(featureEnabled);
        const userId = assertAdmin(req);

        const { category, subtask } = req.params;
        const { model } = req.body as { model: string };
        if (!model) throw new AppError(400, 'model is required', 'VALIDATION_ERROR');

        const updated = await globalAiStore.setModel(category, subtask, model, userId);

        // Recalculate cost
        const allConfig = await globalAiStore.getConfig();
        const costConfig: SubtaskCostConfig[] = allConfig.map((c) => ({
          category: c.category, subtask: c.subtask, model: c.model,
        }));
        const costEstimate = costPredictor.estimateMonthlyCost(costConfig, {
          articlesPerMonth: 10_000, iocsPerMonth: 5_000,
        });

        return reply.send({ data: { updated, costEstimate } });
      },
    );

    /** POST /ai/global/apply-plan — Bulk-set models from tier preset. */
    app.post<{ Body: { tier: string } }>('/apply-plan', async (req, reply) => {
      assertFeatureEnabled(featureEnabled);
      const userId = assertAdmin(req);

      const { tier } = req.body as { tier: string };
      if (!['starter', 'teams', 'enterprise'].includes(tier)) {
        throw new AppError(400, `Invalid tier: ${tier}. Must be starter, teams, or enterprise.`, 'VALIDATION_ERROR');
      }

      const rows = await globalAiStore.applyPlanPreset(tier as 'starter' | 'teams' | 'enterprise', userId);
      const costConfig: SubtaskCostConfig[] = rows.map((c) => ({
        category: c.category, subtask: c.subtask, model: c.model,
      }));
      const costEstimate = costPredictor.estimateMonthlyCost(costConfig, {
        articlesPerMonth: 10_000, iocsPerMonth: 5_000,
      });

      return reply.send({ data: { config: rows, costEstimate } });
    });

    /** GET /ai/global/cost-estimate — Preview cost of proposed changes. */
    app.get('/cost-estimate', async (req: FastifyRequest, reply: FastifyReply) => {
      assertFeatureEnabled(featureEnabled);
      assertAdmin(req);

      const changesParam = (req.query as Record<string, string>).changes;
      if (!changesParam) {
        throw new AppError(400, 'changes query parameter is required (e.g., news_feed.classification:opus)', 'VALIDATION_ERROR');
      }

      // Parse changes: "news_feed.classification:opus,ioc_enrichment.ioc_triage:opus"
      const proposedOverrides = new Map<string, AiModelName>();
      for (const change of changesParam.split(',')) {
        const [key, model] = change.trim().split(':');
        if (!key || !model) continue;
        proposedOverrides.set(key, model as AiModelName);
      }

      const currentConfig = await globalAiStore.getConfig();
      const currentCostConfig: SubtaskCostConfig[] = currentConfig.map((c) => ({
        category: c.category, subtask: c.subtask, model: c.model,
      }));
      const proposedCostConfig: SubtaskCostConfig[] = currentConfig.map((c) => {
        const key = `${c.category}.${c.subtask}`;
        return {
          category: c.category,
          subtask: c.subtask,
          model: proposedOverrides.get(key) ?? c.model,
        };
      });

      const volume = { articlesPerMonth: 10_000, iocsPerMonth: 5_000 };
      const delta = costPredictor.estimateCostDelta(currentCostConfig, proposedCostConfig, volume);

      return reply.send({ data: delta });
    });

    /** GET /ai/global/confidence-model — Current confidence model. */
    app.get('/confidence-model', async (req: FastifyRequest, reply: FastifyReply) => {
      assertFeatureEnabled(featureEnabled);
      assertAdmin(req);

      const model = await globalAiStore.getConfidenceModel();
      return reply.send({ data: { model } });
    });

    /** PUT /ai/global/confidence-model — Set confidence model. */
    app.put<{ Body: { model: string } }>('/confidence-model', async (req, reply) => {
      assertFeatureEnabled(featureEnabled);
      assertAdmin(req);

      const { model } = req.body as { model: string };
      if (!['linear', 'bayesian'].includes(model)) {
        throw new AppError(400, `Invalid confidence model: ${model}. Must be linear or bayesian.`, 'VALIDATION_ERROR');
      }

      // In production this would persist to DB; for now just acknowledge
      return reply.send({ data: { model, status: 'updated' } });
    });
  };
}
