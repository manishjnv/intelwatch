/**
 * P1 Accuracy Improvements — pure scoring functions.
 *
 * A4: Attribution confidence decay (type-aware)
 * B2: TTP evolution tracking
 * C1: Cross-actor infrastructure sharing
 * D1: Actor provenance export
 * D2: MITRE ATT&CK coverage heatmap data
 */

import { groupTtpsByTactic } from './scoring.js';

// ── A4: Attribution Confidence Decay ────────────────────────

/** Decay half-lives (in days) by IOC type — from DECISION-015. */
export const IOC_DECAY_RATES: Record<string, number> = {
  ip: 14,
  domain: 60,
  url: 30,
  hash: 365,
  sha256: 365,
  sha1: 365,
  md5: 365,
  email: 90,
  cve: 180,
};

export interface DecayResult {
  /** Original confidence before decay. */
  originalConfidence: number;
  /** Confidence after time decay applied. */
  decayedConfidence: number;
  /** Weighted average decay factor across all linked IOC types. */
  avgDecayFactor: number;
  /** Per-type breakdown of decay. */
  perType: Array<{
    iocType: string;
    count: number;
    halfLifeDays: number;
    avgAgeDays: number;
    decayFactor: number;
  }>;
}

/**
 * A4: Computes time-decay on attribution confidence based on IOC types and ages.
 * IP-linked attributions decay fast (14-day half-life); hash-linked are near-permanent (365 days).
 */
export function computeAttributionDecay(
  baseConfidence: number,
  linkedIocs: Array<{ iocType: string; daysSinceFirstSeen: number }>,
): DecayResult {
  if (linkedIocs.length === 0) {
    return { originalConfidence: baseConfidence, decayedConfidence: baseConfidence, avgDecayFactor: 1.0, perType: [] };
  }

  // Group by IOC type
  const byType = new Map<string, number[]>();
  for (const ioc of linkedIocs) {
    const key = ioc.iocType.toLowerCase();
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(ioc.daysSinceFirstSeen);
  }

  const perType: DecayResult['perType'] = [];
  let totalDecay = 0;
  let totalWeight = 0;

  for (const [iocType, ages] of byType) {
    const halfLife = IOC_DECAY_RATES[iocType] ?? 60;
    const avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;
    const decayFactor = Math.exp(-0.693 * avgAge / halfLife); // ln(2) ≈ 0.693
    perType.push({ iocType, count: ages.length, halfLifeDays: halfLife, avgAgeDays: Math.round(avgAge), decayFactor: Math.round(decayFactor * 1000) / 1000 });
    totalDecay += decayFactor * ages.length;
    totalWeight += ages.length;
  }

  const avgDecayFactor = totalWeight > 0 ? totalDecay / totalWeight : 1.0;
  const decayedConfidence = Math.round(Math.max(0, Math.min(100, baseConfidence * avgDecayFactor)));

  return {
    originalConfidence: baseConfidence,
    decayedConfidence,
    avgDecayFactor: Math.round(avgDecayFactor * 1000) / 1000,
    perType: perType.sort((a, b) => a.decayFactor - b.decayFactor),
  };
}

// ── B2: TTP Evolution Tracking ──────────────────────────────

export interface TtpEvolution {
  /** Techniques seen in last 30 days but NOT in previous 90 days. */
  newTtps: string[];
  /** Techniques seen 90+ days ago but NOT in last 30 days. */
  abandonedTtps: string[];
  /** Techniques seen in both periods. */
  consistentTtps: string[];
  /** Percentage of TTP set that changed in recent period. */
  evolutionVelocity: number;
  /** Total unique techniques across all time. */
  totalUnique: number;
}

/**
 * B2: Tracks how an actor's TTPs change over time by comparing
 * recent IOC TTPs (last 30 days) vs historical IOC TTPs (31-120 days).
 */
export function analyzeTtpEvolution(
  recentTtps: string[],
  historicalTtps: string[],
): TtpEvolution {
  const recentSet = new Set(recentTtps.map((t) => t.toUpperCase()));
  const historicalSet = new Set(historicalTtps.map((t) => t.toUpperCase()));
  const allTtps = new Set([...recentSet, ...historicalSet]);

  const newTtps: string[] = [];
  const abandonedTtps: string[] = [];
  const consistentTtps: string[] = [];

  for (const ttp of recentSet) {
    if (historicalSet.has(ttp)) consistentTtps.push(ttp);
    else newTtps.push(ttp);
  }
  for (const ttp of historicalSet) {
    if (!recentSet.has(ttp)) abandonedTtps.push(ttp);
  }

  const changedCount = newTtps.length + abandonedTtps.length;
  const evolutionVelocity = allTtps.size > 0 ? Math.round((changedCount / allTtps.size) * 100) : 0;

  return {
    newTtps: newTtps.sort(),
    abandonedTtps: abandonedTtps.sort(),
    consistentTtps: consistentTtps.sort(),
    evolutionVelocity,
    totalUnique: allTtps.size,
  };
}

// ── C1: Cross-Actor Infrastructure Sharing ──────────────────

export interface SharedInfrastructure {
  actorAId: string;
  actorAName: string;
  actorBId: string;
  actorBName: string;
  sharedIocs: Array<{ value: string; iocType: string }>;
  sharedCount: number;
  relationship: 'coordination' | 'tool_sharing' | 'coincidental';
}

/**
 * C1: Detects IOCs shared between actors.
 * 3+ shared IOCs = coordination, 1-2 = tool_sharing, 0 = not returned.
 */
export function detectSharedInfrastructure(
  actors: Array<{
    id: string;
    name: string;
    iocs: Array<{ value: string; iocType: string }>;
  }>,
): SharedInfrastructure[] {
  const results: SharedInfrastructure[] = [];

  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i]!;
      const b = actors[j]!;
      const aValues = new Map(a.iocs.map((ioc) => [ioc.value.toLowerCase(), ioc]));
      const shared: Array<{ value: string; iocType: string }> = [];

      for (const bIoc of b.iocs) {
        const match = aValues.get(bIoc.value.toLowerCase());
        if (match) shared.push({ value: match.value, iocType: match.iocType });
      }

      if (shared.length > 0) {
        results.push({
          actorAId: a.id, actorAName: a.name,
          actorBId: b.id, actorBName: b.name,
          sharedIocs: shared.slice(0, 50),
          sharedCount: shared.length,
          relationship: shared.length >= 3 ? 'coordination' : 'tool_sharing',
        });
      }
    }
  }

  return results.sort((a, b) => b.sharedCount - a.sharedCount);
}

// ── D1: Actor Provenance Export ─────────────────────────────

export interface ActorProvenance {
  actorId: string;
  actorName: string;
  confidence: number;
  corroborationFeedCount: number;
  dormancyStatus: string;
  ttpEvolutionVelocity: number;
  linkedIocCount: number;
  avgLinkStrength: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

/**
 * D1: Builds a provenance record for an actor suitable for export.
 */
export function buildActorProvenance(
  actor: { id: string; name: string; confidence: number; firstSeen: Date | null; lastSeen: Date | null },
  feedCount: number,
  dormancyStatus: string,
  ttpVelocity: number,
  iocCount: number,
  avgLinkStrength: number,
): ActorProvenance {
  return {
    actorId: actor.id,
    actorName: actor.name,
    confidence: actor.confidence,
    corroborationFeedCount: feedCount,
    dormancyStatus,
    ttpEvolutionVelocity: ttpVelocity,
    linkedIocCount: iocCount,
    avgLinkStrength: Math.round(avgLinkStrength),
    firstSeen: actor.firstSeen?.toISOString() ?? null,
    lastSeen: actor.lastSeen?.toISOString() ?? null,
  };
}

// ── D2: MITRE ATT&CK Coverage Heatmap ──────────────────────

/** All 14 MITRE ATT&CK tactics with total technique counts (ATT&CK v14). */
export const MITRE_TACTIC_TOTALS: Record<string, number> = {
  'Reconnaissance': 10,
  'Resource Development': 8,
  'Initial Access': 9,
  'Execution': 14,
  'Persistence': 19,
  'Privilege Escalation': 13,
  'Defense Evasion': 42,
  'Credential Access': 17,
  'Discovery': 31,
  'Lateral Movement': 9,
  'Collection': 17,
  'Command and Control': 16,
  'Exfiltration': 9,
  'Impact': 13,
};

export interface MitreHeatmapCell {
  tactic: string;
  totalKnownTechniques: number;
  actorTechniques: string[];
  actorTechniqueCount: number;
  coverage: number;
}

/**
 * D2: Generates per-tactic coverage data for MITRE ATT&CK heatmap rendering.
 * Coverage = actor's techniques in tactic / total known techniques in tactic.
 */
export function generateMitreHeatmap(ttps: string[]): MitreHeatmapCell[] {
  const grouped = groupTtpsByTactic(ttps);

  return Object.entries(MITRE_TACTIC_TOTALS).map(([tactic, total]) => {
    const actorTechniques = grouped[tactic] ?? [];
    return {
      tactic,
      totalKnownTechniques: total,
      actorTechniques: actorTechniques.sort(),
      actorTechniqueCount: actorTechniques.length,
      coverage: total > 0 ? Math.round((actorTechniques.length / total) * 1000) / 1000 : 0,
    };
  });
}
