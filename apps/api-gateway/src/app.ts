import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { type AppConfig } from './config.js';
import { createLogger } from './logger.js';
import { registerMetrics } from '@etip/shared-utils';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';

export interface BuildAppOptions { config: AppConfig; }

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const logger = createLogger(config.TI_LOG_LEVEL);

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
    disableRequestLogging: false,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  const allowedOrigins = config.TI_CORS_ORIGINS.split(',').map((o) => o.trim());
  await app.register(cors, {
    origin: allowedOrigins, credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Service-Token'],
  });

  await app.register(rateLimit, {
    global: true,
    max: config.TI_RATE_LIMIT_MAX_REQUESTS,
    timeWindow: config.TI_RATE_LIMIT_WINDOW_MS,
    keyGenerator: (req) =>
      (req.headers['x-tenant-id'] as string) ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests — limit is ${context.max} per minute`,
        retryAfter: context.after,
      },
    }),
  });

  await app.register(sensible);
  await registerMetrics(app, 'api-gateway');
  registerErrorHandler(app);

  app.addHook('onRequest', async (req) => { (req as unknown as Record<string, unknown>)._startTime = Date.now(); });
  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (startTime) {
      req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration: Date.now() - startTime }, 'request completed');
    }
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  logger.info('API Gateway configured successfully');
  return app;
}
