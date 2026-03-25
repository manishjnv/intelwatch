import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { IOCRepository } from './repository.js';
import { createNormalizeQueue, createEnrichQueue, closeNormalizeQueue } from './queue.js';
import { createNormalizeWorker } from './workers/normalize-worker.js';
import { createLifecycleWorker } from './workers/lifecycle-worker.js';
import { configureClassifier } from './service.js';

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

  // G4b: Extend severity classifier from env vars (DECISION-013 compliant — no migration)
  configureClassifier({
    extraRansomwareFamilies: process.env.TI_EXTRA_RANSOMWARE_FAMILIES?.split(',').map(s => s.trim()).filter(Boolean),
    extraNationStateActors: process.env.TI_EXTRA_NATION_STATE_ACTORS?.split(',').map(s => s.trim()).filter(Boolean),
  });

  const repo = new IOCRepository(prisma);
  createNormalizeQueue();
  createEnrichQueue();

  const app = await buildApp({ config, repo });

  // Start BullMQ worker to process normalization jobs
  const worker = createNormalizeWorker({ repo, logger });

  // Start lifecycle cron worker (ACTIVE→AGING→EXPIRED→ARCHIVED)
  const lifecycleTask = createLifecycleWorker(repo, logger);

  app.addHook('onClose', async () => {
    lifecycleTask.stop();
    await worker.close();
    await closeNormalizeQueue();
    await disconnectPrisma();
  });

  try {
    const address = await app.listen({ port: config.TI_NORMALIZATION_PORT, host: config.TI_NORMALIZATION_HOST });
    logger.info(`ETIP Normalization Service listening at ${address}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Normalization Service');
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
