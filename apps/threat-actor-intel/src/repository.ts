import type { PrismaClient, ThreatActorProfile, Prisma } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import type { ListActorsInput, SearchActorsInput, CreateActorInput, UpdateActorInput } from './schemas/actor.js';

/** Repository for ThreatActorProfile CRUD and query operations. */
export class ActorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Builds a Prisma where clause from filter params. */
  private buildWhere(tenantId: string, filters: Partial<ListActorsInput>): Prisma.ThreatActorProfileWhereInput {
    const where: Prisma.ThreatActorProfileWhereInput = { tenantId };
    if (filters.actorType) where.actorType = filters.actorType;
    if (filters.motivation) where.motivation = filters.motivation;
    if (filters.sophistication) where.sophistication = filters.sophistication;
    if (filters.country) where.country = { equals: filters.country, mode: 'insensitive' };
    if (filters.active !== undefined) where.active = filters.active;
    if (filters.tag) where.tags = { hasSome: [filters.tag] };
    return where;
  }

  /** Lists actors with pagination, sorting, and filters. */
  async findMany(tenantId: string, input: ListActorsInput): Promise<{ data: ThreatActorProfile[]; total: number }> {
    const where = this.buildWhere(tenantId, input);
    const skip = (input.page - 1) * input.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.threatActorProfile.findMany({
        where,
        skip,
        take: input.limit,
        orderBy: { [input.sortBy]: input.sortOrder },
      }),
      this.prisma.threatActorProfile.count({ where }),
    ]);
    return { data, total };
  }

  /** Finds a single actor by ID and tenant. */
  async findById(tenantId: string, id: string): Promise<ThreatActorProfile | null> {
    return this.prisma.threatActorProfile.findFirst({
      where: { id, tenantId },
    });
  }

  /** Finds an actor by name within a tenant. */
  async findByName(tenantId: string, name: string): Promise<ThreatActorProfile | null> {
    return this.prisma.threatActorProfile.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    });
  }

  /** Creates a new threat actor profile. */
  async create(tenantId: string, data: CreateActorInput): Promise<ThreatActorProfile> {
    try {
      return await this.prisma.threatActorProfile.create({
        data: {
          tenantId,
          ...data,
          firstSeen: data.firstSeen ? new Date(data.firstSeen) : null,
          lastSeen: data.lastSeen ? new Date(data.lastSeen) : null,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Unique constraint')) {
        throw new AppError(409, `Actor "${data.name}" already exists for this tenant`, 'ACTOR_DUPLICATE');
      }
      throw err;
    }
  }

  /** Updates an existing actor profile. */
  async update(tenantId: string, id: string, data: UpdateActorInput): Promise<ThreatActorProfile> {
    const existing = await this.findById(tenantId, id);
    if (!existing) throw new AppError(404, 'Threat actor not found', 'ACTOR_NOT_FOUND');

    const updateData: Prisma.ThreatActorProfileUpdateInput = { ...data };
    if (data.firstSeen) updateData.firstSeen = new Date(data.firstSeen);
    if (data.lastSeen) updateData.lastSeen = new Date(data.lastSeen);

    // TLP never-downgrade ratchet
    if (data.tlp) {
      const tlpOrder = { white: 0, green: 1, amber: 2, red: 3 } as const;
      const currentLevel = tlpOrder[existing.tlp as keyof typeof tlpOrder] ?? 0;
      const newLevel = tlpOrder[data.tlp as keyof typeof tlpOrder] ?? 0;
      if (newLevel < currentLevel) {
        delete updateData.tlp;
      }
    }

    try {
      return await this.prisma.threatActorProfile.update({
        where: { id },
        data: updateData,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Unique constraint')) {
        throw new AppError(409, `Actor "${data.name}" already exists for this tenant`, 'ACTOR_DUPLICATE');
      }
      throw err;
    }
  }

  /** Soft-deletes an actor (sets active = false). */
  async softDelete(tenantId: string, id: string): Promise<void> {
    const existing = await this.findById(tenantId, id);
    if (!existing) throw new AppError(404, 'Threat actor not found', 'ACTOR_NOT_FOUND');
    await this.prisma.threatActorProfile.update({
      where: { id },
      data: { active: false },
    });
  }

  /** Full-text search across name, aliases, and description. */
  async search(tenantId: string, input: SearchActorsInput): Promise<{ data: ThreatActorProfile[]; total: number }> {
    const term = input.q;
    const where: Prisma.ThreatActorProfileWhereInput = {
      tenantId,
      active: true,
      AND: [
        {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { aliases: { hasSome: [term] } },
            { description: { contains: term, mode: 'insensitive' } },
            { tags: { hasSome: [term] } },
            { ttps: { hasSome: [term] } },
            { associatedMalware: { hasSome: [term] } },
            { country: { contains: term, mode: 'insensitive' } },
          ],
        },
        ...(input.actorType ? [{ actorType: input.actorType }] : []),
        ...(input.motivation ? [{ motivation: input.motivation }] : []),
      ],
    };
    const skip = (input.page - 1) * input.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.threatActorProfile.findMany({ where, skip, take: input.limit, orderBy: { confidence: 'desc' } }),
      this.prisma.threatActorProfile.count({ where }),
    ]);
    return { data, total };
  }

  /** Returns aggregate statistics for actors in a tenant. */
  async getStats(tenantId: string): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    byMotivation: Record<string, number>;
    bySophistication: Record<string, number>;
    avgConfidence: number;
  }> {
    const [total, active, byType, byMotivation, bySophistication, avgResult] = await this.prisma.$transaction([
      this.prisma.threatActorProfile.count({ where: { tenantId } }),
      this.prisma.threatActorProfile.count({ where: { tenantId, active: true } }),
      this.prisma.threatActorProfile.groupBy({ by: ['actorType'], where: { tenantId }, orderBy: { actorType: 'asc' }, _count: { _all: true } }),
      this.prisma.threatActorProfile.groupBy({ by: ['motivation'], where: { tenantId }, orderBy: { motivation: 'asc' }, _count: { _all: true } }),
      this.prisma.threatActorProfile.groupBy({ by: ['sophistication'], where: { tenantId }, orderBy: { sophistication: 'asc' }, _count: { _all: true } }),
      this.prisma.threatActorProfile.aggregate({ where: { tenantId }, _avg: { confidence: true } }),
    ]);

    // Prisma groupBy returns complex union types; cast to runtime shape
    const toRecord = (groups: unknown[], key: string): Record<string, number> => {
      const result: Record<string, number> = {};
      for (const g of groups as Array<Record<string, unknown>>) {
        const count = g['_count'] as { _all: number };
        result[g[key] as string] = count._all;
      }
      return result;
    };

    return {
      total,
      active,
      byType: toRecord(byType as unknown[], 'actorType'),
      byMotivation: toRecord(byMotivation as unknown[], 'motivation'),
      bySophistication: toRecord(bySophistication as unknown[], 'sophistication'),
      avgConfidence: Math.round(avgResult._avg.confidence ?? 0),
    };
  }

  /** Finds all actors for export with optional filters. */
  async findForExport(tenantId: string, filters: { actorType?: string; motivation?: string; active?: boolean }): Promise<ThreatActorProfile[]> {
    const where: Prisma.ThreatActorProfileWhereInput = { tenantId };
    if (filters.actorType) where.actorType = filters.actorType as Prisma.EnumActorTypeFilter<'ThreatActorProfile'>;
    if (filters.motivation) where.motivation = filters.motivation as Prisma.EnumActorMotivationFilter<'ThreatActorProfile'>;
    if (filters.active !== undefined) where.active = filters.active;
    return this.prisma.threatActorProfile.findMany({ where, orderBy: { name: 'asc' } });
  }
}
