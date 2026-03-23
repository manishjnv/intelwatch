import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { planRoutes, type PlanRouteDeps } from './routes/plans.js';
import { usageRoutes, type UsageRouteDeps } from './routes/usage.js';
import { subscriptionRoutes, type SubscriptionRouteDeps } from './routes/subscriptions.js';
import { invoiceRoutes, type InvoiceRouteDeps } from './routes/invoices.js';
import { upgradeRoutes, type UpgradeRouteDeps } from './routes/upgrade.js';
import { p0Routes, type P0RouteDeps } from './routes/p0-features.js';
import { webhookRoutes, type WebhookRouteDeps } from './routes/webhooks.js';
import { adminRoutes, type AdminRouteDeps } from './routes/admin.js';
import type { BillingConfig } from './config.js';

export interface BuildAppOptions {
  config: BillingConfig;
  planDeps?: PlanRouteDeps;
  usageDeps?: UsageRouteDeps;
  subscriptionDeps?: SubscriptionRouteDeps;
  invoiceDeps?: InvoiceRouteDeps;
  upgradeDeps?: UpgradeRouteDeps;
  webhookDeps?: WebhookRouteDeps;
  p0Deps?: P0RouteDeps;
  adminDeps?: AdminRouteDeps;
}

/** Build and configure the Fastify application. */
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

  // ─── Security plugins ─────────────────────────────────────────
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

  // ─── Request lifecycle hooks ───────────────────────────────────
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

  // ─── Health routes (no prefix) ────────────────────────────────
  await app.register(healthRoutes);

  // ─── API routes ────────────────────────────────────────────────
  if (opts.planDeps) {
    await app.register(planRoutes(opts.planDeps), { prefix: '/api/v1/billing/plans' });
    // Tenant plan routes share the plans router with a different sub-path
    // but tenant/plan is registered within planRoutes already
  }

  if (opts.usageDeps) {
    await app.register(usageRoutes(opts.usageDeps), { prefix: '/api/v1/billing/usage' });
  }

  if (opts.subscriptionDeps) {
    await app.register(subscriptionRoutes(opts.subscriptionDeps), { prefix: '/api/v1/billing' });
  }

  if (opts.invoiceDeps) {
    await app.register(invoiceRoutes(opts.invoiceDeps), { prefix: '/api/v1/billing/invoices' });
  }

  if (opts.upgradeDeps) {
    await app.register(upgradeRoutes(opts.upgradeDeps), { prefix: '/api/v1/billing' });
  }

  if (opts.webhookDeps) {
    await app.register(webhookRoutes(opts.webhookDeps), { prefix: '/api/v1/billing/webhooks' });
  }

  if (opts.p0Deps) {
    await app.register(p0Routes(opts.p0Deps), { prefix: '/api/v1/billing' });
  }

  if (opts.adminDeps) {
    await app.register(adminRoutes(opts.adminDeps), { prefix: '/api/v1/billing/admin' });
  }

  return app;
}
