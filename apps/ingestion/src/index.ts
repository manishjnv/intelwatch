import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { FeedRepository } from './repository.js';
import { createFeedFetchQueues, closeFeedFetchQueues } from './queue.js';
import { createFeedFetchWorkers } from './workers/feed-fetch.js';
import { FeedScheduler } from './workers/scheduler.js';
import { FeedPolicyStore } from './services/feed-policy-store.js';
import { createGlobalRSSWorker } from './workers/global-rss-worker.js';
import { createGlobalNVDWorker } from './workers/global-nvd-worker.js';
import { createGlobalSTIXWorker } from './workers/global-stix-worker.js';
import { createGlobalRESTWorker } from './workers/global-rest-worker.js';
import { createGlobalMISPWorker } from './workers/global-misp-worker.js';
import { GlobalFeedScheduler } from './schedulers/global-feed-scheduler.js';
import { QUEUES } from '@etip/shared-utils';
import { Queue } from 'bullmq';

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
  const queues = createFeedFetchQueues();
  const policyStore = new FeedPolicyStore();

  const app = await buildApp({ config, repo, queue: queues.values().next().value!, policyStore });

  // Start 4 per-feed-type BullMQ workers (P3-4) with per-tenant fairness (P3-7)
  const workerResult = createFeedFetchWorkers({ repo, logger, db: prisma, policyStore });

  // Start cron scheduler to enqueue feeds on their schedule (routes to per-type queues)
  const scheduler = new FeedScheduler({ repo, queues, logger });
  await scheduler.start();

  // Daily reset of per-feed article counters — fires at midnight UTC
  const midnightResetInterval = scheduleMidnightReset(policyStore, logger);

  // ── Global Feed Processing (DECISION-029 Phase B1) ─────────────────
  const globalWorkers: { close(): Promise<void> }[] = [];
  const globalEnabled = process.env.TI_GLOBAL_PROCESSING_ENABLED === 'true';

  if (globalEnabled) {
    const globalDeps = { db: prisma, logger, redisUrl: config.TI_REDIS_URL };
    globalWorkers.push(
      createGlobalRSSWorker(globalDeps),
      createGlobalNVDWorker(globalDeps),
      createGlobalSTIXWorker(globalDeps),
      createGlobalRESTWorker(globalDeps),
      createGlobalMISPWorker(globalDeps),
    );

    const globalUrl = new URL(config.TI_REDIS_URL);
    const globalPwd = decodeURIComponent(globalUrl.password || '');
    const globalRedisOpts = {
      host: globalUrl.hostname, port: Number(globalUrl.port) || 6379,
      password: globalPwd || undefined, maxRetriesPerRequest: null as null,
      enableReadyCheck: false, lazyConnect: true,
    };
    const globalQueues: Record<string, Queue> = {
      [QUEUES.FEED_FETCH_GLOBAL_RSS]: new Queue(QUEUES.FEED_FETCH_GLOBAL_RSS, { connection: { ...globalRedisOpts } }),
      [QUEUES.FEED_FETCH_GLOBAL_NVD]: new Queue(QUEUES.FEED_FETCH_GLOBAL_NVD, { connection: { ...globalRedisOpts } }),
      [QUEUES.FEED_FETCH_GLOBAL_STIX]: new Queue(QUEUES.FEED_FETCH_GLOBAL_STIX, { connection: { ...globalRedisOpts } }),
      [QUEUES.FEED_FETCH_GLOBAL_REST]: new Queue(QUEUES.FEED_FETCH_GLOBAL_REST, { connection: { ...globalRedisOpts } }),
    };
    const globalScheduler = new GlobalFeedScheduler({ db: prisma, queues: globalQueues, logger });
    globalScheduler.start();

    logger.info(`Global feed processing: ENABLED — ${globalWorkers.length} workers registered`);
  } else {
    logger.info('Global feed processing: DISABLED');
  }

  app.addHook('onClose', async () => {
    clearInterval(midnightResetInterval);
    await scheduler.stop();
    await workerResult.close(); // Closes workers + fairnessRedis + normalizeQueue
    await Promise.all(globalWorkers.map((w) => w.close()));
    await closeFeedFetchQueues();
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
