import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { integrationRoutes, type IntegrationRouteDeps } from './routes/integrations.js';
import { webhookRoutes, type WebhookRouteDeps } from './routes/webhooks.js';
import { exportRoutes, type ExportRouteDeps } from './routes/export.js';
import type { IntegrationConfig } from './config.js';

export interface BuildAppOptions {
  config: IntegrationConfig;
  routeDeps?: IntegrationRouteDeps;
  webhookDeps?: WebhookRouteDeps;
  exportDeps?: ExportRouteDeps;
}

/** Build and configure the Fastify application. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, routeDeps, webhookDeps, exportDeps } = opts;

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

  if (routeDeps) {
    await app.register(integrationRoutes(routeDeps), { prefix: '/api/v1/integrations' });
  }
  if (webhookDeps) {
    await app.register(webhookRoutes(webhookDeps), { prefix: '/api/v1/integrations' });
  }
  if (exportDeps) {
    await app.register(exportRoutes(exportDeps), { prefix: '/api/v1/integrations' });
  }

  return app;
}
