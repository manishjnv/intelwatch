import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import compress from '@fastify/compress';
import { type AppConfig } from './config.js';
import { createLogger } from './logger.js';
import { registerMetrics } from '@etip/shared-utils';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerErrorAlerting, errorAlertingRoutes } from './plugins/error-alerting.js';
import { registerQuotaEnforcement } from './plugins/quota-enforcement.js';
import { registerRls } from './plugins/rls.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { planRoutes } from './routes/plans.js';
import { overrideRoutes } from './routes/overrides.js';
import { usageRoutes } from './routes/usage.js';
import { mfaRoutes } from './routes/mfa.js';
import { billingUpgradeRoutes } from './routes/billing-upgrade.js';
import { auditRoutes } from './routes/audit.js';
import { sessionRoutes } from './routes/sessions.js';
import { accessReviewRoutes } from './routes/access-review.js';
import { complianceRoutes } from './routes/compliance.js';
import { offboardingGatewayRoutes } from './routes/offboarding.js';

/** Determine per-request rate limit tier based on URL + method */
function resolveRateLimit(req: FastifyRequest): number {
  const url = req.url;
  // Search tier — ES-backed, expensive
  if (url.startsWith('/api/v1/search') || (url.startsWith('/api/v1/iocs') && url.includes('q='))) {
    return 10;
  }
  // Write tier — mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return 30;
  }
  // Read tier — default for all GETs
  return 120;
}

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

  // Response compression — gzip for payloads >1KB, skip binaries
  await app.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate', 'identity'],
    removeContentLengthHeader: false,
    customTypes: /^(?!image\/|application\/octet-stream)/,
  });

  // Tiered rate limiting — per-tenant, URL-aware
  await app.register(rateLimit, {
    global: true,
    max: resolveRateLimit,
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

  // Error alerting — aggregate 5xx errors, emit QUEUE_ALERT above threshold
  registerErrorAlerting(app, config.TI_REDIS_URL);

  // RLS — set PostgreSQL session vars (app.tenant_id, app.is_super_admin) per request
  registerRls(app);

  // Quota enforcement — per-tenant plan limits, usage counters, X-Quota headers
  await registerQuotaEnforcement(app, config.TI_REDIS_URL);

  app.addHook('onRequest', async (req) => { (req as unknown as Record<string, unknown>)._startTime = Date.now(); });
  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req as unknown as Record<string, unknown>)._startTime as number | undefined;
    if (startTime) {
      req.log.info({ method: req.method, url: req.url, statusCode: reply.statusCode, duration: Date.now() - startTime }, 'request completed');
    }
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(planRoutes, { prefix: '/api/v1/admin/plans' });
  await app.register(overrideRoutes, { prefix: '/api/v1/admin/tenants' });
  await app.register(errorAlertingRoutes, { prefix: '/api/v1/gateway' });
  await app.register(usageRoutes, { prefix: '/api/v1' });
  await app.register(mfaRoutes, { prefix: '/api/v1/auth' });
  await app.register(billingUpgradeRoutes, { prefix: '/api/v1/billing' });
  await app.register(auditRoutes, { prefix: '/api/v1' });
  await app.register(sessionRoutes, { prefix: '/api/v1/auth' });
  await app.register(accessReviewRoutes, { prefix: '/api/v1' });
  await app.register(complianceRoutes, { prefix: '/api/v1' });
  await app.register(offboardingGatewayRoutes, { prefix: '/api/v1' });

  logger.info('API Gateway configured successfully');
  return app;
}
