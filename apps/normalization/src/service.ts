import { createHash } from 'crypto';
import type pino from 'pino';
import { detectIOCType, normalizeIOCValue, calculateCompositeConfidence, IOC_DECAY_RATES, DEFAULT_DECAY_RATE } from '@etip/shared-normalization';
import type { IOCRepository } from './repository.js';
import type { NormalizeBatchJob } from './schema.js';
import { applyQualityFilters } from './filters.js';
import { getEnrichQueue } from './queue.js';
import { incrementUnknownType } from './stats-counter.js';
import type { BloomManager } from './bloom.js';

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
let NATION_STATE_ACTORS = new Set([
  'lazarus', 'kimsuky', 'turla', 'fancy bear', 'cozy bear',
  'sandworm', 'charming kitten', 'hafnium', 'nobelium',
  'volt typhoon', 'salt typhoon', 'flax typhoon', 'silk typhoon',
]);

/** Known ransomware families → always CRITICAL */
let RANSOMWARE_FAMILIES = new Set([
  'lockbit', 'blackcat', 'alphv', 'cl0p', 'clop', 'revil', 'sodinokibi',
  'conti', 'ryuk', 'maze', 'darkside', 'blackmatter', 'hive',
  'royal', 'akira', 'play', 'medusa', 'rhysida', 'bianlian',
]);

export interface SeverityClassifierConfig {
  extraRansomwareFamilies?: string[];
  extraNationStateActors?: string[];
}

/**
 * G4b: Extend the severity classifier with additional known families/actors.
 * Called at service startup from env vars TI_EXTRA_RANSOMWARE_FAMILIES and TI_EXTRA_NATION_STATE_ACTORS.
 * Zero Prisma migration — in-memory extension (DECISION-013).
 */
export function configureClassifier(cfg: SeverityClassifierConfig): void {
  if (cfg.extraRansomwareFamilies?.length) {
    RANSOMWARE_FAMILIES = new Set([...RANSOMWARE_FAMILIES, ...cfg.extraRansomwareFamilies.map(f => f.toLowerCase())]);
  }
  if (cfg.extraNationStateActors?.length) {
    NATION_STATE_ACTORS = new Set([...NATION_STATE_ACTORS, ...cfg.extraNationStateActors.map(a => a.toLowerCase())]);
  }
}

interface AutoSeverityInput {
  iocType: string;
  threatActors: string[];
  malwareFamilies: string[];
  mitreAttack: string[];
  corroborationCount: number;
  explicitSeverity?: string;
  /** True if CVE is in CISA Known Exploited Vulnerabilities catalog */
  isKEV?: boolean;
  /** EPSS exploitation probability score (0.0–1.0) */
  epssScore?: number;
}

/**
 * Auto-classify severity from extraction context.
 * Priority: explicit > KEV+EPSS > ransomware > KEV-only > nation-state > MITRE high-impact > corroboration > type default.
 */
export function classifySeverity(input: AutoSeverityInput): string {
  // If extraction provided an explicit severity, trust it
  if (input.explicitSeverity && input.explicitSeverity !== 'medium') {
    return mapSeverity(input.explicitSeverity);
  }

  // CISA KEV + EPSS > 0.5 → auto CRITICAL (actively exploited + high probability)
  if (input.isKEV && input.epssScore != null && input.epssScore > 0.5) {
    return 'critical';
  }

  // Ransomware family → CRITICAL
  for (const family of input.malwareFamilies) {
    if (RANSOMWARE_FAMILIES.has(family.toLowerCase())) return 'critical';
  }

  // CISA KEV alone → at least HIGH (government-confirmed exploitation)
  if (input.isKEV) return 'high';

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
/**
 * G2b: Weighted velocity — uses feed reliability to weight each sighting.
 * A feed with reliability 80% contributes 0.80 to the weighted count.
 * Falls back to raw count when no reliability map is provided.
 *
 * Thresholds (weighted counts):
 *   1h: >= 4.0 → 100, >= 2.4 → 80, >= 1.6 → 60
 *  24h: >= 4.0 → 70,  >= 2.4 → 50, >= 1.6 → 35
 *   7d: >= 4.0 → 40,  >= 2.4 → 20, >= 1.6 → 10
 *
 * Example: 5 spam feeds at 30% reliability → weighted 1.5 (low velocity).
 *          3 APT feeds at 90% reliability  → weighted 2.7 (high velocity).
 */
export function calculateVelocity(
  sightingTimestamps: SightingTimestamp[],
  currentTimestamp: string,
  currentFeedId: string,
  feedReliabilityMap?: Map<string, number>,
): { velocityScore: number; sightingTimestamps: SightingTimestamp[] } {
  const updated = [
    ...sightingTimestamps,
    { feedId: currentFeedId, timestamp: currentTimestamp },
  ].slice(-50); // cap at 50 entries

  if (updated.length <= 1) return { velocityScore: 0, sightingTimestamps: updated };

  const now = new Date(currentTimestamp).getTime();

  // Accumulate weighted counts per unique feed per window
  const seen1h = new Map<string, number>();
  const seen24h = new Map<string, number>();
  const seen7d = new Map<string, number>();

  for (const s of updated) {
    const age = now - new Date(s.timestamp).getTime();
    const ageHours = age / (1000 * 60 * 60);
    const weight = feedReliabilityMap ? (feedReliabilityMap.get(s.feedId) ?? 50) / 100 : 1;
    // Use max weight if same feed appears multiple times in a window
    if (ageHours <= 1)   seen1h.set(s.feedId,  Math.max(seen1h.get(s.feedId)   ?? 0, weight));
    if (ageHours <= 24)  seen24h.set(s.feedId, Math.max(seen24h.get(s.feedId)  ?? 0, weight));
    if (ageHours <= 168) seen7d.set(s.feedId,  Math.max(seen7d.get(s.feedId)   ?? 0, weight));
  }

  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const w1h  = sum(seen1h);
  const w24h = sum(seen24h);
  const w7d  = sum(seen7d);

  let score = 0;
  if      (w1h  >= 4.0) score = 100;
  else if (w1h  >= 2.4) score = 80;
  else if (w1h  >= 1.6) score = 60;
  else if (w24h >= 4.0) score = 70;
  else if (w24h >= 2.4) score = 50;
  else if (w24h >= 1.6) score = 35;
  else if (w7d  >= 4.0) score = 40;
  else if (w7d  >= 2.4) score = 20;
  else if (w7d  >= 1.6) score = 10;

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
  bloomHits?: number;
  bloomMisses?: number;
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
  kevBonus?: number;
  epssBonus?: number;
  isKEV?: boolean;
  epssScore?: number;
  epssPercentile?: number;
}

export class NormalizationService {
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private reliabilityCache = new Map<string, { score: number; cachedAt: number }>();
  private bloomManager: BloomManager | null = null;

  constructor(
    private readonly repo: IOCRepository,
    private readonly logger: pino.Logger,
  ) {}

  /** Set the optional Bloom filter manager for pre-write dedup */
  setBloomManager(manager: BloomManager): void {
    this.bloomManager = manager;
  }

  /** Normalize a batch of IOCs from a single article */
  async normalizeBatch(job: NormalizeBatchJob): Promise<NormalizationResult> {
    const result: NormalizationResult = {
      created: 0, updated: 0, skipped: 0, filtered: 0, reactivated: 0, errors: 0,
      bloomHits: 0, bloomMisses: 0,
    };
    const now = new Date();

    // ── Improvement #10: Batch anomaly scoring ────────────────
    const batchMultiplier = batchPenalty(job.iocs.length);

    // ── G2a: Fetch feed reliability with TTL cache ───────────────
    const feedReliability = await this.getFeedReliability(job.feedSourceId);

    // ── G2b: Build reliability map for weighted velocity scoring ─
    // Includes current job's feed; other feeds in sighting history default to 50%
    const feedReliabilityMap = new Map<string, number>([[job.feedSourceId, feedReliability]]);

    for (const ioc of job.iocs) {
      try {
        // Step 1: Detect & map IOC type
        const detectedType = detectIOCType(ioc.rawValue);
        const mappedRawType = mapIOCType(ioc.rawType);
        const iocType = detectedType !== 'unknown' ? mapIOCType(detectedType) : mappedRawType;

        if (iocType === 'unknown') {
          this.logger.warn({ rawValue: ioc.rawValue, rawType: ioc.rawType }, 'Skipping unknown IOC type');
          incrementUnknownType(ioc.rawType);
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

        // Step 3b: Bloom filter pre-check (optimization — skip enrichment for known IOCs)
        let bloomHit = false;
        if (this.bloomManager) {
          try {
            bloomHit = await this.bloomManager.check(job.tenantId, dedupeHash);
            if (bloomHit) { result.bloomHits!++; } else { result.bloomMisses!++; }
          } catch (err) {
            // Bloom is optional — failures don't block pipeline
            this.logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Bloom check failed — proceeding without');
          }
        }

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
          isKEV: meta.isKEV === true,
          epssScore: typeof meta.epssScore === 'number' ? meta.epssScore : undefined,
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
        const clampedConfidence = clampConfidence(penalizedScore, iocType);

        // ── KEV/EPSS confidence bonus (stacks with existing scoring) ──
        let kevEpssBonus = 0;
        if (meta.isKEV === true) kevEpssBonus += 20;
        if (typeof meta.epssPercentile === 'number') {
          if (meta.epssPercentile > 0.9) kevEpssBonus += 15;
          else if (meta.epssPercentile > 0.7) kevEpssBonus += 10;
          else if (meta.epssPercentile > 0.5) kevEpssBonus += 5;
        }
        const finalConfidence = kevEpssBonus > 0
          ? clampConfidence(clampedConfidence + kevEpssBonus, iocType)
          : clampedConfidence;

        // ── Store confidence breakdown in enrichmentData ───────────
        const bounds = CONFIDENCE_BOUNDS[iocType] ?? { floor: 0, ceiling: 100 };
        const { decayRate: usedDecayRate } = this.getDecayInfo(iocType);

        // ── Improvement B3: Append to confidence history ──────────
        const prevHistory = existingEnrichment?.confidenceHistory ?? [];
        const confidenceHistory = [
          ...prevHistory.slice(-19), // keep last 19 entries (cap at 20)
          { date: now.toISOString().slice(0, 10), score: finalConfidence, source: job.feedSourceId },
        ];

        // ── G2b: IOC velocity scoring (weighted by feed reliability) ─
        const prevTimestamps = existingEnrichment?.sightingTimestamps ?? [];
        const { velocityScore, sightingTimestamps } = calculateVelocity(
          prevTimestamps,
          now.toISOString(),
          job.feedSourceId,
          feedReliabilityMap,
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
          ...(kevEpssBonus > 0 ? {
            kevBonus: meta.isKEV === true ? 20 : 0,
            epssBonus: kevEpssBonus - (meta.isKEV === true ? 20 : 0),
            isKEV: meta.isKEV === true || undefined,
            epssScore: typeof meta.epssScore === 'number' ? meta.epssScore : undefined,
            epssPercentile: typeof meta.epssPercentile === 'number' ? meta.epssPercentile : undefined,
          } : {}),
        };

        // Merge arrays
        const tags = this.mergeArrays(existing?.tags, meta.tags);

        // ── Improvement A4: TLP escalation — never downgrade ──────
        const incomingTLP = mapTLP(meta.tlp);
        const finalTLP = existing
          ? escalateTLP(existing.tlp as string, incomingTLP)
          : incomingTLP;

        // Upsert IOC
        const upserted = await this.repo.upsert({
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

        // ── Add to Bloom filter after successful upsert ────────
        if (this.bloomManager) {
          try {
            await this.bloomManager.add(job.tenantId, dedupeHash);
            // Track false positives: bloom said "probably exists" but IOC was actually new
            if (bloomHit && !existing) {
              this.bloomManager.recordFalsePositive();
            }
          } catch (err) {
            this.logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Bloom add failed — non-critical');
          }
        }

        // ── Queue IOC for AI enrichment (Module 06) ────────────
        // Bloom optimization: if bloom said "probably exists" AND the IOC was an update
        // (not new), skip enrichment queue — it was likely already enriched.
        // Reactivated IOCs always get re-enriched (priority 1).
        const skipEnrichment = bloomHit && existing && !isReactivation;
        const enrichQueue = getEnrichQueue();
        if (enrichQueue && upserted.id && !skipEnrichment) {
          await enrichQueue.add(`enrich-${upserted.id}`, {
            iocId: upserted.id,
            tenantId: job.tenantId,
            iocType,
            normalizedValue,
            confidence: finalConfidence,
            severity,
            existingEnrichment: enrichmentData,
          }, { priority: isReactivation ? 1 : 3 }).catch((err) => {
            this.logger.warn({ error: err instanceof Error ? err.message : String(err), iocId: upserted.id }, 'Failed to queue enrichment job');
          });
        }

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
   * G2a: Fetch feed reliability with 5-minute TTL in-memory cache.
   * Eliminates redundant DB queries when same feedSourceId is hit across concurrent jobs.
   * Falls back to 50 (neutral) if feed not found or field is null.
   */
  private async getFeedReliability(feedSourceId: string): Promise<number> {
    const hit = this.reliabilityCache.get(feedSourceId);
    if (hit && Date.now() - hit.cachedAt < this.CACHE_TTL_MS) return hit.score;
    try {
      const score = (await this.repo.findFeedReliability(feedSourceId)) ?? 50;
      this.reliabilityCache.set(feedSourceId, { score, cachedAt: Date.now() });
      return score;
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
