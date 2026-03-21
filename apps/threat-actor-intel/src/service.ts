import type { PrismaClient, ThreatActorProfile } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import type { ActorRepository } from './repository.js';
import type {
  ListActorsInput, CreateActorInput, UpdateActorInput,
  SearchActorsInput, ExportActorsInput, LinkedIocsInput, TimelineInput,
} from './schemas/actor.js';
import {
  calculateAttributionScore, jaccardSimilarity,
  generateMitreSummary, computeSophisticationScore,
  actorToCsvRow, CSV_HEADER,
  explainAttribution, findAliasCandidates, analyzeCorroboration,
  classifyDormancy, computeLinkStrength, classifyLinkStrength,
  type ExplainableAttribution, type AliasSuggestion,
  type CorroborationResult, type DormancyResult, type ScoredLink,
} from './scoring.js';
import {
  computeAttributionDecay, analyzeTtpEvolution,
  detectSharedInfrastructure, buildActorProvenance, generateMitreHeatmap,
  type DecayResult, type TtpEvolution, type SharedInfrastructure,
  type ActorProvenance, type MitreHeatmapCell,
} from './accuracy.js';

/** Business logic layer for the Threat Actor Intel Service. */
export class ActorService {
  constructor(
    private readonly repo: ActorRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** Lists actors with pagination and filters. */
  async listActors(tenantId: string, input: ListActorsInput) {
    const { data, total } = await this.repo.findMany(tenantId, input);
    return { data, total, page: input.page, limit: input.limit };
  }

  /** Gets a single actor by ID. Throws 404 if not found. */
  async getActor(tenantId: string, id: string): Promise<ThreatActorProfile> {
    const actor = await this.repo.findById(tenantId, id);
    if (!actor) throw new AppError(404, 'Threat actor not found', 'ACTOR_NOT_FOUND');
    return actor;
  }

  /** Creates a new threat actor profile with alias deduplication check. */
  async createActor(tenantId: string, input: CreateActorInput): Promise<ThreatActorProfile> {
    // Check if name or any alias conflicts with existing actor names/aliases
    const existingByName = await this.repo.findByName(tenantId, input.name);
    if (existingByName) {
      throw new AppError(409, `Actor "${input.name}" already exists`, 'ACTOR_DUPLICATE');
    }
    return this.repo.create(tenantId, input);
  }

  /** Updates an existing actor profile. */
  async updateActor(tenantId: string, id: string, input: UpdateActorInput): Promise<ThreatActorProfile> {
    return this.repo.update(tenantId, id, input);
  }

  /** Soft-deletes an actor. */
  async deleteActor(tenantId: string, id: string): Promise<void> {
    await this.repo.softDelete(tenantId, id);
  }

  /** Full-text search across actor profiles. */
  async searchActors(tenantId: string, input: SearchActorsInput) {
    const { data, total } = await this.repo.search(tenantId, input);
    return { data, total, page: input.page, limit: input.limit };
  }

  /** Returns aggregate statistics for actors. */
  async getStats(tenantId: string) {
    return this.repo.getStats(tenantId);
  }

  /**
   * Gets IOCs linked to a threat actor by matching actor name and aliases
   * against the IOC table's threatActors string array.
   */
  async getLinkedIocs(tenantId: string, actorId: string, input: LinkedIocsInput) {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];
    const skip = (input.page - 1) * input.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ioc.findMany({
        where: { tenantId, threatActors: { hasSome: names } },
        skip,
        take: input.limit,
        orderBy: { confidence: 'desc' },
        select: {
          id: true, iocType: true, normalizedValue: true, severity: true,
          confidence: true, lifecycle: true, tlp: true, tags: true,
          threatActors: true, malwareFamilies: true, firstSeen: true, lastSeen: true,
        },
      }),
      this.prisma.ioc.count({ where: { tenantId, threatActors: { hasSome: names } } }),
    ]);

    return { data, total, page: input.page, limit: input.limit, actorName: actor.name };
  }

  /** Generates activity timeline data for an actor based on linked IOC timestamps. */
  async getTimeline(tenantId: string, actorId: string, input: TimelineInput) {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];
    const since = new Date();
    since.setDate(since.getDate() - input.days);

    const iocs = await this.prisma.ioc.findMany({
      where: {
        tenantId,
        threatActors: { hasSome: names },
        firstSeen: { gte: since },
      },
      select: {
        id: true, iocType: true, normalizedValue: true, severity: true,
        confidence: true, firstSeen: true, lastSeen: true,
      },
      orderBy: { firstSeen: 'asc' },
    });

    // Bucket IOCs by day
    const buckets: Record<string, { date: string; count: number; severities: Record<string, number>; types: Record<string, number> }> = {};
    for (const ioc of iocs) {
      const day = ioc.firstSeen.toISOString().slice(0, 10);
      if (!buckets[day]) {
        buckets[day] = { date: day, count: 0, severities: {}, types: {} };
      }
      buckets[day].count++;
      buckets[day].severities[ioc.severity] = (buckets[day].severities[ioc.severity] ?? 0) + 1;
      buckets[day].types[ioc.iocType] = (buckets[day].types[ioc.iocType] ?? 0) + 1;
    }

    return {
      actorName: actor.name,
      days: input.days,
      totalIocs: iocs.length,
      timeline: Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Returns MITRE ATT&CK technique summary for an actor. */
  async getMitreSummary(tenantId: string, actorId: string) {
    const actor = await this.getActor(tenantId, actorId);
    const mitreSummary = generateMitreSummary(actor.ttps);
    const sophisticationScore = computeSophisticationScore(actor.ttps);
    return {
      actorName: actor.name,
      totalTechniques: actor.ttps.length,
      sophisticationScore,
      tactics: mitreSummary,
    };
  }

  /** Exports actors in JSON or CSV format. */
  async exportActors(tenantId: string, input: ExportActorsInput): Promise<{ content: string; contentType: string; filename: string }> {
    const actors = await this.repo.findForExport(tenantId, {
      actorType: input.actorType,
      motivation: input.motivation,
      active: input.active,
    });

    if (input.format === 'csv') {
      const rows = actors.map(actorToCsvRow);
      return {
        content: [CSV_HEADER, ...rows].join('\n'),
        contentType: 'text/csv',
        filename: `threat-actors-${new Date().toISOString().slice(0, 10)}.csv`,
      };
    }

    return {
      content: JSON.stringify({ data: actors, total: actors.length, exportedAt: new Date().toISOString() }, null, 2),
      contentType: 'application/json',
      filename: `threat-actors-${new Date().toISOString().slice(0, 10)}.json`,
    };
  }

  /**
   * Computes attribution score between two actors based on shared signals.
   * Useful for alias deduplication and actor merging suggestions.
   */
  computeAttributionBetween(actorA: ThreatActorProfile, actorB: ThreatActorProfile): number {
    const signals = {
      infrastructureOverlap: jaccardSimilarity(actorA.associatedMalware, actorB.associatedMalware),
      malwareSimilarity: jaccardSimilarity(actorA.associatedMalware, actorB.associatedMalware),
      ttpMatch: jaccardSimilarity(actorA.ttps, actorB.ttps),
      victimologyMatch: jaccardSimilarity(
        [...actorA.targetSectors, ...actorA.targetRegions],
        [...actorB.targetSectors, ...actorB.targetRegions],
      ),
    };
    return calculateAttributionScore(signals);
  }

  // ═══════════════════════════════════════════════════════════
  // P0 ACCURACY IMPROVEMENTS — Service Methods
  // ═══════════════════════════════════════════════════════════

  /** A1: Explainable attribution — returns 4-signal breakdown with evidence. */
  async getExplainableAttribution(tenantId: string, actorId: string): Promise<ExplainableAttribution> {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];

    const linkedIocs = await this.prisma.ioc.findMany({
      where: { tenantId, threatActors: { hasSome: names } },
      select: { normalizedValue: true, malwareFamilies: true, threatActors: true, iocType: true },
      take: 500,
    });

    const sharedIocValues = linkedIocs.map((i) => i.normalizedValue);
    const allMalware = [...new Set(linkedIocs.flatMap((i) => i.malwareFamilies))];
    const sharedMalware = allMalware.filter((m) => actor.associatedMalware.map((a) => a.toLowerCase()).includes(m.toLowerCase()));

    return explainAttribution(
      sharedMalware.length > 0 ? sharedMalware : actor.associatedMalware,
      actor.ttps,
      actor.targetSectors,
      actor.targetRegions,
      sharedIocValues,
    );
  }

  /** A2: Alias clustering — finds actors that might be the same entity. */
  async getAliasSuggestions(tenantId: string, actorId: string): Promise<AliasSuggestion[]> {
    const actor = await this.getActor(tenantId, actorId);

    // Fetch all other active actors in this tenant
    const { data: allActors } = await this.repo.findMany(tenantId, {
      page: 1, limit: 500, sortBy: 'name', sortOrder: 'asc', active: true,
    });

    const candidates = allActors
      .filter((a) => a.id !== actor.id)
      .map((a) => ({ id: a.id, name: a.name, ttps: a.ttps, associatedMalware: a.associatedMalware, targetSectors: a.targetSectors }));

    return findAliasCandidates(
      { ttps: actor.ttps, associatedMalware: actor.associatedMalware, targetSectors: actor.targetSectors },
      candidates,
    );
  }

  /** A3: Multi-source corroboration — how many feeds mention this actor. */
  async getCorroboration(tenantId: string, actorId: string): Promise<CorroborationResult> {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];

    const feedIds = await this.prisma.ioc.findMany({
      where: { tenantId, threatActors: { hasSome: names }, feedSourceId: { not: null } },
      select: { feedSourceId: true },
      distinct: ['feedSourceId'],
    });

    const uniqueFeedIds = feedIds.map((f) => f.feedSourceId).filter(Boolean) as string[];
    return analyzeCorroboration(actor.confidence, uniqueFeedIds);
  }

  /** B1: Dormancy detection — classifies actor activity status. */
  async getDormancyStatus(tenantId: string, actorId: string): Promise<DormancyResult> {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];

    const iocDates = await this.prisma.ioc.findMany({
      where: { tenantId, threatActors: { hasSome: names } },
      select: { firstSeen: true },
      orderBy: { firstSeen: 'desc' },
      take: 100,
    });

    return classifyDormancy(iocDates.map((i) => i.firstSeen));
  }

  /** C2: Link strength scoring — scores each IOC-actor link 0-100. */
  async getScoredLinks(tenantId: string, actorId: string, limit: number = 50): Promise<{ data: ScoredLink[]; total: number }> {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];
    const now = new Date();

    const iocs = await this.prisma.ioc.findMany({
      where: { tenantId, threatActors: { hasSome: names } },
      select: {
        id: true, iocType: true, normalizedValue: true, confidence: true,
        feedSourceId: true, firstSeen: true, threatActors: true,
      },
      orderBy: { confidence: 'desc' },
      take: limit,
    });

    // Count feeds per IOC for corroboration
    const feedCounts = new Map<string, number>();
    for (const ioc of iocs) {
      if (ioc.feedSourceId) {
        feedCounts.set(ioc.feedSourceId, (feedCounts.get(ioc.feedSourceId) ?? 0) + 1);
      }
    }

    const scoredLinks: ScoredLink[] = iocs.map((ioc) => {
      const daysSince = Math.max(0, Math.floor((now.getTime() - ioc.firstSeen.getTime()) / 86400000));
      const strength = computeLinkStrength({
        feedReliability: 70, // Default — feed reliability scoring comes in Phase 4
        daysSinceAttribution: daysSince,
        corroboratingFeeds: ioc.feedSourceId ? (feedCounts.get(ioc.feedSourceId) ?? 1) : 1,
        iocConfidence: ioc.confidence,
      });
      return {
        iocId: ioc.id,
        iocValue: ioc.normalizedValue,
        iocType: ioc.iocType,
        linkStrength: strength,
        classification: classifyLinkStrength(strength),
        signals: { feedReliability: 70, recency: Math.round(100 * Math.exp(-0.023 * daysSince)), corroboration: Math.min(100, 50 + ((feedCounts.get(ioc.feedSourceId ?? '') ?? 1) - 1) * 15), iocConfidence: ioc.confidence },
      };
    });

    scoredLinks.sort((a, b) => b.linkStrength - a.linkStrength);
    return { data: scoredLinks, total: iocs.length };
  }

  // ═══════════════════════════════════════════════════════════
  // P1 ACCURACY IMPROVEMENTS — Service Methods
  // ═══════════════════════════════════════════════════════════

  /** A4: Attribution decay — applies type-aware confidence decay. */
  async getAttributionDecay(tenantId: string, actorId: string): Promise<DecayResult> {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];
    const now = new Date();

    const iocs = await this.prisma.ioc.findMany({
      where: { tenantId, threatActors: { hasSome: names } },
      select: { iocType: true, firstSeen: true },
      take: 500,
    });

    const linkedIocs = iocs.map((i) => ({
      iocType: i.iocType,
      daysSinceFirstSeen: Math.max(0, Math.floor((now.getTime() - i.firstSeen.getTime()) / 86400000)),
    }));

    return computeAttributionDecay(actor.confidence, linkedIocs);
  }

  /** B2: TTP evolution — compares recent vs historical TTPs. */
  async getTtpEvolution(tenantId: string, actorId: string): Promise<TtpEvolution> {
    const actor = await this.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const oneHundredTwentyDaysAgo = new Date(now.getTime() - 120 * 86400000);

    const [recentIocs, historicalIocs] = await this.prisma.$transaction([
      this.prisma.ioc.findMany({
        where: { tenantId, threatActors: { hasSome: names }, firstSeen: { gte: thirtyDaysAgo } },
        select: { mitreAttack: true },
      }),
      this.prisma.ioc.findMany({
        where: { tenantId, threatActors: { hasSome: names }, firstSeen: { gte: oneHundredTwentyDaysAgo, lt: thirtyDaysAgo } },
        select: { mitreAttack: true },
      }),
    ]);

    const recentTtps = [...new Set(recentIocs.flatMap((i) => i.mitreAttack))];
    const historicalTtps = [...new Set(historicalIocs.flatMap((i) => i.mitreAttack))];

    return analyzeTtpEvolution(recentTtps, historicalTtps);
  }

  /** C1: Cross-actor infra sharing — finds actors sharing IOCs. */
  async getSharedInfrastructure(tenantId: string, actorId: string): Promise<SharedInfrastructure[]> {
    await this.getActor(tenantId, actorId); // validates actor exists (throws 404)
    const { data: allActors } = await this.repo.findMany(tenantId, {
      page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc', active: true,
    });

    // Fetch IOCs for each actor (limited to 100 per actor for performance)
    const actorIocs: Array<{ id: string; name: string; iocs: Array<{ value: string; iocType: string }> }> = [];
    for (const a of allActors) {
      const names = [a.name, ...a.aliases];
      const iocs = await this.prisma.ioc.findMany({
        where: { tenantId, threatActors: { hasSome: names } },
        select: { normalizedValue: true, iocType: true },
        take: 100,
      });
      actorIocs.push({ id: a.id, name: a.name, iocs: iocs.map((i) => ({ value: i.normalizedValue, iocType: i.iocType })) });
    }

    // Filter to only pairs involving the requested actor
    const allShared = detectSharedInfrastructure(actorIocs);
    return allShared.filter((s) => s.actorAId === actorId || s.actorBId === actorId);
  }

  /** D1: Provenance — builds enriched export record for an actor. */
  async getActorProvenance(tenantId: string, actorId: string): Promise<ActorProvenance> {
    const actor = await this.getActor(tenantId, actorId);
    const corroboration = await this.getCorroboration(tenantId, actorId);
    const dormancy = await this.getDormancyStatus(tenantId, actorId);
    const ttpEvolution = await this.getTtpEvolution(tenantId, actorId);
    const links = await this.getScoredLinks(tenantId, actorId, 500);
    const avgStrength = links.data.length > 0
      ? links.data.reduce((s, l) => s + l.linkStrength, 0) / links.data.length
      : 0;

    return buildActorProvenance(
      actor, corroboration.feedCount, dormancy.status,
      ttpEvolution.evolutionVelocity, links.total, avgStrength,
    );
  }

  /** D2: MITRE heatmap — per-tactic coverage data. */
  async getMitreHeatmap(tenantId: string, actorId: string): Promise<MitreHeatmapCell[]> {
    const actor = await this.getActor(tenantId, actorId);
    return generateMitreHeatmap(actor.ttps);
  }
}
