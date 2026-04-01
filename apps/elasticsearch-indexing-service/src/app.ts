import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health-check.js';
import { searchRoutes } from './routes/search.js';
import { reindexRoutes } from './routes/reindex.js';
import { migrateRoutes } from './routes/migrate.js';
import { EsIndexClient } from './es-client.js';
import { IocIndexer } from './ioc-indexer.js';
import { IocSearchService } from './search-service.js';
import { IocIndexWorker } from './worker.js';
import { registerMetrics } from '@etip/shared-utils';
import type { EsIndexingConfig } from './config.js';

export interface BuildAppOptions {
  config: EsIndexingConfig;
}

export interface AppDependencies {
  esClient: EsIndexClient;
  indexer: IocIndexer;
  searchService: IocSearchService;
  worker: IocIndexWorker;
}

/** Build and configure the Fastify application with all dependencies wired. */
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;

  // ── Dependency construction ─────────────────────────────────────────────────
  const esClient = new EsIndexClient({
    url: config.TI_ES_URL,
    username: config.TI_ES_USERNAME,
    password: config.TI_ES_PASSWORD,
  });

  const indexer = new IocIndexer(esClient);
  const searchService = new IocSearchService(esClient);
  const worker = new IocIndexWorker(config.TI_REDIS_URL, indexer);

  // ── Fastify setup ───────────────────────────────────────────────────────────
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

  // ── Security plugins ─────────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.TI_CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.TI_RATE_LIMIT_MAX,
    timeWindow: config.TI_RATE_LIMIT_WINDOW_MS,
  });
  await app.register(sensible);
  await registerMetrics(app, 'es-indexing-service');
  await app.register(errorHandlerPlugin);

  // ── Request lifecycle hooks ──────────────────────────────────────────────────
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

  // ── ILM + Index Template setup (idempotent — safe to run on every startup) ──
  try {
    await esClient.setupIlmPolicy();
    await esClient.setupIndexTemplate();
    app.log.info('ILM policy and index template configured');
  } catch (err) {
    app.log.warn({ err }, 'ILM/template setup failed — will retry on next restart');
  }

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(healthRoutes({ esClient, worker }));
  await app.register(searchRoutes({ searchService }), { prefix: '/api/v1/search' });
  await app.register(reindexRoutes({ indexer }), { prefix: '/api/v1/search' });
  await app.register(migrateRoutes({ esClient }), { prefix: '/api/v1/admin' });

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  app.addHook('onClose', async () => {
    await worker.stop();
  });

  return app;
}
