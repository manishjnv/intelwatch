/**
 * #14 — Batch Re-correlation
 * Retroactively re-runs correlation algorithms against all stored IOCs.
 * Supports progress tracking, cancellation, and diff reporting.
 */
import { randomUUID } from 'crypto';
import type {
  CorrelationStore, CorrelationType, BatchJob,
  CorrelationResult,
} from '../schemas/correlation.js';
import type { CooccurrenceService } from './cooccurrence.js';
import type { InfrastructureClusterService } from './infrastructure-cluster.js';
import type { TemporalWaveService } from './temporal-wave.js';
import type { CampaignClusterService } from './campaign-cluster.js';
import type { FPSuppressionService } from './fp-suppression.js';
import type { ConfidenceScoringService } from './confidence-scoring.js';

export interface BatchRecorrelationDeps {
  store: CorrelationStore;
  cooccurrence: CooccurrenceService;
  infraCluster: InfrastructureClusterService;
  temporalWave: TemporalWaveService;
  campaignCluster: CampaignClusterService;
  fpSuppression: FPSuppressionService;
  confidenceScoring: ConfidenceScoringService;
  confidenceThreshold: number;
  windowHours: number;
}

export class BatchRecorrelationService {
  private readonly jobs = new Map<string, BatchJob>();
  private readonly cancelTokens = new Map<string, boolean>();
  private readonly deps: BatchRecorrelationDeps;

  constructor(deps: BatchRecorrelationDeps) {
    this.deps = deps;
  }

  /** Start a batch re-correlation job. Returns immediately; processing is async. */
  startBatch(
    tenantId: string,
    options?: { algorithms?: CorrelationType[]; ruleTemplateId?: string },
  ): BatchJob {
    const iocs = this.deps.store.getTenantIOCs(tenantId);
    const job: BatchJob = {
      id: randomUUID(),
      tenantId,
      status: 'pending',
      algorithms: options?.algorithms ?? ['cooccurrence', 'infrastructure_overlap',
        'temporal_wave', 'campaign_cluster', 'cross_entity_inference', 'ttp_similarity'],
      ruleTemplateId: options?.ruleTemplateId,
      total: iocs.size,
      processed: 0,
      newCorrelations: 0,
      changedCorrelations: 0,
      removedCorrelations: 0,
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    this.cancelTokens.set(job.id, false);

    // Async processing — HTTP response returns immediately
    setImmediate(() => {
      this.processBatch(job).catch(() => {
        job.status = 'failed';
        job.error = 'Unexpected processing error';
      });
    });

    return job;
  }

  /** Get batch progress by ID. */
  getBatchProgress(batchId: string): BatchJob | null {
    return this.jobs.get(batchId) ?? null;
  }

  /** Cancel a running or pending batch. */
  cancelBatch(batchId: string): boolean {
    if (!this.jobs.has(batchId)) return false;
    this.cancelTokens.set(batchId, true);
    const job = this.jobs.get(batchId)!;
    if (job.status === 'pending' || job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
    }
    return true;
  }

  /** List all batches for a tenant. */
  listBatches(tenantId: string): BatchJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.tenantId === tenantId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // ── Private ────────────────────────────────────────────────────

  private async processBatch(job: BatchJob): Promise<void> {
    job.status = 'running';
    const { store, cooccurrence, infraCluster, temporalWave, campaignCluster,
      fpSuppression, confidenceThreshold, windowHours } = this.deps;

    const tenantId = job.tenantId;
    const iocs = store.getTenantIOCs(tenantId);
    const existingResults = store.getTenantResults(tenantId);

    // Snapshot existing result IDs for diff
    const existingIds = new Set(existingResults.keys());

    // Check cancellation
    if (this.cancelTokens.get(job.id)) {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      return;
    }

    // Run selected algorithms
    const newResults: CorrelationResult[] = [];

    if (job.algorithms.includes('cooccurrence')) {
      const pairs = cooccurrence.detectCooccurrences(tenantId, iocs);
      newResults.push(...cooccurrence.toCorrelationResults(tenantId, pairs, iocs));
    }

    job.processed = Math.floor(job.total * 0.3);

    if (this.cancelTokens.get(job.id)) {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      return;
    }

    if (job.algorithms.includes('infrastructure_overlap')) {
      const clusters = infraCluster.detectClusters(tenantId, iocs);
      newResults.push(...infraCluster.toCorrelationResults(tenantId, clusters, iocs));
    }

    job.processed = Math.floor(job.total * 0.5);

    if (job.algorithms.includes('temporal_wave')) {
      temporalWave.detectWaves(tenantId, iocs, windowHours);
    }

    if (job.algorithms.includes('campaign_cluster')) {
      const campaigns = campaignCluster.detectCampaigns(tenantId, iocs);
      const campaignMap = store.getTenantCampaigns(tenantId);
      for (const c of campaigns) campaignMap.set(c.id, c);
    }

    job.processed = Math.floor(job.total * 0.8);

    // Filter by confidence
    const filtered = newResults.filter((r) => r.confidence >= confidenceThreshold);

    // Apply FP suppression
    const ruleStats = store.getTenantRuleStats(tenantId);
    const suppressed = fpSuppression.applySuppression(filtered, ruleStats);

    // Diff against existing results
    const newResultIds = new Set(suppressed.map((r) => r.id));
    let newCount = 0;
    let changedCount = 0;

    for (const r of suppressed) {
      const existing = existingResults.get(r.id);
      if (!existing) {
        newCount++;
      } else if (Math.abs(existing.confidence - r.confidence) > 0.01) {
        changedCount++;
      }
      existingResults.set(r.id, r);
    }

    // Count removed (existed before but not in new run)
    let removedCount = 0;
    for (const id of existingIds) {
      if (!newResultIds.has(id)) removedCount++;
    }

    job.processed = job.total;
    job.newCorrelations = newCount;
    job.changedCorrelations = changedCount;
    job.removedCorrelations = removedCount;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  }
}
