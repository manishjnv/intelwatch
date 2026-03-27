/**
 * @module @etip/shared-normalization/admiralty
 * @description NATO Admiralty Code (6×6 Source Reliability Matrix).
 * Maps source reliability (A–F) × information credibility (1–6) → 0-100 score.
 */

export type SourceReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type InfoCredibility = 1 | 2 | 3 | 4 | 5 | 6;

const SOURCE_RANKS: Record<SourceReliability, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5,
};

const VALID_SOURCES = new Set<string>(['A', 'B', 'C', 'D', 'E', 'F']);

/** Human-readable labels for source reliability and info credibility. */
export const ADMIRALTY_LABELS: Record<string, string> = {
  A: 'Completely reliable',
  B: 'Usually reliable',
  C: 'Fairly reliable',
  D: 'Not usually reliable',
  E: 'Unreliable',
  F: 'Cannot be judged',
  '1': 'Confirmed',
  '2': 'Probably true',
  '3': 'Possibly true',
  '4': 'Doubtful',
  '5': 'Improbable',
  '6': 'Cannot be judged',
};

/**
 * Convert NATO Admiralty Code to a 0-100 feed reliability score.
 * Formula: (5 - sourceRank) * 14 + (6 - cred) * 3
 * A1=100, F6=0, C3=51
 */
export function admiraltyToScore(source: SourceReliability, cred: InfoCredibility): number {
  if (!VALID_SOURCES.has(source)) throw new Error(`Invalid source reliability: ${source}`);
  if (cred < 1 || cred > 6 || !Number.isInteger(cred)) throw new Error(`Invalid info credibility: ${cred}`);

  const sourceRank = SOURCE_RANKS[source];
  const score = (5 - sourceRank) * 14 + (6 - cred) * 3;
  return Math.max(0, Math.min(100, score));
}

/**
 * Reverse-map a 0-100 score to the nearest NATO Admiralty Code.
 * Finds the (source, cred) pair whose admiraltyToScore is closest.
 */
export function scoreToAdmiralty(score: number): { source: SourceReliability; cred: InfoCredibility } {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  let bestSource: SourceReliability = 'C';
  let bestCred: InfoCredibility = 3;
  let bestDiff = Infinity;

  const sources: SourceReliability[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const creds: InfoCredibility[] = [1, 2, 3, 4, 5, 6];

  for (const s of sources) {
    for (const c of creds) {
      const diff = Math.abs(admiraltyToScore(s, c) - clamped);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSource = s;
        bestCred = c;
      }
    }
  }
  return { source: bestSource, cred: bestCred };
}

/** Format Admiralty Code as display string (e.g. "B2"). */
export function formatAdmiraltyCode(source: string, cred: number): string {
  return `${source}${cred}`;
}
