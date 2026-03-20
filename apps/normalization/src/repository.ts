import type { PrismaClient, Ioc, Prisma } from '@prisma/client';
import type { ListIOCsQuery } from './schema.js';

export class IOCRepository {
  constructor(private readonly db: PrismaClient) {}

  /** Upsert an IOC: insert if new (by dedupeHash), update lastSeen + merge sourceRefs if existing */
  async upsert(data: {
    tenantId: string;
    feedSourceId: string;
    iocType: string;
    value: string;
    normalizedValue: string;
    dedupeHash: string;
    severity: string;
    tlp: string;
    confidence: number;
    lifecycle: string;
    tags: string[];
    mitreAttack: string[];
    malwareFamilies: string[];
    threatActors: string[];
    firstSeen: Date;
    lastSeen: Date;
    enrichmentData?: object;
  }): Promise<Ioc> {
    return this.db.ioc.upsert({
      where: { dedupeHash: data.dedupeHash },
      create: {
        tenantId: data.tenantId,
        feedSourceId: data.feedSourceId,
        iocType: data.iocType as Ioc['iocType'],
        value: data.value,
        normalizedValue: data.normalizedValue,
        dedupeHash: data.dedupeHash,
        severity: data.severity as Ioc['severity'],
        tlp: data.tlp as Ioc['tlp'],
        confidence: data.confidence,
        lifecycle: data.lifecycle as Ioc['lifecycle'],
        tags: data.tags,
        mitreAttack: data.mitreAttack,
        malwareFamilies: data.malwareFamilies,
        threatActors: data.threatActors,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        enrichmentData: (data.enrichmentData ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        lastSeen: data.lastSeen,
        confidence: data.confidence,
        severity: data.severity as Ioc['severity'],
        lifecycle: data.lifecycle as Ioc['lifecycle'],
        tags: { set: data.tags },
        mitreAttack: { set: data.mitreAttack },
        malwareFamilies: { set: data.malwareFamilies },
        threatActors: { set: data.threatActors },
        enrichmentData: (data.enrichmentData ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Find IOC by ID scoped to tenant */
  async findById(tenantId: string, id: string): Promise<Ioc | null> {
    return this.db.ioc.findFirst({
      where: { id, tenantId },
    });
  }

  /** List IOCs with filtering, search, and pagination */
  async findMany(tenantId: string, query: ListIOCsQuery): Promise<{ data: Ioc[]; total: number }> {
    const where: Prisma.IocWhereInput = { tenantId };

    if (query.type) where.iocType = query.type;
    if (query.severity) where.severity = query.severity;
    if (query.lifecycle) where.lifecycle = query.lifecycle;
    if (query.tlp) where.tlp = query.tlp;
    if (query.feedSourceId) where.feedSourceId = query.feedSourceId;
    if (query.minConfidence) where.confidence = { gte: query.minConfidence };
    if (query.search) {
      where.OR = [
        { value: { contains: query.search, mode: 'insensitive' } },
        { normalizedValue: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.IocOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await this.db.$transaction([
      this.db.ioc.findMany({ where, orderBy, skip, take: query.limit }),
      this.db.ioc.count({ where }),
    ]);

    return { data, total };
  }

  /** Get IOC stats for a tenant */
  async getStats(tenantId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byLifecycle: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    const where = { tenantId };
    const total = await this.db.ioc.count({ where });

    const byTypeRaw = await this.db.ioc.groupBy({ by: ['iocType'], _count: { _all: true }, orderBy: { iocType: 'asc' }, where });
    const byLifecycleRaw = await this.db.ioc.groupBy({ by: ['lifecycle'], _count: { _all: true }, orderBy: { lifecycle: 'asc' }, where });
    const bySeverityRaw = await this.db.ioc.groupBy({ by: ['severity'], _count: { _all: true }, orderBy: { severity: 'asc' }, where });

    const byType: Record<string, number> = {};
    for (const g of byTypeRaw) byType[g.iocType] = g._count._all;

    const byLifecycle: Record<string, number> = {};
    for (const g of byLifecycleRaw) byLifecycle[g.lifecycle] = g._count._all;

    const bySeverity: Record<string, number> = {};
    for (const g of bySeverityRaw) bySeverity[g.severity] = g._count._all;

    return { total, byType, byLifecycle, bySeverity };
  }

  /** Fetch existing IOC by dedupeHash for merge logic */
  async findByDedupeHash(dedupeHash: string): Promise<Ioc | null> {
    return this.db.ioc.findUnique({ where: { dedupeHash } });
  }

  /** Fetch feed reliability score from FeedSource table */
  async findFeedReliability(feedSourceId: string): Promise<number | null> {
    const feed = await this.db.feedSource.findUnique({
      where: { id: feedSourceId },
      select: { feedReliability: true },
    });
    return feed?.feedReliability ?? null;
  }
}
