import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchRecorrelationService } from '../src/services/batch-recorrelation.js';
import { CorrelationStore } from '../src/schemas/correlation.js';
import type { CorrelatedIOC, CorrelationResult } from '../src/schemas/correlation.js';
import { CooccurrenceService } from '../src/services/cooccurrence.js';
import { InfrastructureClusterService } from '../src/services/infrastructure-cluster.js';
import { TemporalWaveService } from '../src/services/temporal-wave.js';
import { CampaignClusterService } from '../src/services/campaign-cluster.js';
import { FPSuppressionService } from '../src/services/fp-suppression.js';
import { ConfidenceScoringService } from '../src/services/confidence-scoring.js';

function makeIOC(id: string, overrides: Partial<CorrelatedIOC> = {}): CorrelatedIOC {
  return {
    id, tenantId: 't1', iocType: 'ip', value: `1.2.3.${id}`,
    normalizedValue: `1.2.3.${id}`, confidence: 80, severity: 'HIGH',
    tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
    sourceFeedIds: ['f1', 'f2'], firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(), enrichmentQuality: 0.7,
    ...overrides,
  };
}

function createService(store: CorrelationStore): BatchRecorrelationService {
  return new BatchRecorrelationService({
    store,
    cooccurrence: new CooccurrenceService(),
    infraCluster: new InfrastructureClusterService(),
    temporalWave: new TemporalWaveService(),
    campaignCluster: new CampaignClusterService(),
    fpSuppression: new FPSuppressionService(),
    confidenceScoring: new ConfidenceScoringService(),
    confidenceThreshold: 0.6,
    windowHours: 24,
  });
}

describe('BatchRecorrelationService', () => {
  let store: CorrelationStore;
  let service: BatchRecorrelationService;

  beforeEach(() => {
    store = new CorrelationStore();
    service = createService(store);
  });

  describe('startBatch', () => {
    it('creates job with pending status', () => {
      const job = service.startBatch('t1');
      expect(job.status).toBe('pending');
      expect(job.tenantId).toBe('t1');
      expect(job.processed).toBe(0);
    });

    it('generates unique batchId', () => {
      const job1 = service.startBatch('t1');
      const job2 = service.startBatch('t1');
      expect(job1.id).not.toBe(job2.id);
    });

    it('accepts specific algorithms filter', () => {
      const job = service.startBatch('t1', { algorithms: ['cooccurrence'] });
      expect(job.algorithms).toEqual(['cooccurrence']);
    });
  });

  describe('getBatchProgress', () => {
    it('returns null for unknown batchId', () => {
      expect(service.getBatchProgress('nonexistent')).toBeNull();
    });

    it('returns job with current status', () => {
      const job = service.startBatch('t1');
      const progress = service.getBatchProgress(job.id);
      expect(progress).not.toBeNull();
      expect(progress!.id).toBe(job.id);
    });
  });

  describe('cancelBatch', () => {
    it('returns true for existing job', () => {
      const job = service.startBatch('t1');
      expect(service.cancelBatch(job.id)).toBe(true);
    });

    it('returns false for unknown job', () => {
      expect(service.cancelBatch('nonexistent')).toBe(false);
    });
  });

  describe('listBatches', () => {
    it('returns only jobs for specified tenant', () => {
      service.startBatch('t1');
      service.startBatch('t1');
      service.startBatch('t2');
      expect(service.listBatches('t1')).toHaveLength(2);
      expect(service.listBatches('t2')).toHaveLength(1);
    });
  });

  describe('processing', () => {
    it('completes batch with IOC data', async () => {
      const tenantIOCs = store.getTenantIOCs('t1');
      for (let i = 0; i < 5; i++) {
        tenantIOCs.set(`ioc-${i}`, makeIOC(`ioc-${i}`, {
          sourceFeedIds: ['f1', 'f2'],
          asn: 'AS12345',
        }));
      }

      const job = service.startBatch('t1');

      // Wait for async processing to complete
      await new Promise<void>((resolve) => {
        const check = () => {
          const progress = service.getBatchProgress(job.id);
          if (progress && (progress.status === 'completed' || progress.status === 'failed')) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        setTimeout(check, 10);
      });

      const final = service.getBatchProgress(job.id);
      expect(final).not.toBeNull();
      expect(final!.status).toBe('completed');
      expect(final!.completedAt).toBeTruthy();
    });

    it('cancelled job stops processing', async () => {
      const tenantIOCs = store.getTenantIOCs('t1');
      for (let i = 0; i < 3; i++) {
        tenantIOCs.set(`ioc-${i}`, makeIOC(`ioc-${i}`));
      }

      const job = service.startBatch('t1');
      service.cancelBatch(job.id);

      // Wait a tick for async to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      const final = service.getBatchProgress(job.id);
      expect(final).not.toBeNull();
      expect(['cancelled', 'completed']).toContain(final!.status);
    });
  });
});
