import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { reportRoutes, type ReportRouteDeps } from './routes/reports.js';
import { scheduleRoutes, type ScheduleRouteDeps } from './routes/schedules.js';
import { templateRoutes, type TemplateRouteDeps } from './routes/templates.js';
import { statsRoutes, type StatsRouteDeps } from './routes/stats.js';
import type { ReportingConfig } from './config.js';

export interface BuildAppOptions {
  config: ReportingConfig;
  reportDeps?: ReportRouteDeps;
  scheduleDeps?: ScheduleRouteDeps;
  templateDeps?: TemplateRouteDeps;
  statsDeps?: StatsRouteDeps;
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

  // Report API routes
  if (opts.reportDeps) {
    await app.register(reportRoutes(opts.reportDeps), { prefix: '/api/v1/reports' });
  }

  // Schedule routes — registered BEFORE :id param routes via separate prefix
  if (opts.scheduleDeps) {
    await app.register(scheduleRoutes(opts.scheduleDeps), { prefix: '/api/v1/reports/schedule' });
  }

  // Template routes
  if (opts.templateDeps) {
    await app.register(templateRoutes(opts.templateDeps), { prefix: '/api/v1/reports/templates' });
  }

  // Stats routes
  if (opts.statsDeps) {
    await app.register(statsRoutes(opts.statsDeps), { prefix: '/api/v1/reports/stats' });
  }

  return app;
}
