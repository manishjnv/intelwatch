import type { PrismaClient } from '@prisma/client';
import type { ActorRepository } from './repository.js';
import type { ActorService } from './service.js';
import {
  buildDiamondModel, detectFalseFlags, predictTargets,
  compareActors, computeFeedActorAccuracy,
  type DiamondModel, type FalseFlagAlert, type PredictedTarget,
  type ActorComparison, type FeedActorAccuracy,
} from './accuracy-p2.js';

/** P2 accuracy improvement service methods (separate from core service to respect 400-line limit). */
export class ActorServiceP2 {
  constructor(
    private readonly coreService: ActorService,
    private readonly repo: ActorRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** A5: Diamond Model — maps actor to adversary/capability/infrastructure/victim facets. */
  async getDiamondModel(tenantId: string, actorId: string): Promise<DiamondModel> {
    const actor = await this.coreService.getActor(tenantId, actorId);
    const names = [actor.name, ...actor.aliases];
    const iocCount = await this.prisma.ioc.count({
      where: { tenantId, threatActors: { hasSome: names } },
    });
    return buildDiamondModel(actor, iocCount);
  }

  /** B3: False flag detection — flags suspicious TTP overlap with other actors. */
  async getFalseFlagAlerts(tenantId: string, actorId: string): Promise<FalseFlagAlert[]> {
    const actor = await this.coreService.getActor(tenantId, actorId);
    const { data: allActors } = await this.repo.findMany(tenantId, {
      page: 1, limit: 200, sortBy: 'name', sortOrder: 'asc', active: true,
    });

    const others = allActors
      .filter((a) => a.id !== actorId)
      .map((a) => ({ id: a.id, name: a.name, ttps: a.ttps }));

    return detectFalseFlags(
      { id: actor.id, name: actor.name, ttps: actor.ttps },
      others,
    );
  }

  /** C3: Victimology prediction — predicts probable next targets from IOC sector data. */
  async getVictimologyPrediction(tenantId: string, actorId: string): Promise<{
    actorName: string;
    profileSectors: string[];
    predictions: PredictedTarget[];
  }> {
    const actor = await this.coreService.getActor(tenantId, actorId);

    // Combine actor profile sectors with sectors from linked IOCs (if tagged)
    const allSectors = [...actor.targetSectors];

    // If no sector data, return empty predictions
    if (allSectors.length === 0) {
      return { actorName: actor.name, profileSectors: [], predictions: [] };
    }

    return {
      actorName: actor.name,
      profileSectors: actor.targetSectors,
      predictions: predictTargets(allSectors),
    };
  }

  /** D3: Actor comparison — side-by-side comparison of two actors. */
  async getActorComparison(tenantId: string, actorIdA: string, actorIdB: string): Promise<ActorComparison> {
    const [actorA, actorB] = await Promise.all([
      this.coreService.getActor(tenantId, actorIdA),
      this.coreService.getActor(tenantId, actorIdB),
    ]);

    return compareActors(
      { id: actorA.id, name: actorA.name, ttps: actorA.ttps, associatedMalware: actorA.associatedMalware, targetSectors: actorA.targetSectors, targetRegions: actorA.targetRegions },
      { id: actorB.id, name: actorB.name, ttps: actorB.ttps, associatedMalware: actorB.associatedMalware, targetSectors: actorB.targetSectors, targetRegions: actorB.targetRegions },
    );
  }

  /** D4: Per-feed actor accuracy — which feeds provide the best actor intel. */
  async getFeedActorAccuracy(tenantId: string): Promise<FeedActorAccuracy[]> {
    const iocs = await this.prisma.ioc.findMany({
      where: { tenantId, threatActors: { isEmpty: false } },
      select: { feedSourceId: true, confidence: true, threatActors: true },
      take: 5000,
    });

    return computeFeedActorAccuracy(iocs);
  }
}
