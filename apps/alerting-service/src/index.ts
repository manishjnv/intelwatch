import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { RuleStore } from './services/rule-store.js';
import { AlertStore } from './services/alert-store.js';
import { ChannelStore } from './services/channel-store.js';
import { EscalationStore } from './services/escalation-store.js';
import { RuleEngine } from './services/rule-engine.js';
import { Notifier } from './services/notifier.js';
import { DedupStore } from './services/dedup-store.js';
import { AlertHistory } from './services/alert-history.js';
import { EscalationDispatcher } from './services/escalation-dispatcher.js';
import { AlertGroupStore } from './services/alert-group-store.js';
import { MaintenanceStore } from './services/maintenance-store.js';
import { AlertWorker } from './workers/alert-worker.js';
import { EventEmitter } from 'node:events';
import { GlobalIocAlertHandler, type SubscriptionRepository, type TenantSubscription } from './handlers/global-ioc-alert-handler.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting alerting-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Core services (in-memory — DECISION-013)
  const ruleStore = new RuleStore();
  const alertStore = new AlertStore(config.TI_ALERT_MAX_PER_TENANT);
  const channelStore = new ChannelStore();
  const escalationStore = new EscalationStore();
  const ruleEngine = new RuleEngine();
  const notifier = new Notifier();
  const dedupStore = new DedupStore(5); // 5-minute dedup window
  const alertHistory = new AlertHistory();
  const alertGroupStore = new AlertGroupStore(30); // 30-minute group window
  const maintenanceStore = new MaintenanceStore();

  // 4. Escalation dispatcher (auto-escalate after policy delays)
  const escalationDispatcher = new EscalationDispatcher({
    alertStore,
    escalationStore,
    channelStore,
    notifier,
    alertHistory,
  });
  escalationDispatcher.start();

  // 5. BullMQ worker for alert evaluation
  const alertWorker = new AlertWorker({
    ruleStore,
    alertStore,
    channelStore,
    ruleEngine,
    notifier,
    dedupStore,
    alertHistory,
    escalationDispatcher,
    alertGroupStore,
    maintenanceStore,
    redisUrl: config.TI_REDIS_URL,
    integrationPushEnabled: config.TI_INTEGRATION_PUSH_ENABLED,
  });
  alertWorker.start();

  // 6. Global IOC Alert Handler (DECISION-029 Phase C)
  const globalEventBus = new EventEmitter();
  const globalAlertEnabled = process.env.TI_GLOBAL_PROCESSING_ENABLED === 'true';

  if (globalAlertEnabled) {
    // In-memory subscription registry — tenants register via global catalog subscribe
    // For MVP: all known tenants receive global alerts (no filtering)
    // TODO: Wire HTTP adapter to query ingestion catalog /subscriptions API
    const tenantRegistry = new Set<string>();

    // Register tenants as they create alert rules (proxy for "active tenants")
    const inMemorySubRepo: SubscriptionRepository = {
      async getSubscriptionsForFeed(globalFeedId: string): Promise<TenantSubscription[]> {
        return Array.from(tenantRegistry).map(tenantId => ({
          tenantId,
          globalFeedId,
          alertConfig: {}, // No filters — all tenants get all global alerts for MVP
        }));
      },
      async getAllSubscriptions(): Promise<TenantSubscription[]> {
        return this.getSubscriptionsForFeed('*');
      },
    };

    // Simple: register the default tenant for now
    tenantRegistry.add(process.env.TI_DEFAULT_TENANT_ID ?? 'default-tenant');

    const globalAlertHandler = new GlobalIocAlertHandler(alertStore, inMemorySubRepo, logger);
    globalAlertHandler.registerEventListeners(globalEventBus);
    logger.info('Global IOC alert handler: ENABLED — listening for GLOBAL_IOC_CRITICAL/UPDATED events');
  } else {
    logger.info('Global IOC alert handler: DISABLED');
  }

  // 7. Periodic maintenance: unsuppress expired + purge dedup cache
  const maintenanceInterval = setInterval(() => {
    const unsuppressed = alertStore.unsuppressExpired();
    if (unsuppressed > 0) logger.info({ count: unsuppressed }, 'Unsuppressed expired alerts');
    const purged = dedupStore.purgeExpired();
    if (purged > 0) logger.debug({ purged }, 'Purged expired dedup entries');
  }, 60_000);

  // 7. Build Fastify app with DI
  const app = await buildApp({
    config,
    ruleDeps: { ruleStore, ruleEngine },
    alertDeps: { alertStore, alertHistory, escalationDispatcher },
    channelDeps: { channelStore, notifier },
    escalationDeps: { escalationStore },
    statsDeps: { alertStore, ruleStore },
    templateDeps: { ruleStore },
    groupDeps: { alertGroupStore },
    maintenanceDeps: { maintenanceStore },
  });

  // 8. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down alerting-service...');
    clearInterval(maintenanceInterval);
    escalationDispatcher.stop();
    await alertWorker.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 9. Start listening
  await app.listen({ port: config.TI_SERVICE_PORT, host: config.TI_SERVICE_HOST });
  logger.info({ port: config.TI_SERVICE_PORT }, 'Alerting service ready');
}

main().catch((err) => {
  console.error('Failed to start alerting-service:', err);
  process.exit(1);
});
