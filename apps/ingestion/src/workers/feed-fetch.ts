import { Worker, Queue, type Job } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { FeedRepository } from '../repository.js';
import { RSSConnector, type ConnectorResult } from '../connectors/rss.js';
import { NVDConnector } from '../connectors/nvd.js';
import { TAXIIConnector } from '../connectors/taxii.js';
import { RestAPIConnector } from '../connectors/rest-api.js';
import { getConfig } from '../config.js';
import { ArticlePipeline, type PipelineBatchResult } from './pipeline.js';
import type { FeedPolicyStore } from '../services/feed-policy-store.js';

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

export function createFeedFetchWorker(deps: FeedFetchWorkerDeps): Worker<FeedFetchJobData, FeedFetchResult> {
  const { repo, logger, db, policyStore } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  // Create normalize queue producer (for cross-service IOC handoff)
  const normalizeQueue = new Queue(QUEUES.NORMALIZE, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    },
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
  const pipeline = new ArticlePipeline({
    logger,
    db,
    anthropicApiKey: config.TI_ANTHROPIC_API_KEY,
    aiEnabled: config.TI_AI_ENABLED,
    aiMaxTriagePerFetch: config.TI_AI_MAX_TRIAGE_PER_FETCH,
    aiMaxExtractionPerFetch: config.TI_AI_MAX_EXTRACTION_PER_FETCH,
    aiTriageModel: config.TI_AI_TRIAGE_MODEL,
    aiExtractionModel: config.TI_AI_EXTRACTION_MODEL,
  });

  const worker = new Worker<FeedFetchJobData, FeedFetchResult>(
    QUEUES.FEED_FETCH,
    async (job: Job<FeedFetchJobData>) => {
      const { feedId, tenantId, triggeredBy } = job.data;
      logger.info({ feedId, tenantId, triggeredBy, jobId: job.id }, 'Processing feed fetch job');

      const feed = await repo.findById(tenantId, feedId);
      if (!feed) {
        throw new AppError(404, `Feed not found: ${feedId}`, 'NOT_FOUND');
      }

      if (!feed.enabled) {
        logger.warn({ feedId }, 'Skipping disabled feed');
        return buildEmptyResult(feedId);
      }

      // ── Daily cap enforcement ─────────────────────────────────────────────
      if (policyStore?.isCapReached(tenantId, feedId)) {
        const policy = policyStore.getPolicy(tenantId, feedId);
        logger.warn(
          { feedId, tenantId, currentDayCount: policy?.currentDayCount, dailyLimit: policy?.dailyLimit },
          'Feed daily cap reached — skipping until midnight reset',
        );
        return buildEmptyResult(feedId);
      }

      // ── Compute effective AI flag: global AND per-feed ────────────────────
      const feedPolicy = policyStore?.getPolicy(tenantId, feedId);
      const feedAiEnabled = feedPolicy ? feedPolicy.aiEnabled : true;
      if (!feedAiEnabled) {
        logger.info({ feedId, tenantId }, 'Feed policy aiEnabled=false — AI stages will be skipped for this feed');
      }

      try {
        // ── Fetch articles from source ────────────────────────────
        const feedUrl = feed.url ?? '';
        const feedHeaders: Record<string, string> = { ...(feed.headers as Record<string, string>) };
        // Auto-inject OTX API key header for AlienVault feeds when key is configured
        if (feedUrl.includes('alienvault.com') && config.TI_OTX_API_KEY) {
          feedHeaders['X-OTX-API-Key'] = config.TI_OTX_API_KEY;
        }
        const fetchResult = await routeToConnector(feed.feedType, {
          url: feedUrl,
          headers: feedHeaders,
          parseConfig: feed.parseConfig as Record<string, unknown> | null,
          rssConnector,
          nvdConnector,
          taxiiConnector,
          restApiConnector,
          config,
        });

        // ── Run articles through pipeline ─────────────────────────
        const pipelineResult = await pipeline.processBatch(
          fetchResult.articles,
          feedId,
          feed.name,
          tenantId,
          feedAiEnabled,
        );

        // ── Persist processed articles to DB ──────────────────────
        await persistArticles(db, pipelineResult, feedId, tenantId);

        // ── Enqueue IOCs to normalization service ───────────────
        await enqueueIOCsForNormalization(normalizeQueue, pipelineResult, feedId, feed.name, tenantId, logger);

        // ── Increment daily policy counter ────────────────────────
        policyStore?.incrementCount(tenantId, feedId, fetchResult.articles.length);

        // ── Update feed health on success ─────────────────────────
        await repo.updateHealth(tenantId, feedId, {
          lastFetchAt: new Date(),
          consecutiveFailures: 0,
          status: 'active',
          totalItemsIngested: { increment: fetchResult.articles.length },
          itemsRelevant24h: { increment: pipelineResult.relevant },
          avgProcessingTimeMs: pipelineResult.processingTimeMs,
        });

        const iocsFound = pipelineResult.articles.reduce(
          (sum, a) => sum + a.iocResults.length, 0,
        );

        logger.info(
          {
            feedId,
            total: fetchResult.articles.length,
            relevant: pipelineResult.relevant,
            duplicates: pipelineResult.duplicates,
            iocsFound,
            pipelineMs: pipelineResult.processingTimeMs,
          },
          'Feed fetch + pipeline completed',
        );

        return {
          feedId,
          articlesCount: fetchResult.articles.length,
          relevantCount: pipelineResult.relevant,
          duplicateCount: pipelineResult.duplicates,
          iocsFound,
          fetchDurationMs: fetchResult.fetchDurationMs,
          pipelineDurationMs: pipelineResult.processingTimeMs,
          totalCostUsd: pipelineResult.totalCostUsd,
          status: 'success' as const,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const newFailures = feed.consecutiveFailures + 1;
        const maxFailures = config.TI_MAX_CONSECUTIVE_FAILURES;

        await repo.updateHealth(tenantId, feedId, {
          lastErrorAt: new Date(),
          lastErrorMessage: message.slice(0, 1000),
          consecutiveFailures: newFailures,
          ...(newFailures >= maxFailures ? { status: 'error', enabled: false } : {}),
        });

        logger.error(
          { feedId, error: message, consecutiveFailures: newFailures },
          'Feed fetch failed',
        );

        return {
          feedId,
          articlesCount: 0,
          relevantCount: 0,
          duplicateCount: 0,
          iocsFound: 0,
          fetchDurationMs: 0,
          pipelineDurationMs: 0,
          totalCostUsd: 0,
          status: 'failure' as const,
          error: message,
        };
      }
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: password || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      },
      concurrency: 3,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Feed fetch job failed (BullMQ)');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Feed fetch worker error');
  });

  logger.info('Feed fetch worker started');
  return worker;
}

function buildEmptyResult(feedId: string): FeedFetchResult {
  return {
    feedId,
    articlesCount: 0,
    relevantCount: 0,
    duplicateCount: 0,
    iocsFound: 0,
    fetchDurationMs: 0,
    pipelineDurationMs: 0,
    totalCostUsd: 0,
    status: 'success',
  };
}

interface RouteOptions {
  url: string;
  headers: Record<string, string>;
  parseConfig: Record<string, unknown> | null;
  rssConnector: RSSConnector;
  nvdConnector: NVDConnector;
  taxiiConnector: TAXIIConnector;
  restApiConnector: RestAPIConnector;
  config: import('../config.js').AppConfig;
}

async function routeToConnector(feedType: string, opts: RouteOptions): Promise<ConnectorResult> {
  switch (feedType) {
    case 'rss':
      return opts.rssConnector.fetch({ url: opts.url, headers: opts.headers });
    case 'nvd':
      return opts.nvdConnector.fetch({
        apiKey: opts.config.TI_NVD_API_KEY,
        pubStartDate: (opts.parseConfig?.pubStartDate as string) ?? undefined,
        pubEndDate: (opts.parseConfig?.pubEndDate as string) ?? undefined,
      });
    case 'stix':
    case 'taxii':
      return opts.taxiiConnector.fetch({
        taxiiUrl: opts.config.TI_TAXII_URL ?? (opts.parseConfig?.taxiiUrl as string) ?? undefined,
        username: opts.config.TI_TAXII_USER ?? (opts.parseConfig?.username as string) ?? undefined,
        password: opts.config.TI_TAXII_PASSWORD ?? (opts.parseConfig?.password as string) ?? undefined,
        collectionId: (opts.parseConfig?.collectionId as string) ?? undefined,
        addedAfter: (opts.parseConfig?.addedAfter as string) ?? undefined,
      });
    case 'rest_api':
      return opts.restApiConnector.fetch({
        feedMeta: { url: opts.url, ...opts.parseConfig },
      });
    case 'misp':
      throw new AppError(501, `Connector not yet implemented: ${feedType}`, 'CONNECTOR_NOT_IMPLEMENTED');
    default:
      throw new AppError(400, `Unsupported feed type: ${feedType}`, 'CONNECTOR_UNSUPPORTED');
  }
}

/**
 * Persist processed articles to the database.
 * Creates Article records for all processed (non-failed) articles.
 */
async function persistArticles(
  db: PrismaClient,
  pipelineResult: PipelineBatchResult,
  feedId: string,
  tenantId: string,
): Promise<void> {
  const articlesToCreate = pipelineResult.articles
    .filter((a) => a.pipelineStatus !== 'failed')
    .map((a) => ({
      tenantId,
      feedSourceId: feedId,
      title: a.original.title.slice(0, 1000),
      content: a.original.content,
      url: a.original.url,
      publishedAt: a.original.publishedAt,
      author: a.original.author?.slice(0, 500) ?? null,
      pipelineStatus: a.skipped && a.skipReason === 'duplicate' ? 'deduplicated' as const : a.isCtiRelevant ? 'persisted' as const : 'triaged' as const,
      isCtiRelevant: a.isCtiRelevant,
      articleType: a.triageResult?.articleType ?? 'irrelevant',
      triageConfidence: a.triageResult?.confidence ?? 0,
      triagePriority: a.triageResult?.priority ?? null,
      triageResult: a.triageResult as object ?? undefined,
      extractionResult: a.extractionResult as object ?? undefined,
      stage1TriageTokens: a.costBreakdown.triageTokens,
      stage1TriageCostUsd: a.costBreakdown.triageCostUsd,
      stage2ExtractionTokens: a.costBreakdown.extractionTokens,
      stage2ExtractionCostUsd: a.costBreakdown.extractionCostUsd,
      iocsExtracted: a.iocContexts.length,
      processingTimeMs: a.processingTimeMs,
      dedupResult: a.dedupResult as object ?? undefined,
      rawMeta: a.original.rawMeta as object,
    }));

  if (articlesToCreate.length === 0) return;

  // Use createMany for batch insert performance
  await db.article.createMany({ data: articlesToCreate });
}

/**
 * Enqueue extracted IOCs from processed articles to the normalization queue.
 * Creates one batch job per article (groups all IOCs from that article).
 * Only enqueues for CTI-relevant, non-duplicate articles with IOCs.
 */
async function enqueueIOCsForNormalization(
  normalizeQueue: Queue,
  pipelineResult: PipelineBatchResult,
  feedId: string,
  feedName: string,
  tenantId: string,
  logger: pino.Logger,
): Promise<void> {
  let totalEnqueued = 0;

  for (const article of pipelineResult.articles) {
    // Only enqueue for articles that passed triage, are not duplicates, and have IOCs
    if (!article.isCtiRelevant || article.skipped || article.iocResults.length === 0) continue;

    const articleId = crypto.randomUUID();
    const iocs = article.iocResults.map((r) => ({
      rawValue: r.iocValue,
      rawType: r.iocType,
      calibratedConfidence: r.calibratedConfidence,
      corroborationCount: r.corroborationCount,
      context: article.iocContexts.find((c) => c.iocValue === r.iocValue)?.context,
      extractionMeta: article.extractionResult ? {
        threatActors: article.extractionResult.threatActors,
        malwareFamilies: article.extractionResult.malwareFamilies,
        mitreAttack: article.extractionResult.mitreTechniques,
        tlp: article.extractionResult.tlp,
      } : undefined,
    }));

    try {
      await normalizeQueue.add(
        `normalize-${articleId}`,
        { articleId, feedSourceId: feedId, tenantId, feedName, iocs },
        { priority: article.triageResult?.priority === 'critical' ? 1 : 3 },
      );
      totalEnqueued += iocs.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ articleId, feedId, error: message }, 'Failed to enqueue IOCs for normalization');
    }
  }

  if (totalEnqueued > 0) {
    logger.info({ feedId, feedName, totalEnqueued }, 'IOCs enqueued for normalization');
  }
}
