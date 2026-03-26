import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { registerMetrics } from '@etip/shared-utils';
import { type AppConfig } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { graphRoutes } from './routes/graph.js';
import { graphExtendedRoutes, type ExtendedRouteDeps } from './routes/graph-extended.js';
import { graphOperationRoutes, type OperationRouteDeps } from './routes/graph-operations.js';
import type { GraphService } from './service.js';

export interface BuildAppOptions {
  config: AppConfig;
  service: GraphService;
  extendedDeps: ExtendedRouteDeps;
  operationDeps: OperationRouteDeps;
}

/** Builds and returns the configured Fastify instance with all plugins and routes. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, service, extendedDeps, operationDeps } = opts;

  const app = Fastify({
    logger: {
      level: config.TI_LOG_LEVEL,
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, hostname: req.hostname, remoteAddress: req.ip }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  const allowedOrigins = config.TI_CORS_ORIGINS.split(',').map((o) => o.trim());
  await app.register(cors, {
    origin: allowedOrigins, credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Service-Token'],
  });

  await app.register(rateLimit, {
    max: config.TI_RATE_LIMIT_MAX_REQUESTS,
    timeWindow: config.TI_RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) => {
      const user = (req as unknown as Record<string, unknown>).user as { sub?: string } | undefined;
      return user?.sub ?? req.ip;
    },
  });

  await app.register(sensible);
  await registerMetrics(app, 'threat-graph');
  registerErrorHandler(app);

  app.addHook('onRequest', async (req) => { (req as unknown as Record<string, unknown>)._startTime = Date.now(); });
  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (startTime) {
      req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration: Date.now() - startTime }, 'request completed');
    }
  });

  await app.register(healthRoutes);
  await app.register(graphRoutes(service), { prefix: '/api/v1/graph' });
  await app.register(graphExtendedRoutes(extendedDeps), { prefix: '/api/v1/graph' });
  await app.register(graphOperationRoutes(operationDeps), { prefix: '/api/v1/graph' });

  return app;
}
