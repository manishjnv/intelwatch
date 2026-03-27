/**
 * @module GlobalEnrichWorker
 * @description Consumes ENRICH_GLOBAL queue. Enriches global IOCs via external sources
 * (Shodan, GreyNoise, EPSS stubs, etc.), recalculates confidence, and emits
 * GLOBAL_IOC_CRITICAL for high-severity IOCs. DECISION-029 Phase B2.
 */

import { Worker, type Job } from 'bullmq';
import { QUEUES, EVENTS } from '@etip/shared-utils';
import {
  calculateBayesianConfidence,
  stixConfidenceTier,
} from '@etip/shared-normalization';
import { ShodanClient } from '../enrichment/shodan-client.js';
import { GreyNoiseClient } from '../enrichment/greynoise-client.js';
import type { PrismaClient } from '@prisma/client';
import type pino from 'pino';

export interface GlobalEnrichJobData {
  globalIocId: string;
}

interface EnrichmentSourceResult {
  source: string;
  data: Record<string, unknown> | null;
  timestamp: string;
  success: boolean;
}

export interface GlobalEnrichDeps {
  prisma: PrismaClient;
  logger: pino.Logger;
  shodanClient?: ShodanClient;
  greynoiseClient?: GreyNoiseClient;
  eventEmitter?: { emit: (event: string, data: unknown) => void };
}

/** Determine enrichment sources by IOC type. */
function getSourcesForType(iocType: string): string[] {
  switch (iocType) {
    case 'ip':     return ['shodan', 'greynoise', 'geoip'];
    case 'domain': return ['greynoise', 'whois'];
    case 'hash_md5':
    case 'hash_sha1':
    case 'hash_sha256': return ['virustotal', 'malwarebazaar'];
    case 'cve':    return ['epss', 'cpe'];
    case 'url':    return ['urlhaus'];
    case 'email':  return ['hibp'];
    default:       return [];
  }
}

/** Calculate enrichment quality score (0-100). */
function calculateEnrichmentQuality(results: EnrichmentSourceResult[], totalSources: number): number {
  if (totalSources === 0) return 0;
  const successCount = results.filter((r) => r.success && r.data !== null).length;
  const sourceCoverage = (successCount / totalSources) * 50;

  // Data freshness: all results are fresh (just fetched)
  const freshnessScore = successCount > 0 ? 30 : 0;

  // Coverage: at least some data came back
  const coverageScore = successCount >= Math.ceil(totalSources / 2) ? 20 : (successCount > 0 ? 10 : 0);

  return Math.round(Math.min(100, sourceCoverage + freshnessScore + coverageScore));
}

export function createGlobalEnrichWorker(deps: GlobalEnrichDeps): Worker {
  const { prisma, logger, eventEmitter } = deps;
  const redisUrl = new URL(process.env['TI_REDIS_URL'] ?? 'redis://localhost:6379');
  const password = decodeURIComponent(redisUrl.password || '');

  const shodan = deps.shodanClient ?? new ShodanClient();
  const greynoise = deps.greynoiseClient ?? new GreyNoiseClient();

  async function processJob(job: Job<GlobalEnrichJobData>): Promise<void> {
    const { globalIocId } = job.data;

    // 1. Load IOC by dedupeHash (used as jobId key)
    const ioc = await prisma.globalIoc.findUnique({ where: { dedupeHash: globalIocId } });
    if (!ioc) {
      logger.warn({ globalIocId }, 'Global IOC not found — skipping');
      return;
    }

    // 2. Skip if enriched within 24h
    if (ioc.enrichedAt) {
      const hoursSince = (Date.now() - new Date(ioc.enrichedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        logger.debug({ globalIocId, hoursSince: Math.round(hoursSince) }, 'IOC enriched recently — skipping');
        return;
      }
    }

    // 3. Determine sources
    const sourceNames = getSourcesForType(ioc.iocType);
    const results: EnrichmentSourceResult[] = [];
    let confidenceAdjustment = 0;

    // 4. Call each enrichment source
    for (const source of sourceNames) {
      try {
        switch (source) {
          case 'shodan': {
            const data = await shodan.enrichIp(ioc.normalizedValue);
            results.push({ source, data: data as unknown as Record<string, unknown>, timestamp: new Date().toISOString(), success: !!data });
            if (data) {
              const risk = ShodanClient.extractRiskIndicators(data);
              confidenceAdjustment += risk.riskScore > 50 ? 10 : 0;
            }
            break;
          }
          case 'greynoise': {
            const data = await greynoise.enrichIp(ioc.normalizedValue);
            results.push({ source, data: data as unknown as Record<string, unknown>, timestamp: new Date().toISOString(), success: !!data });
            if (data) {
              const assessment = GreyNoiseClient.assessThreatLevel(data);
              confidenceAdjustment += assessment.confidenceAdjustment;
            }
            break;
          }
          default: {
            // Stub sources — return null gracefully
            results.push({ source, data: null, timestamp: new Date().toISOString(), success: false });
            break;
          }
        }
      } catch {
        results.push({ source, data: null, timestamp: new Date().toISOString(), success: false });
      }
    }

    // 5. Recalculate confidence
    const feedReliability = ioc.confidence; // use current as baseline
    const corroboration = Math.min((ioc.crossFeedCorroboration ?? 1) * 10, 100);
    const aiScore = Math.max(0, Math.min(100, 50 + confidenceAdjustment));

    const newConfidence = calculateBayesianConfidence({
      feedReliability,
      corroboration,
      aiScore,
      daysSinceLastSeen: 0,
      iocType: ioc.iocType,
    });

    const newTier = stixConfidenceTier(newConfidence.score);

    // 6. Calculate enrichment quality
    const enrichmentQuality = calculateEnrichmentQuality(results, sourceNames.length);

    // 7. Merge enrichment data
    const existingData = (ioc.enrichmentData as Record<string, unknown>) ?? {};
    const enrichmentData = {
      ...existingData,
      sources: results,
      lastEnrichedAt: new Date().toISOString(),
    };

    // 8. Update IOC
    await prisma.globalIoc.update({
      where: { dedupeHash: globalIocId },
      data: {
        enrichmentData,
        enrichedAt: new Date(),
        confidence: newConfidence.score,
        stixConfidenceTier: newTier,
        enrichmentQuality,
      },
    });

    // 9. Emit critical event if warranted
    if (newConfidence.score >= 80 && ioc.severity === 'critical') {
      eventEmitter?.emit(EVENTS.GLOBAL_IOC_CRITICAL, {
        globalIocId: ioc.id,
        iocType: ioc.iocType,
        value: ioc.normalizedValue,
        confidence: newConfidence.score,
        severity: ioc.severity,
      });
    }

    // 10. Log
    logger.info(
      { globalIocId, iocType: ioc.iocType, enrichmentQuality, confidence: newConfidence.score },
      `Enriched IOC ${ioc.iocType}:${ioc.normalizedValue} — quality=${enrichmentQuality}, confidence=${newConfidence.score}`,
    );
  }

  const worker = new Worker<GlobalEnrichJobData>(
    QUEUES.ENRICH_GLOBAL,
    async (job) => { await processJob(job); },
    {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port) || 6379,
        password: password || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      },
      concurrency: 3,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Global enrich job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Global enrich worker error');
  });

  logger.info('Global enrich worker started');
  return worker;
}
