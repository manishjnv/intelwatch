/**
 * @module app
 * @description Fastify application factory for analytics-service.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { dashboardRoutes, type DashboardRouteDeps } from './routes/dashboard.js';
import { trendRoutes, type TrendRouteDeps } from './routes/trends.js';
import { executiveRoutes, type ExecutiveRouteDeps } from './routes/executive.js';
import { registerMetrics } from '@etip/shared-utils';
import type { AnalyticsConfig } from './config.js';

export interface BuildAppOptions {
  config: AnalyticsConfig;
  dashboardDeps?: DashboardRouteDeps;
  trendDeps?: TrendRouteDeps;
  executiveDeps?: ExecutiveRouteDeps;
}

/** Build and configure the Fastify app with all plugins and routes. */
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

  // Security plugins
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
  await registerMetrics(app, 'analytics-service');
  await app.register(errorHandlerPlugin);

  // Request lifecycle hooks
  app.addHook('onRequest', async (req) => {
    (req as unknown as Record<string, unknown>)._startTime = Date.now();
  });
  app.addHook('onResponse', async (req, reply) => {
    const start = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (start) {
      req.log.info(
        { method: req.method, url: req.url, statusCode: reply.statusCode, duration: Date.now() - start },
        'request completed',
      );
    }
  });

  // Health routes (no prefix, no auth)
  await app.register(healthRoutes);

  // Dashboard widget routes
  if (opts.dashboardDeps) {
    await app.register(dashboardRoutes(opts.dashboardDeps), { prefix: '/api/v1/analytics' });
  }

  // Trend routes
  if (opts.trendDeps) {
    await app.register(trendRoutes(opts.trendDeps), { prefix: '/api/v1/analytics/trends' });
  }

  // Executive + stats + health routes
  if (opts.executiveDeps) {
    await app.register(executiveRoutes(opts.executiveDeps), { prefix: '/api/v1/analytics' });
  }

  return app;
}
