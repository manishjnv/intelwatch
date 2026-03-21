import type pino from 'pino';
import type { EnrichmentRepository } from './repository.js';
import type { VirusTotalProvider } from './providers/virustotal.js';
import type { AbuseIPDBProvider } from './providers/abuseipdb.js';
import type { EnrichJob, EnrichmentResult, VTResult, AbuseIPDBResult } from './schema.js';

/** Weighted risk score formula: VT 50% + AbuseIPDB 30% + base confidence 20% */
function computeExternalRiskScore(
  vt: VTResult | null,
  abuse: AbuseIPDBResult | null,
  baseConfidence: number,
): number {
  let vtScore = 0;
  let vtWeight = 0;
  if (vt && vt.totalEngines > 0) {
    vtScore = vt.detectionRate;
    vtWeight = 0.5;
  }

  let abuseScore = 0;
  let abuseWeight = 0;
  if (abuse) {
    abuseScore = abuse.abuseConfidenceScore;
    abuseWeight = 0.3;
  }

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
    private readonly aiEnabled: boolean,
    private readonly logger: pino.Logger,
  ) {}

  /** Enrich a single IOC with external API lookups */
  async enrichIOC(job: EnrichJob): Promise<EnrichmentResult> {
    const now = new Date();

    if (!this.aiEnabled) {
      this.logger.debug({ iocId: job.iocId }, 'Enrichment disabled (TI_AI_ENABLED=false)');
      return {
        vtResult: null,
        abuseipdbResult: null,
        enrichedAt: now.toISOString(),
        enrichmentStatus: 'skipped',
        failureReason: 'TI_AI_ENABLED is false',
        externalRiskScore: null,
      };
    }

    let vtResult: VTResult | null = null;
    let abuseResult: AbuseIPDBResult | null = null;
    const errors: string[] = [];

    // VirusTotal lookup (IP, domain, hash, URL)
    if (this.vtProvider.supports(job.iocType)) {
      try {
        vtResult = await this.vtProvider.lookup(job.iocType, job.normalizedValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`VT: ${msg}`);
        this.logger.warn({ error: msg, iocId: job.iocId }, 'VT lookup failed');
      }
    }

    // AbuseIPDB lookup (IP only)
    if (this.abuseProvider.supports(job.iocType)) {
      try {
        abuseResult = await this.abuseProvider.lookup(job.iocType, job.normalizedValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`AbuseIPDB: ${msg}`);
        this.logger.warn({ error: msg, iocId: job.iocId }, 'AbuseIPDB lookup failed');
      }
    }

    // Determine status
    const hasAnyResult = vtResult !== null || abuseResult !== null;
    const hasAllResults = (
      (!this.vtProvider.supports(job.iocType) || vtResult !== null) &&
      (!this.abuseProvider.supports(job.iocType) || abuseResult !== null)
    );

    let enrichmentStatus: EnrichmentResult['enrichmentStatus'];
    if (hasAllResults) enrichmentStatus = 'enriched';
    else if (hasAnyResult) enrichmentStatus = 'partial';
    else if (errors.length > 0) enrichmentStatus = 'failed';
    else enrichmentStatus = 'enriched'; // no providers applicable = still "enriched"

    const externalRiskScore = hasAnyResult
      ? computeExternalRiskScore(vtResult, abuseResult, job.confidence)
      : null;

    const result: EnrichmentResult = {
      vtResult,
      abuseipdbResult: abuseResult,
      enrichedAt: now.toISOString(),
      enrichmentStatus,
      failureReason: errors.length > 0 ? errors.join('; ') : null,
      externalRiskScore,
    };

    // Merge with existing enrichment data and persist
    const existingData = (job.existingEnrichment ?? {}) as Record<string, unknown>;
    const mergedEnrichment = { ...existingData, ...result };

    await this.repo.updateEnrichment(job.iocId, mergedEnrichment, now);

    this.logger.info(
      { iocId: job.iocId, iocType: job.iocType, status: enrichmentStatus, riskScore: externalRiskScore },
      'IOC enrichment complete',
    );

    return result;
  }
}
