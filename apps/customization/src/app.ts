import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { moduleToggleRoutes, type ModuleToggleRouteDeps } from './routes/module-toggles.js';
import { aiModelRoutes, type AiModelRouteDeps } from './routes/ai-models.js';
import { riskWeightRoutes, type RiskWeightRouteDeps } from './routes/risk-weights.js';
import { dashboardRoutes, type DashboardRouteDeps } from './routes/dashboard.js';
import { notificationRoutes, type NotificationRouteDeps } from './routes/notifications.js';
import { configRoutes, type ConfigRouteDeps } from './routes/config.js';
import { apiKeyRoutes, type ApiKeyRouteDeps } from './routes/api-keys.js';
import { feedQuotaRoutes, type FeedQuotaRouteDeps } from './routes/feed-quota.js';
import { globalAiRoutes, type GlobalAiRouteDeps } from './routes/global-ai.js';
import { planLimitsRoutes, type PlanLimitsRouteDeps } from './routes/plan-limits.js';
import { registerMetrics } from '@etip/shared-utils';
import type { CustomizationConfig } from './config.js';

export interface BuildAppOptions {
  config: CustomizationConfig;
  moduleToggleDeps?: ModuleToggleRouteDeps;
  aiModelDeps?: AiModelRouteDeps;
  apiKeyDeps?: ApiKeyRouteDeps;
  riskWeightDeps?: RiskWeightRouteDeps;
  dashboardDeps?: DashboardRouteDeps;
  notificationDeps?: NotificationRouteDeps;
  configDeps?: ConfigRouteDeps;
  feedQuotaDeps?: FeedQuotaRouteDeps;
  globalAiDeps?: GlobalAiRouteDeps;
  planLimitsDeps?: PlanLimitsRouteDeps;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;

  const app = Fastify({
    logger: {
      level: config.TI_LOG_LEVEL,
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  // ─── Plugins ──────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.TI_CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.TI_RATE_LIMIT_MAX,
    timeWindow: config.TI_RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) => {
      const user = (req as unknown as Record<string, unknown>).user as { userId?: string } | undefined;
      return user?.userId ?? req.ip;
    },
  });
  await app.register(sensible);
  await registerMetrics(app, 'customization-service');
  await app.register(errorHandlerPlugin);

  // ─── Request logging ──────────────────────────────────────
  app.addHook('onRequest', async (req) => {
    (req as unknown as Record<string, unknown>)._startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const start = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (start) {
      const duration = Date.now() - start;
      req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration }, 'request completed');
    }
  });

  // ─── Routes ───────────────────────────────────────────────
  await app.register(healthRoutes);

  if (opts.moduleToggleDeps) {
    await app.register(moduleToggleRoutes(opts.moduleToggleDeps), { prefix: '/api/v1/customization/modules' });
  }
  if (opts.aiModelDeps) {
    await app.register(aiModelRoutes(opts.aiModelDeps), { prefix: '/api/v1/customization/ai' });
  }
  if (opts.riskWeightDeps) {
    await app.register(riskWeightRoutes(opts.riskWeightDeps), { prefix: '/api/v1/customization/risk' });
  }
  if (opts.dashboardDeps) {
    await app.register(dashboardRoutes(opts.dashboardDeps), { prefix: '/api/v1/customization/dashboard' });
  }
  if (opts.notificationDeps) {
    await app.register(notificationRoutes(opts.notificationDeps), { prefix: '/api/v1/customization/notifications' });
  }
  if (opts.apiKeyDeps) {
    await app.register(apiKeyRoutes(opts.apiKeyDeps), { prefix: '/api/v1/customization/api-keys' });
  }
  if (opts.configDeps) {
    await app.register(configRoutes(opts.configDeps), { prefix: '/api/v1/customization' });
  }
  if (opts.feedQuotaDeps) {
    await app.register(feedQuotaRoutes(opts.feedQuotaDeps), { prefix: '/api/v1/customization/feed-quota' });
  }
  if (opts.globalAiDeps) {
    await app.register(globalAiRoutes(opts.globalAiDeps), { prefix: '/api/v1/customization/ai/global' });
  }
  if (opts.planLimitsDeps) {
    await app.register(planLimitsRoutes(opts.planLimitsDeps), { prefix: '/api/v1/customization/plans' });
  }

  return app;
}
