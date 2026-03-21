import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { EnrichmentRepository } from './repository.js';
import { EnrichmentService } from './service.js';
import { VirusTotalProvider } from './providers/virustotal.js';
import { AbuseIPDBProvider } from './providers/abuseipdb.js';
import { createVTRateLimiter, createAbuseIPDBRateLimiter } from './rate-limiter.js';
import { createEnrichQueue, closeEnrichQueue } from './queue.js';
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

  const repo = new EnrichmentRepository(prisma);
  const service = new EnrichmentService(repo, vtProvider, abuseProvider, config.TI_AI_ENABLED, logger);

  createEnrichQueue();
  const app = await buildApp({ config, repo });
  const worker = createEnrichWorker({ service, logger });

  app.addHook('onClose', async () => {
    await worker.close();
    await closeEnrichQueue();
    await disconnectPrisma();
  });

  try {
    const address = await app.listen({ port: config.TI_ENRICHMENT_PORT, host: config.TI_ENRICHMENT_HOST });
    logger.info(`ETIP AI Enrichment Service listening at ${address}`);
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
