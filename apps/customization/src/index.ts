import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { AuditTrail } from './services/audit-trail.js';
import { ConfigVersioning } from './services/config-versioning.js';
import { ValidationEngine } from './services/validation-engine.js';
import { ConfigInheritance } from './services/config-inheritance.js';
import { ConfigPortability } from './services/config-portability.js';
import { ModuleToggleStore } from './services/module-toggle-store.js';
import { AiModelStore } from './services/ai-model-store.js';
import { PlanTierService } from './services/plan-tiers.js';
import { RiskWeightStore } from './services/risk-weight-store.js';
import { DashboardStore } from './services/dashboard-store.js';
import { NotificationStore } from './services/notification-store.js';
import { FeedQuotaStore } from './services/feed-quota-store.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting customization-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. P0 cross-cutting services
  const auditTrail = new AuditTrail();
  const configVersioning = new ConfigVersioning();
  const validationEngine = new ValidationEngine();
  const configInheritance = new ConfigInheritance();
  const configPortability = new ConfigPortability();

  // 4. Feature stores (inject P0 deps)
  const moduleToggleStore = new ModuleToggleStore(validationEngine, auditTrail, configVersioning);
  const aiModelStore = new AiModelStore(auditTrail, configVersioning);
  const planTierService = new PlanTierService();
  const riskWeightStore = new RiskWeightStore(validationEngine, auditTrail, configVersioning);
  const dashboardStore = new DashboardStore(configInheritance, auditTrail, configVersioning);
  const notificationStore = new NotificationStore(configInheritance, auditTrail, configVersioning);
  const feedQuotaStore = new FeedQuotaStore();

  // 5. Register stores with config portability
  configPortability.registerStore('modules', {
    get: (tid) => moduleToggleStore.getExportData(tid),
    set: (tid, data, uid) => moduleToggleStore.importData(tid, data, uid),
  });
  configPortability.registerStore('ai', {
    get: (tid) => aiModelStore.getExportData(tid),
    set: (tid, data, uid) => aiModelStore.importData(tid, data, uid),
  });
  configPortability.registerStore('risk', {
    get: (tid) => riskWeightStore.getExportData(tid),
    set: (tid, data, uid) => riskWeightStore.importData(tid, data, uid),
  });
  configPortability.registerStore('dashboard', {
    get: (tid) => dashboardStore.getExportData(tid),
    set: (tid, data, uid) => dashboardStore.importData(tid, data, uid),
  });
  configPortability.registerStore('notifications', {
    get: (tid) => notificationStore.getExportData(tid),
    set: (tid, data, uid) => notificationStore.importData(tid, data, uid),
  });

  // 6. Build Fastify app
  const app = await buildApp({
    config,
    moduleToggleDeps: { moduleToggleStore },
    aiModelDeps: { aiModelStore, planTierService, stage2Factor: config.TI_COST_STAGE2_FACTOR },
    apiKeyDeps: { aiModelStore },
    riskWeightDeps: { riskWeightStore },
    dashboardDeps: { dashboardStore },
    notificationDeps: { notificationStore },
    configDeps: { configPortability, auditTrail, configVersioning },
    feedQuotaDeps: { feedQuotaStore },
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 8. Start listening
  await app.listen({ port: config.TI_CUSTOMIZATION_PORT, host: config.TI_CUSTOMIZATION_HOST });
  logger.info({ port: config.TI_CUSTOMIZATION_PORT }, 'Customization service ready');
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
