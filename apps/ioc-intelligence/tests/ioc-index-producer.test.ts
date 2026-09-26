/**
 * @module tests/ioc-index-producer
 * @description Verifies analyst writes in ioc-intelligence (create, update, soft-delete,
 * lifecycle transition, bulk ops) keep Elasticsearch search in sync (S157).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IocIndexJobSchema, iocIndexJobId } from '@etip/shared-utils';
import pino from 'pino';
import { IOCService } from '../src/service.js';
import type { IOCRepository } from '../src/repository.js';

const TENANT = '00000000-0000-0000-0000-000000000003';
const NOW = new Date('2026-01-01T00:00:00.000Z');

// ── Mock queue (same pattern as normalization/tests/ioc-index-producer.test.ts) ──
const indexJobs: Array<{ name: string; data: Record<string, unknown>; opts: Record<string, unknown> }> = [];
let indexQueueEnabled = true;
let indexAddImpl: (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown> =
  async (name, data, opts) => {
    indexJobs.push({ name, data, opts });
    return { id: name };
  };

vi.mock('../src/queue.js', () => ({
  getIocIndexQueue: () => (indexQueueEnabled ? { add: (n: string, d: Record<string, unknown>, o: Record<string, unknown>) => indexAddImpl(n, d, o) } : null),
  createIocIndexQueue: vi.fn(),
  closeIocIndexQueue: vi.fn(),
}));

/** A full Prisma-Ioc-shaped row so toIocDocument() succeeds. */
function fullIocRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ioc-1',
    tenantId: TENANT,
    feedSourceId: null,
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

function mockRepo(overrides: Partial<Record<keyof IOCRepository, unknown>> = {}) {
  return {
    findMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(fullIocRow()),
    findByDedupeHash: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(fullIocRow()),
    update: vi.fn().mockResolvedValue(fullIocRow({ severity: 'critical' })),
    softDelete: vi.fn().mockResolvedValue(fullIocRow({ lifecycle: 'revoked' })),
    findByIds: vi.fn().mockResolvedValue([fullIocRow(), fullIocRow({ id: 'ioc-2' }), fullIocRow({ id: 'ioc-3' })]),
    bulkUpdateSeverity: vi.fn().mockResolvedValue(3),
    bulkUpdateLifecycle: vi.fn().mockResolvedValue(3),
    bulkSetTags: vi.fn().mockResolvedValue(3),
    bulkAddTags: vi.fn().mockResolvedValue(3),
    bulkRemoveTags: vi.fn().mockResolvedValue(3),
    findFPRelated: vi.fn().mockResolvedValue([]),
    tagForReview: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as IOCRepository;
}

describe('IOC search-index producer (ioc-intelligence)', () => {
  const logger = pino({ level: 'silent' });

  beforeEach(() => {
    indexJobs.length = 0;
    indexQueueEnabled = true;
    indexAddImpl = async (name, data, opts) => {
      indexJobs.push({ name, data, opts });
      return { id: name };
    };
  });

  it('createIoc queues one schema-valid index job with a versioned jobId', async () => {
    const repo = mockRepo();
    const service = new IOCService(repo, logger);

    await service.createIoc(TENANT, {
      iocType: 'ip', value: '44.55.66.77', severity: 'medium', tlp: 'amber',
      confidence: 60, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
    });

    expect(indexJobs).toHaveLength(1);
    const [entry] = indexJobs;
    expect(entry.data).toMatchObject({ action: 'index', iocId: 'ioc-1', tenantId: TENANT });
    expect(() => IocIndexJobSchema.parse(entry.data)).not.toThrow();
    expect(entry.opts.jobId).toBe(iocIndexJobId('index', 'ioc-1', NOW));
  });

  it('updateIoc (severity change) queues an index job reflecting the new severity', async () => {
    const repo = mockRepo({
      findById: vi.fn().mockResolvedValue(fullIocRow({ severity: 'medium' })),
      update: vi.fn().mockResolvedValue(fullIocRow({ severity: 'critical', updatedAt: new Date('2026-01-02T00:00:00.000Z') })),
    });
    const service = new IOCService(repo, logger);

    await service.updateIoc(TENANT, 'ioc-1', { severity: 'critical' });

    expect(indexJobs).toHaveLength(1);
    expect((indexJobs[0].data.payload as Record<string, unknown>).severity).toBe('critical');
  });

  it('soft delete (revoke) queues an index job with lifecycle revoked', async () => {
    const repo = mockRepo({
      softDelete: vi.fn().mockResolvedValue(fullIocRow({ lifecycle: 'revoked' })),
    });
    const service = new IOCService(repo, logger);

    await service.deleteIoc(TENANT, 'ioc-1');

    expect(indexJobs).toHaveLength(1);
    expect((indexJobs[0].data.payload as Record<string, unknown>).lifecycle).toBe('revoked');
  });

  it('lifecycle transition queues an index job', async () => {
    const repo = mockRepo({
      findById: vi.fn().mockResolvedValue(fullIocRow({ lifecycle: 'active' })),
      update: vi.fn().mockResolvedValue(fullIocRow({ lifecycle: 'aging' })),
    });
    const service = new IOCService(repo, logger);

    await service.transitionLifecycle(TENANT, 'ioc-1', 'aging');

    expect(indexJobs).toHaveLength(1);
    expect((indexJobs[0].data.payload as Record<string, unknown>).lifecycle).toBe('aging');
  });

  it('bulk op on 3 ids re-reads rows and queues 3 index jobs', async () => {
    const repo = mockRepo({
      bulkUpdateSeverity: vi.fn().mockResolvedValue(3),
      findByIds: vi.fn().mockResolvedValue([
        fullIocRow({ id: 'ioc-1' }), fullIocRow({ id: 'ioc-2' }), fullIocRow({ id: 'ioc-3' }),
      ]),
    });
    const service = new IOCService(repo, logger);

    const result = await service.bulkOperation(TENANT, { action: 'set_severity', ids: ['ioc-1', 'ioc-2', 'ioc-3'], severity: 'high' });

    expect(result.affected).toBe(3);
    expect(indexJobs).toHaveLength(3);
    expect(repo.findByIds).toHaveBeenCalledWith(TENANT, ['ioc-1', 'ioc-2', 'ioc-3']);
  });

  it('does not enqueue when getIocIndexQueue() returns null (flag disabled)', async () => {
    indexQueueEnabled = false;
    const repo = mockRepo();
    const service = new IOCService(repo, logger);

    await service.createIoc(TENANT, {
      iocType: 'ip', value: '44.55.66.77', severity: 'medium', tlp: 'amber',
      confidence: 60, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
    });

    expect(indexJobs).toHaveLength(0);
  });

  it('a rejected add() does not fail the request', async () => {
    indexAddImpl = async () => Promise.reject(new Error('redis down'));
    const repo = mockRepo();
    const service = new IOCService(repo, logger);

    await expect(service.createIoc(TENANT, {
      iocType: 'ip', value: '44.55.66.77', severity: 'medium', tlp: 'amber',
      confidence: 60, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
    })).resolves.toHaveProperty('id');
  });

  it('logs a warning and still succeeds when the row fails toIocDocument (missing updatedAt)', async () => {
    const warn = vi.fn();
    const badLogger = { ...logger, warn } as unknown as typeof logger;
    const repo = mockRepo({ create: vi.fn().mockResolvedValue({ ...fullIocRow(), updatedAt: undefined }) });
    const service = new IOCService(repo, badLogger);

    await expect(service.createIoc(TENANT, {
      iocType: 'ip', value: '44.55.66.77', severity: 'medium', tlp: 'amber',
      confidence: 60, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
    })).resolves.toHaveProperty('id');

    expect(indexJobs).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ iocId: 'ioc-1' }),
      'IOC not indexable — skipped search index job',
    );
  });
});
