import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { huntRoutes, type HuntRouteDeps } from './routes/hunts.js';
import { advancedRoutes, type AdvancedRouteDeps } from './routes/advanced.js';
import { p2Routes, type P2RouteDeps } from './routes/p2.js';
import type { HuntingConfig } from './config.js';

export interface BuildAppOptions {
  config: HuntingConfig;
  routeDeps: HuntRouteDeps;
  advancedDeps: AdvancedRouteDeps;
  p2Deps: P2RouteDeps;
}

/** Build and configure the Fastify application. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, routeDeps, advancedDeps, p2Deps } = opts;

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
  await app.register(huntRoutes(routeDeps), { prefix: '/api/v1/hunts' });
  await app.register(advancedRoutes(advancedDeps), { prefix: '/api/v1/hunts' });
  await app.register(p2Routes(p2Deps), { prefix: '/api/v1/hunts' });

  return app;
}
