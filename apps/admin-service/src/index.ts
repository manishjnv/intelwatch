import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { HealthStore } from './services/health-store.js';
import { MaintenanceStore } from './services/maintenance-store.js';
import { BackupStore } from './services/backup-store.js';
import { TenantStore } from './services/tenant-store.js';
import { AuditStore } from './services/audit-store.js';
import { AlertRulesStore } from './services/alert-rules-store.js';
import { ScheduledMaintenanceStore } from './services/scheduled-maintenance-store.js';
import { TenantAnalyticsStore } from './services/tenant-analytics-store.js';
import { AdminActivityStore } from './services/admin-activity-store.js';
import { initEmailSender } from './services/email-sender.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting admin-service...');

  // 1b. Email sender (optional — skipped if Resend key not set)
  initEmailSender(config);
  if (config.TI_RESEND_API_KEY) logger.info('Resend email sender initialised');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Core services (in-memory — DECISION-013)
  const healthStore = new HealthStore();
  const maintenanceStore = new MaintenanceStore();
  const backupStore = new BackupStore();
  const tenantStore = new TenantStore();
  const auditStore = new AuditStore();
  const alertRulesStore = new AlertRulesStore();
  const scheduledMaintenanceStore = new ScheduledMaintenanceStore();
  const tenantAnalyticsStore = new TenantAnalyticsStore();
  const adminActivityStore = new AdminActivityStore();

  // 4. Build Fastify app with DI
  const app = await buildApp({
    config,
    systemHealthDeps: { healthStore },
    maintenanceDeps: { maintenanceStore },
    backupDeps: { backupStore },
    tenantDeps: { tenantStore },
    auditDeps: { auditStore },
    queueMonitorDeps:  { redisUrl: config.TI_REDIS_URL },
    dlqProcessorDeps:  { redisUrl: config.TI_REDIS_URL },
    p0Deps: {
      alertRulesStore,
      scheduledMaintenanceStore,
      tenantAnalyticsStore,
      adminActivityStore,
      tenantStore,
    },
  });

  // 5. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down admin-service...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 6. Start listening
  await app.listen({ port: config.TI_ADMIN_PORT, host: config.TI_ADMIN_HOST });
  logger.info({ port: config.TI_ADMIN_PORT }, 'Admin service ready');
}

main().catch((err) => {
  console.error('Failed to start admin-service:', err);
  process.exit(1);
});
