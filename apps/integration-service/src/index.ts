import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { IntegrationStore } from './services/integration-store.js';
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

  // 3. In-memory store + field mapper injection (P0 #2)
  const store = new IntegrationStore();
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

  // 6. P1 services
  const webhookRetryEngine = new WebhookRetryEngine(store, webhookService, {
    maxRetries: config.TI_INTEGRATION_WEBHOOK_MAX_RETRIES,
    baseDelayMs: config.TI_INTEGRATION_SIEM_RETRY_DELAY_MS,
    maxDelayMs: config.TI_INTEGRATION_WEBHOOK_MAX_DELAY_MS,
  });
  const fieldMappingStore = new FieldMappingStore();
  const templateEngine = new TemplateEngine();
  const stixCollectionStore = new StixCollectionStore();
  const exportScheduler = new ExportScheduler(bulkExport);

  // 7. P2 services
  const credentialEncryption = new CredentialEncryption(config.TI_INTEGRATION_ENCRYPTION_KEY);
  const healthScoring = new HealthScoring(store, rateLimiter);
  const auditTrail = new AuditTrail();
  const rateLimitTracker = new RateLimitTracker(rateLimiter);
  const credentialRotation = new CredentialRotationService(store, credentialEncryption);
  const alertRoutingEngine = new AlertRoutingEngine();

  // 8. Build Fastify app
  const app = await buildApp({
    config,
    routeDeps: { store, siemAdapter, ticketingService, healthDashboard, rateLimiter, webhookRetryEngine },
    webhookDeps: { store, webhookService },
    exportDeps: { store, stixExport, bulkExport, ticketingService },
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

  // 10. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down integration-service...');
    await eventRouter.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 11. Start listening
  await app.listen({ port: config.TI_INTEGRATION_PORT, host: config.TI_INTEGRATION_HOST });
  logger.info({ port: config.TI_INTEGRATION_PORT }, 'Integration service ready');
}

main().catch((err) => {
  console.error('Failed to start integration-service:', err);
  process.exit(1);
});
