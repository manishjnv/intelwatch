import { type PrismaClient, type Prisma, type IocType, type Severity, type IocLifecycle, type TLP } from '@prisma/client';
import type { ListIocsQuery, SearchIocsBody, ExportIocsBody } from './schemas/ioc.js';

/** Prisma-backed IOC repository — all queries are tenant-scoped. */
export class IOCRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Build Prisma where clause from common filter parameters. */
  private buildWhereClause(
    tenantId: string,
    filters: {
      iocType?: string[]; severity?: string[]; lifecycle?: string[];
      tlp?: string[]; tags?: string[]; search?: string;
      minConfidence?: number; dateFrom?: Date; dateTo?: Date;
      feedSourceId?: string;
    },
  ): Prisma.IocWhereInput {
    const where: Prisma.IocWhereInput = { tenantId };

    if (filters.iocType?.length) {
      where.iocType = { in: filters.iocType as IocType[] };
    }
    if (filters.severity?.length) {
      where.severity = { in: filters.severity as Severity[] };
    }
    if (filters.lifecycle?.length) {
      where.lifecycle = { in: filters.lifecycle as IocLifecycle[] };
    }
    if (filters.tlp?.length) {
      where.tlp = { in: filters.tlp as TLP[] };
    }
    if (filters.tags?.length) {
      where.tags = { hasSome: filters.tags };
    }
    if (filters.minConfidence !== undefined) {
      where.confidence = { gte: filters.minConfidence };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.lastSeen = {};
      if (filters.dateFrom) (where.lastSeen as Prisma.DateTimeFilter).gte = filters.dateFrom;
      if (filters.dateTo) (where.lastSeen as Prisma.DateTimeFilter).lte = filters.dateTo;
    }
    if (filters.feedSourceId) {
      where.feedSourceId = filters.feedSourceId;
    }
    if (filters.search) {
      const term = filters.search;
      where.OR = [
        { normalizedValue: { contains: term, mode: 'insensitive' } },
        { tags: { hasSome: [term] } },
        { threatActors: { hasSome: [term] } },
        { malwareFamilies: { hasSome: [term] } },
      ];
    }
    return where;
  }

  /** Paginated IOC list with filters and sorting. */
  async findMany(tenantId: string, query: ListIocsQuery): Promise<{ items: unknown[]; total: number }> {
    const where = this.buildWhereClause(tenantId, query);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ioc.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip,
        take: query.limit,
      }),
      this.prisma.ioc.count({ where }),
    ]);

    return { items, total };
  }

  /** Find single IOC by ID within tenant. */
  async findById(tenantId: string, id: string): Promise<unknown | null> {
    return this.prisma.ioc.findFirst({ where: { id, tenantId } });
  }

  /** Find IOC by dedupe hash. */
  async findByDedupeHash(dedupeHash: string): Promise<unknown | null> {
    return this.prisma.ioc.findUnique({ where: { dedupeHash } });
  }

  /** Create a new IOC record. */
  async create(data: Prisma.IocUncheckedCreateInput): Promise<unknown> {
    return this.prisma.ioc.create({ data });
  }

  /** Update IOC fields by ID within tenant. Returns null if not found. */
  async update(tenantId: string, id: string, data: Prisma.IocUncheckedUpdateInput): Promise<unknown | null> {
    const existing = await this.prisma.ioc.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    return this.prisma.ioc.update({ where: { id }, data });
  }

  /** Soft-delete: set lifecycle to 'revoked'. */
  async softDelete(tenantId: string, id: string): Promise<unknown | null> {
    const existing = await this.prisma.ioc.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    return this.prisma.ioc.update({
      where: { id },
      data: { lifecycle: 'revoked', updatedAt: new Date() },
    });
  }

  /** Bulk update severity for multiple IOCs. */
  async bulkUpdateSeverity(tenantId: string, ids: string[], severity: string): Promise<number> {
    const result = await this.prisma.ioc.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { severity: severity as never, updatedAt: new Date() },
    });
    return result.count;
  }

  /** Bulk update lifecycle for multiple IOCs. */
  async bulkUpdateLifecycle(tenantId: string, ids: string[], lifecycle: string): Promise<number> {
    const result = await this.prisma.ioc.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { lifecycle: lifecycle as never, updatedAt: new Date() },
    });
    return result.count;
  }

  /** Bulk set tags (replaces existing tags). */
  async bulkSetTags(tenantId: string, ids: string[], tags: string[]): Promise<number> {
    const result = await this.prisma.ioc.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { tags, updatedAt: new Date() },
    });
    return result.count;
  }

  /** Full-text search across IOC fields. */
  async search(tenantId: string, body: SearchIocsBody): Promise<{ items: unknown[]; total: number }> {
    const where = this.buildWhereClause(tenantId, {
      search: body.query,
      iocType: body.iocType,
      severity: body.severity,
      lifecycle: body.lifecycle,
      tlp: body.tlp,
      minConfidence: body.minConfidence,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
    const skip = (body.page - 1) * body.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ioc.findMany({
        where,
        orderBy: [{ confidence: 'desc' }, { lastSeen: 'desc' }],
        skip,
        take: body.limit,
      }),
      this.prisma.ioc.count({ where }),
    ]);

    return { items, total };
  }

  /** Find IOCs related to a given IOC (pivot). */
  async findPivotRelated(
    tenantId: string,
    ioc: { id: string; feedSourceId: string | null; threatActors: string[]; malwareFamilies: string[]; iocType: string; normalizedValue: string },
    limit: number = 50,
  ): Promise<{ byFeed: unknown[]; byThreatActor: unknown[]; byMalware: unknown[]; bySubnet: unknown[] }> {
    const baseWhere = { tenantId, id: { not: ioc.id } };

    const byFeed = ioc.feedSourceId
      ? await this.prisma.ioc.findMany({
          where: { ...baseWhere, feedSourceId: ioc.feedSourceId },
          take: limit, orderBy: { confidence: 'desc' },
        })
      : [];

    const byThreatActor = ioc.threatActors.length > 0
      ? await this.prisma.ioc.findMany({
          where: { ...baseWhere, threatActors: { hasSome: ioc.threatActors } },
          take: limit, orderBy: { confidence: 'desc' },
        })
      : [];

    const byMalware = ioc.malwareFamilies.length > 0
      ? await this.prisma.ioc.findMany({
          where: { ...baseWhere, malwareFamilies: { hasSome: ioc.malwareFamilies } },
          take: limit, orderBy: { confidence: 'desc' },
        })
      : [];

    // Subnet pivot: for IP IOCs, find others in the same /24
    let bySubnet: unknown[] = [];
    if (ioc.iocType === 'ip') {
      const parts = ioc.normalizedValue.split('.');
      if (parts.length === 4) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
        bySubnet = await this.prisma.ioc.findMany({
          where: { ...baseWhere, iocType: 'ip', normalizedValue: { startsWith: prefix } },
          take: limit, orderBy: { confidence: 'desc' },
        });
      }
    }

    return { byFeed, byThreatActor, byMalware, bySubnet };
  }

  /** Fetch IOCs for export (no pagination, up to maxResults). */
  async findForExport(tenantId: string, body: ExportIocsBody): Promise<unknown[]> {
    const where = this.buildWhereClause(tenantId, {
      iocType: body.iocType,
      severity: body.severity,
      lifecycle: body.lifecycle,
      tlp: body.tlp,
      tags: body.tags,
      minConfidence: body.minConfidence,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });

    return this.prisma.ioc.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
      take: body.maxResults,
    });
  }

  /** Aggregate stats by type, severity, and lifecycle. */
  async getStats(tenantId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byLifecycle: Record<string, number>;
    avgConfidence: number;
  }> {
    const [total, typeGroups, severityGroups, lifecycleGroups, avgResult] = await this.prisma.$transaction([
      this.prisma.ioc.count({ where: { tenantId } }),
      this.prisma.ioc.groupBy({ by: ['iocType'], where: { tenantId }, orderBy: { iocType: 'asc' }, _count: { _all: true } }),
      this.prisma.ioc.groupBy({ by: ['severity'], where: { tenantId }, orderBy: { severity: 'asc' }, _count: { _all: true } }),
      this.prisma.ioc.groupBy({ by: ['lifecycle'], where: { tenantId }, orderBy: { lifecycle: 'asc' }, _count: { _all: true } }),
      this.prisma.ioc.aggregate({ where: { tenantId }, _avg: { confidence: true } }),
    ]);

    const toRecord = (groups: unknown[], key: string): Record<string, number> => {
      const result: Record<string, number> = {};
      for (const g of groups as Array<Record<string, unknown>>) {
        const count = g['_count'] as { _all: number } | number;
        result[g[key] as string] = typeof count === 'number' ? count : count._all;
      }
      return result;
    };

    return {
      total,
      byType: toRecord(typeGroups, 'iocType'),
      bySeverity: toRecord(severityGroups, 'severity'),
      byLifecycle: toRecord(lifecycleGroups, 'lifecycle'),
      avgConfidence: Math.round(avgResult._avg.confidence ?? 0),
    };
  }

  /** Add tags to IOCs (merge with existing). Uses raw SQL for array_cat + array_agg. */
  async bulkAddTags(tenantId: string, ids: string[], tags: string[]): Promise<number> {
    // Prisma doesn't support array append natively, use updateMany with set per IOC
    const iocs = await this.prisma.ioc.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, tags: true },
    });
    let count = 0;
    for (const ioc of iocs) {
      const merged = [...new Set([...ioc.tags, ...tags])];
      await this.prisma.ioc.update({ where: { id: ioc.id }, data: { tags: merged } });
      count++;
    }
    return count;
  }

  /** Remove tags from IOCs. */
  async bulkRemoveTags(tenantId: string, ids: string[], tagsToRemove: string[]): Promise<number> {
    const iocs = await this.prisma.ioc.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, tags: true },
    });
    let count = 0;
    const removeSet = new Set(tagsToRemove);
    for (const ioc of iocs) {
      const filtered = ioc.tags.filter((t) => !removeSet.has(t));
      await this.prisma.ioc.update({ where: { id: ioc.id }, data: { tags: filtered } });
      count++;
    }
    return count;
  }

  // ── Accuracy improvement queries ────────────────────────────

  /** A1: Count IOCs in the same /24 subnet for density scoring. */
  async countBySubnet(tenantId: string, subnetPrefix: string): Promise<number> {
    return this.prisma.ioc.count({
      where: { tenantId, iocType: 'ip', normalizedValue: { startsWith: `${subnetPrefix}.` } },
    });
  }

  /** B1: Find IOCs related to a false-positive (same feed, same /24). */
  async findFPRelated(tenantId: string, ioc: { id: string; feedSourceId: string | null; iocType: string; normalizedValue: string }): Promise<string[]> {
    const conditions: unknown[] = [];
    if (ioc.feedSourceId) {
      conditions.push({ feedSourceId: ioc.feedSourceId, lifecycle: { notIn: ['false_positive', 'revoked', 'archived'] } });
    }
    if (ioc.iocType === 'ip') {
      const parts = ioc.normalizedValue.split('.');
      if (parts.length === 4) {
        const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
        conditions.push({ iocType: 'ip', normalizedValue: { startsWith: prefix }, lifecycle: { notIn: ['false_positive', 'revoked', 'archived'] } });
      }
    }
    if (conditions.length === 0) return [];

    const related = await this.prisma.ioc.findMany({
      where: { tenantId, id: { not: ioc.id }, OR: conditions as Prisma.IocWhereInput[] },
      select: { id: true },
      take: 100,
    });
    return related.map((r) => r.id);
  }

  /** B1: Add a review tag to multiple IOCs. */
  async tagForReview(tenantId: string, ids: string[], tag: string): Promise<number> {
    const iocs = await this.prisma.ioc.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, tags: true },
    });
    let count = 0;
    for (const ioc of iocs) {
      if (!ioc.tags.includes(tag)) {
        await this.prisma.ioc.update({ where: { id: ioc.id }, data: { tags: [...ioc.tags, tag] } });
        count++;
      }
    }
    return count;
  }

  /** B3: Per-feed accuracy aggregation. */
  async getFeedStats(tenantId: string): Promise<Array<{
    feedSourceId: string; total: number; avgConfidence: number;
    falsePositiveCount: number; revokedCount: number;
  }>> {
    const feeds = await this.prisma.ioc.groupBy({
      by: ['feedSourceId'],
      where: { tenantId, feedSourceId: { not: null } },
      orderBy: { feedSourceId: 'asc' },
      _count: { _all: true },
      _avg: { confidence: true },
    });

    const results: Array<{
      feedSourceId: string; total: number; avgConfidence: number;
      falsePositiveCount: number; revokedCount: number;
    }> = [];

    for (const f of feeds) {
      if (!f.feedSourceId) continue;
      const fpCount = await this.prisma.ioc.count({
        where: { tenantId, feedSourceId: f.feedSourceId, lifecycle: 'false_positive' },
      });
      const revokedCount = await this.prisma.ioc.count({
        where: { tenantId, feedSourceId: f.feedSourceId, lifecycle: 'revoked' },
      });
      results.push({
        feedSourceId: f.feedSourceId,
        total: f._count._all,
        avgConfidence: Math.round(f._avg.confidence ?? 0),
        falsePositiveCount: fpCount,
        revokedCount,
      });
    }
    return results;
  }

  /** B2: Store analyst override in enrichmentData. */
  async setAnalystOverride(tenantId: string, id: string, override: { confidence: number; reason: string; analyst: string }): Promise<unknown | null> {
    const ioc = await this.prisma.ioc.findFirst({ where: { id, tenantId } });
    if (!ioc) return null;
    const enrichment = (ioc.enrichmentData ?? {}) as Record<string, unknown>;
    enrichment.analystOverride = { ...override, timestamp: new Date().toISOString() };
    return this.prisma.ioc.update({
      where: { id },
      data: { confidence: override.confidence, enrichmentData: enrichment as Prisma.JsonObject, updatedAt: new Date() },
    });
  }
}
