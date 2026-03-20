import { createHash } from 'crypto';
import type pino from 'pino';
import { detectIOCType, normalizeIOCValue, calculateCompositeConfidence } from '@etip/shared-normalization';
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
  communityVotes: number;
  decayFactor: number;
  daysSinceFirstSeen: number;
  sightingCount: number;
  sourceFeedIds: string[];
  autoSeverityReason?: string;
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
        const confidenceResult = calculateCompositeConfidence(
          {
            feedReliability,
            corroboration: corroborationSignal,
            aiScore: ioc.calibratedConfidence ?? 50,
            communityVotes: 0,
          },
          daysSinceFirstSeen,
        );

        // ── Improvement #6: Auto-severity classification ──────────
        const allThreatActors = this.mergeArrays(existing?.threatActors, meta.threatActors);
        const allMalware = this.mergeArrays(existing?.malwareFamilies, meta.malwareFamilies);
        const allMitre = this.mergeArrays(existing?.mitreAttack, meta.mitreAttack);

        const severity = classifySeverity({
          iocType,
          threatActors: allThreatActors,
          malwareFamilies: allMalware,
          mitreAttack: allMitre,
          corroborationCount: independentSourceCount,
          explicitSeverity: meta.severity,
        });

        // ── Improvement #4: Lifecycle transitions on normalization ─
        const lifecycle = this.computeLifecycle(existing, daysSinceFirstSeen, iocType);
        const isReactivation = existing &&
          (existing.lifecycle === 'expired' || existing.lifecycle === 'aging') &&
          lifecycle === 'reactivated';

        // Apply confidence boost for reactivation (1.2x — APT infra recycling signal)
        const finalConfidence = isReactivation
          ? Math.min(100, Math.round(confidenceResult.score * 1.2))
          : confidenceResult.score;

        // ── Store confidence breakdown in enrichmentData ───────────
        const enrichmentData: ConfidenceBreakdown = {
          feedReliability,
          corroboration: corroborationSignal,
          aiScore: ioc.calibratedConfidence ?? 50,
          communityVotes: 0,
          decayFactor: confidenceResult.decayFactor,
          daysSinceFirstSeen: Math.round(daysSinceFirstSeen * 10) / 10,
          sightingCount,
          sourceFeedIds,
          ...(isReactivation ? { autoSeverityReason: 'reactivated_ioc_confidence_boost_1.2x' } : {}),
        };

        // Merge arrays
        const tags = this.mergeArrays(existing?.tags, meta.tags);

        // Upsert IOC
        await this.repo.upsert({
          tenantId: job.tenantId,
          feedSourceId: job.feedSourceId,
          iocType,
          value: ioc.rawValue,
          normalizedValue,
          dedupeHash,
          severity,
          tlp: mapTLP(meta.tlp),
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

  /** Merge existing DB array with new values, deduplicating */
  private mergeArrays(existing?: string[] | null, incoming?: string[]): string[] {
    const set = new Set<string>(existing ?? []);
    for (const v of incoming ?? []) set.add(v);
    return [...set];
  }
}
