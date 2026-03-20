import { Worker, type Job } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FeedRepository } from '../repository.js';
import { RSSConnector, type ConnectorResult } from '../connectors/rss.js';
import { getConfig } from '../config.js';

export interface FeedFetchJobData {
  feedId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'schedule';
}

export interface FeedFetchResult {
  feedId: string;
  articlesCount: number;
  fetchDurationMs: number;
  status: 'success' | 'failure';
  error?: string;
}

export interface FeedFetchWorkerDeps {
  repo: FeedRepository;
  logger: pino.Logger;
}

export function createFeedFetchWorker(deps: FeedFetchWorkerDeps): Worker<FeedFetchJobData, FeedFetchResult> {
  const { repo, logger } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  const rssConnector = new RSSConnector(logger);

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
        return { feedId, articlesCount: 0, fetchDurationMs: 0, status: 'success' as const };
      }

      try {
        const result = await routeToConnector(feed.feedType, {
          url: feed.url ?? '',
          headers: (feed.headers as Record<string, string>) ?? {},
          rssConnector,
        });

        // Update feed health on success
        await repo.updateHealth(tenantId, feedId, {
          lastFetchAt: new Date(),
          consecutiveFailures: 0,
          status: 'active',
          totalItemsIngested: { increment: result.articles.length },
        });

        logger.info(
          { feedId, articlesCount: result.articles.length, fetchDurationMs: result.fetchDurationMs },
          'Feed fetch completed',
        );

        return {
          feedId,
          articlesCount: result.articles.length,
          fetchDurationMs: result.fetchDurationMs,
          status: 'success' as const,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const newFailures = feed.consecutiveFailures + 1;
        const maxFailures = config.TI_MAX_CONSECUTIVE_FAILURES;

        // Update feed health on failure
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

        return { feedId, articlesCount: 0, fetchDurationMs: 0, status: 'failure' as const, error: message };
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
