import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { IOCRepository } from './repository.js';
import { createNormalizeQueue, createEnrichQueue, closeNormalizeQueue } from './queue.js';
import { createNormalizeWorker } from './workers/normalize-worker.js';
import { createLifecycleWorker } from './workers/lifecycle-worker.js';
import { createGlobalNormalizeWorker } from './workers/global-normalize-worker.js';
import { createGlobalEnrichWorker } from './workers/global-enrich-worker.js';
import { ShodanClient } from './enrichment/shodan-client.js';
import { GreyNoiseClient } from './enrichment/greynoise-client.js';
import { configureClassifier } from './service.js';
import { BloomManager } from './bloom.js';
import { QUEUES } from '@etip/shared-utils';
import { Queue } from 'bullmq';
import { EventEmitter } from 'node:events';
import Redis from 'ioredis';

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

  // ── Bloom Filter Initialization (optional, gated by TI_BLOOM_ENABLED) ──
  let bloomManager: BloomManager | undefined;
  if (config.TI_BLOOM_ENABLED) {
    const redisUrl = new URL(config.TI_REDIS_URL);
    const redisPwd = decodeURIComponent(redisUrl.password || '');
    const bloomRedis = new Redis({
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisPwd || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    bloomManager = new BloomManager({
      redis: bloomRedis as unknown as import('@etip/shared-utils').BloomRedisClient,
      logger,
      expectedItems: config.TI_BLOOM_EXPECTED_ITEMS,
      falsePositiveRate: config.TI_BLOOM_FP_RATE,
    });
    logger.info({
      expectedItems: config.TI_BLOOM_EXPECTED_ITEMS,
      fpRate: config.TI_BLOOM_FP_RATE,
      warmOnBoot: config.TI_BLOOM_WARM_ON_BOOT,
    }, 'Bloom filter: ENABLED');
  } else {
    logger.info('Bloom filter: DISABLED');
  }

  const app = await buildApp({ config, repo, bloomManager });

  // Start BullMQ worker to process normalization jobs
  const worker = createNormalizeWorker({ repo, logger, bloomManager });

  // Start lifecycle cron worker (ACTIVE→AGING→EXPIRED→ARCHIVED)
  const lifecycleTask = createLifecycleWorker(repo, logger);

  // ── Bloom Filter Warm-Up on Boot ────────────────────────────────
  if (bloomManager && config.TI_BLOOM_WARM_ON_BOOT) {
    // Warm up in the background — don't block server startup
    const fetchHashes = (tenantId: string, skip: number, take: number) =>
      repo.findDedupeHashes(tenantId, skip, take);

    // Warm global tenant filter (system tenant)
    bloomManager.warmUp('00000000-0000-0000-0000-000000000000', fetchHashes).catch((err) => {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Bloom warm-up failed for system tenant — non-critical');
    });
  }

  // ── Global Feed Processing Workers (DECISION-029 Phase B2+C) ─────
  const globalWorkerCleanup: (() => Promise<void>)[] = [];
  const globalEnabled = process.env.TI_GLOBAL_PROCESSING_ENABLED === 'true';

  if (globalEnabled) {
    const redisUrl = new URL(config.TI_REDIS_URL);
    const redisPwd = decodeURIComponent(redisUrl.password || '');
    const redisOpts = {
      host: redisUrl.hostname, port: Number(redisUrl.port) || 6379,
      password: redisPwd || undefined, maxRetriesPerRequest: null as null,
      enableReadyCheck: false, lazyConnect: true,
    };

    // Queues for downstream pipeline
    const enrichGlobalQueue = new Queue(QUEUES.ENRICH_GLOBAL, { connection: { ...redisOpts } });
    const alertEvaluateQueue = new Queue(QUEUES.ALERT_EVALUATE, { connection: { ...redisOpts } });

    // Global normalize worker: extracts IOCs from articles → upserts → enqueues for enrichment
    const globalNormalizeWorker = createGlobalNormalizeWorker({
      prisma, logger, enrichGlobalQueue,
    });

    // Global enrich worker: Shodan/GreyNoise enrichment → confidence recalc → alert delivery
    const globalEventBus = new EventEmitter();
    const globalEnrichWorker = createGlobalEnrichWorker({
      prisma, logger,
      shodanClient: new ShodanClient(process.env.TI_SHODAN_API_KEY),
      greynoiseClient: new GreyNoiseClient(process.env.TI_GREYNOISE_API_KEY),
      eventEmitter: globalEventBus,
      alertEvaluateQueue,
    });

    globalWorkerCleanup.push(
      () => globalNormalizeWorker.close(),
      () => globalEnrichWorker.close(),
      () => enrichGlobalQueue.close(),
      () => alertEvaluateQueue.close(),
    );

    logger.info('Global processing workers: ENABLED — normalize + enrich workers started');
  } else {
    logger.info('Global processing workers: DISABLED');
  }

  app.addHook('onClose', async () => {
    lifecycleTask.stop();
    await worker.close();
    await Promise.all(globalWorkerCleanup.map(fn => fn()));
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
