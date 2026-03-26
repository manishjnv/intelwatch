import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { assetRoutes, type AssetRouteDeps } from './routes/assets.js';
import { alertRoutes, type AlertRouteDeps } from './routes/alerts.js';
import { detectionRoutes, type DetectionRouteDeps } from './routes/detection.js';
import { p1Routes, type P1RouteDeps } from './routes/p1.js';
import { p2Routes, type P2RouteDeps } from './routes/p2.js';
import { registerMetrics } from '@etip/shared-utils';
import type { DRPConfig } from './config.js';

export interface BuildAppOptions {
  config: DRPConfig;
  assetDeps: AssetRouteDeps;
  alertDeps: AlertRouteDeps;
  detectionDeps: DetectionRouteDeps;
  p1Deps: P1RouteDeps;
  p2Deps: P2RouteDeps;
}

/** Build and configure the Fastify application. */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, assetDeps, alertDeps, detectionDeps, p1Deps, p2Deps } = options;

  const app = Fastify({
    logger: {
      level: config.TI_LOG_LEVEL,
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.TI_CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.TI_RATE_LIMIT_MAX,
    timeWindow: config.TI_RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) => {
      const user = (req as unknown as Record<string, unknown>).user as
        | { userId: string }
        | undefined;
      return user?.userId ?? req.ip;
    },
  });
  await app.register(sensible);
  await registerMetrics(app, 'drp-service');
  await app.register(errorHandlerPlugin);

  app.addHook('onRequest', async (req) => {
    (req as unknown as Record<string, unknown>)._startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const start = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (start) {
      const duration = Date.now() - start;
      req.log.info({ duration, statusCode: reply.statusCode }, 'request completed');
    }
  });

  await app.register(healthRoutes);
  await app.register(assetRoutes(assetDeps), { prefix: '/api/v1/drp' });
  await app.register(alertRoutes(alertDeps), { prefix: '/api/v1/drp' });
  await app.register(detectionRoutes(detectionDeps), { prefix: '/api/v1/drp' });
  await app.register(p1Routes(p1Deps), { prefix: '/api/v1/drp' });
  await app.register(p2Routes(p2Deps), { prefix: '/api/v1/drp' });

  return app;
}
