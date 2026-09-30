import { PrismaClient } from '@prisma/client';
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
import { AlertHistory } from './services/alert-history.js';
import { EscalationDispatcher } from './services/escalation-dispatcher.js';
import { AlertGroupStore } from './services/alert-group-store.js';
import { MaintenanceStore } from './services/maintenance-store.js';
import { ChannelCrypto } from './services/channel-crypto.js';
import { createPrismaRepos, type AlertingRepos } from './repository.js';
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

  // 3. Persistence (Step 3 S154) — Postgres when configured, in-memory otherwise (dev only)
  let prisma: PrismaClient | undefined;
  let repos: AlertingRepos | undefined;
  if (config.TI_DATABASE_URL) {
    prisma = new PrismaClient();
    await prisma.$connect(); // fail startup if the DB is unreachable
    repos = createPrismaRepos(prisma, new ChannelCrypto(config.TI_ALERTING_ENCRYPTION_KEY!));
    logger.info('Alerting persistence: Postgres');
  } else {
    logger.warn('Alerting persistence: memory (dev only, data lost on restart)');
  }

  // 4. Core services
  const ruleStore = new RuleStore(repos?.rules);
  const alertStore = new AlertStore(repos?.alerts, config.TI_ALERT_MAX_PER_TENANT, 5); // 5-minute dedup window
  const channelStore = new ChannelStore(repos?.channels);
  const escalationStore = new EscalationStore(repos?.escalations);
  const ruleEngine = new RuleEngine();
  const notifier = new Notifier();
  const alertHistory = new AlertHistory(repos?.history);
  const alertGroupStore = new AlertGroupStore(repos?.groups, 30); // 30-minute group window
  const maintenanceStore = new MaintenanceStore(repos?.maintenance);

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

  // 7. Periodic maintenance: unsuppress expired alerts
  const maintenanceInterval = setInterval(() => {
    alertStore.unsuppressExpired()
      .then((count) => { if (count > 0) logger.info({ count }, 'Unsuppressed expired alerts'); })
      .catch((err) => logger.warn({ err }, 'Unsuppress sweep failed'));
  }, 60_000);

  // 7. Build Fastify app with DI
  const app = await buildApp({
    config,
    ruleDeps: { ruleStore, ruleEngine },
    alertDeps: { alertStore, alertHistory },
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
    await prisma?.$disconnect();
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
