import { Worker, type Job } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { FeedRepository } from '../repository.js';
import { RSSConnector, type ConnectorResult } from '../connectors/rss.js';
import { getConfig } from '../config.js';
import { ArticlePipeline, type PipelineBatchResult } from './pipeline.js';

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
}

export function createFeedFetchWorker(deps: FeedFetchWorkerDeps): Worker<FeedFetchJobData, FeedFetchResult> {
  const { repo, logger, db } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  const rssConnector = new RSSConnector(logger);
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

  const queueName = QUEUES.FEED_FETCH.replace(/:/g, '-');

  const worker = new Worker<FeedFetchJobData, FeedFetchResult>(
    queueName,
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

      try {
        // ── Fetch articles from source ────────────────────────────
        const fetchResult = await routeToConnector(feed.feedType, {
          url: feed.url ?? '',
          headers: (feed.headers as Record<string, string>) ?? {},
          rssConnector,
        });

        // ── Run articles through pipeline ─────────────────────────
        const pipelineResult = await pipeline.processBatch(
          fetchResult.articles,
          feedId,
          feed.name,
          tenantId,
        );

        // ── Persist processed articles to DB ──────────────────────
        await persistArticles(db, pipelineResult, feedId, tenantId);

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
  rssConnector: RSSConnector;
}

async function routeToConnector(feedType: string, opts: RouteOptions): Promise<ConnectorResult> {
  switch (feedType) {
    case 'rss':
      return opts.rssConnector.fetch({ url: opts.url, headers: opts.headers });
    case 'stix':
    case 'taxii':
    case 'misp':
    case 'rest_api':
    case 'nvd':
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
