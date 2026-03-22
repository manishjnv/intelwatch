import type pino from 'pino';
import type { EnrichmentRepository } from './repository.js';
import type { VirusTotalProvider } from './providers/virustotal.js';
import type { AbuseIPDBProvider } from './providers/abuseipdb.js';
import type { HaikuTriageProvider } from './providers/haiku-triage.js';
import type { EnrichmentCostTracker } from './cost-tracker.js';
import type { EnrichJob, EnrichmentResult, VTResult, AbuseIPDBResult, HaikuTriageResult } from './schema.js';

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
  ) {}

  /** Enrich a single IOC with external API lookups + optional Haiku triage */
  async enrichIOC(job: EnrichJob): Promise<EnrichmentResult> {
    const now = new Date();

    if (!this.aiEnabled) {
      this.logger.debug({ iocId: job.iocId }, 'Enrichment disabled (TI_AI_ENABLED=false)');
      return {
        vtResult: null, abuseipdbResult: null, haikuResult: null,
        enrichedAt: now.toISOString(), enrichmentStatus: 'skipped',
        failureReason: 'TI_AI_ENABLED is false', externalRiskScore: null, costBreakdown: null,
      };
    }

    let vtResult: VTResult | null = null;
    let abuseResult: AbuseIPDBResult | null = null;
    let haikuResult: HaikuTriageResult | null = null;
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

    // Haiku AI triage (all IOC types, when enabled)
    if (this.haikuProvider?.isEnabled()) {
      haikuResult = await this.haikuProvider.triage(job.iocType, job.normalizedValue, vtResult, abuseResult, job.confidence);
      if (haikuResult) {
        this.costTracker.trackProvider(
          job.iocId, job.iocType, 'haiku_triage',
          haikuResult.inputTokens, haikuResult.outputTokens, 'haiku', haikuResult.durationMs,
        );
      }
    }

    // Determine status
    const hasAnyResult = vtResult !== null || abuseResult !== null || haikuResult !== null;
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

    const result: EnrichmentResult = {
      vtResult, abuseipdbResult: abuseResult, haikuResult,
      enrichedAt: now.toISOString(), enrichmentStatus,
      failureReason: errors.length > 0 ? errors.join('; ') : null,
      externalRiskScore, costBreakdown,
    };

    // Merge with existing enrichment data and persist
    const existingData = (job.existingEnrichment ?? {}) as Record<string, unknown>;
    const mergedEnrichment = { ...existingData, ...result };

    await this.repo.updateEnrichment(job.iocId, mergedEnrichment, now);

    // Track tenant spend
    if (costBreakdown.totalCostUsd > 0) {
      this.costTracker.addTenantSpend(job.tenantId, costBreakdown.totalCostUsd);
    }

    this.logger.info(
      { iocId: job.iocId, iocType: job.iocType, status: enrichmentStatus, riskScore: externalRiskScore, costUsd: costBreakdown.totalCostUsd },
      'IOC enrichment complete',
    );

    return result;
  }
}
