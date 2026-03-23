import { TLD_RISK_SCORES } from './typosquat-constants.js';

/** Jaro-Winkler distance — better for transposition detection and prefix-preserving typos. */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Basic Soundex — phonetic similarity for detecting sound-alike typos. */
export function soundex(s: string): string {
  if (s.length === 0) return '0000';
  const upper = s.toUpperCase().replace(/[^A-Z]/g, '');
  if (upper.length === 0) return '0000';

  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3', L: '4', M: '5', N: '5', R: '6',
  };

  let result = upper[0]!;
  let lastCode = map[upper[0]!] ?? '0';
  for (let i = 1; i < upper.length && result.length < 4; i++) {
    const code = map[upper[i]!];
    if (code && code !== lastCode) {
      result += code;
    }
    lastCode = code ?? '0';
  }

  return result.padEnd(4, '0');
}

/** Normalized Levenshtein distance — 0 = identical, 1 = completely different. Returns 1 - normalized. */
export function levenshteinNormalized(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  const distance = matrix[len1]![len2]!;
  return 1 - distance / Math.max(len1, len2);
}

/** Phonetic match score — 1 if same soundex, 0 otherwise. */
export function phoneticMatch(s1: string, s2: string): number {
  return soundex(s1) === soundex(s2) ? 1 : 0;
}

/** Get TLD risk score from Interisle 2025 abuse data. */
export function tldRiskScore(domain: string): number {
  const lastDot = domain.lastIndexOf('.');
  if (lastDot === -1) return 0.5;
  const tld = domain.slice(lastDot);
  return TLD_RISK_SCORES[tld] ?? 0.3;
}

/**
 * Composite risk score formula:
 * 0.30 × levenshtein_normalized + 0.25 × jaro_winkler +
 * 0.15 × keyboard_proximity_score + 0.15 × registration_recency +
 * 0.10 × tld_risk_score + 0.05 × phonetic_match
 */
export function computeCompositeRiskScore(
  original: string,
  candidate: string,
  isRegistered: boolean,
  registrationDate: string | null,
  registrationTermYears: number | null,
): number {
  const origName = original.split('.')[0] ?? original;
  const candName = candidate.split('.')[0] ?? candidate;

  const levScore = levenshteinNormalized(origName, candName);
  const jwScore = jaroWinkler(origName, candName);
  const phonScore = phoneticMatch(origName, candName);
  const tldScore = tldRiskScore(candidate);

  // Registration recency: more recent = higher risk
  let recencyScore = 0;
  if (isRegistered && registrationDate) {
    const daysOld = (Date.now() - new Date(registrationDate).getTime()) / 86400000;
    if (daysOld < 7) recencyScore = 1.0;
    else if (daysOld < 30) recencyScore = 0.85;
    else if (daysOld < 90) recencyScore = 0.6;
    else if (daysOld < 180) recencyScore = 0.3;
    else recencyScore = 0.1;
  }

  // Keyboard proximity signal: already encoded in similarity for keyboard_proximity method
  const kbScore = isRegistered ? 0.5 : 0.2;

  // 1-year registration term = 98% malware (boost signal)
  const termPenalty = (isRegistered && registrationTermYears === 1) ? 0.15 : 0;

  let score = 0.30 * levScore + 0.25 * jwScore + 0.15 * kbScore
    + 0.15 * recencyScore + 0.10 * tldScore + 0.05 * phonScore + termPenalty;

  return Math.min(1, Math.max(0, score));
}
