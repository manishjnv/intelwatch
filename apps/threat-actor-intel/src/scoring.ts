/**
 * Attribution scoring functions for threat actor intelligence.
 *
 * Scoring formula (from skill 08-THREAT-ACTOR):
 *   infrastructure overlap 35% + malware code similarity 30% +
 *   TTP match 20% + victimology 15%
 */

/** Weight configuration for attribution scoring signals. */
export const ATTRIBUTION_WEIGHTS = {
  infrastructure: 0.35,
  malware: 0.30,
  ttps: 0.20,
  victimology: 0.15,
} as const;

export interface AttributionSignals {
  /** Fraction of shared infrastructure (IPs, domains) between 0-1. */
  infrastructureOverlap: number;
  /** Fraction of shared malware families between 0-1. */
  malwareSimilarity: number;
  /** Fraction of shared MITRE ATT&CK TTPs between 0-1. */
  ttpMatch: number;
  /** Fraction of shared target sectors/regions between 0-1. */
  victimologyMatch: number;
}

/**
 * Calculates composite attribution score from 4 signals.
 * @returns Score between 0 and 100.
 */
export function calculateAttributionScore(signals: AttributionSignals): number {
  const raw =
    signals.infrastructureOverlap * ATTRIBUTION_WEIGHTS.infrastructure +
    signals.malwareSimilarity * ATTRIBUTION_WEIGHTS.malware +
    signals.ttpMatch * ATTRIBUTION_WEIGHTS.ttps +
    signals.victimologyMatch * ATTRIBUTION_WEIGHTS.victimology;
  return Math.round(Math.min(100, Math.max(0, raw * 100)));
}

/**
 * Computes Jaccard similarity between two string arrays.
 * Returns 0 if both arrays are empty.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Groups MITRE ATT&CK technique IDs by tactic category.
 * Categorizes based on technique number ranges (simplified mapping).
 */
export function groupTtpsByTactic(ttps: string[]): Record<string, string[]> {
  const tacticMap: Record<string, [number, number]> = {
    'Reconnaissance': [1595, 1598],
    'Resource Development': [1583, 1588],
    'Initial Access': [1189, 1199],
    'Execution': [1059, 1072],
    'Persistence': [1037, 1058],
    'Privilege Escalation': [1134, 1134],
    'Defense Evasion': [1027, 1036],
    'Credential Access': [1003, 1026],
    'Discovery': [1007, 1018],
    'Lateral Movement': [1021, 1026],
    'Collection': [1005, 1006],
    'Exfiltration': [1020, 1020],
    'Impact': [1485, 1499],
    'Command and Control': [1071, 1105],
  };

  const groups: Record<string, string[]> = {};

  for (const ttp of ttps) {
    const match = ttp.match(/^T(\d{4})/);
    if (!match || !match[1]) continue;
    const num = parseInt(match[1], 10);

    let assigned = false;
    for (const [tactic, [min, max]] of Object.entries(tacticMap)) {
      if (num >= min && num <= max) {
        if (!groups[tactic]) groups[tactic] = [];
        groups[tactic].push(ttp);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      if (!groups['Other']) groups['Other'] = [];
      groups['Other'].push(ttp);
    }
  }

  return groups;
}

/**
 * Generates a MITRE ATT&CK coverage summary for an actor.
 * Returns tactic names with technique counts and IDs.
 */
export function generateMitreSummary(ttps: string[]): Array<{
  tactic: string;
  techniqueCount: number;
  techniques: string[];
}> {
  const grouped = groupTtpsByTactic(ttps);
  return Object.entries(grouped)
    .map(([tactic, techniques]) => ({
      tactic,
      techniqueCount: techniques.length,
      techniques: techniques.sort(),
    }))
    .sort((a, b) => b.techniqueCount - a.techniqueCount);
}

/**
 * Computes a sophistication score from 0-100 based on TTP diversity.
 * More diverse techniques across more tactics = higher sophistication.
 */
export function computeSophisticationScore(ttps: string[]): number {
  if (ttps.length === 0) return 0;
  const grouped = groupTtpsByTactic(ttps);
  const tacticCount = Object.keys(grouped).length;
  const techniqueCount = ttps.length;
  // Score: 40% from tactic coverage (max 14 tactics), 60% from technique count (diminishing returns)
  const tacticScore = Math.min(1, tacticCount / 8) * 40;
  const techniqueScore = Math.min(1, Math.log2(techniqueCount + 1) / 6) * 60;
  return Math.round(Math.min(100, tacticScore + techniqueScore));
}

/**
 * Converts a CSV row from an actor record for export.
 */
export function actorToCsvRow(actor: {
  name: string;
  aliases: string[];
  actorType: string;
  motivation: string;
  sophistication: string;
  country: string | null;
  confidence: number;
  targetSectors: string[];
  targetRegions: string[];
  ttps: string[];
  associatedMalware: string[];
  tags: string[];
  tlp: string;
  firstSeen: Date | null;
  lastSeen: Date | null;
}): string {
  const escape = (s: string): string => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const fields = [
    escape(actor.name),
    escape(actor.aliases.join('; ')),
    actor.actorType,
    actor.motivation,
    actor.sophistication,
    actor.country ?? '',
    String(actor.confidence),
    escape(actor.targetSectors.join('; ')),
    escape(actor.targetRegions.join('; ')),
    escape(actor.ttps.join('; ')),
    escape(actor.associatedMalware.join('; ')),
    escape(actor.tags.join('; ')),
    actor.tlp,
    actor.firstSeen?.toISOString() ?? '',
    actor.lastSeen?.toISOString() ?? '',
  ];
  return fields.join(',');
}

/** CSV header row for actor export. */
export const CSV_HEADER = 'name,aliases,actor_type,motivation,sophistication,country,confidence,target_sectors,target_regions,ttps,associated_malware,tags,tlp,first_seen,last_seen';

// ═══════════════════════════════════════════════════════════════
// P0 ACCURACY IMPROVEMENTS
// ═══════════════════════════════════════════════════════════════

// ── A1: Explainable Attribution Audit Trail ─────────────────

export interface AttributionEvidence {
  signal: 'infrastructure' | 'malware' | 'ttps' | 'victimology';
  weight: number;
  rawScore: number;
  weightedScore: number;
  evidence: string[];
}

export interface ExplainableAttribution {
  compositeScore: number;
  signals: AttributionEvidence[];
}

/**
 * A1: Calculates attribution score with full evidence trail.
 * Unlike calculateAttributionScore(), returns per-signal breakdown
 * with the specific items (IOC IDs, malware names, TTPs) that
 * contributed to each signal.
 */
export function explainAttribution(
  sharedMalware: string[],
  sharedTtps: string[],
  sharedSectors: string[],
  sharedRegions: string[],
  sharedIocValues: string[],
): ExplainableAttribution {
  const infraScore = sharedIocValues.length > 0 ? Math.min(1, sharedIocValues.length / 10) : 0;
  const malwareScore = sharedMalware.length > 0 ? Math.min(1, sharedMalware.length / 5) : 0;
  const ttpScore = sharedTtps.length > 0 ? Math.min(1, sharedTtps.length / 10) : 0;
  const victimTargets = [...sharedSectors, ...sharedRegions];
  const victimScore = victimTargets.length > 0 ? Math.min(1, victimTargets.length / 6) : 0;

  const signals: AttributionEvidence[] = [
    { signal: 'infrastructure', weight: ATTRIBUTION_WEIGHTS.infrastructure, rawScore: infraScore, weightedScore: infraScore * ATTRIBUTION_WEIGHTS.infrastructure, evidence: sharedIocValues.slice(0, 20) },
    { signal: 'malware', weight: ATTRIBUTION_WEIGHTS.malware, rawScore: malwareScore, weightedScore: malwareScore * ATTRIBUTION_WEIGHTS.malware, evidence: sharedMalware },
    { signal: 'ttps', weight: ATTRIBUTION_WEIGHTS.ttps, rawScore: ttpScore, weightedScore: ttpScore * ATTRIBUTION_WEIGHTS.ttps, evidence: sharedTtps },
    { signal: 'victimology', weight: ATTRIBUTION_WEIGHTS.victimology, rawScore: victimScore, weightedScore: victimScore * ATTRIBUTION_WEIGHTS.victimology, evidence: victimTargets },
  ];

  const compositeScore = Math.round(Math.min(100, signals.reduce((sum, s) => sum + s.weightedScore, 0) * 100));
  return { compositeScore, signals };
}

// ── A2: Alias Similarity Clustering ─────────────────────────

export interface AliasSuggestion {
  actorId: string;
  actorName: string;
  similarity: number;
  sharedTtps: string[];
  sharedMalware: string[];
  sharedSectors: string[];
}

/** Minimum Jaccard similarity to flag as potential alias. */
export const ALIAS_SIMILARITY_THRESHOLD = 0.6;

/**
 * A2: Computes alias similarity between a target actor and a list of candidates.
 * Returns candidates above the threshold, sorted by similarity descending.
 */
export function findAliasCandidates(
  target: { ttps: string[]; associatedMalware: string[]; targetSectors: string[] },
  candidates: Array<{ id: string; name: string; ttps: string[]; associatedMalware: string[]; targetSectors: string[] }>,
): AliasSuggestion[] {
  const results: AliasSuggestion[] = [];

  for (const candidate of candidates) {
    const ttpSim = jaccardSimilarity(target.ttps, candidate.ttps);
    const malwareSim = jaccardSimilarity(target.associatedMalware, candidate.associatedMalware);
    const sectorSim = jaccardSimilarity(target.targetSectors, candidate.targetSectors);
    // Weighted: TTPs 40%, Malware 35%, Sectors 25%
    const similarity = ttpSim * 0.40 + malwareSim * 0.35 + sectorSim * 0.25;

    if (similarity >= ALIAS_SIMILARITY_THRESHOLD) {
      const sharedTtps = target.ttps.filter((t) => candidate.ttps.map((c) => c.toLowerCase()).includes(t.toLowerCase()));
      const sharedMalware = target.associatedMalware.filter((m) => candidate.associatedMalware.map((c) => c.toLowerCase()).includes(m.toLowerCase()));
      const sharedSectors = target.targetSectors.filter((s) => candidate.targetSectors.map((c) => c.toLowerCase()).includes(s.toLowerCase()));
      results.push({ actorId: candidate.id, actorName: candidate.name, similarity: Math.round(similarity * 100) / 100, sharedTtps, sharedMalware, sharedSectors });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

// ── A3: Multi-Source Actor Corroboration ─────────────────────

/** Per-feed bonus for actor corroboration (capped). */
export const CORROBORATION_BONUS_PER_FEED = 5;
export const CORROBORATION_MAX_BONUS = 20;

/**
 * A3: Computes corroboration boost based on how many independent feeds
 * mention this actor. More feeds = higher confidence.
 * @returns Boost value (0 to CORROBORATION_MAX_BONUS).
 */
export function computeCorroborationBoost(feedCount: number): number {
  if (feedCount <= 1) return 0;
  return Math.min(CORROBORATION_MAX_BONUS, (feedCount - 1) * CORROBORATION_BONUS_PER_FEED);
}

export interface CorroborationResult {
  feedCount: number;
  feedIds: string[];
  boost: number;
  corroboratedConfidence: number;
  singleSource: boolean;
}

/**
 * A3: Full corroboration analysis for an actor.
 * Returns the number of feeds, boost value, and adjusted confidence.
 */
export function analyzeCorroboration(
  baseConfidence: number,
  feedIds: string[],
): CorroborationResult {
  const uniqueFeeds = [...new Set(feedIds)];
  const boost = computeCorroborationBoost(uniqueFeeds.length);
  return {
    feedCount: uniqueFeeds.length,
    feedIds: uniqueFeeds,
    boost,
    corroboratedConfidence: Math.min(100, baseConfidence + boost),
    singleSource: uniqueFeeds.length <= 1,
  };
}

// ── B1: Actor Dormancy Detection ────────────────────────────

export type DormancyStatus = 'active' | 'dormant' | 'resurgent' | 'unknown';

export interface DormancyResult {
  status: DormancyStatus;
  daysSinceLastIoc: number | null;
  lastIocDate: Date | null;
  resurgenceDetected: boolean;
  confidenceAdjustment: number;
}

/** Thresholds for dormancy classification (in days). */
export const DORMANCY_THRESHOLDS = {
  activeWithin: 30,
  dormantAfter: 90,
  resurgenceGap: 60,
  resurgenceWindow: 14,
} as const;

/**
 * B1: Classifies actor dormancy based on IOC activity timestamps.
 * - active: IOC seen within 30 days
 * - dormant: no IOCs in 90+ days
 * - resurgent: gap of 60+ days, then IOC in last 14 days (most dangerous)
 * - unknown: no IOC data
 */
export function classifyDormancy(
  iocDates: Date[],
  now: Date = new Date(),
): DormancyResult {
  if (iocDates.length === 0) {
    return { status: 'unknown', daysSinceLastIoc: null, lastIocDate: null, resurgenceDetected: false, confidenceAdjustment: 0 };
  }

  const sorted = [...iocDates].sort((a, b) => b.getTime() - a.getTime());
  const mostRecent = sorted[0]!;
  const daysSinceLast = Math.floor((now.getTime() - mostRecent.getTime()) / (86400000));

  // Check for resurgence: gap of 60+ days before most recent activity
  let resurgenceDetected = false;
  if (sorted.length >= 2 && daysSinceLast <= DORMANCY_THRESHOLDS.resurgenceWindow) {
    const secondMostRecent = sorted[1]!;
    const gapDays = Math.floor((mostRecent.getTime() - secondMostRecent.getTime()) / 86400000);
    if (gapDays >= DORMANCY_THRESHOLDS.resurgenceGap) {
      resurgenceDetected = true;
    }
  }

  let status: DormancyStatus;
  let confidenceAdjustment = 0;

  if (resurgenceDetected) {
    status = 'resurgent';
    confidenceAdjustment = 10; // Resurgent actors get confidence boost
  } else if (daysSinceLast <= DORMANCY_THRESHOLDS.activeWithin) {
    status = 'active';
    confidenceAdjustment = 0;
  } else if (daysSinceLast >= DORMANCY_THRESHOLDS.dormantAfter) {
    status = 'dormant';
    confidenceAdjustment = -10; // Dormant actors lose confidence
  } else {
    status = 'active'; // 31-89 days: still active but aging
    confidenceAdjustment = -5;
  }

  return { status, daysSinceLastIoc: daysSinceLast, lastIocDate: mostRecent ?? null, resurgenceDetected, confidenceAdjustment };
}

// ── C2: Actor-IOC Link Strength Scoring ─────────────────────

export interface LinkStrengthInput {
  /** Feed reliability score 0-100 for the feed that made the attribution. */
  feedReliability: number;
  /** Days since the attribution was made. */
  daysSinceAttribution: number;
  /** Number of independent feeds that confirm this link. */
  corroboratingFeeds: number;
  /** Confidence score of the linked IOC (0-100). */
  iocConfidence: number;
}

/** Weights for link strength scoring. */
export const LINK_STRENGTH_WEIGHTS = {
  feedReliability: 0.35,
  recency: 0.25,
  corroboration: 0.25,
  iocConfidence: 0.15,
} as const;

/**
 * C2: Scores the strength of an IOC-actor link from 0-100.
 * Weak links (<30) are flagged for review; strong links (>70) drive actor confidence.
 */
export function computeLinkStrength(input: LinkStrengthInput): number {
  const feedScore = input.feedReliability;
  // Recency: exponential decay with 30-day half-life
  const recencyScore = Math.max(0, 100 * Math.exp(-0.023 * input.daysSinceAttribution));
  // Corroboration: 50 base + 15 per additional feed, capped at 100
  const corrobScore = Math.min(100, 50 + (input.corroboratingFeeds - 1) * 15);
  const iocScore = input.iocConfidence;

  const weighted =
    feedScore * LINK_STRENGTH_WEIGHTS.feedReliability +
    recencyScore * LINK_STRENGTH_WEIGHTS.recency +
    corrobScore * LINK_STRENGTH_WEIGHTS.corroboration +
    iocScore * LINK_STRENGTH_WEIGHTS.iocConfidence;

  return Math.round(Math.min(100, Math.max(0, weighted)));
}

export interface ScoredLink {
  iocId: string;
  iocValue: string;
  iocType: string;
  linkStrength: number;
  classification: 'strong' | 'moderate' | 'weak';
  signals: { feedReliability: number; recency: number; corroboration: number; iocConfidence: number };
}

/**
 * C2: Classifies a link strength score into strong/moderate/weak.
 */
export function classifyLinkStrength(score: number): 'strong' | 'moderate' | 'weak' {
  if (score >= 70) return 'strong';
  if (score >= 30) return 'moderate';
  return 'weak';
}
