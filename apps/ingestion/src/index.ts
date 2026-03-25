import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { FeedRepository } from './repository.js';
import { createFeedFetchQueue, closeFeedFetchQueue } from './queue.js';
import { createFeedFetchWorker } from './workers/feed-fetch.js';
import { FeedScheduler } from './workers/scheduler.js';
import { FeedPolicyStore } from './services/feed-policy-store.js';

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
  const policyStore = new FeedPolicyStore();

  const app = await buildApp({ config, repo, queue, policyStore });

  // Start BullMQ worker to process feed fetch jobs (with DB for article persistence)
  const worker = createFeedFetchWorker({ repo, logger, db: prisma, policyStore });

  // Start cron scheduler to enqueue feeds on their schedule
  const scheduler = new FeedScheduler({ repo, queue, logger });
  await scheduler.start();

  // Daily reset of per-feed article counters — fires at midnight UTC
  const midnightResetInterval = scheduleMidnightReset(policyStore, logger);

  app.addHook('onClose', async () => {
    clearInterval(midnightResetInterval);
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

/**
 * Schedule a daily reset of all FeedPolicy article counters.
 * Calculates ms until the next UTC midnight and sets a recurring 24-hour interval.
 */
function scheduleMidnightReset(policyStore: FeedPolicyStore, logger: ReturnType<typeof import('./logger.js').initLogger>): ReturnType<typeof setInterval> {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  const runReset = (): void => {
    const n = policyStore.resetAll();
    logger.info({ policiesReset: n }, 'Daily feed policy counters reset at midnight UTC');
  };

  // Fire once at midnight then repeat every 24 hours
  const timeout = setTimeout(() => {
    runReset();
    setInterval(runReset, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  logger.info({ msUntilMidnight }, 'Midnight feed policy reset scheduled');

  // Return the timeout handle so onClose can clear it before it fires
  return timeout as unknown as ReturnType<typeof setInterval>;
}
