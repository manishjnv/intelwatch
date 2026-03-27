/**
 * @module GlobalFetchBase
 * @description DRY shared logic for all global feed fetch workers (DECISION-029 Phase B1).
 * Each connector-specific worker is a thin wrapper around createGlobalFetchWorker().
 *
 * All global workers:
 *  - Consume FEED_FETCH_GLOBAL_* queues
 *  - Read from GlobalFeedCatalog, write to global_articles
 *  - Track consecutive failures → auto-disable at 5
 *  - Rate-limit per feed via Redis
 *  - Gated by TI_GLOBAL_PROCESSING_ENABLED feature flag
 */
import { Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { EVENTS, AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { PrismaClient, GlobalFeedCatalog } from '@prisma/client';
import type { ConnectorResult } from '../connectors/rss.js';
import { RSSConnector } from '../connectors/rss.js';
import { NVDConnector } from '../connectors/nvd.js';
import { TAXIIConnector } from '../connectors/taxii.js';
import { RestAPIConnector } from '../connectors/rest-api.js';
import { MISPConnector } from '../connectors/misp.js';

export type GlobalConnectorType = 'rss' | 'nvd' | 'stix' | 'rest' | 'misp';

export interface GlobalFetchJobData {
  globalFeedId: string;
}

export interface GlobalFetchResult {
  globalFeedId: string;
  articlesInserted: number;
  articlesSkipped: number;
  status: 'success' | 'skipped' | 'failure';
  error?: string;
}

export interface GlobalFetchWorkerConfig {
  queueName: string;
  connectorType: GlobalConnectorType;
  concurrency: number;
  rateLimitSeconds: number;
}

export interface GlobalFetchWorkerDeps {
  db: PrismaClient;
  logger: pino.Logger;
  redisUrl: string;
}

const MAX_CONSECUTIVE_FAILURES = 5;

export interface GlobalFetchWorkerResult {
  worker: Worker<GlobalFetchJobData, GlobalFetchResult>;
  close(): Promise<void>;
}

/**
 * Create a global feed fetch worker for a specific connector type.
 * Returns the BullMQ Worker instance + close function.
 */
export function createGlobalFetchWorker(
  config: GlobalFetchWorkerConfig,
  deps: GlobalFetchWorkerDeps,
): GlobalFetchWorkerResult {
  const { db, logger } = deps;
  const url = new URL(deps.redisUrl);
  const password = decodeURIComponent(url.password || '');

  const redisOpts = {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: password || undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    lazyConnect: true,
  };

  const rateLimitRedis = new Redis({
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: password || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  // Connector instances (lazy — only the relevant one is used)
  const connectors = {
    rss: new RSSConnector(logger),
    nvd: new NVDConnector(logger),
    stix: new TAXIIConnector(logger),
    rest: new RestAPIConnector(logger),
    misp: new MISPConnector(logger),
  };

  async function processJob(job: Job<GlobalFetchJobData>): Promise<GlobalFetchResult> {
    const { globalFeedId } = job.data;
    const log = logger.child({ globalFeedId, queue: config.queueName });

    // 1. Load catalog entry
    const entry = await db.globalFeedCatalog.findUnique({ where: { id: globalFeedId } });
    if (!entry) {
      log.warn('Global feed catalog entry not found — skipping');
      return { globalFeedId, articlesInserted: 0, articlesSkipped: 0, status: 'skipped' };
    }
    if (!entry.enabled) {
      log.warn('Global feed is disabled — skipping');
      return { globalFeedId, articlesInserted: 0, articlesSkipped: 0, status: 'skipped' };
    }

    // 2. Rate limit check
    const rateLimitKey = `global-${config.connectorType}-${globalFeedId}-lastfetch`;
    const lastFetch = await rateLimitRedis.get(rateLimitKey);
    if (lastFetch) {
      const elapsed = Date.now() - parseInt(lastFetch, 10);
      if (elapsed < config.rateLimitSeconds * 1000) {
        log.info({ elapsedMs: elapsed, limitMs: config.rateLimitSeconds * 1000 },
          'Rate limited — skipping fetch');
        return { globalFeedId, articlesInserted: 0, articlesSkipped: 0, status: 'skipped' };
      }
    }

    try {
      // 3. Fetch via connector
      const fetchResult = await routeToConnector(config.connectorType, entry, connectors);

      // 4. Dedupe + insert
      let inserted = 0;
      let skipped = 0;

      for (const article of fetchResult.articles) {
        if (!article.url) { skipped++; continue; }

        const existing = await db.globalArticle.findFirst({
          where: { globalFeedId, url: article.url },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await db.globalArticle.create({
          data: {
            globalFeedId,
            title: article.title.slice(0, 1000),
            content: article.content || null,
            url: article.url,
            publishedAt: article.publishedAt,
            pipelineStatus: 'pending',
            triageResult: article.rawMeta ? (article.rawMeta as object) : undefined,
          },
        });
        inserted++;
      }

      // 5. Update catalog stats
      await db.globalFeedCatalog.update({
        where: { id: globalFeedId },
        data: {
          lastFetchAt: new Date(),
          consecutiveFailures: 0,
          totalItemsIngested: { increment: inserted },
        },
      });

      // 6. Set rate limit key
      await rateLimitRedis.set(rateLimitKey, String(Date.now()), 'EX', config.rateLimitSeconds);

      log.info({ inserted, skipped, total: fetchResult.articles.length }, 'Global feed fetch completed');
      return { globalFeedId, articlesInserted: inserted, articlesSkipped: skipped, status: 'success' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ error: message }, 'Global feed fetch failed');

      // 7. Increment consecutive failures
      const updated = await db.globalFeedCatalog.update({
        where: { id: globalFeedId },
        data: { consecutiveFailures: { increment: 1 } },
      });

      // 8. Disable after MAX_CONSECUTIVE_FAILURES
      if (updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await db.globalFeedCatalog.update({
          where: { id: globalFeedId },
          data: { enabled: false },
        });
        log.warn({ failures: updated.consecutiveFailures }, 'Feed disabled after consecutive failures');
        // Emit QUEUE_ALERT (via log — actual event bus integration in future phase)
        log.warn({ event: EVENTS.QUEUE_ALERT, globalFeedId }, 'QUEUE_ALERT: feed auto-disabled');
      }

      return { globalFeedId, articlesInserted: 0, articlesSkipped: 0, status: 'failure', error: message };
    }
  }

  const worker = new Worker<GlobalFetchJobData, GlobalFetchResult>(
    config.queueName, processJob,
    { connection: { ...redisOpts }, concurrency: config.concurrency },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, queue: config.queueName, error: err.message }, 'Global fetch job failed');
  });
  worker.on('error', (err) => {
    logger.error({ queue: config.queueName, error: err.message }, 'Global fetch worker error');
  });

  logger.info({ queue: config.queueName, concurrency: config.concurrency, connector: config.connectorType },
    'Global fetch worker started');

  return {
    worker,
    async close() {
      await worker.close();
      await rateLimitRedis.quit();
    },
  };
}

/** Route to the appropriate connector based on type */
async function routeToConnector(
  type: GlobalConnectorType,
  entry: GlobalFeedCatalog,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectors: Record<GlobalConnectorType, { fetch: (...args: any[]) => Promise<ConnectorResult> }>,
): Promise<ConnectorResult> {
  const headers = (entry.headers as Record<string, string>) ?? {};
  const parseConfig = (entry.parseConfig as Record<string, unknown>) ?? {};

  switch (type) {
    case 'rss':
      return connectors.rss.fetch({ url: entry.url, headers });
    case 'nvd':
      return (connectors.nvd as NVDConnector).fetch({
        apiKey: parseConfig.apiKey as string | undefined,
        pubStartDate: parseConfig.pubStartDate as string | undefined,
        pubEndDate: parseConfig.pubEndDate as string | undefined,
      });
    case 'stix':
      return (connectors.stix as TAXIIConnector).fetch({
        taxiiUrl: entry.url,
        collectionId: parseConfig.collectionId as string | undefined,
        addedAfter: parseConfig.addedAfter as string | undefined,
      });
    case 'rest':
      return (connectors.rest as RestAPIConnector).fetch({
        feedMeta: { url: entry.url, ...parseConfig },
      });
    case 'misp':
      return (connectors.misp as MISPConnector).fetch({
        baseUrl: entry.url,
        apiKey: headers.Authorization ?? (parseConfig.apiKey as string) ?? '',
        publishedAfter: parseConfig.publishedAfter as string | undefined,
      });
    default:
      throw new AppError(400, `Unsupported global connector type: ${type}`, 'CONNECTOR_UNSUPPORTED');
  }
}
