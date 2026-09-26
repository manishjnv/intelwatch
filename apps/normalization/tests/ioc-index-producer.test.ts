/**
 * @module tests/ioc-index-producer
 * @description Verifies every IOC upsert also enqueues an ES search-index job
 * (QUEUES.IOC_INDEX), independent of AI enrichment routing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IocIndexJobSchema, iocIndexJobId } from '@etip/shared-utils';
import { NormalizationService } from '../src/service.js';
import type { IOCRepository } from '../src/repository.js';
import type { NormalizeBatchJob } from '../src/schema.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// ── Mock queues ──────────────────────────────────────────────────────
const indexJobs: Array<{ name: string; data: Record<string, unknown>; opts: Record<string, unknown> }> = [];
let indexQueueEnabled = true;
let indexAddImpl: (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown> =
  async (name, data, opts) => {
    indexJobs.push({ name, data, opts });
    return { id: name };
  };

vi.mock('../src/queue.js', () => ({
  getEnrichQueue: () => null,
  getIocIndexQueue: () => (indexQueueEnabled ? { add: (n: string, d: Record<string, unknown>, o: Record<string, unknown>) => indexAddImpl(n, d, o) } : null),
  createNormalizeQueue: vi.fn(),
  createEnrichQueue: vi.fn(),
  createIocIndexQueue: vi.fn(),
  closeNormalizeQueue: vi.fn(),
}));

const NOW = new Date('2026-01-01T00:00:00.000Z');

/** A full Prisma-Ioc-shaped row so toIocDocument() succeeds. */
function fullIocRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ioc-1',
    tenantId: '00000000-0000-0000-0000-000000000003',
    feedSourceId: '00000000-0000-0000-0000-000000000002',
    iocType: 'ip',
    value: '44.55.66.77',
    normalizedValue: '44.55.66.77',
    severity: 'medium',
    tlp: 'amber',
    confidence: 60,
    lifecycle: 'active',
    tags: [],
    mitreAttack: [],
    malwareFamilies: [],
    threatActors: [],
    enrichmentData: null,
    enrichedAt: null,
    firstSeen: NOW,
    lastSeen: NOW,
    archivedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

function mockRepo(upsertReturn: Record<string, unknown> = fullIocRow()): IOCRepository {
  return {
    upsert: vi.fn().mockResolvedValue(upsertReturn),
    findById: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getStats: vi.fn().mockResolvedValue({ total: 0, byType: {}, byLifecycle: {}, bySeverity: {} }),
    findByDedupeHash: vi.fn().mockResolvedValue(null),
    findFeedReliability: vi.fn().mockResolvedValue(50),
  } as unknown as IOCRepository;
}

function buildJob(iocs: NormalizeBatchJob['iocs'] = []): NormalizeBatchJob {
  return {
    articleId: '00000000-0000-0000-0000-000000000001',
    feedSourceId: '00000000-0000-0000-0000-000000000002',
    tenantId: '00000000-0000-0000-0000-000000000003',
    feedName: 'Test Feed',
    iocs,
  };
}

describe('IOC search-index producer', () => {
  beforeEach(() => {
    indexJobs.length = 0;
    indexQueueEnabled = true;
    indexAddImpl = async (name, data, opts) => {
      indexJobs.push({ name, data, opts });
      return { id: name };
    };
  });

  it('queues one ioc-index job with a schema-valid payload and deterministic jobId', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, logger);
    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);

    const result = await service.normalizeBatch(job);

    expect(result.created + result.updated).toBe(1);
    expect(indexJobs).toHaveLength(1);
    const [entry] = indexJobs;
    expect(entry.name).toBe('ioc-index');
    expect(entry.data).toMatchObject({ action: 'index', iocId: 'ioc-1', tenantId: job.tenantId });
    expect(() => IocIndexJobSchema.parse(entry.data)).not.toThrow();
    expect(entry.opts.jobId).toBe(iocIndexJobId('index', 'ioc-1', NOW));
  });

  it('does not enqueue when getIocIndexQueue() returns null (flag disabled)', async () => {
    indexQueueEnabled = false;
    const repo = mockRepo();
    const service = new NormalizationService(repo, logger);
    const job = buildJob([{ rawValue: '44.55.66.78', rawType: 'ip' }]);

    const result = await service.normalizeBatch(job);

    expect(result.created + result.updated).toBe(1);
    expect(indexJobs).toHaveLength(0);
  });

  it('a rejected add() does not fail the IOC or the batch', async () => {
    indexAddImpl = async () => Promise.reject(new Error('redis down'));
    const repo = mockRepo();
    const service = new NormalizationService(repo, logger);
    const job = buildJob([{ rawValue: '44.55.66.79', rawType: 'ip' }]);

    const result = await service.normalizeBatch(job);

    expect(result.errors).toBe(0);
    expect(result.created + result.updated).toBe(1);
  });

  it('logs a warning and still counts the IOC when the row fails toIocDocument', async () => {
    const warn = vi.fn();
    const badLogger = { ...logger, warn } as unknown as typeof logger;
    const repo = mockRepo(fullIocRow({ severity: 'bogus' }));
    const service = new NormalizationService(repo, badLogger);
    const job = buildJob([{ rawValue: '44.55.66.80', rawType: 'ip' }]);

    const result = await service.normalizeBatch(job);

    expect(result.errors).toBe(0);
    expect(result.created + result.updated).toBe(1);
    expect(indexJobs).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ iocId: 'ioc-1' }),
      'IOC not indexable — skipped search index job',
    );
  });
});
