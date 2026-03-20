import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { FeedRepository } from './repository.js';
import { createFeedFetchQueue, closeFeedFetchQueue } from './queue.js';
import { createFeedFetchWorker } from './workers/feed-fetch.js';
import { FeedScheduler } from './workers/scheduler.js';

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

  const repo = new FeedRepository(prisma);
  const queue = createFeedFetchQueue();

  const app = await buildApp({ config, repo, queue });

  // Start BullMQ worker to process feed fetch jobs
  const worker = createFeedFetchWorker({ repo, logger });

  // Start cron scheduler to enqueue feeds on their schedule
  const scheduler = new FeedScheduler({ repo, queue, logger });
  await scheduler.start();

  app.addHook('onClose', async () => {
    await scheduler.stop();
    await worker.close();
    await closeFeedFetchQueue();
    await disconnectPrisma();
  });

  try {
    const address = await app.listen({ port: config.TI_INGESTION_PORT, host: config.TI_INGESTION_HOST });
    logger.info(`ETIP Ingestion Service listening at ${address}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Ingestion Service');
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
