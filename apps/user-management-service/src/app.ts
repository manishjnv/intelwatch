import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { permissionRoutes, type PermissionRouteDeps } from './routes/permissions.js';
import { teamRoutes, type TeamRouteDeps } from './routes/teams.js';
import { ssoRoutes, type SsoRouteDeps } from './routes/sso.js';
import { mfaRoutes, type MfaRouteDeps } from './routes/mfa.js';
import { breakGlassRoutes, type BreakGlassRouteDeps } from './routes/break-glass.js';
import { sessionRoutes, type SessionRouteDeps } from './routes/sessions.js';
import { apiKeyRoutes, type ApiKeyRouteDeps } from './routes/api-keys.js';
import { registerMetrics } from '@etip/shared-utils';
import type { UserManagementConfig } from './config.js';

export interface BuildAppOptions {
  config: UserManagementConfig;
  permissionDeps?: PermissionRouteDeps;
  teamDeps?: TeamRouteDeps;
  ssoDeps?: SsoRouteDeps;
  mfaDeps?: MfaRouteDeps;
  breakGlassDeps?: BreakGlassRouteDeps;
  sessionDeps?: SessionRouteDeps;
  apiKeyDeps?: ApiKeyRouteDeps;
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
  await registerMetrics(app, 'user-management-service');
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

  if (opts.permissionDeps) {
    await app.register(permissionRoutes(opts.permissionDeps), { prefix: '/api/v1/users' });
  }
  if (opts.teamDeps) {
    await app.register(teamRoutes(opts.teamDeps), { prefix: '/api/v1/users' });
  }
  if (opts.ssoDeps) {
    await app.register(ssoRoutes(opts.ssoDeps), { prefix: '/api/v1/users' });
  }
  if (opts.mfaDeps) {
    await app.register(mfaRoutes(opts.mfaDeps), { prefix: '/api/v1/users' });
  }
  if (opts.breakGlassDeps) {
    await app.register(breakGlassRoutes(opts.breakGlassDeps), { prefix: '/api/v1/users' });
  }
  if (opts.sessionDeps) {
    await app.register(sessionRoutes(opts.sessionDeps), { prefix: '/api/v1/users' });
  }
  if (opts.apiKeyDeps) {
    await app.register(apiKeyRoutes(opts.apiKeyDeps), { prefix: '/api/v1/users' });
  }

  return app;
}
