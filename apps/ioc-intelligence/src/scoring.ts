/**
 * Pure scoring/computation functions for IOC accuracy improvements.
 * Stateless — no DB access, no side effects. All inputs are plain data.
 */

// ── A2: Confidence Trend Direction ──────────────────────────────

export interface ConfidenceHistoryEntry {
  date: string;
  score: number;
  source: string;
}

export interface ConfidenceTrend {
  direction: 'rising' | 'falling' | 'stable' | 'insufficient_data';
  slope: number;
  dataPoints: number;
  daysSampled: number;
}

/**
 * Computes the confidence trend from the history array.
 * Uses simple linear regression on (dayOffset, score) pairs.
 * Requires at least 3 data points for a meaningful trend.
 */
export function computeConfidenceTrend(history: ConfidenceHistoryEntry[]): ConfidenceTrend {
  if (history.length < 3) {
    return { direction: 'insufficient_data', slope: 0, dataPoints: history.length, daysSampled: 0 };
  }

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0];
  if (!first) return { direction: 'insufficient_data', slope: 0, dataPoints: 0, daysSampled: 0 };
  const baseTime = new Date(first.date).getTime();
  const msPerDay = 86400000;

  const points = sorted.map((e) => ({
    x: (new Date(e.date).getTime() - baseTime) / msPerDay,
    y: e.score,
  }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const roundedSlope = Math.round(slope * 1000) / 1000;

  const lastPoint = points[points.length - 1];
  const daysSampled = lastPoint ? Math.round(lastPoint.x) : 0;
  let direction: ConfidenceTrend['direction'];
  if (roundedSlope > 0.5) direction = 'rising';
  else if (roundedSlope < -0.5) direction = 'falling';
  else direction = 'stable';

  return { direction, slope: roundedSlope, dataPoints: n, daysSampled };
}

// ── A3: Threat Context Actionability Score ──────────────────────

const RANSOMWARE_FAMILIES = new Set([
  'lockbit', 'blackcat', 'alphv', 'conti', 'revil', 'sodinokibi', 'ryuk',
  'hive', 'blackbasta', 'clop', 'royal', 'play', 'akira', 'medusa',
  'rhysida', 'bianlian', 'cactus', 'hunters', '8base',
]);

const HIGH_IMPACT_MITRE = new Set([
  'T1486', 'T1490', 'T1059', 'T1055', 'T1003', 'T1071', 'T1021',
  'T1027', 'T1053', 'T1547', 'T1569', 'T1036', 'T1105', 'T1562',
]);

export interface ActionabilityResult {
  score: number;
  components: {
    ransomwareLinkage: number;
    aptLinkage: number;
    mitreHighImpact: number;
    enrichmentCoverage: number;
    velocitySignal: number;
  };
}

/**
 * Computes actionability score (0-100): "Should I block this now?"
 * Separate from confidence ("Is this real?").
 * Weights: ransomware 30%, APT 25%, MITRE 20%, enrichment 15%, velocity 10%.
 */
export function computeActionability(ioc: {
  malwareFamilies: string[];
  threatActors: string[];
  mitreAttack: string[];
  enrichmentData: Record<string, unknown> | null;
}): ActionabilityResult {
  const enrichment = (ioc.enrichmentData ?? {}) as Record<string, unknown>;

  // Ransomware linkage (0-100)
  const ransomwareLinkage = ioc.malwareFamilies.some((f) => RANSOMWARE_FAMILIES.has(f.toLowerCase())) ? 100 : 0;

  // APT linkage (0-100): named APT/FIN/UNC groups
  const aptPattern = /^(apt|fin|unc|ta)\d+/i;
  const hasNamedApt = ioc.threatActors.some((a) => aptPattern.test(a) || a.toLowerCase().includes('lazarus') || a.toLowerCase().includes('turla'));
  const aptLinkage = hasNamedApt ? 100 : (ioc.threatActors.length > 0 ? 40 : 0);

  // MITRE high-impact (0-100): proportion of techniques that are high-impact
  const highImpactCount = ioc.mitreAttack.filter((t) => { const base = t.split('.')[0]; return base ? HIGH_IMPACT_MITRE.has(base) : false; }).length;
  const mitreHighImpact = ioc.mitreAttack.length > 0
    ? Math.min(100, Math.round((highImpactCount / ioc.mitreAttack.length) * 100))
    : 0;

  // Enrichment coverage (0-100): how many enrichment signals are present
  const hasVT = !!enrichment.vtResult;
  const hasAbuseIPDB = !!enrichment.abuseipdbResult;
  const enrichmentCoverage = (hasVT ? 50 : 0) + (hasAbuseIPDB ? 50 : 0);

  // Velocity signal (0-100)
  const velocitySignal = typeof enrichment.velocityScore === 'number' ? enrichment.velocityScore as number : 0;

  const score = Math.round(
    ransomwareLinkage * 0.30 +
    aptLinkage * 0.25 +
    mitreHighImpact * 0.20 +
    enrichmentCoverage * 0.15 +
    velocitySignal * 0.10,
  );

  return {
    score: Math.min(100, score),
    components: { ransomwareLinkage, aptLinkage, mitreHighImpact, enrichmentCoverage, velocitySignal },
  };
}

// ── A5: Sighting Recency-Weighted Ranking ───────────────────────

/**
 * Computes a recency boost multiplier (1.0 – 1.5).
 * IOCs seen in the last 7 days get up to 50% ranking boost.
 * Formula: 1.0 + 0.5 × e^(-daysSinceLastSeen / 7)
 */
export function computeRecencyBoost(lastSeen: Date, now: Date = new Date()): number {
  const daysSince = Math.max(0, (now.getTime() - lastSeen.getTime()) / 86400000);
  return 1.0 + 0.5 * Math.exp(-daysSince / 7);
}

/**
 * Computes relevance score combining confidence and recency.
 * Used for search result ranking.
 */
export function computeRelevanceScore(confidence: number, lastSeen: Date, now: Date = new Date()): number {
  return Math.round(confidence * computeRecencyBoost(lastSeen, now));
}

// ── A1: Infrastructure Density Classification ───────────────────

export interface InfrastructureDensity {
  subnetPrefix: string;
  iocCountInSubnet: number;
  classification: 'c2_infrastructure' | 'shared_hosting' | 'low_density' | 'not_applicable';
  confidenceAdjustment: number;
}

/**
 * Classifies infrastructure density based on /24 subnet IOC count.
 * - 10+ IOCs in same /24 = likely C2 block → boost confidence (+10)
 * - 1 IOC in /24 with high overall subnet usage = shared hosting → penalize (-15)
 * - Only applies to IPv4 IOCs.
 */
export function classifyInfrastructureDensity(
  iocType: string,
  normalizedValue: string,
  subnetIocCount: number,
): InfrastructureDensity {
  if (iocType !== 'ip') {
    return { subnetPrefix: '', iocCountInSubnet: 0, classification: 'not_applicable', confidenceAdjustment: 0 };
  }

  const parts = normalizedValue.split('.');
  if (parts.length !== 4) {
    return { subnetPrefix: '', iocCountInSubnet: 0, classification: 'not_applicable', confidenceAdjustment: 0 };
  }

  const p0 = parts[0]; const p1 = parts[1]; const p2 = parts[2];
  if (!p0 || !p1 || !p2) return { subnetPrefix: '', iocCountInSubnet: 0, classification: 'not_applicable', confidenceAdjustment: 0 };
  const subnetPrefix = `${p0}.${p1}.${p2}`;

  if (subnetIocCount >= 10) {
    return { subnetPrefix, iocCountInSubnet: subnetIocCount, classification: 'c2_infrastructure', confidenceAdjustment: 10 };
  }
  if (subnetIocCount === 1) {
    return { subnetPrefix, iocCountInSubnet: subnetIocCount, classification: 'low_density', confidenceAdjustment: -5 };
  }
  return { subnetPrefix, iocCountInSubnet: subnetIocCount, classification: 'shared_hosting', confidenceAdjustment: 0 };
}

// ── A4: IOC Relationship Inference ──────────────────────────────

export interface InferredRelationship {
  relatedValue: string;
  relatedType: string;
  relationship: string;
}

/**
 * Extracts implicit relationships from an IOC value.
 * - URL → extracts domain
 * - Email → extracts domain
 * No network calls — pure string parsing.
 */
export function inferRelationships(iocType: string, normalizedValue: string): InferredRelationship[] {
  const relationships: InferredRelationship[] = [];

  if (iocType === 'url') {
    try {
      const url = new URL(normalizedValue);
      relationships.push({ relatedValue: url.hostname, relatedType: 'domain', relationship: 'url_contains_domain' });
    } catch {
      const match = normalizedValue.match(/^https?:\/\/([^/:]+)/i);
      if (match && match[1]) {
        relationships.push({ relatedValue: match[1].toLowerCase(), relatedType: 'domain', relationship: 'url_contains_domain' });
      }
    }
  }

  if (iocType === 'email') {
    const atIdx = normalizedValue.lastIndexOf('@');
    if (atIdx > 0) {
      relationships.push({ relatedValue: normalizedValue.slice(atIdx + 1), relatedType: 'domain', relationship: 'email_domain' });
    }
  }

  return relationships;
}

// ── D2: Export Threshold Profiles ────────────────────────────────

export interface ExportProfile {
  minConfidence: number;
  excludeLifecycles: string[];
  description: string;
}

/** Pre-built export profiles for common use cases. */
export const EXPORT_PROFILES: Record<string, ExportProfile> = {
  high_fidelity: {
    minConfidence: 80,
    excludeLifecycles: ['expired', 'archived', 'false_positive', 'revoked'],
    description: 'High-confidence IOCs for blocking rules (SIEM/firewall)',
  },
  monitoring: {
    minConfidence: 40,
    excludeLifecycles: ['archived', 'false_positive', 'revoked'],
    description: 'Moderate-confidence IOCs for detection/alerting',
  },
  research: {
    minConfidence: 0,
    excludeLifecycles: [],
    description: 'All IOCs including low-confidence for threat research',
  },
};
