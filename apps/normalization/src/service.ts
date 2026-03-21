import { createHash } from 'crypto';
import type pino from 'pino';
import { detectIOCType, normalizeIOCValue, calculateCompositeConfidence, IOC_DECAY_RATES, DEFAULT_DECAY_RATE } from '@etip/shared-normalization';
import type { IOCRepository } from './repository.js';
import type { NormalizeBatchJob } from './schema.js';
import { applyQualityFilters } from './filters.js';

/** Map shared-normalization IOCType to Prisma IocType enum values */
function mapIOCType(rawType: string): string {
  const mapping: Record<string, string> = {
    ip: 'ip', ipv6: 'ipv6', domain: 'domain', fqdn: 'fqdn',
    url: 'url', email: 'email',
    hash_md5: 'hash_md5', hash_sha1: 'hash_sha1',
    hash_sha256: 'hash_sha256', hash_sha512: 'hash_sha512',
    cve: 'cve', asn: 'asn', cidr: 'cidr', bitcoin_address: 'bitcoin_address',
    // Ingestion pipeline aliases
    md5: 'hash_md5', sha1: 'hash_sha1', sha256: 'hash_sha256', sha512: 'hash_sha512',
    ipv4: 'ip',
    ja3: 'unknown', ja3s: 'unknown', yara_rule: 'unknown',
    registry_key: 'unknown', file_path: 'unknown',
    ethereum_address: 'unknown', monero_address: 'unknown', mitre_technique: 'unknown',
  };
  return mapping[rawType.toLowerCase()] ?? 'unknown';
}

/** Map severity string to Prisma Severity enum */
function mapSeverity(raw?: string): string {
  if (!raw) return 'medium';
  const valid = ['info', 'low', 'medium', 'high', 'critical'];
  const lower = raw.toLowerCase();
  return valid.includes(lower) ? lower : 'medium';
}

/** Map TLP string to Prisma TLP enum */
function mapTLP(raw?: string): string {
  if (!raw) return 'amber';
  const cleaned = raw.toUpperCase().replace('TLP:', '').replace('TLP_', '').trim().toLowerCase();
  const valid = ['white', 'green', 'amber', 'red'];
  return valid.includes(cleaned) ? cleaned : 'amber';
}

/** Build deterministic SHA-256 dedupe hash: type:normalizedValue:tenantId */
export function buildDedupeHash(type: string, normalizedValue: string, tenantId: string): string {
  return createHash('sha256')
    .update(`${type}:${normalizedValue}:${tenantId}`)
    .digest('hex');
}

// ═══════════════════════════════════════════════════════════════════
// Improvement #6: Auto-severity classification from context
// Rules-based severity engine — uses threat actor, malware, MITRE,
// and IOC type to assign severity when extraction doesn't provide one.
// ═══════════════════════════════════════════════════════════════════

/** Known APT / nation-state actor prefixes → always HIGH or CRITICAL */
const APT_PATTERNS = /^(apt|fin|unc|ta)\d+$/i;
const NATION_STATE_ACTORS = new Set([
  'lazarus', 'kimsuky', 'turla', 'fancy bear', 'cozy bear',
  'sandworm', 'charming kitten', 'hafnium', 'nobelium',
  'volt typhoon', 'salt typhoon', 'flax typhoon', 'silk typhoon',
]);

/** Known ransomware families → always CRITICAL */
const RANSOMWARE_FAMILIES = new Set([
  'lockbit', 'blackcat', 'alphv', 'cl0p', 'clop', 'revil', 'sodinokibi',
  'conti', 'ryuk', 'maze', 'darkside', 'blackmatter', 'hive',
  'royal', 'akira', 'play', 'medusa', 'rhysida', 'bianlian',
]);

interface AutoSeverityInput {
  iocType: string;
  threatActors: string[];
  malwareFamilies: string[];
  mitreAttack: string[];
  corroborationCount: number;
  explicitSeverity?: string;
}

/**
 * Auto-classify severity from extraction context.
 * Priority: explicit > ransomware > nation-state > MITRE high-impact > corroboration > type default.
 */
export function classifySeverity(input: AutoSeverityInput): string {
  // If extraction provided an explicit severity, trust it
  if (input.explicitSeverity && input.explicitSeverity !== 'medium') {
    return mapSeverity(input.explicitSeverity);
  }

  // Ransomware family → CRITICAL
  for (const family of input.malwareFamilies) {
    if (RANSOMWARE_FAMILIES.has(family.toLowerCase())) return 'critical';
  }

  // Nation-state / APT actor → HIGH (minimum)
  for (const actor of input.threatActors) {
    const lower = actor.toLowerCase();
    if (APT_PATTERNS.test(lower) || NATION_STATE_ACTORS.has(lower)) return 'high';
  }

  // MITRE techniques with high-impact categories
  const highImpactTechniques = input.mitreAttack.filter((t) => {
    // T1486 = Data Encrypted for Impact (ransomware)
    // T1059 = Command and Scripting Interpreter
    // T1055 = Process Injection
    // T1003 = OS Credential Dumping
    // T1071 = Application Layer Protocol (C2)
    return ['T1486', 'T1059', 'T1055', 'T1003', 'T1071'].some((ht) => t.startsWith(ht));
  });
  if (highImpactTechniques.length > 0) return 'high';

  // High corroboration (3+ independent sources) → at least MEDIUM
  if (input.corroborationCount >= 5) return 'high';
  if (input.corroborationCount >= 3) return 'medium';

  // Type-based defaults
  const typeDefaults: Record<string, string> = {
    cve: 'medium',
    hash_sha256: 'medium',
    hash_sha1: 'medium',
    hash_md5: 'medium',
    url: 'medium',
    ip: 'low',
    domain: 'low',
    fqdn: 'low',
    email: 'low',
    cidr: 'low',
    asn: 'info',
  };
  return typeDefaults[input.iocType] ?? 'low';
}

// ═══════════════════════════════════════════════════════════════════
// Improvement #7: TLP escalation protection — never downgrade
// ═══════════════════════════════════════════════════════════════════

const TLP_RANK: Record<string, number> = { white: 0, green: 1, amber: 2, red: 3 };

/** Return the higher (more restrictive) TLP level */
export function escalateTLP(existing: string, incoming: string): string {
  const existingRank = TLP_RANK[existing] ?? 2;
  const incomingRank = TLP_RANK[incoming] ?? 2;
  return incomingRank >= existingRank ? incoming : existing;
}

// ═══════════════════════════════════════════════════════════════════
// Improvement #8: Severity escalation — never downgrade
// ═══════════════════════════════════════════════════════════════════

const SEVERITY_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** Return the higher severity */
export function escalateSeverity(existing: string, incoming: string): string {
  const existingRank = SEVERITY_RANK[existing] ?? 2;
  const incomingRank = SEVERITY_RANK[incoming] ?? 2;
  return incomingRank >= existingRank ? incoming : existing;
}

// ═══════════════════════════════════════════════════════════════════
// Improvement #9: Confidence floor/ceiling per IOC type
// ═══════════════════════════════════════════════════════════════════

const CONFIDENCE_BOUNDS: Record<string, { floor: number; ceiling: number }> = {
  hash_sha256: { floor: 60, ceiling: 100 },
  hash_sha512: { floor: 60, ceiling: 100 },
  hash_sha1:   { floor: 40, ceiling: 95 },
  hash_md5:    { floor: 40, ceiling: 95 },
  cve:         { floor: 50, ceiling: 100 },
  ip:          { floor: 20, ceiling: 90 },
  ipv6:        { floor: 20, ceiling: 90 },
  domain:      { floor: 25, ceiling: 95 },
  fqdn:        { floor: 25, ceiling: 95 },
  url:         { floor: 15, ceiling: 90 },
  email:       { floor: 30, ceiling: 85 },
  cidr:        { floor: 20, ceiling: 90 },
  asn:         { floor: 10, ceiling: 80 },
  bitcoin_address: { floor: 35, ceiling: 95 },
};

/** Clamp confidence to type-specific floor/ceiling */
export function clampConfidence(confidence: number, iocType: string): number {
  const bounds = CONFIDENCE_BOUNDS[iocType];
  if (!bounds) return Math.min(100, Math.max(0, confidence));
  return Math.min(bounds.ceiling, Math.max(bounds.floor, confidence));
}

// ═══════════════════════════════════════════════════════════════════
// Improvement #10: Batch anomaly scoring
// ═══════════════════════════════════════════════════════════════════

/** Penalty multiplier for large batches (bulk dumps, not curated intel) */
export function batchPenalty(batchSize: number): number {
  if (batchSize <= 10) return 1.0;
  if (batchSize <= 30) return 0.9;
  if (batchSize <= 100) return 0.7;
  return 0.5;
}

// ═══════════════════════════════════════════════════════════════════
// Improvement B5: IOC velocity scoring
// Track how fast an IOC spreads across feeds — campaign detection.
// ═══════════════════════════════════════════════════════════════════

interface SightingTimestamp {
  feedId: string;
  timestamp: string; // ISO date
}

/**
 * Calculate velocity score (0-100) based on how fast IOC spreads.
 * High velocity = active campaign indicator.
 */
export function calculateVelocity(
  sightingTimestamps: SightingTimestamp[],
  currentTimestamp: string,
  currentFeedId: string,
): { velocityScore: number; sightingTimestamps: SightingTimestamp[] } {
  const updated = [
    ...sightingTimestamps,
    { feedId: currentFeedId, timestamp: currentTimestamp },
  ].slice(-50); // cap at 50 entries

  if (updated.length <= 1) return { velocityScore: 0, sightingTimestamps: updated };

  // Count unique feeds in the last 1h, 24h, 7d windows
  const now = new Date(currentTimestamp).getTime();
  const feedsIn1h = new Set<string>();
  const feedsIn24h = new Set<string>();
  const feedsIn7d = new Set<string>();

  for (const s of updated) {
    const age = now - new Date(s.timestamp).getTime();
    const ageHours = age / (1000 * 60 * 60);
    if (ageHours <= 1) feedsIn1h.add(s.feedId);
    if (ageHours <= 24) feedsIn24h.add(s.feedId);
    if (ageHours <= 168) feedsIn7d.add(s.feedId);
  }

  // Score: weight recent spread higher
  // 3+ feeds in 1h = critical velocity (80-100)
  // 3+ feeds in 24h = high velocity (50-79)
  // 3+ feeds in 7d = medium velocity (20-49)
  // Otherwise low (0-19)
  let score = 0;
  if (feedsIn1h.size >= 5) score = 100;
  else if (feedsIn1h.size >= 3) score = 80;
  else if (feedsIn1h.size >= 2) score = 60;
  else if (feedsIn24h.size >= 5) score = 70;
  else if (feedsIn24h.size >= 3) score = 50;
  else if (feedsIn24h.size >= 2) score = 35;
  else if (feedsIn7d.size >= 5) score = 40;
  else if (feedsIn7d.size >= 3) score = 20;
  else if (feedsIn7d.size >= 2) score = 10;

  return { velocityScore: score, sightingTimestamps: updated };
}

// ═══════════════════════════════════════════════════════════════════

export interface NormalizationResult {
  created: number;
  updated: number;
  skipped: number;
  filtered: number;
  reactivated: number;
  errors: number;
}

/** Confidence signal breakdown stored in enrichmentData */
export interface ConfidenceBreakdown {
  feedReliability: number;
  corroboration: number;
  aiScore: number;
  decayFactor: number;
  decayRate: number;
  daysSinceFirstSeen: number;
  sightingCount: number;
  sourceFeedIds: string[];
  batchPenalty: number;
  confidenceFloor: number;
  confidenceCeiling: number;
  velocityScore: number;
  sightingTimestamps: SightingTimestamp[];
  autoSeverityReason?: string;
  confidenceHistory?: Array<{ date: string; score: number; source: string }>;
}

export class NormalizationService {
  constructor(
    private readonly repo: IOCRepository,
    private readonly logger: pino.Logger,
  ) {}

  /** Normalize a batch of IOCs from a single article */
  async normalizeBatch(job: NormalizeBatchJob): Promise<NormalizationResult> {
    const result: NormalizationResult = {
      created: 0, updated: 0, skipped: 0, filtered: 0, reactivated: 0, errors: 0,
    };
    const now = new Date();

    // ── Improvement #10: Batch anomaly scoring ────────────────
    const batchMultiplier = batchPenalty(job.iocs.length);

    // ── Improvement #2: Fetch feed reliability from DB ──────────
    const feedReliability = await this.getFeedReliability(job.feedSourceId);

    for (const ioc of job.iocs) {
      try {
        // Step 1: Detect & map IOC type
        const detectedType = detectIOCType(ioc.rawValue);
        const mappedRawType = mapIOCType(ioc.rawType);
        const iocType = detectedType !== 'unknown' ? mapIOCType(detectedType) : mappedRawType;

        if (iocType === 'unknown') {
          this.logger.debug({ rawValue: ioc.rawValue, rawType: ioc.rawType }, 'Skipping unknown IOC type');
          result.skipped++;
          continue;
        }

        // Step 2: Normalize value
        const normalizedValue = normalizeIOCValue(ioc.rawValue, detectedType);

        // ── Improvement #5: Quality filters (bogon, safe domains, placeholders) ──
        const filterResult = applyQualityFilters(normalizedValue, iocType);
        if (!filterResult.passed) {
          this.logger.debug({ rawValue: ioc.rawValue, reason: filterResult.reason }, 'IOC filtered by quality check');
          result.filtered++;
          continue;
        }

        // Step 3: Build dedupe hash
        const dedupeHash = buildDedupeHash(iocType, normalizedValue, job.tenantId);

        // Step 4: Fetch existing IOC for merge + lifecycle logic
        const existing = await this.repo.findByDedupeHash(dedupeHash);
        const meta = ioc.extractionMeta ?? {};

        // ── Improvement #3: Sighting count + source diversity ──────
        const existingEnrichment = (existing?.enrichmentData as ConfidenceBreakdown | null) ?? null;
        const sightingCount = (existingEnrichment?.sightingCount ?? 0) + 1;
        const sourceFeedIds = this.mergeArrays(
          existingEnrichment?.sourceFeedIds,
          [job.feedSourceId],
        );
        const independentSourceCount = sourceFeedIds.length;
        const corroborationSignal = Math.min(100, independentSourceCount * 20);

        // ── Improvement #1: Live confidence decay on re-sighting ──
        const firstSeen = existing?.firstSeen ?? now;
        const daysSinceFirstSeen = Math.max(0, (now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24));

        // ── Improvement #2: Use actual feed reliability ───────────
        // ── Improvement A1: Type-specific decay via iocType ──────
        const confidenceResult = calculateCompositeConfidence(
          {
            feedReliability,
            corroboration: corroborationSignal,
            aiScore: ioc.calibratedConfidence ?? 50,
          },
          daysSinceFirstSeen,
          iocType,
        );

        // ── Improvement #6: Auto-severity classification ──────────
        const allThreatActors = this.mergeArrays(existing?.threatActors, meta.threatActors);
        const allMalware = this.mergeArrays(existing?.malwareFamilies, meta.malwareFamilies);
        const allMitre = this.mergeArrays(existing?.mitreAttack, meta.mitreAttack);

        const classifiedSeverity = classifySeverity({
          iocType,
          threatActors: allThreatActors,
          malwareFamilies: allMalware,
          mitreAttack: allMitre,
          corroborationCount: independentSourceCount,
          explicitSeverity: meta.severity,
        });
        // ── Improvement C3: Severity only escalates, never downgrades ──
        const severity = existing
          ? escalateSeverity(existing.severity as string, classifiedSeverity)
          : classifiedSeverity;

        // ── Improvement #4: Lifecycle transitions on normalization ─
        const lifecycle = this.computeLifecycle(existing, daysSinceFirstSeen, iocType);
        const isReactivation = existing &&
          (existing.lifecycle === 'expired' || existing.lifecycle === 'aging') &&
          lifecycle === 'reactivated';

        // Apply confidence boost for reactivation (1.2x — APT infra recycling signal)
        // ── Improvement A6: Batch anomaly penalty ──────────────────
        // ── Improvement A5: Type-specific confidence floor/ceiling ─
        const baseScore = isReactivation
          ? Math.min(100, Math.round(confidenceResult.score * 1.2))
          : confidenceResult.score;
        const penalizedScore = Math.round(baseScore * batchMultiplier);
        const finalConfidence = clampConfidence(penalizedScore, iocType);

        // ── Store confidence breakdown in enrichmentData ───────────
        const bounds = CONFIDENCE_BOUNDS[iocType] ?? { floor: 0, ceiling: 100 };
        const { decayRate: usedDecayRate } = this.getDecayInfo(iocType);

        // ── Improvement B3: Append to confidence history ──────────
        const prevHistory = existingEnrichment?.confidenceHistory ?? [];
        const confidenceHistory = [
          ...prevHistory.slice(-19), // keep last 19 entries (cap at 20)
          { date: now.toISOString().slice(0, 10), score: finalConfidence, source: job.feedSourceId },
        ];

        // ── Improvement B5: IOC velocity scoring ──────────────────
        const prevTimestamps = existingEnrichment?.sightingTimestamps ?? [];
        const { velocityScore, sightingTimestamps } = calculateVelocity(
          prevTimestamps,
          now.toISOString(),
          job.feedSourceId,
        );

        const enrichmentData: ConfidenceBreakdown = {
          feedReliability,
          corroboration: corroborationSignal,
          aiScore: ioc.calibratedConfidence ?? 50,
          decayFactor: confidenceResult.decayFactor,
          decayRate: usedDecayRate,
          daysSinceFirstSeen: Math.round(daysSinceFirstSeen * 10) / 10,
          sightingCount,
          sourceFeedIds,
          batchPenalty: batchMultiplier,
          confidenceFloor: bounds.floor,
          confidenceCeiling: bounds.ceiling,
          velocityScore,
          sightingTimestamps,
          confidenceHistory,
          ...(isReactivation ? { autoSeverityReason: 'reactivated_ioc_confidence_boost_1.2x' } : {}),
        };

        // Merge arrays
        const tags = this.mergeArrays(existing?.tags, meta.tags);

        // ── Improvement A4: TLP escalation — never downgrade ──────
        const incomingTLP = mapTLP(meta.tlp);
        const finalTLP = existing
          ? escalateTLP(existing.tlp as string, incomingTLP)
          : incomingTLP;

        // Upsert IOC
        await this.repo.upsert({
          tenantId: job.tenantId,
          feedSourceId: job.feedSourceId,
          iocType,
          value: ioc.rawValue,
          normalizedValue,
          dedupeHash,
          severity,
          tlp: finalTLP,
          confidence: finalConfidence,
          lifecycle,
          tags,
          mitreAttack: allMitre,
          malwareFamilies: allMalware,
          threatActors: allThreatActors,
          firstSeen,
          lastSeen: now,
          enrichmentData: enrichmentData as object,
        });

        if (isReactivation) {
          result.reactivated++;
          this.logger.info({ normalizedValue, iocType, sightingCount }, 'IOC reactivated — APT infrastructure recycling detected');
        }

        if (existing) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error({ rawValue: ioc.rawValue, error: message }, 'IOC normalization failed');
        result.errors++;
      }
    }

    this.logger.info(
      { articleId: job.articleId, ...result },
      'Normalization batch complete',
    );

    return result;
  }

  /**
   * Improvement #4: Compute lifecycle state based on existing state + re-sighting.
   * NEW → ACTIVE (on second sighting)
   * ACTIVE stays ACTIVE
   * AGING → ACTIVE (re-sighting revives it)
   * EXPIRED/REACTIVATED → REACTIVATED (APT infrastructure recycling)
   * FALSE_POSITIVE stays FALSE_POSITIVE (analyst decision respected)
   * REVOKED stays REVOKED (feed retraction respected)
   */
  private computeLifecycle(
    existing: { lifecycle: string; lastSeen: Date } | null,
    _daysSinceFirstSeen: number,
    _iocType: string,
  ): string {
    if (!existing) return 'new';

    const currentState = existing.lifecycle;

    // Analyst/admin decisions are never overridden by automation
    if (currentState === 'false_positive' || currentState === 'revoked' || currentState === 'archived') {
      return currentState;
    }

    // Reactivation: expired or aging IOC re-seen
    if (currentState === 'expired' || currentState === 'aging') {
      return 'reactivated';
    }

    // Previously reactivated + seen again → stays active
    if (currentState === 'reactivated') {
      return 'active';
    }

    // NEW → ACTIVE on second sighting
    if (currentState === 'new') {
      return 'active';
    }

    // ACTIVE stays ACTIVE
    return 'active';
  }

  /**
   * Improvement #2: Fetch actual feed reliability score from DB.
   * Falls back to 50 (neutral) if feed not found or field is null.
   */
  private async getFeedReliability(feedSourceId: string): Promise<number> {
    try {
      const feed = await this.repo.findFeedReliability(feedSourceId);
      return feed ?? 50;
    } catch {
      return 50;
    }
  }

  /** Get decay rate info for an IOC type */
  private getDecayInfo(iocType: string): { decayRate: number } {
    return { decayRate: IOC_DECAY_RATES[iocType] ?? DEFAULT_DECAY_RATE };
  }

  /** Merge existing DB array with new values, deduplicating */
  private mergeArrays(existing?: string[] | null, incoming?: string[]): string[] {
    const set = new Set<string>(existing ?? []);
    for (const v of incoming ?? []) set.add(v);
    return [...set];
  }
}
