import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { type AppConfig } from './config.js';
import { createLogger } from './logger.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { feedRoutes } from './routes/feeds.js';
import { feedPolicyRoutes } from './routes/feed-policies.js';
import { articleRoutes } from './routes/articles.js';
import { FeedRepository } from './repository.js';
import { FeedService } from './service.js';
import { FeedPolicyStore } from './services/feed-policy-store.js';
import type { Queue } from 'bullmq';

export interface BuildAppOptions {
  config: AppConfig;
  repo: FeedRepository;
  queue: Queue;
  policyStore?: FeedPolicyStore;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, repo, queue, policyStore = new FeedPolicyStore() } = opts;
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
  registerErrorHandler(app);

  app.addHook('onRequest', async (req) => { (req as unknown as Record<string, unknown>)._startTime = Date.now(); });
  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (startTime) {
      req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration: Date.now() - startTime }, 'request completed');
    }
  });

  const service = new FeedService(repo, queue as never, logger);

  await app.register(healthRoutes);
  await app.register(feedRoutes(service), { prefix: '/api/v1/feeds' });
  await app.register(feedPolicyRoutes(policyStore, repo), { prefix: '/api/v1/feeds' });
  await app.register(articleRoutes(repo), { prefix: '/api/v1/articles' });

  logger.info('Ingestion service configured successfully');
  return app;
}
