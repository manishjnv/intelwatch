/**
 * @module GlobalFeedRepository
 * @description Prisma-backed repository for the global feed catalog (DECISION-029).
 */
import type { PrismaClient, GlobalFeedCatalog } from '@prisma/client';
import { admiraltyToScore, type SourceReliability, type InfoCredibility } from '@etip/shared-normalization';

export interface CreateCatalogInput {
  name: string;
  description?: string;
  feedType: string;
  url: string;
  schedule?: string;
  minPlanTier?: string;
  sourceReliability?: string;
  infoCred?: number;
  industries?: string[];
  headers?: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
  parseConfig?: Record<string, unknown>;
}

export interface UpdateCatalogInput extends Partial<CreateCatalogInput> {
  enabled?: boolean;
  status?: string;
}

export interface CatalogFilters {
  feedType?: string;
  minPlanTier?: string;
  enabled?: boolean;
}

export class GlobalFeedRepository {
  constructor(private prisma: PrismaClient) {}

  async listCatalog(filters?: CatalogFilters): Promise<GlobalFeedCatalog[]> {
    const where: Record<string, unknown> = {};
    if (filters?.feedType) where.feedType = filters.feedType;
    if (filters?.minPlanTier) where.minPlanTier = filters.minPlanTier;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;
    return this.prisma.globalFeedCatalog.findMany({ where, orderBy: { name: 'asc' } });
  }

  async getCatalogEntry(id: string): Promise<GlobalFeedCatalog | null> {
    return this.prisma.globalFeedCatalog.findUnique({ where: { id } });
  }

  async createCatalogEntry(data: CreateCatalogInput): Promise<GlobalFeedCatalog> {
    const source = (data.sourceReliability ?? 'C') as SourceReliability;
    const cred = (data.infoCred ?? 3) as InfoCredibility;
    const feedReliability = admiraltyToScore(source, cred);

    return this.prisma.globalFeedCatalog.create({
      data: {
        name: data.name,
        description: data.description,
        feedType: data.feedType,
        url: data.url,
        schedule: data.schedule ?? '*/30 * * * *',
        minPlanTier: data.minPlanTier ?? 'free',
        sourceReliability: source,
        infoCred: cred,
        feedReliability,
        industries: data.industries ?? [],
        headers: data.headers ?? {},
        authConfig: data.authConfig ?? {},
        parseConfig: data.parseConfig ?? {},
      },
    });
  }

  async updateCatalogEntry(id: string, data: UpdateCatalogInput): Promise<GlobalFeedCatalog> {
    const updateData: Record<string, unknown> = { ...data };

    // Recompute feedReliability if source/cred changed
    if (data.sourceReliability || data.infoCred) {
      const existing = await this.prisma.globalFeedCatalog.findUnique({ where: { id } });
      const source = (data.sourceReliability ?? existing?.sourceReliability ?? 'C') as SourceReliability;
      const cred = (data.infoCred ?? existing?.infoCred ?? 3) as InfoCredibility;
      updateData.feedReliability = admiraltyToScore(source, cred);
    }

    return this.prisma.globalFeedCatalog.update({ where: { id }, data: updateData });
  }

  async deleteCatalogEntry(id: string): Promise<void> {
    await this.prisma.globalFeedCatalog.delete({ where: { id } });
  }

  async incrementSubscriberCount(id: string, delta: 1 | -1): Promise<void> {
    await this.prisma.globalFeedCatalog.update({
      where: { id },
      data: { subscriberCount: { increment: delta } },
    });
  }

  async updateFetchStats(
    id: string,
    stats: { lastFetchAt: Date; totalItemsIngested?: number; consecutiveFailures?: number },
  ): Promise<void> {
    const data: Record<string, unknown> = { lastFetchAt: stats.lastFetchAt };
    if (stats.totalItemsIngested !== undefined) data.totalItemsIngested = stats.totalItemsIngested;
    if (stats.consecutiveFailures !== undefined) data.consecutiveFailures = stats.consecutiveFailures;
    await this.prisma.globalFeedCatalog.update({ where: { id }, data });
  }
}
