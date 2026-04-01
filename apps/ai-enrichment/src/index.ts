import { Redis as IORedis } from 'ioredis';
import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { EnrichmentRepository } from './repository.js';
import { EnrichmentService } from './service.js';
import { VirusTotalProvider } from './providers/virustotal.js';
import { AbuseIPDBProvider } from './providers/abuseipdb.js';
import { HaikuTriageProvider } from './providers/haiku-triage.js';
import { EnrichmentCostTracker } from './cost-tracker.js';
import { CostPersistence } from './cost-persistence.js';
import { BatchEnrichmentService } from './batch-enrichment.js';
import { ReEnrichScheduler } from './workers/re-enrich-scheduler.js';
import { GoogleSafeBrowsingProvider } from './providers/google-safe-browsing.js';
import { createVTRateLimiter, createAbuseIPDBRateLimiter, createGSBRateLimiter } from './rate-limiter.js';
import { createEnrichQueue, closeEnrichQueue, getEnrichQueue, createDownstreamQueues, closeDownstreamQueues } from './queue.js';
import { createEnrichWorker } from './workers/enrich-worker.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = initLogger(config.TI_LOG_LEVEL);

  loadJwtConfig({
    TI_JWT_SECRET: config.TI_JWT_SECRET,
    TI_JWT_ISSUER: config.TI_JWT_ISSUER,
    TI_JWT_ACCESS_EXPIRY: String(config.TI_JWT_ACCESS_EXPIRY),
    TI_JWT_REFRESH_EXPIRY: String(config.TI_JWT_REFRESH_EXPIRY),
  });
  loadServiceJwtSecret({ TI_SERVICE_JWT_SECRET: config.TI_SERVICE_JWT_SECRET });

  // Providers with rate limiting
  const vtLimiter = createVTRateLimiter(config.TI_VT_RATE_LIMIT_PER_MIN, logger);
  const abuseLimiter = createAbuseIPDBRateLimiter(config.TI_ABUSEIPDB_RATE_LIMIT_PER_DAY, logger);
  const vtProvider = new VirusTotalProvider(config.TI_VIRUSTOTAL_API_KEY, vtLimiter, logger);
  const abuseProvider = new AbuseIPDBProvider(config.TI_ABUSEIPDB_API_KEY, abuseLimiter, logger);

  // Google Safe Browsing (null when API key not configured)
  const gsbLimiter = createGSBRateLimiter(config.TI_GSB_RATE_LIMIT_PER_DAY, logger);
  const gsbProvider = config.TI_GSB_API_KEY
    ? new GoogleSafeBrowsingProvider(config.TI_GSB_API_KEY, gsbLimiter, logger)
    : null;

  // Haiku triage (null when API key not configured)
  const haikuProvider = config.TI_ANTHROPIC_API_KEY
    ? new HaikuTriageProvider(config.TI_ANTHROPIC_API_KEY, config.TI_AI_ENABLED, logger, config.TI_HAIKU_MODEL)
    : null;

  // Cost tracker (in-memory per DECISION-013 + Postgres dual-write for Command Center)
  const costTracker = new EnrichmentCostTracker();
  costTracker.setPrisma(prisma);

  // #14 Cost Persistence — Redis flush/reload
  let costPersistence: CostPersistence | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redis: any = null;
  if (config.TI_COST_PERSISTENCE_ENABLED) {
    try {
      redis = new IORedis(config.TI_REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
      costPersistence = new CostPersistence(redis, costTracker, logger);
      await costPersistence.loadFromRedis();
      costPersistence.startPeriodicFlush();
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Cost persistence init failed — continuing without');
    }
  }

  // #13 Batch Enrichment Service (client reuses Anthropic SDK from haiku provider)
  const batchService = config.TI_BATCH_ENABLED && config.TI_ANTHROPIC_API_KEY
    ? new BatchEnrichmentService(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { batches: (haikuProvider as any)?.client?.batches ?? null } as any,
        config.TI_HAIKU_MODEL, costTracker, logger, config.TI_BATCH_MIN_SIZE,
      )
    : null;

  const repo = new EnrichmentRepository(prisma);
  const service = new EnrichmentService(
    repo, vtProvider, abuseProvider, haikuProvider, costTracker,
    config.TI_AI_ENABLED, logger, undefined, undefined, gsbProvider,
  );

  createEnrichQueue();
  const downstream = createDownstreamQueues();
  logger.info({
    graphSync: !!downstream.graphSync,
    iocIndex: !!downstream.iocIndex,
    correlate: !!downstream.correlate,
  }, 'Downstream queues initialized');

  const app = await buildApp({ config, repo, costTracker, batchService });
  const worker = createEnrichWorker({ service, logger, downstream });

  // #15 Re-enrichment Scheduler
  const scheduler = new ReEnrichScheduler(
    repo, getEnrichQueue(), logger,
    config.TI_REENRICH_INTERVAL_MS,
  );
  scheduler.start();

  app.addHook('onClose', async () => {
    scheduler.stop();
    if (costPersistence) await costPersistence.stop();
    await worker.close();
    await closeDownstreamQueues();
    await closeEnrichQueue();
    if (redis) await redis.quit();
    await disconnectPrisma();
  });

  try {
    const address = await app.listen({ port: config.TI_ENRICHMENT_PORT, host: config.TI_ENRICHMENT_HOST });
    logger.info(`ETIP AI Enrichment Service listening at ${address}`);
    if (haikuProvider) {
      logger.info({ model: config.TI_HAIKU_MODEL, budget: config.TI_ENRICHMENT_DAILY_BUDGET_USD }, 'Haiku triage enabled');
    }
  } catch (err) {
    logger.fatal({ err }, 'Failed to start AI Enrichment Service');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    try { await app.close(); logger.info('Server closed'); process.exit(0); }
    catch (err) { logger.error({ err }, 'Error during shutdown'); process.exit(1); }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => { console.error('Fatal startup error:', err); process.exit(1); });
