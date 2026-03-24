/**
 * @module index
 * @description Entry point for caching-service. Wires all dependencies,
 * starts cron jobs, and launches the Fastify server.
 */
import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { createRedisClient, CacheService } from '@etip/shared-cache';
import { buildApp } from './app.js';
import { CacheManager } from './services/cache-manager.js';
import { CacheInvalidator } from './services/cache-invalidator.js';
import { ArchiveStore } from './services/archive-store.js';
import { ArchiveEngine } from './services/archive-engine.js';
import { createMinioClient, ensureBucket, pingMinio } from './services/minio-client.js';
import { EventListenerWorker } from './workers/event-listener.js';
import * as cron from 'node-cron';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting caching-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Redis + CacheService
  const redis = createRedisClient(config.TI_REDIS_URL);
  const cacheService = new CacheService(redis);
  logger.info('Redis connected');

  // 4. MinIO client
  const minioClient = createMinioClient(config);
  try {
    await ensureBucket(minioClient, config.TI_MINIO_BUCKET);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'MinIO bucket setup deferred — will retry on archive runs');
  }

  // 5. Core services
  const cacheManager = new CacheManager({ redis, cacheService });
  const cacheInvalidator = new CacheInvalidator({ cacheManager });
  const archiveStore = new ArchiveStore();
  const archiveEngine = new ArchiveEngine(minioClient, archiveStore, {
    bucket: config.TI_MINIO_BUCKET,
    ageDays: config.TI_ARCHIVE_AGE_DAYS,
    retentionDays: config.TI_ARCHIVE_RETENTION_DAYS,
    batchSize: config.TI_ARCHIVE_BATCH_SIZE,
    cronExpression: config.TI_ARCHIVE_CRON,
  });

  // 6. Start background processes
  cacheInvalidator.start();
  archiveEngine.startCron();

  // 6b. BullMQ event listener — consumes invalidation events from other services
  const eventListener = new EventListenerWorker({
    cacheInvalidator,
    redisUrl: config.TI_REDIS_URL,
  });
  eventListener.start();

  // 7. Cache warming cron (P0 improvement #2)
  const warmTask = cron.schedule(config.TI_CACHE_WARM_CRON, () => {
    void cacheManager.warmDashboard(config.TI_ANALYTICS_URL);
  });
  logger.info({ cron: config.TI_CACHE_WARM_CRON }, 'Cache warming cron started');

  // 8. Periodic maintenance: retention enforcement every 6 hours
  const retentionInterval = setInterval(() => {
    void archiveEngine.enforceRetention();
  }, 6 * 3600 * 1000);

  // 9. Build Fastify app with DI
  const app = await buildApp({
    config,
    healthDeps: {
      cacheManager,
      minioConnected: () => pingMinio(minioClient),
    },
    cacheDeps: {
      cacheManager,
      cacheInvalidator,
      analyticsUrl: config.TI_ANALYTICS_URL,
    },
    archiveDeps: {
      archiveEngine,
      archiveStore,
    },
  });

  // 10. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down caching-service...');
    warmTask.stop();
    clearInterval(retentionInterval);
    archiveEngine.stopCron();
    await eventListener.stop();
    await cacheInvalidator.stop();
    await app.close();
    await redis.quit();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 11. Start listening
  await app.listen({ port: config.TI_SERVICE_PORT, host: config.TI_SERVICE_HOST });
  logger.info({ port: config.TI_SERVICE_PORT }, 'Caching service ready');
}

main().catch((err) => {
  console.error('Failed to start caching-service:', err);
  process.exit(1);
});
