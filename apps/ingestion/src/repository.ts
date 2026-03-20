import type { PrismaClient, FeedSource, Article, Prisma } from '@prisma/client';
import type { ListFeedsQuery, ListArticlesQuery } from './schema.js';

export type CreateFeedData = Omit<Prisma.FeedSourceCreateInput, 'tenant' | 'iocs'>;

export interface FeedStats {
  totalFeeds: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  totalItemsIngested: number;
  avgReliability: number;
}

export interface FeedHealth {
  lastFetchAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  feedReliability: number;
  totalItemsIngested: number;
  itemsIngested24h: number;
  itemsRelevant24h: number;
  avgProcessingTimeMs: number;
}

export class FeedRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(tenantId: string, data: CreateFeedData): Promise<FeedSource> {
    return this.db.feedSource.create({
      data: { ...data, tenant: { connect: { id: tenantId } } },
    });
  }

  async findMany(tenantId: string, query: ListFeedsQuery): Promise<FeedSource[]> {
    const where: Prisma.FeedSourceWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.feedType) where.feedType = query.feedType;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    return this.db.feedSource.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string, query?: Partial<ListFeedsQuery>): Promise<number> {
    const where: Prisma.FeedSourceWhereInput = { tenantId };
    if (query?.status) where.status = query.status;
    if (query?.feedType) where.feedType = query.feedType;
    if (query?.search) where.name = { contains: query.search, mode: 'insensitive' };

    return this.db.feedSource.count({ where });
  }

  async findById(tenantId: string, id: string): Promise<FeedSource | null> {
    return this.db.feedSource.findFirst({ where: { id, tenantId } });
  }

  async update(tenantId: string, id: string, data: Prisma.FeedSourceUpdateInput): Promise<FeedSource> {
    await this.ensureOwnership(tenantId, id);
    return this.db.feedSource.update({ where: { id }, data });
  }

  async softDelete(tenantId: string, id: string): Promise<FeedSource> {
    await this.ensureOwnership(tenantId, id);
    return this.db.feedSource.update({
      where: { id },
      data: { enabled: false, status: 'disabled' },
    });
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.db.feedSource.count({ where: { tenantId, enabled: true } });
  }

  async getHealth(tenantId: string, id: string): Promise<FeedHealth | null> {
    const feed = await this.db.feedSource.findFirst({
      where: { id, tenantId },
      select: {
        lastFetchAt: true, lastErrorAt: true, lastErrorMessage: true,
        consecutiveFailures: true, feedReliability: true, totalItemsIngested: true,
        itemsIngested24h: true, itemsRelevant24h: true, avgProcessingTimeMs: true,
      },
    });
    return feed;
  }

  async getStats(tenantId: string): Promise<FeedStats> {
    const feeds = await this.db.feedSource.findMany({
      where: { tenantId },
      select: { status: true, feedType: true, totalItemsIngested: true, feedReliability: true },
    });

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalItems = 0;
    let reliabilitySum = 0;

    for (const f of feeds) {
      byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
      byType[f.feedType] = (byType[f.feedType] ?? 0) + 1;
      totalItems += f.totalItemsIngested;
      reliabilitySum += f.feedReliability;
    }

    return {
      totalFeeds: feeds.length,
      byStatus,
      byType,
      totalItemsIngested: totalItems,
      avgReliability: feeds.length > 0 ? Math.round(reliabilitySum / feeds.length) : 0,
    };
  }

  async findAllActive(): Promise<FeedSource[]> {
    return this.db.feedSource.findMany({
      where: { enabled: true, status: 'active' },
      select: { id: true, tenantId: true, schedule: true } as Record<string, boolean>,
    }) as unknown as FeedSource[];
  }

  async updateHealth(tenantId: string, id: string, data: Prisma.FeedSourceUpdateInput): Promise<FeedSource> {
    await this.ensureOwnership(tenantId, id);
    return this.db.feedSource.update({ where: { id }, data });
  }

  // ─── Article Queries ───────────────────────────────────────────────────────

  async findArticles(tenantId: string, query: ListArticlesQuery): Promise<Article[]> {
    const where: Prisma.ArticleWhereInput = { tenantId };
    if (query.feedId) where.feedSourceId = query.feedId;
    if (query.pipelineStatus) where.pipelineStatus = query.pipelineStatus;
    if (query.isCtiRelevant !== undefined) where.isCtiRelevant = query.isCtiRelevant;
    if (query.articleType) where.articleType = query.articleType;
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };

    return this.db.article.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, tenantId: true, feedSourceId: true, title: true, url: true,
        publishedAt: true, author: true, language: true,
        pipelineStatus: true, isCtiRelevant: true, articleType: true,
        triageConfidence: true, triagePriority: true,
        iocsExtracted: true, processingTimeMs: true, totalCostUsd: true,
        createdAt: true, updatedAt: true,
        // Exclude heavy fields: content, triageResult, extractionResult, dedupResult, rawMeta
      } as Record<string, boolean>,
    }) as unknown as Article[];
  }

  async countArticles(tenantId: string, query?: Partial<ListArticlesQuery>): Promise<number> {
    const where: Prisma.ArticleWhereInput = { tenantId };
    if (query?.feedId) where.feedSourceId = query.feedId;
    if (query?.pipelineStatus) where.pipelineStatus = query.pipelineStatus;
    if (query?.isCtiRelevant !== undefined) where.isCtiRelevant = query.isCtiRelevant;
    if (query?.articleType) where.articleType = query.articleType;
    if (query?.search) where.title = { contains: query.search, mode: 'insensitive' };

    return this.db.article.count({ where });
  }

  async findArticleById(tenantId: string, id: string): Promise<Article | null> {
    return this.db.article.findFirst({ where: { id, tenantId } });
  }

  private async ensureOwnership(tenantId: string, id: string): Promise<void> {
    const feed = await this.db.feedSource.findFirst({ where: { id, tenantId } });
    if (!feed) {
      const { Errors } = await import('@etip/shared-utils');
      throw Errors.notFound('Feed', id);
    }
  }
}
