import { Worker, Queue, DelayedError, type Job } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { FeedRepository } from '../repository.js';
import { RSSConnector, type ConnectorResult } from '../connectors/rss.js';
import { NVDConnector } from '../connectors/nvd.js';
import { TAXIIConnector } from '../connectors/taxii.js';
import { RestAPIConnector } from '../connectors/rest-api.js';
import { MISPConnector, type MISPConnectorResult } from '../connectors/misp.js';
import { BulkFileConnector } from '../connectors/bulk-file.js';
import { getConfig } from '../config.js';
import { ArticlePipeline, type PipelineBatchResult } from './pipeline.js';
import type { FeedPolicyStore } from '../services/feed-policy-store.js';
import { FEED_FETCH_QUEUE_NAMES } from '../queue.js';

export interface FeedFetchJobData {
  feedId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'schedule';
}

export interface FeedFetchResult {
  feedId: string;
  articlesCount: number;
  relevantCount: number;
  duplicateCount: number;
  iocsFound: number;
  fetchDurationMs: number;
  pipelineDurationMs: number;
  totalCostUsd: number;
  status: 'success' | 'failure';
  error?: string;
}

export interface FeedFetchWorkerDeps {
  repo: FeedRepository;
  logger: pino.Logger;
  db: PrismaClient;
  /** Optional policy store — when provided, enforces per-feed daily article caps */
  policyStore?: FeedPolicyStore;
}

/** Redis key prefix for per-tenant active job counter (P3-7) */
const TENANT_ACTIVE_KEY_PREFIX = 'etip-feed-active';
/** Safety TTL for tenant counter — prevents stuck counters from blocking forever */
const TENANT_COUNTER_TTL_SECONDS = 300;

/** Lua script: DECR only if value > 0 (prevents negative counter drift) */
const SAFE_DECR_LUA = `
  local val = tonumber(redis.call('get', KEYS[1]) or '0')
  if val > 0 then return redis.call('decr', KEYS[1]) end
  return 0
`;

export interface FeedFetchWorkersResult {
  workers: Worker<FeedFetchJobData, FeedFetchResult>[];
  /** Close all workers, Redis clients, and queues */
  close(): Promise<void>;
}

/** Per-queue concurrency config mapping */
const QUEUE_CONCURRENCY_MAP: Record<string, keyof import('../config.js').AppConfig> = {
  [QUEUES.FEED_FETCH_RSS]:  'TI_FEED_CONCURRENCY_RSS',
  [QUEUES.FEED_FETCH_NVD]:  'TI_FEED_CONCURRENCY_NVD',
  [QUEUES.FEED_FETCH_STIX]: 'TI_FEED_CONCURRENCY_STIX',
  [QUEUES.FEED_FETCH_REST]: 'TI_FEED_CONCURRENCY_REST',
};

/**
 * Create all 4 per-feed-type workers (P3-4). Each uses the same job processor but
 * different concurrency settings. Includes per-tenant fairness via Redis counters (P3-7).
 */
export function createFeedFetchWorkers(deps: FeedFetchWorkerDeps): FeedFetchWorkersResult {
  const { repo, logger, db, policyStore } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  const redisConnectionOpts = {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: password || undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    lazyConnect: true,
  };

  // Dedicated Redis client for tenant fairness counters
  const fairnessRedis = new Redis({
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: password || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  const normalizeQueue = new Queue(QUEUES.NORMALIZE, {
    connection: { ...redisConnectionOpts },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  const rssConnector = new RSSConnector(logger);
  const nvdConnector = new NVDConnector(logger);
  const taxiiConnector = new TAXIIConnector(logger);
  const restApiConnector = new RestAPIConnector(logger);
  const mispConnector = new MISPConnector(logger);
  const bulkFileConnector = new BulkFileConnector(logger);
  const pipeline = new ArticlePipeline({
    logger, db,
    anthropicApiKey: config.TI_ANTHROPIC_API_KEY,
    aiEnabled: config.TI_AI_ENABLED,
    aiMaxTriagePerFetch: config.TI_AI_MAX_TRIAGE_PER_FETCH,
    aiMaxExtractionPerFetch: config.TI_AI_MAX_EXTRACTION_PER_FETCH,
    aiTriageModel: config.TI_AI_TRIAGE_MODEL,
    aiExtractionModel: config.TI_AI_EXTRACTION_MODEL,
  });

  const maxPerTenant = config.TI_FEED_MAX_CONCURRENT_PER_TENANT;
  const processorDeps = {
    repo, logger, db, policyStore, normalizeQueue, pipeline, config,
    rssConnector, nvdConnector, taxiiConnector, restApiConnector, mispConnector, bulkFileConnector,
  };

  /** Shared processor function used by all 4 workers */
  async function processJob(job: Job<FeedFetchJobData>): Promise<FeedFetchResult> {
    const { tenantId } = job.data;
    const tenantKey = `${TENANT_ACTIVE_KEY_PREFIX}:${tenantId}`;

    // ── P3-7: Per-tenant fairness check ────────────────────────────
    const currentCount = await fairnessRedis.get(tenantKey);
    if (currentCount !== null && parseInt(currentCount, 10) >= maxPerTenant) {
      logger.info(
        { feedId: job.data.feedId, tenantId, currentCount: parseInt(currentCount, 10), maxPerTenant },
        'Tenant at max concurrent jobs — delaying job by 5s',
      );
      await job.moveToDelayed(Date.now() + 5000);
      throw new DelayedError(); // Signal BullMQ to NOT mark job as completed
    }

    // Atomic INCR + EXPIRE via pipeline (W1: prevents orphaned keys on crash)
    const pipe = fairnessRedis.pipeline();
    pipe.incr(tenantKey);
    pipe.expire(tenantKey, TENANT_COUNTER_TTL_SECONDS);
    await pipe.exec();

    try {
      return await executeJobProcessor(
        { feedId: job.data.feedId, tenantId, triggeredBy: job.data.triggeredBy, jobId: job.id ?? 'unknown' },
        processorDeps,
      );
    } finally {
      // Safe DECR — Lua ensures counter never goes below 0 (W2)
      await fairnessRedis.eval(SAFE_DECR_LUA, 1, tenantKey).catch((err) => {
        logger.error({ tenantId, error: (err as Error).message }, 'Failed to decrement tenant counter');
      });
    }
  }

  const workers: Worker<FeedFetchJobData, FeedFetchResult>[] = [];

  for (const queueName of FEED_FETCH_QUEUE_NAMES) {
    const concurrencyKey = QUEUE_CONCURRENCY_MAP[queueName] as keyof typeof config | undefined;
    const concurrency = concurrencyKey ? (config[concurrencyKey] as number) : 3;

    const worker = new Worker<FeedFetchJobData, FeedFetchResult>(queueName, processJob,
      { connection: { ...redisConnectionOpts }, concurrency, limiter: { max: 10, duration: 60_000 } });
    worker.on('failed', (job, err) => { logger.error({ jobId: job?.id, queue: queueName, error: err.message }, 'Feed fetch job failed'); });
    worker.on('error', (err) => { logger.error({ queue: queueName, error: err.message }, 'Feed fetch worker error'); });
    logger.info({ queue: queueName, concurrency }, 'Feed fetch worker started');
    workers.push(worker);
  }

  return { workers, async close() {
    await Promise.all(workers.map((w) => w.close()));
    await normalizeQueue.close(); await fairnessRedis.quit();
  } };
}

function buildEmptyResult(feedId: string): FeedFetchResult {
  return {
    feedId, articlesCount: 0, relevantCount: 0, duplicateCount: 0,
    iocsFound: 0, fetchDurationMs: 0, pipelineDurationMs: 0, totalCostUsd: 0, status: 'success',
  };
}

/** Core job processing logic — shared across all 4 queue workers */
async function executeJobProcessor(
  jobCtx: { feedId: string; tenantId: string; triggeredBy: string; jobId: string },
  deps: {
    repo: FeedRepository; logger: pino.Logger; db: PrismaClient; policyStore?: FeedPolicyStore;
    normalizeQueue: Queue; pipeline: ArticlePipeline; config: import('../config.js').AppConfig;
    rssConnector: RSSConnector; nvdConnector: NVDConnector;
    taxiiConnector: TAXIIConnector; restApiConnector: RestAPIConnector;
    mispConnector: MISPConnector; bulkFileConnector: BulkFileConnector;
  },
): Promise<FeedFetchResult> {
  const { feedId, tenantId, triggeredBy, jobId } = jobCtx;
  const { repo, logger, db, policyStore, normalizeQueue, pipeline, config,
    rssConnector, nvdConnector, taxiiConnector, restApiConnector, mispConnector, bulkFileConnector } = deps;

  logger.info({ feedId, tenantId, triggeredBy, jobId }, 'Processing feed fetch job');

  const feed = await repo.findById(tenantId, feedId);
  if (!feed) throw new AppError(404, `Feed not found: ${feedId}`, 'NOT_FOUND');
  if (!feed.enabled) { logger.warn({ feedId }, 'Skipping disabled feed'); return buildEmptyResult(feedId); }

  if (policyStore?.isCapReached(tenantId, feedId)) {
    const policy = policyStore.getPolicy(tenantId, feedId);
    logger.warn({ feedId, tenantId, currentDayCount: policy?.currentDayCount, dailyLimit: policy?.dailyLimit },
      'Feed daily cap reached — skipping until midnight reset');
    return buildEmptyResult(feedId);
  }

  const feedPolicy = policyStore?.getPolicy(tenantId, feedId);
  const feedAiEnabled = feedPolicy ? feedPolicy.aiEnabled : true;
  if (!feedAiEnabled) logger.info({ feedId, tenantId }, 'Feed policy aiEnabled=false — AI stages skipped');

  try {
    const feedUrl = feed.url ?? '';
    const feedHeaders: Record<string, string> = { ...(feed.headers as Record<string, string>) };
    if (feedUrl.includes('alienvault.com') && config.TI_OTX_API_KEY) {
      feedHeaders['X-OTX-API-Key'] = config.TI_OTX_API_KEY;
    }

    const fetchResult = await routeToConnector(feed.feedType, {
      url: feedUrl, headers: feedHeaders,
      parseConfig: feed.parseConfig as Record<string, unknown> | null,
      rssConnector, nvdConnector, taxiiConnector, restApiConnector, mispConnector, bulkFileConnector, config,
    });

    // Bulk feed types: skip article pipeline, queue IOCs directly to normalize
    if (['csv_bulk', 'plaintext', 'jsonl'].includes(feed.feedType)) {
      const iocs = fetchResult.articles.filter((a) => a.rawMeta.iocValue)
        .map((a) => ({ rawValue: String(a.rawMeta.iocValue), rawType: a.rawMeta.iocType ? String(a.rawMeta.iocType) : undefined }));
      if (iocs.length > 0) {
        await normalizeQueue.add(`normalize-bulk-${crypto.randomUUID()}`,
          { articleId: crypto.randomUUID(), feedSourceId: feedId, tenantId, feedName: feed.name, iocs }, { priority: 3 });
        logger.info({ feedId, count: iocs.length }, 'Bulk IOCs queued for normalization');
      }
      policyStore?.incrementCount(tenantId, feedId, fetchResult.articles.length);
      await repo.updateHealth(tenantId, feedId, { lastFetchAt: new Date(), consecutiveFailures: 0, status: 'active',
        totalItemsIngested: { increment: fetchResult.articles.length } });
      return { feedId, articlesCount: fetchResult.articles.length, relevantCount: iocs.length, duplicateCount: 0,
        iocsFound: iocs.length, fetchDurationMs: fetchResult.fetchDurationMs, pipelineDurationMs: 0, totalCostUsd: 0, status: 'success' as const };
    }

    const pipelineResult = await pipeline.processBatch(fetchResult.articles, feedId, feed.name, tenantId, feedAiEnabled);
    await persistArticles(db, pipelineResult, feedId, tenantId);
    await enqueueIOCsForNormalization(normalizeQueue, pipelineResult, feedId, feed.name, tenantId, logger);
    policyStore?.incrementCount(tenantId, feedId, fetchResult.articles.length);

    await repo.updateHealth(tenantId, feedId, {
      lastFetchAt: new Date(), consecutiveFailures: 0, status: 'active',
      totalItemsIngested: { increment: fetchResult.articles.length },
      itemsRelevant24h: { increment: pipelineResult.relevant },
      avgProcessingTimeMs: pipelineResult.processingTimeMs,
    });

    // P1-6: Persist MISP incremental fetch cursor for next run
    if (feed.feedType === 'misp') {
      const mispResult = fetchResult as MISPConnectorResult;
      if (mispResult.latestEventTimestamp) {
        const existingConfig = (feed.parseConfig as Record<string, unknown>) ?? {};
        await repo.update(tenantId, feedId, {
          parseConfig: { ...existingConfig, publishedAfter: mispResult.latestEventTimestamp },
        });
        logger.info({ feedId, cursor: mispResult.latestEventTimestamp }, 'MISP incremental cursor saved');
      }
    }

    const iocsFound = pipelineResult.articles.reduce((sum, a) => sum + a.iocResults.length, 0);
    logger.info({ feedId, total: fetchResult.articles.length, relevant: pipelineResult.relevant,
      duplicates: pipelineResult.duplicates, iocsFound, pipelineMs: pipelineResult.processingTimeMs },
      'Feed fetch + pipeline completed');

    return {
      feedId, articlesCount: fetchResult.articles.length, relevantCount: pipelineResult.relevant,
      duplicateCount: pipelineResult.duplicates, iocsFound, fetchDurationMs: fetchResult.fetchDurationMs,
      pipelineDurationMs: pipelineResult.processingTimeMs, totalCostUsd: pipelineResult.totalCostUsd,
      status: 'success' as const,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failures = feed.consecutiveFailures + 1;
    await repo.updateHealth(tenantId, feedId, { lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 1000),
      consecutiveFailures: failures, ...(failures >= config.TI_MAX_CONSECUTIVE_FAILURES ? { status: 'error', enabled: false } : {}) });
    logger.error({ feedId, error: message, consecutiveFailures: failures }, 'Feed fetch failed');
    return { feedId, articlesCount: 0, relevantCount: 0, duplicateCount: 0, iocsFound: 0,
      fetchDurationMs: 0, pipelineDurationMs: 0, totalCostUsd: 0, status: 'failure' as const, error: message };
  }
}

interface RouteOptions {
  url: string; headers: Record<string, string>; parseConfig: Record<string, unknown> | null;
  rssConnector: RSSConnector; nvdConnector: NVDConnector;
  taxiiConnector: TAXIIConnector; restApiConnector: RestAPIConnector;
  mispConnector: MISPConnector; bulkFileConnector: BulkFileConnector;
  config: import('../config.js').AppConfig;
}

async function routeToConnector(feedType: string, opts: RouteOptions): Promise<ConnectorResult> {
  switch (feedType) {
    case 'rss': return opts.rssConnector.fetch({ url: opts.url, headers: opts.headers });
    case 'nvd': return opts.nvdConnector.fetch({
      apiKey: opts.config.TI_NVD_API_KEY,
      pubStartDate: (opts.parseConfig?.pubStartDate as string) ?? undefined,
      pubEndDate: (opts.parseConfig?.pubEndDate as string) ?? undefined,
    });
    case 'stix': case 'taxii': return opts.taxiiConnector.fetch({
      taxiiUrl: opts.config.TI_TAXII_URL ?? (opts.parseConfig?.taxiiUrl as string) ?? undefined,
      username: opts.config.TI_TAXII_USER ?? (opts.parseConfig?.username as string) ?? undefined,
      password: opts.config.TI_TAXII_PASSWORD ?? (opts.parseConfig?.password as string) ?? undefined,
      collectionId: (opts.parseConfig?.collectionId as string) ?? undefined,
      addedAfter: (opts.parseConfig?.addedAfter as string) ?? undefined,
    });
    case 'rest_api': return opts.restApiConnector.fetch({ feedMeta: { url: opts.url, ...opts.parseConfig } });
    case 'misp': {
      // P1-10: Flat file feed mode when parseConfig.format === 'misp_feed'
      if (opts.parseConfig?.format === 'misp_feed') {
        return opts.mispConnector.fetchFeed({
          feedUrl: opts.url || ((opts.parseConfig?.feedUrl as string) ?? ''),
          apiKey: opts.headers?.['Authorization'] ?? ((opts.parseConfig?.apiKey as string) ?? undefined),
          publishedAfter: (opts.parseConfig?.publishedAfter as string) ?? undefined,
          onlyIdsAttributes: (opts.parseConfig?.onlyIdsAttributes as boolean) ?? undefined,
        });
      }
      return opts.mispConnector.fetch({
        baseUrl: opts.url || ((opts.parseConfig?.baseUrl as string) ?? ''),
        apiKey: opts.headers?.['Authorization'] ?? ((opts.parseConfig?.apiKey as string) ?? ''),
        publishedAfter: (opts.parseConfig?.publishedAfter as string) ?? undefined,
        tags: (opts.parseConfig?.tags as string[]) ?? undefined,
        limit: (opts.parseConfig?.limit as number) ?? undefined,
      });
    }
    case 'csv_bulk': case 'plaintext': case 'jsonl': {
      const fmt = feedType === 'csv_bulk' ? 'csv' : feedType;
      return opts.bulkFileConnector.fetch({
        url: opts.url, format: fmt as 'csv' | 'plaintext' | 'jsonl', headers: opts.headers,
        ...(opts.parseConfig as Record<string, unknown> ?? {}),
      });
    }
    default: throw new AppError(400, `Unsupported feed type: ${feedType}`, 'CONNECTOR_UNSUPPORTED');
  }
}

async function persistArticles(db: PrismaClient, pipelineResult: PipelineBatchResult, feedId: string, tenantId: string): Promise<void> {
  const articlesToCreate = pipelineResult.articles
    .filter((a) => a.pipelineStatus !== 'failed')
    .map((a) => ({
      tenantId, feedSourceId: feedId, title: a.original.title.slice(0, 1000), content: a.original.content,
      url: a.original.url, publishedAt: a.original.publishedAt, author: a.original.author?.slice(0, 500) ?? null,
      pipelineStatus: a.skipped && a.skipReason === 'duplicate' ? 'deduplicated' as const : a.isCtiRelevant ? 'persisted' as const : 'triaged' as const,
      isCtiRelevant: a.isCtiRelevant, articleType: a.triageResult?.articleType ?? 'irrelevant',
      triageConfidence: a.triageResult?.confidence ?? 0, triagePriority: a.triageResult?.priority ?? null,
      triageResult: a.triageResult as object ?? undefined, extractionResult: a.extractionResult as object ?? undefined,
      stage1TriageTokens: a.costBreakdown.triageTokens, stage1TriageCostUsd: a.costBreakdown.triageCostUsd,
      stage2ExtractionTokens: a.costBreakdown.extractionTokens, stage2ExtractionCostUsd: a.costBreakdown.extractionCostUsd,
      iocsExtracted: a.iocContexts.length, processingTimeMs: a.processingTimeMs,
      dedupResult: a.dedupResult as object ?? undefined, rawMeta: a.original.rawMeta as object,
    }));
  if (articlesToCreate.length === 0) return;
  await db.article.createMany({ data: articlesToCreate });
}

async function enqueueIOCsForNormalization(
  normalizeQueue: Queue, pipelineResult: PipelineBatchResult,
  feedId: string, feedName: string, tenantId: string, logger: pino.Logger,
): Promise<void> {
  let totalEnqueued = 0;
  for (const article of pipelineResult.articles) {
    if (!article.isCtiRelevant || article.skipped || article.iocResults.length === 0) continue;
    const articleId = crypto.randomUUID();
    const ext = article.extractionResult;
    const iocs = article.iocResults.map((r) => ({
      rawValue: r.iocValue, rawType: r.iocType, calibratedConfidence: r.calibratedConfidence,
      corroborationCount: r.corroborationCount,
      context: article.iocContexts.find((c) => c.iocValue === r.iocValue)?.context,
      extractionMeta: ext ? { threatActors: ext.threatActors, malwareFamilies: ext.malwareFamilies,
        mitreAttack: ext.mitreTechniques, tlp: ext.tlp } : undefined,
    }));
    try {
      await normalizeQueue.add(`normalize-${articleId}`,
        { articleId, feedSourceId: feedId, tenantId, feedName, iocs },
        { priority: article.triageResult?.priority === 'critical' ? 1 : 3 });
      totalEnqueued += iocs.length;
    } catch (err) {
      logger.error({ articleId, feedId, error: (err as Error).message }, 'Failed to enqueue IOCs');
    }
  }
  if (totalEnqueued > 0) logger.info({ feedId, feedName, totalEnqueued }, 'IOCs enqueued for normalization');
}
