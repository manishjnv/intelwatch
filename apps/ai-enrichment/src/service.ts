import type pino from 'pino';
import type { EnrichmentRepository } from './repository.js';
import type { VirusTotalProvider } from './providers/virustotal.js';
import type { AbuseIPDBProvider } from './providers/abuseipdb.js';
import type { HaikuTriageProvider } from './providers/haiku-triage.js';
import type { EnrichmentCostTracker } from './cost-tracker.js';
import type { EnrichmentCache } from './cache.js';
import type { GoogleSafeBrowsingProvider } from './providers/google-safe-browsing.js';
import type { IPinfoProvider } from './providers/ipinfo.js';
import type { EnrichJob, EnrichmentResult, VTResult, AbuseIPDBResult, HaikuTriageResult, GSBResult, IPinfoResult, Geolocation } from './schema.js';
import { ruleBasedScore } from './rule-based-scorer.js';
import { calculateCompositeConfidence } from '@etip/shared-normalization';
import { computeEnrichmentQuality } from './quality-score.js';

/** Budget threshold for Haiku → rule-based fallback (90%) */
const BUDGET_FALLBACK_PERCENT = 90;

/**
 * Backward-compatible risk scoring with optional Haiku AI component.
 * - Without Haiku: 50% VT + 30% AbuseIPDB + 20% base (same as before)
 * - With Haiku: 35% VT + 25% AbuseIPDB + 25% Haiku + 15% base
 */
export function computeRiskScore(
  vt: VTResult | null,
  abuse: AbuseIPDBResult | null,
  haiku: HaikuTriageResult | null,
  baseConfidence: number,
): number {
  if (haiku) {
    // 4-component formula with AI
    const components: Array<{ score: number; weight: number }> = [];
    if (vt && vt.totalEngines > 0) components.push({ score: vt.detectionRate, weight: 0.35 });
    if (abuse) components.push({ score: abuse.abuseConfidenceScore, weight: 0.25 });
    components.push({ score: haiku.riskScore, weight: 0.25 });
    const usedWeight = components.reduce((sum, c) => sum + c.weight, 0);
    components.push({ score: baseConfidence, weight: 1 - usedWeight });
    const raw = components.reduce((sum, c) => sum + c.score * c.weight, 0);
    return Math.round(Math.min(100, Math.max(0, raw)));
  }

  // Original 2-provider formula (backward compatible)
  let vtScore = 0, vtWeight = 0;
  if (vt && vt.totalEngines > 0) { vtScore = vt.detectionRate; vtWeight = 0.5; }
  let abuseScore = 0, abuseWeight = 0;
  if (abuse) { abuseScore = abuse.abuseConfidenceScore; abuseWeight = 0.3; }
  const baseWeight = 1 - vtWeight - abuseWeight;
  const raw = vtScore * vtWeight + abuseScore * abuseWeight + baseConfidence * baseWeight;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export interface EnrichmentStats {
  enriched: number;
  failed: number;
  skipped: number;
  partial: number;
}

export class EnrichmentService {
  constructor(
    private readonly repo: EnrichmentRepository,
    private readonly vtProvider: VirusTotalProvider,
    private readonly abuseProvider: AbuseIPDBProvider,
    private readonly haikuProvider: HaikuTriageProvider | null,
    private readonly costTracker: EnrichmentCostTracker,
    private readonly aiEnabled: boolean,
    private readonly logger: pino.Logger,
    private readonly cache?: EnrichmentCache,
    private readonly dailyBudgetUsd: number = 5.00,
    private readonly gsbProvider?: GoogleSafeBrowsingProvider | null,
    private readonly ipinfoProvider?: IPinfoProvider | null,
  ) {}

  /** Enrich a single IOC with external API lookups + optional Haiku triage */
  async enrichIOC(job: EnrichJob): Promise<EnrichmentResult> {
    const now = new Date();

    if (!this.aiEnabled) {
      this.logger.debug({ iocId: job.iocId }, 'Enrichment disabled (TI_AI_ENABLED=false)');
      return {
        vtResult: null, abuseipdbResult: null, haikuResult: null, gsbResult: null,
        enrichedAt: now.toISOString(), enrichmentStatus: 'skipped',
        failureReason: 'TI_AI_ENABLED is false', externalRiskScore: null, costBreakdown: null,
        enrichmentQuality: null, geolocation: null,
      };
    }

    // #6 Cache check — return cached result if available
    if (this.cache?.isAvailable()) {
      const cached = await this.cache.get(job.iocType, job.normalizedValue);
      if (cached) {
        this.logger.debug({ iocId: job.iocId }, 'Returning cached enrichment result');
        // Track $0 cost for cache hit
        this.costTracker.trackProvider(job.iocId, job.iocType, 'virustotal', 0, 0, null, 0);
        return cached;
      }
    }

    let vtResult: VTResult | null = null;
    let abuseResult: AbuseIPDBResult | null = null;
    let haikuResult: HaikuTriageResult | null = null;
    let gsbResult: GSBResult | null = null;
    const errors: string[] = [];

    // VirusTotal lookup (IP, domain, hash, URL)
    if (this.vtProvider.supports(job.iocType)) {
      const vtStart = Date.now();
      try {
        vtResult = await this.vtProvider.lookup(job.iocType, job.normalizedValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`VT: ${msg}`);
        this.logger.warn({ error: msg, iocId: job.iocId }, 'VT lookup failed');
      }
      this.costTracker.trackProvider(job.iocId, job.iocType, 'virustotal', 0, 0, null, Date.now() - vtStart);
    }

    // AbuseIPDB lookup (IP only)
    if (this.abuseProvider.supports(job.iocType)) {
      const abuseStart = Date.now();
      try {
        abuseResult = await this.abuseProvider.lookup(job.iocType, job.normalizedValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`AbuseIPDB: ${msg}`);
        this.logger.warn({ error: msg, iocId: job.iocId }, 'AbuseIPDB lookup failed');
      }
      this.costTracker.trackProvider(job.iocId, job.iocType, 'abuseipdb', 0, 0, null, Date.now() - abuseStart);
    }

    // IPinfo.io lookup (ip/ipv6 only — geolocation + ASN, called after AbuseIPDB)
    let ipinfoResult: IPinfoResult | null = null;
    if (this.ipinfoProvider?.supports(job.iocType)) {
      const ipinfoStart = Date.now();
      try {
        ipinfoResult = await this.ipinfoProvider.lookup(job.iocType, job.normalizedValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`IPinfo: ${msg}`);
        this.logger.warn({ error: msg, iocId: job.iocId }, 'IPinfo lookup failed');
      }
      this.costTracker.trackProvider(job.iocId, job.iocType, 'ipinfo', 0, 0, null, Date.now() - ipinfoStart);
    }

    // Google Safe Browsing lookup (url, domain, fqdn only — supplementary to VT)
    if (this.gsbProvider?.supports(job.iocType)) {
      try {
        gsbResult = await this.gsbProvider.lookup(job.iocType, job.normalizedValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`GSB: ${msg}`);
        this.logger.warn({ error: msg, iocId: job.iocId }, 'GSB lookup failed');
      }
    }

    // #5 Budget Enforcement Gate — check before calling Haiku
    if (this.haikuProvider?.isEnabled()) {
      const budgetAlert = this.costTracker.checkBudgetAlert(job.tenantId, this.dailyBudgetUsd);

      if (budgetAlert.isOverBudget) {
        // 100%+ budget — skip AI entirely, use rule-based fallback
        this.logger.warn({ tenantId: job.tenantId, spend: budgetAlert.currentSpendUsd }, 'Budget exceeded — skipping Haiku');
        haikuResult = ruleBasedScore(job.iocType, vtResult, abuseResult);
      } else if (budgetAlert.percentUsed >= BUDGET_FALLBACK_PERCENT) {
        // 90-99% budget — use rule-based fallback instead of Haiku
        this.logger.info({ tenantId: job.tenantId, percentUsed: budgetAlert.percentUsed }, 'Budget at 90%+ — using rule-based fallback');
        haikuResult = ruleBasedScore(job.iocType, vtResult, abuseResult);
      } else {
        // Under budget — call Haiku normally
        haikuResult = await this.haikuProvider.triage(job.iocType, job.normalizedValue, vtResult, abuseResult, job.confidence);
        if (haikuResult) {
          this.costTracker.trackProvider(
            job.iocId, job.iocType, 'haiku_triage',
            haikuResult.inputTokens, haikuResult.outputTokens, 'haiku', haikuResult.durationMs,
          );
        }
      }
    }

    // Determine status
    const hasAnyResult = vtResult !== null || abuseResult !== null || haikuResult !== null || gsbResult !== null || ipinfoResult !== null;
    const hasAllExternal = (
      (!this.vtProvider.supports(job.iocType) || vtResult !== null) &&
      (!this.abuseProvider.supports(job.iocType) || abuseResult !== null)
    );

    let enrichmentStatus: EnrichmentResult['enrichmentStatus'];
    if (hasAllExternal) enrichmentStatus = 'enriched';
    else if (hasAnyResult) enrichmentStatus = 'partial';
    else if (errors.length > 0) enrichmentStatus = 'failed';
    else enrichmentStatus = 'enriched';

    const externalRiskScore = hasAnyResult
      ? computeRiskScore(vtResult, abuseResult, haikuResult, job.confidence)
      : null;

    const costBreakdown = this.costTracker.getIOCCost(job.iocId);

    // #10 Enrichment Quality Score
    const enrichmentQuality = hasAnyResult
      ? computeEnrichmentQuality(vtResult, abuseResult, haikuResult, job.iocType, now)
      : null;

    // #12 Geolocation — extract from AbuseIPDB for IP types
    const geolocation = this.extractGeolocation(job.iocType, abuseResult);

    const result: EnrichmentResult = {
      vtResult, abuseipdbResult: abuseResult, haikuResult, gsbResult, ipinfoResult,
      enrichedAt: now.toISOString(), enrichmentStatus,
      failureReason: errors.length > 0 ? errors.join('; ') : null,
      externalRiskScore, costBreakdown,
      enrichmentQuality, geolocation,
    };

    // Merge with existing enrichment data and persist
    const existingData = (job.existingEnrichment ?? {}) as Record<string, unknown>;
    const mergedEnrichment = { ...existingData, ...result };

    await this.repo.updateEnrichment(job.iocId, mergedEnrichment, now);

    // #4 Confidence Feedback Loop — update IOC confidence with AI score
    if (externalRiskScore !== null) {
      await this.updateIOCConfidence(job, externalRiskScore);
    }

    // Track tenant spend
    if (costBreakdown.totalCostUsd > 0) {
      this.costTracker.addTenantSpend(job.tenantId, costBreakdown.totalCostUsd);
    }

    // #6 Cache store — save result for future lookups
    if (this.cache?.isAvailable() && enrichmentStatus === 'enriched') {
      await this.cache.set(job.iocType, job.normalizedValue, result);
    }

    this.logger.info(
      { iocId: job.iocId, iocType: job.iocType, status: enrichmentStatus, riskScore: externalRiskScore, costUsd: costBreakdown.totalCostUsd },
      'IOC enrichment complete',
    );

    return result;
  }

  /**
   * #12 Geolocation — extract from AbuseIPDB response for IP/IPv6 IOCs.
   * No additional API calls needed; AbuseIPDB already provides country + ISP.
   */
  private extractGeolocation(iocType: string, abuse: AbuseIPDBResult | null): Geolocation | null {
    if (!abuse) return null;
    if (iocType !== 'ip' && iocType !== 'ipv6') return null;
    return {
      countryCode: abuse.countryCode,
      isp: abuse.isp,
      usageType: abuse.usageType,
      isTor: abuse.isTor,
    };
  }

  /**
   * #4 Confidence Feedback Loop
   * Feed enrichment riskScore into the 3-signal confidence formula as aiScore.
   * Updates IOC.confidence in DB via shared-normalization calculateCompositeConfidence.
   */
  private async updateIOCConfidence(job: EnrichJob, aiScore: number): Promise<void> {
    try {
      const existing = job.existingEnrichment as Record<string, unknown> | undefined;
      const feedReliability = Number(existing?.feedReliability ?? 50);
      const corroboration = Number(existing?.corroboration ?? 0);

      const composite = calculateCompositeConfidence(
        { feedReliability, corroboration, aiScore },
        0, // daysSinceLastSeen = 0 (just enriched)
        job.iocType,
      );

      await this.repo.updateConfidence(job.iocId, composite.score);
      this.logger.debug({ iocId: job.iocId, oldConfidence: job.confidence, newConfidence: composite.score }, 'Confidence updated via feedback loop');
    } catch (err) {
      // Non-fatal — log and continue
      this.logger.warn({ error: (err as Error).message, iocId: job.iocId }, 'Confidence feedback loop failed — continuing');
    }
  }
}
