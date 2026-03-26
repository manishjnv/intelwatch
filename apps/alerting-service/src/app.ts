import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { ruleRoutes, type RuleRouteDeps } from './routes/rules.js';
import { alertRoutes, type AlertRouteDeps } from './routes/alerts.js';
import { channelRoutes, type ChannelRouteDeps } from './routes/channels.js';
import { escalationRoutes, type EscalationRouteDeps } from './routes/escalations.js';
import { statsRoutes, type StatsRouteDeps } from './routes/stats.js';
import { templateRoutes, type TemplateRouteDeps } from './routes/templates.js';
import { groupRoutes, type GroupRouteDeps } from './routes/groups.js';
import { maintenanceRoutes, type MaintenanceRouteDeps } from './routes/maintenance.js';
import { registerMetrics } from '@etip/shared-utils';
import type { AlertingConfig } from './config.js';

export interface BuildAppOptions {
  config: AlertingConfig;
  ruleDeps?: RuleRouteDeps;
  alertDeps?: AlertRouteDeps;
  channelDeps?: ChannelRouteDeps;
  escalationDeps?: EscalationRouteDeps;
  statsDeps?: StatsRouteDeps;
  templateDeps?: TemplateRouteDeps;
  groupDeps?: GroupRouteDeps;
  maintenanceDeps?: MaintenanceRouteDeps;
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
  await registerMetrics(app, 'alerting-service');
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

  // Alert rules
  if (opts.ruleDeps) {
    await app.register(ruleRoutes(opts.ruleDeps), { prefix: '/api/v1/alerts/rules' });
  }

  // Alerts — register bulk routes prefix BEFORE :id routes to avoid param collision
  if (opts.alertDeps) {
    await app.register(alertRoutes(opts.alertDeps), { prefix: '/api/v1/alerts' });
  }

  // Notification channels
  if (opts.channelDeps) {
    await app.register(channelRoutes(opts.channelDeps), { prefix: '/api/v1/alerts/channels' });
  }

  // Escalation policies
  if (opts.escalationDeps) {
    await app.register(escalationRoutes(opts.escalationDeps), { prefix: '/api/v1/alerts/escalations' });
  }

  // Stats
  if (opts.statsDeps) {
    await app.register(statsRoutes(opts.statsDeps), { prefix: '/api/v1/alerts/stats' });
  }

  // Rule templates
  if (opts.templateDeps) {
    await app.register(templateRoutes(opts.templateDeps), { prefix: '/api/v1/alerts/templates' });
  }

  // Alert groups
  if (opts.groupDeps) {
    await app.register(groupRoutes(opts.groupDeps), { prefix: '/api/v1/alerts/groups' });
  }

  // Maintenance windows
  if (opts.maintenanceDeps) {
    await app.register(maintenanceRoutes(opts.maintenanceDeps), { prefix: '/api/v1/alerts/maintenance-windows' });
  }

  return app;
}
