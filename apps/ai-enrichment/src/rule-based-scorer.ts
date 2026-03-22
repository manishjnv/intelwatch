/**
 * Rule-Based Scorer — Fallback when Haiku budget is at 90%+.
 * Produces a deterministic risk score from VT + AbuseIPDB data only.
 * No AI calls, $0 cost. Used by budget enforcement gate (#5).
 */

import type { VTResult, AbuseIPDBResult, HaikuTriageResult } from './schema.js';
import { generateStixLabels } from './stix-labels.js';

/** Known CDN/benign ISP patterns for FP detection */
const BENIGN_ISP_PATTERNS = [
  /cloudflare/i, /akamai/i, /fastly/i, /google/i, /microsoft/i,
  /amazon/i, /cloudfront/i, /incapsula/i,
];

/** Severity thresholds for rule-based classification */
const SEVERITY_THRESHOLDS = {
  CRITICAL: 85,
  HIGH: 65,
  MEDIUM: 40,
  LOW: 20,
} as const;

/** Category based on VT tags */
function inferCategory(vtTags: string[], isTor: boolean): string {
  if (isTor) return 'tor_exit';
  const tagStr = vtTags.join(' ').toLowerCase();
  if (tagStr.includes('c2') || tagStr.includes('command')) return 'c2_server';
  if (tagStr.includes('phish')) return 'phishing';
  if (tagStr.includes('miner') || tagStr.includes('crypto')) return 'cryptomining';
  if (tagStr.includes('botnet')) return 'botnet';
  if (tagStr.includes('malware') || tagStr.includes('trojan')) return 'malware_distribution';
  if (tagStr.includes('scan')) return 'scanning';
  return 'unknown';
}

function classifySeverity(score: number): HaikuTriageResult['severity'] {
  if (score >= SEVERITY_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= SEVERITY_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= SEVERITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (score >= SEVERITY_THRESHOLDS.LOW) return 'LOW';
  return 'INFO';
}

/**
 * Rule-based IOC scoring using VT + AbuseIPDB data.
 * Returns a HaikuTriageResult-compatible object with zero tokens/cost.
 */
export function ruleBasedScore(
  _iocType: string,
  vt: VTResult | null,
  abuse: AbuseIPDBResult | null,
): HaikuTriageResult {
  let score = 0;
  let confidence = 30; // low confidence without AI
  const evidence: string[] = [];

  // VT component (60% weight)
  if (vt && vt.totalEngines > 0) {
    score += vt.detectionRate * 0.6;
    confidence += 20;
    evidence.push(`VT: ${vt.malicious}/${vt.totalEngines} detections (${vt.detectionRate}%)`);
  }

  // AbuseIPDB component (40% weight)
  if (abuse) {
    score += abuse.abuseConfidenceScore * 0.4;
    confidence += 15;
    evidence.push(`AbuseIPDB: ${abuse.abuseConfidenceScore}/100 confidence, ${abuse.totalReports} reports`);
  }

  // FP detection: check if ISP matches known benign providers
  const isFP = abuse ? BENIGN_ISP_PATTERNS.some(p => p.test(abuse.isp)) : false;
  if (isFP) {
    score = Math.min(score, 15);
    evidence.push(`FP: ISP matches known CDN/benign provider (${abuse!.isp})`);
  }

  const riskScore = Math.round(Math.min(100, Math.max(0, score)));
  const severity = isFP ? 'INFO' as const : classifySeverity(riskScore);
  const vtTags = vt?.tags ?? [];

  return {
    riskScore,
    confidence: Math.min(100, confidence),
    severity,
    threatCategory: inferCategory(vtTags, abuse?.isTor ?? false),
    reasoning: `Rule-based scoring (AI budget exceeded). ${evidence.join('. ')}.`.slice(0, 500),
    tags: isFP ? ['rule_based', 'suspected_false_positive'] : ['rule_based'],
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    durationMs: 0,
    // New fields — minimal data without AI
    scoreJustification: `Deterministic score from external providers. ${evidence.join('. ')}`.slice(0, 500),
    evidenceSources: [],
    uncertaintyFactors: ['No AI analysis — rule-based fallback due to budget limit'],
    mitreTechniques: [],
    isFalsePositive: isFP,
    falsePositiveReason: isFP ? `ISP matches known CDN/benign provider: ${abuse!.isp}` : null,
    malwareFamilies: [],
    attributedActors: [],
    recommendedActions: [],
    // #9 STIX Labels — generated deterministically
    stixLabels: generateStixLabels(severity, inferCategory(vtTags, abuse?.isTor ?? false), isFP),
    // #11 Prompt caching — no cache for rule-based
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}
