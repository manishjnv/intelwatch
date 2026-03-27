/**
 * @module corroboration
 * @description Cross-feed corroboration scoring engine. Calculates weighted trust
 * scores based on multiple independent feed sightings with Admiralty Code weighting.
 * DECISION-029 Phase G.
 */

// ── Types ──────────────────────────────────────────────────

export interface CorroborationSource {
  feedId: string;
  feedName: string;
  admiraltySource: string;  // A-F
  admiraltyCred: number;    // 1-6
  feedReliability: number;  // 0-100
  firstSeenByFeed: Date;
  lastSeenByFeed: Date;
}

export interface CorroborationResult {
  score: number;              // 0-100
  sourceCount: number;
  weightedSourceCount: number;
  independenceScore: number;  // 0-100
  consensusSeverity: string;
  tier: 'uncorroborated' | 'low' | 'medium' | 'high' | 'confirmed';
  narrative: string;
}

// ── Admiralty source grade → numeric rank ──────────────────

const SOURCE_RANK: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6,
};

function sourceRank(grade: string): number {
  return SOURCE_RANK[grade.toUpperCase()] ?? 6;
}

// ── Vote weight for consensus ──────────────────────────────

const SOURCE_VOTE_WEIGHT: Record<string, number> = {
  A: 5, B: 4, C: 3, D: 2, E: 1, F: 0.5,
};

function voteWeight(grade: string): number {
  return SOURCE_VOTE_WEIGHT[grade.toUpperCase()] ?? 0.5;
}

// ── Tier thresholds ─────────────────────────────────────────

function scoreTier(score: number): CorroborationResult['tier'] {
  if (score >= 86) return 'confirmed';
  if (score >= 61) return 'high';
  if (score >= 36) return 'medium';
  if (score >= 16) return 'low';
  return 'uncorroborated';
}

// ── Independence Score ──────────────────────────────────────

export function calculateIndependenceScore(sources: CorroborationSource[]): number {
  if (sources.length === 0) return 0;

  const uniqueFeedIds = new Set(sources.map(s => s.feedId));
  const uniqueGrades = new Set(sources.map(s => s.admiraltySource.toUpperCase()));

  // Feed diversity: unique feeds / 5 * 40
  const feedDiversity = Math.min(uniqueFeedIds.size, 5) / 5 * 40;
  // Grade diversity: unique Admiralty grades / 6 * 30
  const gradeDiversity = Math.min(uniqueGrades.size, 6) / 6 * 30;
  // Source count factor: min(count, 5) / 5 * 30
  const countFactor = Math.min(sources.length, 5) / 5 * 30;

  return Math.round(Math.min(feedDiversity + gradeDiversity + countFactor, 100));
}

// ── Consensus Severity from Sources ─────────────────────────

export function getConsensusFromSources(
  sources: CorroborationSource[],
  severities: string[],
): string {
  if (sources.length === 0 || severities.length === 0) return 'info';
  if (sources.length !== severities.length) {
    // Use minimum length
    const len = Math.min(sources.length, severities.length);
    sources = sources.slice(0, len);
    severities = severities.slice(0, len);
  }

  const buckets: Record<string, number> = {};
  for (let i = 0; i < sources.length; i++) {
    const sev = severities[i];
    const w = voteWeight(sources[i].admiraltySource);
    buckets[sev] = (buckets[sev] ?? 0) + w;
  }

  let winner = severities[0];
  let maxWeight = -1;
  for (const [sev, w] of Object.entries(buckets)) {
    if (w > maxWeight) {
      maxWeight = w;
      winner = sev;
    }
  }
  return winner;
}

// ── Main Corroboration Score ────────────────────────────────

export function calculateCorroborationScore(
  sources: CorroborationSource[],
): CorroborationResult {
  if (sources.length === 0) {
    return {
      score: 0, sourceCount: 0, weightedSourceCount: 0,
      independenceScore: 0, consensusSeverity: 'info',
      tier: 'uncorroborated', narrative: 'No corroborating sources.',
    };
  }

  // 1. Raw count component: min(sourceCount * 12, 40)
  const rawCount = Math.min(sources.length * 12, 40);

  // 2. Reliability weight: avg(feedReliability) / 100 * 30
  const avgReliability = sources.reduce((s, src) => s + src.feedReliability, 0) / sources.length;
  const reliabilityWeight = avgReliability / 100 * 30;

  // 3. Independence: uniqueAdmiraltyGrades / 6 * 20
  const uniqueGrades = new Set(sources.map(s => s.admiraltySource.toUpperCase()));
  const independenceComponent = uniqueGrades.size / 6 * 20;

  // 4. Recency bonus: +10 if any source seen in last 24h
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 3600_000;
  const hasRecent = sources.some(s => s.lastSeenByFeed.getTime() > twentyFourHoursAgo);
  const recencyBonus = hasRecent ? 10 : 0;

  // 5. Total score, clamped 0-100
  const score = Math.round(
    Math.min(Math.max(rawCount + reliabilityWeight + independenceComponent + recencyBonus, 0), 100),
  );

  // Weighted source count: sum of (7 - sourceRank) / 6 for each source
  const weightedSourceCount = sources.reduce(
    (sum, s) => sum + (7 - sourceRank(s.admiraltySource)) / 6,
    0,
  );

  const independenceScore = calculateIndependenceScore(sources);
  const tier = scoreTier(score);

  // Count highly reliable sources (A or B)
  const highReliableCount = sources.filter(
    s => s.admiraltySource.toUpperCase() === 'A' || s.admiraltySource.toUpperCase() === 'B',
  ).length;

  // Relative time for last seen
  const latestSeen = Math.max(...sources.map(s => s.lastSeenByFeed.getTime()));
  const hoursAgo = Math.round((now - latestSeen) / 3600_000);
  const relativeTime = hoursAgo < 1 ? 'just now'
    : hoursAgo < 24 ? `${hoursAgo}h ago`
    : `${Math.round(hoursAgo / 24)}d ago`;

  const narrative = `${sources.length} source(s), ${highReliableCount} highly reliable (A/B). Independence: ${independenceScore}%. Last seen: ${relativeTime}.`;

  return {
    score,
    sourceCount: sources.length,
    weightedSourceCount: Math.round(weightedSourceCount * 100) / 100,
    independenceScore,
    consensusSeverity: 'info', // caller provides severities via getConsensusFromSources
    tier,
    narrative,
  };
}
