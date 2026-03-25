import type { Queue } from 'bullmq';
import type { FeedSource, Prisma } from '@prisma/client';
import type pino from 'pino';
import { AppError } from '@etip/shared-utils';

type JsonValue = Prisma.InputJsonValue;
import { type FeedRepository, type FeedStats, type FeedHealth } from './repository.js';
import { CreateFeedSchema, UpdateFeedSchema, ListFeedsQuerySchema } from './schema.js';
import type { CreateFeedInput, UpdateFeedInput, ListFeedsQuery } from './schema.js';
import { getConfig } from './config.js';
import { getQueueForFeedType, mapFeedTypeToQueue } from './queue.js';

export interface PaginatedFeeds {
  data: FeedSource[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export class FeedService {
  constructor(
    private readonly repo: FeedRepository,
    private readonly queue: Queue,
    private readonly logger: pino.Logger,
  ) {}

  async createFeed(tenantId: string, input: CreateFeedInput): Promise<FeedSource> {
    const data = CreateFeedSchema.parse(input);
    const config = getConfig();

    const currentCount = await this.repo.countByTenant(tenantId);
    if (currentCount >= config.TI_MAX_FEEDS_PER_TENANT) {
      throw new AppError(429, `Feed limit reached (max ${config.TI_MAX_FEEDS_PER_TENANT} per tenant)`, 'FEED_LIMIT_EXCEEDED');
    }

    const feed = await this.repo.create(tenantId, {
      name: data.name,
      feedType: data.feedType,
      url: data.url,
      description: data.description,
      schedule: data.schedule,
      headers: (data.headers ?? {}) as JsonValue,
      authConfig: (data.authConfig ?? {}) as JsonValue,
      parseConfig: (data.parseConfig ?? {}) as JsonValue,
    });

    this.logger.info({ feedId: feed.id, tenantId, feedType: data.feedType }, 'Feed created');
    return feed;
  }

  async listFeeds(tenantId: string, query: Partial<ListFeedsQuery>): Promise<PaginatedFeeds> {
    const parsed = ListFeedsQuerySchema.parse(query);
    const [data, total] = await Promise.all([
      this.repo.findMany(tenantId, parsed),
      this.repo.count(tenantId, parsed),
    ]);

    return {
      data,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        totalPages: Math.ceil(total / parsed.limit),
      },
    };
  }

  async getFeed(tenantId: string, feedId: string): Promise<FeedSource> {
    const feed = await this.repo.findById(tenantId, feedId);
    if (!feed) throw new AppError(404, `Feed not found: ${feedId}`, 'NOT_FOUND');
    return feed;
  }

  async updateFeed(tenantId: string, feedId: string, input: UpdateFeedInput): Promise<FeedSource> {
    await this.getFeed(tenantId, feedId);
    const data = UpdateFeedSchema.parse(input);

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.feedType !== undefined) updateData.feedType = data.feedType;
    if (data.url !== undefined) updateData.url = data.url;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.headers !== undefined) updateData.headers = data.headers;
    if (data.authConfig !== undefined) updateData.authConfig = data.authConfig;
    if (data.parseConfig !== undefined) updateData.parseConfig = data.parseConfig;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'active') {
        updateData.consecutiveFailures = 0;
      }
    }

    const updated = await this.repo.update(tenantId, feedId, updateData);
    this.logger.info({ feedId, tenantId }, 'Feed updated');
    return updated;
  }

  async deleteFeed(tenantId: string, feedId: string): Promise<{ success: true }> {
    await this.getFeed(tenantId, feedId);
    await this.repo.softDelete(tenantId, feedId);
    this.logger.info({ feedId, tenantId }, 'Feed soft-deleted');
    return { success: true };
  }

  async triggerFeed(tenantId: string, feedId: string): Promise<{ jobId: string; message: string }> {
    const feed = await this.getFeed(tenantId, feedId);
    const config = getConfig();

    if (!feed.enabled) {
      throw new AppError(400, 'Feed is disabled', 'FEED_DISABLED');
    }

    if (feed.consecutiveFailures >= config.TI_MAX_CONSECUTIVE_FAILURES) {
      throw new AppError(400, 'Feed circuit-breaker open — too many consecutive failures', 'FEED_CIRCUIT_OPEN');
    }

    // Route to per-feed-type queue (P3-4)
    const queueName = mapFeedTypeToQueue(feed.feedType);
    let targetQueue: Queue;
    try {
      targetQueue = getQueueForFeedType(feed.feedType);
    } catch {
      // Fallback to legacy queue if per-type queues not initialized (e.g. in tests)
      targetQueue = this.queue;
    }

    const job = await targetQueue.add(
      queueName,
      { feedId, tenantId, triggeredBy: 'manual' },
      { jobId: `manual-${feedId}-${Date.now()}` },
    );

    this.logger.info({ feedId, tenantId, jobId: job.id, queue: queueName }, 'Feed fetch queued to per-type queue');
    return { jobId: job.id ?? 'unknown', message: 'Feed fetch queued' };
  }

  async getFeedHealth(tenantId: string, feedId: string): Promise<FeedHealth> {
    await this.getFeed(tenantId, feedId);
    const health = await this.repo.getHealth(tenantId, feedId);
    if (!health) throw new AppError(404, `Feed not found: ${feedId}`, 'NOT_FOUND');
    return health;
  }

  async getFeedStats(tenantId: string): Promise<FeedStats> {
    return this.repo.getStats(tenantId);
  }
}
