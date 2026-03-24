/**
 * BullMQ worker consuming QUEUES.CORRELATE ('etip-correlate').
 * Processes incoming entity events and runs correlation algorithms.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import { CorrelatePayloadSchema, type CorrelatePayload } from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { AppConfig } from '../config.js';
import { getConfig } from '../config.js';
import type { CorrelationStore, CorrelatedIOC } from '../schemas/correlation.js';
import type { CooccurrenceService } from '../services/cooccurrence.js';
import type { InfrastructureClusterService } from '../services/infrastructure-cluster.js';
import type { TemporalWaveService } from '../services/temporal-wave.js';
import type { CampaignClusterService } from '../services/campaign-cluster.js';
import type { FPSuppressionService } from '../services/fp-suppression.js';
import type { ConfidenceScoringService } from '../services/confidence-scoring.js';

// ── Redis Connection Helper ─────────────────────────────────────

function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  const password = decodeURIComponent(url.password || '');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: password || undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

// ── Queue Producer ──────────────────────────────────────────────

let _queue: Queue | null = null;

export function createCorrelateQueue(): Queue {
  const config = getConfig();
  _queue = new Queue(QUEUES.CORRELATE, {
    connection: parseRedisUrl(config.TI_REDIS_URL),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  return _queue;
}

export function getCorrelateQueue(): Queue {
  if (!_queue) throw new AppError(500, 'Correlate queue not initialized', 'QUEUE_NOT_INITIALIZED');
  return _queue;
}

export async function closeCorrelateQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

// ── Downstream Queue Producers ──────────────────────────────────

export interface DownstreamQueues {
  alertEvaluate: Queue | null;
  integrationPush: Queue | null;
}

let _alertEvaluateQueue: Queue | null = null;
let _integrationPushQueue: Queue | null = null;

export function createDownstreamQueues(): DownstreamQueues {
  const config = getConfig();
  const connection = parseRedisUrl(config.TI_REDIS_URL);

  _alertEvaluateQueue = config.TI_ALERT_ENABLED ? new Queue(QUEUES.ALERT_EVALUATE, { connection }) : null;
  _integrationPushQueue = config.TI_INTEGRATION_PUSH_ENABLED ? new Queue(QUEUES.INTEGRATION_PUSH, { connection }) : null;

  return { alertEvaluate: _alertEvaluateQueue, integrationPush: _integrationPushQueue };
}

export function getDownstreamQueues(): DownstreamQueues {
  return { alertEvaluate: _alertEvaluateQueue, integrationPush: _integrationPushQueue };
}

export async function closeDownstreamQueues(): Promise<void> {
  if (_alertEvaluateQueue) { await _alertEvaluateQueue.close(); _alertEvaluateQueue = null; }
  if (_integrationPushQueue) { await _integrationPushQueue.close(); _integrationPushQueue = null; }
}

// ── Worker Dependencies ─────────────────────────────────────────

export interface CorrelateWorkerDeps {
  store: CorrelationStore;
  cooccurrence: CooccurrenceService;
  infraCluster: InfrastructureClusterService;
  temporalWave: TemporalWaveService;
  campaignCluster: CampaignClusterService;
  fpSuppression: FPSuppressionService;
  confidenceScoring: ConfidenceScoringService;
  logger: pino.Logger;
  downstream?: DownstreamQueues;
}

// ── Worker Consumer ─────────────────────────────────────────────

export function createCorrelateWorker(deps: CorrelateWorkerDeps): Worker<CorrelatePayload> {
  const { logger, downstream } = deps;
  const config = getConfig();
  const worker = new Worker<CorrelatePayload>(
    QUEUES.CORRELATE,
    async (job: Job<CorrelatePayload>) => {
      logger.info({ jobId: job.id, entityType: job.data.entityType, tenantId: job.data.tenantId }, 'Processing correlation job');

      const parsed = CorrelatePayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, errors: parsed.error.issues }, 'Invalid job data');
        return;
      }

      const data = parsed.data;
      const matchCount = await processCorrelation(data, deps.store, deps, config, logger);

      // Enqueue downstream: alert only when matches found, integration always
      if (downstream) {
        await enqueueDownstream(data, matchCount, downstream, logger);
      }
    },
    {
      connection: parseRedisUrl(config.TI_REDIS_URL),
      concurrency: config.TI_CORRELATION_WORKER_CONCURRENCY,
      limiter: { max: 20, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Correlation job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Correlation worker error');
  });

  logger.info('Correlation worker started');
  return worker;
}

// ── Job Processing ──────────────────────────────────────────────

/**
 * Enqueue downstream jobs after correlation processing.
 * ALERT_EVALUATE: only when matches found. INTEGRATION_PUSH: always.
 */
async function enqueueDownstream(
  data: CorrelatePayload,
  matchCount: number,
  downstream: DownstreamQueues,
  logger: pino.Logger,
): Promise<void> {
  const { tenantId, entityType, entityId } = data;

  // Only push to alerting if correlation found matches
  if (downstream.alertEvaluate && matchCount > 0) {
    downstream.alertEvaluate.add('alert-evaluate', {
      tenantId,
      eventType: 'correlation.match',
      metric: 'correlation_matches',
      value: matchCount,
      field: 'entityId',
      fieldValue: entityId,
      source: { entityType, entityId, triggerEvent: 'correlation_complete' },
    }).catch((err) => logger.warn({ err: (err as Error).message, entityId }, 'Failed to enqueue ALERT_EVALUATE'));
  }

  // Always push to integration (let integration worker filter by tenant config)
  if (downstream.integrationPush) {
    downstream.integrationPush.add('integration-push', {
      tenantId,
      eventType: 'correlation.match',
      entityType,
      entityId,
      matchCount,
      triggerEvent: 'correlation_complete',
    }).catch((err) => logger.warn({ err: (err as Error).message, entityId }, 'Failed to enqueue INTEGRATION_PUSH'));
  }
}

/** Returns the number of correlation matches found. */
async function processCorrelation(
  data: CorrelatePayload,
  store: CorrelationStore,
  deps: CorrelateWorkerDeps,
  config: AppConfig,
  logger: pino.Logger,
): Promise<number> {
  const { tenantId, entityType, entityId } = data;
  const { cooccurrence, infraCluster, temporalWave, campaignCluster, fpSuppression } = deps;
  const iocs = store.getTenantIOCs(tenantId);

  // Only process IOC entities for now (other types in P2)
  if (entityType !== 'ioc') {
    logger.debug({ entityType, entityId }, 'Skipping non-IOC entity for correlation');
    return 0;
  }

  // Ensure the entity exists in the store (hydrated externally or by prior jobs)
  if (!iocs.has(entityId)) {
    // Create a minimal placeholder — full hydration happens via API routes
    const placeholder: CorrelatedIOC = {
      id: entityId, tenantId, iocType: 'ip', value: entityId,
      normalizedValue: entityId, confidence: 50, severity: 'MEDIUM',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      sourceFeedIds: [], firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(), enrichmentQuality: 0,
    };
    iocs.set(entityId, placeholder);
  }

  // Run correlation algorithms
  const coocPairs = cooccurrence.detectCooccurrences(tenantId, iocs);
  const coocResults = cooccurrence.toCorrelationResults(tenantId, coocPairs, iocs);

  const infraClusters = infraCluster.detectClusters(tenantId, iocs);
  const infraResults = infraCluster.toCorrelationResults(tenantId, infraClusters, iocs);

  const waves = temporalWave.detectWaves(tenantId, iocs, config.TI_CORRELATION_WINDOW_HOURS);
  const tenantWaves = store.getTenantWaves(tenantId);
  tenantWaves.push(...waves);

  const campaigns = campaignCluster.detectCampaigns(tenantId, iocs);
  const campaignMap = store.getTenantCampaigns(tenantId);
  for (const c of campaigns) campaignMap.set(c.id, c);

  // Filter by confidence threshold and apply FP suppression
  const allResults = [...coocResults, ...infraResults]
    .filter((r) => r.confidence >= config.TI_CORRELATION_CONFIDENCE_THRESHOLD);

  const ruleStats = store.getTenantRuleStats(tenantId);
  const suppressed = fpSuppression.applySuppression(allResults, ruleStats);

  // Store results (cap at max)
  const resultsMap = store.getTenantResults(tenantId);
  for (const r of suppressed) {
    if (resultsMap.size >= config.TI_CORRELATION_MAX_RESULTS) break;
    resultsMap.set(r.id, r);
  }

  logger.info({
    tenantId, entityId,
    correlations: suppressed.length,
    campaigns: campaigns.length,
    waves: waves.length,
  }, 'Correlation processing complete');

  return suppressed.length;
}
