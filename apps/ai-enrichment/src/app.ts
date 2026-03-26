import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { type AppConfig } from './config.js';
import { registerMetrics } from '@etip/shared-utils';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { enrichmentRoutes } from './routes/enrichment.js';
import { costRoutes } from './routes/cost.js';
import type { EnrichmentRepository } from './repository.js';
import type { EnrichmentCostTracker } from './cost-tracker.js';
import type { BatchEnrichmentService } from './batch-enrichment.js';

export interface BuildAppOptions {
  config: AppConfig;
  repo: EnrichmentRepository;
  costTracker: EnrichmentCostTracker;
  batchService?: BatchEnrichmentService | null;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, repo } = opts;

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
  await registerMetrics(app, 'enrichment-service');
  registerErrorHandler(app);

  app.addHook('onRequest', async (req) => { (req as unknown as Record<string, unknown>)._startTime = Date.now(); });
  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (startTime) {
      req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration: Date.now() - startTime }, 'request completed');
    }
  });

  await app.register(healthRoutes);
  await app.register(enrichmentRoutes(repo, opts.batchService), { prefix: '/api/v1/enrichment' });
  await app.register(costRoutes(opts.costTracker, config.TI_ENRICHMENT_DAILY_BUDGET_USD), { prefix: '/api/v1/enrichment/cost' });

  return app;
}
