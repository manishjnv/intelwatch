import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health-check.js';
import { systemHealthRoutes, type SystemHealthRouteDeps } from './routes/system-health.js';
import { maintenanceRoutes, type MaintenanceRouteDeps } from './routes/maintenance.js';
import { backupRoutes, type BackupRouteDeps } from './routes/backup.js';
import { tenantRoutes, type TenantRouteDeps } from './routes/tenants.js';
import { auditRoutes, type AuditRouteDeps } from './routes/audit.js';
import { p0Routes, type P0RouteDeps } from './routes/p0-features.js';
import { queueMonitorRoutes, type QueueMonitorDeps } from './routes/queue-monitor.js';
import { dlqProcessorRoutes, type DlqProcessorDeps } from './routes/dlq-processor.js';
import type { AdminConfig } from './config.js';

export interface BuildAppOptions {
  config: AdminConfig;
  systemHealthDeps?: SystemHealthRouteDeps;
  maintenanceDeps?: MaintenanceRouteDeps;
  backupDeps?: BackupRouteDeps;
  tenantDeps?: TenantRouteDeps;
  auditDeps?: AuditRouteDeps;
  p0Deps?: P0RouteDeps;
  queueMonitorDeps?: QueueMonitorDeps;
  dlqProcessorDeps?: DlqProcessorDeps;
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

  // ─── Health routes (no prefix, no auth) ──────────────────────
  await app.register(healthRoutes);

  // ─── Admin API routes ─────────────────────────────────────────
  if (opts.systemHealthDeps) {
    await app.register(systemHealthRoutes(opts.systemHealthDeps), { prefix: '/api/v1/admin/system' });
  }

  if (opts.maintenanceDeps) {
    await app.register(maintenanceRoutes(opts.maintenanceDeps), { prefix: '/api/v1/admin/maintenance' });
  }

  if (opts.backupDeps) {
    await app.register(backupRoutes(opts.backupDeps), { prefix: '/api/v1/admin/backups' });
  }

  if (opts.tenantDeps) {
    await app.register(tenantRoutes(opts.tenantDeps), { prefix: '/api/v1/admin/tenants' });
  }

  if (opts.auditDeps) {
    await app.register(auditRoutes(opts.auditDeps), { prefix: '/api/v1/admin/audit' });
  }

  if (opts.p0Deps) {
    await app.register(p0Routes(opts.p0Deps), { prefix: '/api/v1/admin' });
  }

  if (opts.queueMonitorDeps) {
    await app.register(queueMonitorRoutes(opts.queueMonitorDeps), { prefix: '/api/v1/admin' });
  }

  if (opts.dlqProcessorDeps) {
    await app.register(dlqProcessorRoutes(opts.dlqProcessorDeps), { prefix: '/api/v1/admin' });
  }

  return app;
}
