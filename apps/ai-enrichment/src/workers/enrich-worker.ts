import { Worker, type Job, type Queue } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import type pino from 'pino';
import { EnrichJobSchema, type EnrichJob, type EnrichmentResult } from '../schema.js';
import type { EnrichmentService } from '../service.js';
import { getConfig } from '../config.js';

export interface DownstreamQueues {
  graphSync: Queue | null;
  iocIndex: Queue | null;
  correlate: Queue | null;
  cacheInvalidate: Queue | null;
}

export interface EnrichWorkerDeps {
  service: EnrichmentService;
  logger: pino.Logger;
  downstream?: DownstreamQueues;
}

/**
 * (#7) Strip nulls and internal fields from enrichment result for graph storage.
 * Only sends fields the graph node actually needs — reduces payload size and node bloat.
 */
export function buildGraphProperties(result: EnrichmentResult): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  if (result.externalRiskScore !== null && result.externalRiskScore !== undefined) {
    props.externalRiskScore = result.externalRiskScore;
  }
  if (result.enrichmentQuality !== null && result.enrichmentQuality !== undefined) {
    props.enrichmentQuality = result.enrichmentQuality;
  }
  if (result.geolocation !== null && result.geolocation !== undefined) {
    props.geolocation = result.geolocation;
  }
  if (result.enrichedAt) {
    props.enrichedAt = result.enrichedAt;
  }
  if (result.enrichmentStatus) {
    props.enrichmentStatus = result.enrichmentStatus;
  }
  // Include non-null provider results (without cost/internal data)
  if (result.vtResult) {
    props.vtDetectionRate = result.vtResult.detectionRate;
    props.vtMalicious = result.vtResult.malicious;
    props.vtTags = result.vtResult.tags;
  }
  if (result.abuseipdbResult) {
    props.abuseConfidenceScore = result.abuseipdbResult.abuseConfidenceScore;
    props.abuseTotalReports = result.abuseipdbResult.totalReports;
    props.abuseCountryCode = result.abuseipdbResult.countryCode;
  }
  if (result.haikuResult) {
    props.haikuVerdict = (result.haikuResult as Record<string, unknown>).verdict;
    props.haikuConfidence = (result.haikuResult as Record<string, unknown>).confidence;
  }

  return props;
}

/**
 * Enqueue downstream jobs after successful enrichment.
 * Fire-and-forget — failures are logged but do not fail the enrichment job.
 *
 * Improvements applied:
 * - #6: Deterministic jobId prevents duplicate downstream jobs on re-enrichment
 * - #7: Graph payload stripped of nulls and internal fields
 * - #9: IOC_INDEX payload includes enrichment fields for searchable indexing
 * - #10: CACHE_INVALIDATE event emitted so caching service can flush stale keys
 */
async function enqueueDownstream(
  data: EnrichJob,
  result: EnrichmentResult,
  downstream: DownstreamQueues,
  logger: pino.Logger,
): Promise<void> {
  const { iocId, tenantId, iocType, normalizedValue, severity, confidence } = data;

  // (#7) Graph sync with filtered properties + (#6) deterministic jobId
  if (downstream.graphSync) {
    downstream.graphSync.add('graph-sync', {
      action: 'upsert_node',
      nodeType: iocType,
      nodeId: iocId,
      tenantId,
      properties: buildGraphProperties(result),
    }, {
      jobId: `graph-sync-${iocId}`,
    }).catch((err) => logger.warn({ err: (err as Error).message, iocId }, 'Failed to enqueue GRAPH_SYNC'));
  }

  // (#9) IOC_INDEX with enrichment fields + (#6) deterministic jobId
  if (downstream.iocIndex) {
    downstream.iocIndex.add('ioc-index', {
      action: 'index',
      iocId,
      tenantId,
      iocType,
      normalizedValue,
      externalRiskScore: result.externalRiskScore,
      enrichmentQuality: result.enrichmentQuality,
      severity,
      confidence,
      enrichedAt: result.enrichedAt,
    }, {
      jobId: `ioc-index-${iocId}`,
    }).catch((err) => logger.warn({ err: (err as Error).message, iocId }, 'Failed to enqueue IOC_INDEX'));
  }

  // (#6) Correlate with deterministic jobId
  if (downstream.correlate) {
    downstream.correlate.add('correlate', {
      entityType: 'ioc',
      entityId: iocId,
      tenantId,
      triggerEvent: 'enrichment_complete',
    }, {
      jobId: `correlate-${iocId}`,
    }).catch((err) => logger.warn({ err: (err as Error).message, iocId }, 'Failed to enqueue CORRELATE'));
  }

  // (#10) Notify caching service to invalidate stale keys
  if (downstream.cacheInvalidate) {
    downstream.cacheInvalidate.add('cache-invalidate', {
      tenantId,
      eventType: 'ioc.enriched',
    }).catch((err) => logger.warn({ err: (err as Error).message, iocId }, 'Failed to enqueue CACHE_INVALIDATE'));
  }
}

export function createEnrichWorker(deps: EnrichWorkerDeps): Worker<EnrichJob, EnrichmentResult> {
  const { service, logger, downstream } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  const worker = new Worker<EnrichJob, EnrichmentResult>(
    QUEUES.ENRICH_REALTIME,
    async (job: Job<EnrichJob>) => {
      logger.info(
        { jobId: job.id, iocId: job.data.iocId, iocType: job.data.iocType },
        'Processing enrichment job',
      );

      const parsed = EnrichJobSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, errors: parsed.error.issues }, 'Invalid enrichment job data');
        return {
          vtResult: null, abuseipdbResult: null, haikuResult: null, gsbResult: null,
          enrichedAt: new Date().toISOString(),
          enrichmentStatus: 'failed' as const,
          failureReason: 'Invalid job data',
          externalRiskScore: null, costBreakdown: null,
          enrichmentQuality: null, geolocation: null,
        };
      }

      const result = await service.enrichIOC(parsed.data);

      // Enqueue downstream jobs on successful enrichment
      if (result.enrichmentStatus !== 'failed' && downstream) {
        await enqueueDownstream(parsed.data, result, downstream, logger);
        logger.debug({ iocId: parsed.data.iocId }, 'Downstream jobs enqueued');
      }

      return result;
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: password || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      },
      concurrency: config.TI_ENRICHMENT_CONCURRENCY,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Enrichment job failed (BullMQ)');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Enrich worker error');
  });

  logger.info('Enrich worker started');
  return worker;
}
