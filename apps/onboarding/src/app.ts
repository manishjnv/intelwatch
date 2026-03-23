import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { wizardRoutes, type WizardRouteDeps } from './routes/wizard.js';
import { connectorRoutes, type ConnectorRouteDeps } from './routes/connectors.js';
import { pipelineRoutes, type PipelineRouteDeps } from './routes/pipeline.js';
import { moduleRoutes, type ModuleRouteDeps } from './routes/modules.js';
import { welcomeRoutes, type WelcomeRouteDeps } from './routes/welcome.js';
import type { OnboardingConfig } from './config.js';

export interface BuildAppOptions {
  config: OnboardingConfig;
  wizardDeps?: WizardRouteDeps;
  connectorDeps?: ConnectorRouteDeps;
  pipelineDeps?: PipelineRouteDeps;
  moduleDeps?: ModuleRouteDeps;
  welcomeDeps?: WelcomeRouteDeps;
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

  if (opts.wizardDeps) {
    await app.register(wizardRoutes(opts.wizardDeps), { prefix: '/api/v1/onboarding/wizard' });
  }
  if (opts.connectorDeps) {
    await app.register(connectorRoutes(opts.connectorDeps), { prefix: '/api/v1/onboarding/connectors' });
  }
  if (opts.pipelineDeps) {
    await app.register(pipelineRoutes(opts.pipelineDeps), { prefix: '/api/v1/onboarding/pipeline' });
  }
  if (opts.moduleDeps) {
    await app.register(moduleRoutes(opts.moduleDeps), { prefix: '/api/v1/onboarding/modules' });
  }
  if (opts.welcomeDeps) {
    await app.register(welcomeRoutes(opts.welcomeDeps), { prefix: '/api/v1/onboarding/welcome' });
  }

  return app;
}
