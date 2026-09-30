import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { prisma, disconnectPrisma } from './prisma.js';
import { IntegrationStore } from './services/integration-store.js';
import { createPrismaRecordsRepo } from './services/records-repo-prisma.js';
import { createPrismaDocRepo } from './services/doc-repo-prisma.js';
import { createIocExportFetcher } from './services/ioc-client.js';
import { FieldMapper } from './services/field-mapper.js';
import { SiemAdapter } from './services/siem-adapter.js';
import { WebhookService } from './services/webhook-service.js';
import { TicketingService } from './services/ticketing-service.js';
import { StixExportService } from './services/stix-export.js';
import { BulkExportService } from './services/bulk-export.js';
import { EventRouter } from './services/event-router.js';
import { CredentialEncryption } from './services/credential-encryption.js';
import { IntegrationRateLimiter } from './services/rate-limiter.js';
import { HealthDashboard } from './services/health-dashboard.js';
import { WebhookRetryEngine } from './services/webhook-retry.js';
import { FieldMappingStore } from './services/field-mapping-store.js';
import { TemplateEngine } from './services/template-engine.js';
import { StixCollectionStore } from './services/stix-collection-store.js';
import { ExportScheduler } from './services/export-scheduler.js';
import { HealthScoring } from './services/health-scoring.js';
import { AuditTrail } from './services/audit-trail.js';
import { RateLimitTracker } from './services/rate-limit-tracker.js';
import { CredentialRotationService } from './services/credential-rotation.js';
import { AlertRoutingEngine } from './services/alert-routing-engine.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);

  logger.info('Starting integration-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Store (integrations cached + write-through; logs/deliveries/tickets go straight
  // to Postgres via the records repo, Step 3 S156) + field mapper injection (P0 #2)
  const store = new IntegrationStore(createPrismaRecordsRepo(prisma));
  const fieldMapper = new FieldMapper();
  store.setFieldMapper(fieldMapper);

  // 4. Core services
  const siemAdapter = new SiemAdapter(store, fieldMapper, config);
  const webhookService = new WebhookService(store, config);
  const ticketingService = new TicketingService(store, fieldMapper);
  const stixExport = new StixExportService();
  const bulkExport = new BulkExportService(stixExport);

  // 5. P0 services
  const rateLimiter = new IntegrationRateLimiter(config.TI_INTEGRATION_RATE_LIMIT_PER_MIN);
  const healthDashboard = new HealthDashboard(store, rateLimiter);
  const eventRouter = new EventRouter(store, siemAdapter, webhookService, config.TI_REDIS_URL);

  // 6. P1 services — config/audit stores persist as Postgres JSON documents (Step 3 S157, DECISION-051)
  const webhookRetryEngine = new WebhookRetryEngine(store, webhookService, {
    maxRetries: config.TI_INTEGRATION_WEBHOOK_MAX_RETRIES,
    baseDelayMs: config.TI_INTEGRATION_SIEM_RETRY_DELAY_MS,
    maxDelayMs: config.TI_INTEGRATION_WEBHOOK_MAX_DELAY_MS,
  }, createPrismaDocRepo(prisma, 'webhook_retry_config'));
  const fieldMappingStore = new FieldMappingStore(createPrismaDocRepo(prisma, 'field_mapping_preset'));
  const templateEngine = new TemplateEngine(createPrismaDocRepo(prisma, 'ticket_template'));
  const stixCollectionStore = new StixCollectionStore(
    createPrismaDocRepo(prisma, 'taxii_collection'),
    createPrismaDocRepo(prisma, 'taxii_objects'),
  );
  const fetchExportRecords = createIocExportFetcher(config.TI_IOC_SERVICE_URL, logger);
  const exportScheduler = new ExportScheduler(
    bulkExport,
    fetchExportRecords,
    createPrismaDocRepo(prisma, 'export_schedule'),
    createPrismaDocRepo(prisma, 'export_run'),
  );

  // 7. P2 services
  const credentialEncryption = new CredentialEncryption(config.TI_INTEGRATION_ENCRYPTION_KEY);
  store.setCredentialEncryption(credentialEncryption);
  const healthScoring = new HealthScoring(store, rateLimiter);
  const auditTrail = new AuditTrail(createPrismaDocRepo(prisma, 'audit_entry'));
  const rateLimitTracker = new RateLimitTracker(rateLimiter);
  const credentialRotation = new CredentialRotationService(
    store, credentialEncryption, createPrismaDocRepo(prisma, 'credential_rotation'),
  );
  const alertRoutingEngine = new AlertRoutingEngine(createPrismaDocRepo(prisma, 'routing_rule'));

  // 7b. Load persisted integrations. Non-blocking (not awaited) — /health serves
  // immediately even if Postgres is still starting; retries with backoff in the background.
  void store.hydrateWithRetry(logger);

  // 8. Build Fastify app
  const app = await buildApp({
    config,
    routeDeps: { store, siemAdapter, ticketingService, healthDashboard, rateLimiter, webhookRetryEngine, webhookService },
    webhookDeps: { store, webhookService },
    exportDeps: { store, stixExport, bulkExport, ticketingService, fetchRecords: fetchExportRecords },
    advancedDeps: { fieldMappingStore, templateEngine, stixCollectionStore, exportScheduler },
    p2Deps: { store, healthScoring, auditTrail, rateLimitTracker, credentialRotation, alertRoutingEngine },
  });

  // 9. Start event router (BullMQ worker)
  try {
    eventRouter.start();
    logger.info('EventRouter started');
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'EventRouter failed to start — service continues without queue worker');
  }

  // 10. Retention: purge old logs/successful deliveries daily (Step 3 S156).
  const retentionInterval = setInterval(() => {
    store.purgeOldRecords(30)
      .then((n) => { if (n > 0) logger.info({ purged: n }, 'Integration records retention purge'); })
      .catch((err: unknown) => logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Retention purge failed'));
  }, 24 * 3600_000);
  retentionInterval.unref();

  // 11. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down integration-service...');
    clearInterval(retentionInterval);
    await eventRouter.stop();
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 12. Start listening
  await app.listen({ port: config.TI_INTEGRATION_PORT, host: config.TI_INTEGRATION_HOST });
  logger.info({ port: config.TI_INTEGRATION_PORT }, 'Integration service ready');
}

main().catch((err) => {
  console.error('Failed to start integration-service:', err);
  process.exit(1);
});
