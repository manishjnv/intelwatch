/**
 * P2 Accuracy Improvements — pure scoring functions.
 *
 * A5: Diamond Model integration
 * B3: False flag detection
 * C3: Victimology pattern prediction
 * D3: Actor comparison report
 * D4: Per-feed actor accuracy report
 */

import { jaccardSimilarity } from './scoring.js';

// ── A5: Diamond Model Integration ───────────────────────────

export interface DiamondFacet {
  facet: 'adversary' | 'capability' | 'infrastructure' | 'victim';
  filled: boolean;
  items: string[];
  score: number;
}

export interface DiamondModel {
  completeness: number;
  facets: DiamondFacet[];
}

/**
 * A5: Maps an actor profile to the Diamond Model (adversary-capability-infrastructure-victim).
 * Returns completeness score (0-100) and per-facet breakdown.
 */
export function buildDiamondModel(actor: {
  name: string;
  aliases: string[];
  actorType: string;
  motivation: string;
  country: string | null;
  ttps: string[];
  associatedMalware: string[];
  targetSectors: string[];
  targetRegions: string[];
}, linkedIocCount: number): DiamondModel {
  // Adversary: identity is known if we have name + type + motivation + country
  const adversaryItems: string[] = [actor.name, ...actor.aliases];
  if (actor.actorType !== 'unknown') adversaryItems.push(`type:${actor.actorType}`);
  if (actor.motivation !== 'unknown') adversaryItems.push(`motivation:${actor.motivation}`);
  if (actor.country) adversaryItems.push(`country:${actor.country}`);
  const adversaryScore = Math.min(100, adversaryItems.length * 20);

  // Capability: TTPs + malware = actor's toolset
  const capabilityItems = [...actor.ttps.slice(0, 10), ...actor.associatedMalware.slice(0, 10)];
  const capabilityScore = Math.min(100, capabilityItems.length * 10);

  // Infrastructure: IOC count = known infrastructure
  const infraItems = [`${linkedIocCount} linked IOCs`];
  const infraScore = Math.min(100, linkedIocCount * 5);

  // Victim: target sectors + regions
  const victimItems = [...actor.targetSectors, ...actor.targetRegions];
  const victimScore = Math.min(100, victimItems.length * 15);

  const facets: DiamondFacet[] = [
    { facet: 'adversary', filled: adversaryScore > 0, items: adversaryItems, score: adversaryScore },
    { facet: 'capability', filled: capabilityScore > 0, items: capabilityItems, score: capabilityScore },
    { facet: 'infrastructure', filled: infraScore > 0, items: infraItems, score: infraScore },
    { facet: 'victim', filled: victimScore > 0, items: victimItems, score: victimScore },
  ];

  const filledCount = facets.filter((f) => f.filled).length;
  const avgScore = facets.reduce((s, f) => s + f.score, 0) / 4;
  const completeness = Math.round((filledCount / 4) * 50 + (avgScore / 100) * 50);

  return { completeness, facets };
}

// ── B3: False Flag Detection ────────────────────────────────

export interface FalseFlagAlert {
  suspectActorId: string;
  suspectActorName: string;
  matchingActorId: string;
  matchingActorName: string;
  ttpOverlap: number;
  sharedTtps: string[];
  assessment: 'false_flag_likely' | 'tool_sharing_possible' | 'no_concern';
}

/** Threshold for TTP overlap to trigger false flag alert. */
export const FALSE_FLAG_THRESHOLD = 0.70;

/**
 * B3: Detects when an actor's TTPs suddenly match another actor at >70% similarity.
 * Suggests false flag, tool sharing, or incorrect attribution.
 */
export function detectFalseFlags(
  target: { id: string; name: string; ttps: string[] },
  otherActors: Array<{ id: string; name: string; ttps: string[] }>,
): FalseFlagAlert[] {
  const alerts: FalseFlagAlert[] = [];

  for (const other of otherActors) {
    if (other.id === target.id) continue;
    if (target.ttps.length === 0 || other.ttps.length === 0) continue;

    const overlap = jaccardSimilarity(target.ttps, other.ttps);
    if (overlap >= FALSE_FLAG_THRESHOLD) {
      const targetSet = new Set(target.ttps.map((t) => t.toUpperCase()));
      const sharedTtps = other.ttps.filter((t) => targetSet.has(t.toUpperCase()));
      alerts.push({
        suspectActorId: target.id,
        suspectActorName: target.name,
        matchingActorId: other.id,
        matchingActorName: other.name,
        ttpOverlap: Math.round(overlap * 100) / 100,
        sharedTtps,
        assessment: overlap >= 0.90 ? 'false_flag_likely' : 'tool_sharing_possible',
      });
    }
  }

  return alerts.sort((a, b) => b.ttpOverlap - a.ttpOverlap);
}

// ── C3: Victimology Pattern Prediction ──────────────────────

export interface PredictedTarget {
  sector: string;
  frequency: number;
  probability: number;
}

/**
 * C3: Predicts probable next targets based on historical targeting patterns.
 * Frequency analysis: sectors targeted most often get highest probability.
 */
export function predictTargets(
  historicalSectors: string[],
): PredictedTarget[] {
  if (historicalSectors.length === 0) return [];

  const counts = new Map<string, number>();
  for (const sector of historicalSectors) {
    const key = sector.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = historicalSectors.length;
  return [...counts.entries()]
    .map(([sector, count]) => ({
      sector,
      frequency: count,
      probability: Math.round((count / total) * 100) / 100,
    }))
    .sort((a, b) => b.probability - a.probability);
}

// ── D3: Actor Comparison Report ─────────────────────────────

export interface ActorComparison {
  actorA: { id: string; name: string };
  actorB: { id: string; name: string };
  ttpSimilarity: number;
  malwareSimilarity: number;
  sectorSimilarity: number;
  regionSimilarity: number;
  overallSimilarity: number;
  sharedTtps: string[];
  sharedMalware: string[];
  sharedSectors: string[];
  sharedRegions: string[];
  uniqueToA: { ttps: string[]; malware: string[]; sectors: string[] };
  uniqueToB: { ttps: string[]; malware: string[]; sectors: string[] };
}

/**
 * D3: Side-by-side comparison of two actors across all dimensions.
 */
export function compareActors(
  a: { id: string; name: string; ttps: string[]; associatedMalware: string[]; targetSectors: string[]; targetRegions: string[] },
  b: { id: string; name: string; ttps: string[]; associatedMalware: string[]; targetSectors: string[]; targetRegions: string[] },
): ActorComparison {
  const ttpSim = jaccardSimilarity(a.ttps, b.ttps);
  const malSim = jaccardSimilarity(a.associatedMalware, b.associatedMalware);
  const secSim = jaccardSimilarity(a.targetSectors, b.targetSectors);
  const regSim = jaccardSimilarity(a.targetRegions, b.targetRegions);
  const overall = ttpSim * 0.35 + malSim * 0.30 + secSim * 0.20 + regSim * 0.15;

  const shared = (arrA: string[], arrB: string[]) => {
    const setB = new Set(arrB.map((s) => s.toLowerCase()));
    return arrA.filter((s) => setB.has(s.toLowerCase()));
  };
  const unique = (arrA: string[], arrB: string[]) => {
    const setB = new Set(arrB.map((s) => s.toLowerCase()));
    return arrA.filter((s) => !setB.has(s.toLowerCase()));
  };

  return {
    actorA: { id: a.id, name: a.name },
    actorB: { id: b.id, name: b.name },
    ttpSimilarity: Math.round(ttpSim * 100) / 100,
    malwareSimilarity: Math.round(malSim * 100) / 100,
    sectorSimilarity: Math.round(secSim * 100) / 100,
    regionSimilarity: Math.round(regSim * 100) / 100,
    overallSimilarity: Math.round(overall * 100) / 100,
    sharedTtps: shared(a.ttps, b.ttps),
    sharedMalware: shared(a.associatedMalware, b.associatedMalware),
    sharedSectors: shared(a.targetSectors, b.targetSectors),
    sharedRegions: shared(a.targetRegions, b.targetRegions),
    uniqueToA: { ttps: unique(a.ttps, b.ttps), malware: unique(a.associatedMalware, b.associatedMalware), sectors: unique(a.targetSectors, b.targetSectors) },
    uniqueToB: { ttps: unique(b.ttps, a.ttps), malware: unique(b.associatedMalware, a.associatedMalware), sectors: unique(b.targetSectors, a.targetSectors) },
  };
}

// ── D4: Per-Feed Actor Accuracy Report ──────────────────────

export interface FeedActorAccuracy {
  feedId: string;
  actorCount: number;
  avgConfidence: number;
  iocCount: number;
  uniqueActorNames: string[];
}

/**
 * D4: Aggregates feed-level accuracy for actor intelligence.
 * Groups IOC data by feed source to assess which feeds provide the best actor intel.
 */
export function computeFeedActorAccuracy(
  iocs: Array<{ feedSourceId: string | null; confidence: number; threatActors: string[] }>,
): FeedActorAccuracy[] {
  const feeds = new Map<string, { confidences: number[]; actors: Set<string>; count: number }>();

  for (const ioc of iocs) {
    if (!ioc.feedSourceId || ioc.threatActors.length === 0) continue;
    if (!feeds.has(ioc.feedSourceId)) {
      feeds.set(ioc.feedSourceId, { confidences: [], actors: new Set(), count: 0 });
    }
    const feed = feeds.get(ioc.feedSourceId)!;
    feed.confidences.push(ioc.confidence);
    feed.count++;
    for (const actor of ioc.threatActors) feed.actors.add(actor);
  }

  return [...feeds.entries()]
    .map(([feedId, data]) => ({
      feedId,
      actorCount: data.actors.size,
      avgConfidence: Math.round(data.confidences.reduce((s, c) => s + c, 0) / data.confidences.length),
      iocCount: data.count,
      uniqueActorNames: [...data.actors].sort(),
    }))
    .sort((a, b) => b.actorCount - a.actorCount);
}
