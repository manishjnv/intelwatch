/**
 * @module tests/bloom-worker-integration
 * @description Integration tests verifying bloom filter behavior
 * in the normalization pipeline (service.ts normalizeBatch).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NormalizationService, buildDedupeHash } from '../src/service.js';
import { BloomManager, resetBloomMetrics, getBloomMetrics } from '../src/bloom.js';
import type { BloomRedisClient, BloomRedisPipeline } from '@etip/shared-utils';

// ── In-Memory Redis Mock ───────────────────────────────────────────

function createMockRedis(): BloomRedisClient {
  const store = new Map<string, Map<number, number>>();
  const strings = new Map<string, string>();

  function getBitmap(key: string): Map<number, number> {
    let bm = store.get(key);
    if (!bm) { bm = new Map(); store.set(key, bm); }
    return bm;
  }

  const client: BloomRedisClient = {
    async setbit(key: string, offset: number, value: number): Promise<number> {
      const bm = getBitmap(key);
      const prev = bm.get(offset) ?? 0;
      bm.set(offset, value);
      return prev;
    },
    async getbit(key: string, offset: number): Promise<number> {
      return store.get(key)?.get(offset) ?? 0;
    },
    async del(key: string | string[]): Promise<number> {
      const keys = Array.isArray(key) ? key : [key];
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
        if (strings.delete(k)) count++;
      }
      return count;
    },
    async get(key: string): Promise<string | null> {
      return strings.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<string | null> {
      strings.set(key, value);
      return 'OK';
    },
    pipeline(): BloomRedisPipeline {
      const ops: Array<{ op: 'setbit' | 'getbit'; key: string; offset: number; value?: number }> = [];
      const pipe: BloomRedisPipeline = {
        setbit(key: string, offset: number, value: number) {
          ops.push({ op: 'setbit', key, offset, value });
          return pipe;
        },
        getbit(key: string, offset: number) {
          ops.push({ op: 'getbit', key, offset });
          return pipe;
        },
        async exec(): Promise<Array<[Error | null, number]>> {
          const results: Array<[Error | null, number]> = [];
          for (const o of ops) {
            if (o.op === 'setbit') {
              const val = await client.setbit(o.key, o.offset, o.value!);
              results.push([null, val]);
            } else {
              const val = await client.getbit(o.key, o.offset);
              results.push([null, val]);
            }
          }
          return results;
        },
      };
      return pipe;
    },
  };
  return client;
}

// ── Mock Repository ────────────────────────────────────────────────

function createMockRepo() {
  const iocs = new Map<string, {
    id: string;
    dedupeHash: string;
    tenantId: string;
    iocType: string;
    normalizedValue: string;
    severity: string;
    confidence: number;
    lifecycle: string;
    firstSeen: Date;
    lastSeen: Date;
    enrichmentData: object | null;
    tags: string[];
    mitreAttack: string[];
    malwareFamilies: string[];
    threatActors: string[];
    tlp: string;
  }>();
  let idCounter = 0;

  return {
    findByDedupeHash: vi.fn(async (hash: string) => iocs.get(hash) ?? null),
    upsert: vi.fn(async (data: Record<string, unknown>) => {
      const hash = data.dedupeHash as string;
      const existing = iocs.get(hash);
      if (existing) {
        const updated = { ...existing, lastSeen: data.lastSeen as Date, confidence: data.confidence as number };
        iocs.set(hash, updated);
        return updated;
      }
      const newIoc = {
        id: `ioc-${++idCounter}`,
        dedupeHash: hash,
        tenantId: data.tenantId as string,
        iocType: data.iocType as string,
        normalizedValue: data.normalizedValue as string,
        severity: data.severity as string,
        confidence: data.confidence as number,
        lifecycle: data.lifecycle as string,
        firstSeen: data.firstSeen as Date,
        lastSeen: data.lastSeen as Date,
        enrichmentData: (data.enrichmentData as object) ?? null,
        tags: (data.tags as string[]) ?? [],
        mitreAttack: (data.mitreAttack as string[]) ?? [],
        malwareFamilies: (data.malwareFamilies as string[]) ?? [],
        threatActors: (data.threatActors as string[]) ?? [],
        tlp: (data.tlp as string) ?? 'amber',
      };
      iocs.set(hash, newIoc);
      return newIoc;
    }),
    findFeedReliability: vi.fn(async () => 75),
    _iocs: iocs,
  };
}

// ── Mock Enrich Queue ──────────────────────────────────────────────

const enrichQueueJobs: Array<{ name: string; data: Record<string, unknown> }> = [];

vi.mock('../src/queue.js', () => ({
  getEnrichQueue: () => ({
    add: vi.fn(async (name: string, data: Record<string, unknown>) => {
      enrichQueueJobs.push({ name, data });
      return { id: name };
    }),
  }),
  createNormalizeQueue: vi.fn(),
  createEnrichQueue: vi.fn(),
  closeNormalizeQueue: vi.fn(),
}));

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as import('pino').Logger;
}

// ── Integration Tests ──────────────────────────────────────────────

describe('Normalization + Bloom Filter Integration', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let logger: ReturnType<typeof createMockLogger>;
  let service: NormalizationService;
  let bloomManager: BloomManager;

  const TENANT = '11111111-1111-1111-1111-111111111111';
  const FEED = '22222222-2222-2222-2222-222222222222';
  const ARTICLE = '33333333-3333-3333-3333-333333333333';

  function makeJob(rawValues: string[]) {
    return {
      articleId: ARTICLE,
      feedSourceId: FEED,
      tenantId: TENANT,
      feedName: 'TestFeed',
      iocs: rawValues.map((v) => ({
        rawValue: v,
        rawType: 'ip',
        calibratedConfidence: 70,
      })),
    };
  }

  beforeEach(() => {
    repo = createMockRepo();
    logger = createMockLogger();
    const redis = createMockRedis();
    bloomManager = new BloomManager({ redis, logger, expectedItems: 10_000, falsePositiveRate: 0.001 });
    service = new NormalizationService(repo as unknown as import('../src/repository.js').IOCRepository, logger);
    service.setBloomManager(bloomManager);
    enrichQueueJobs.length = 0;
    resetBloomMetrics();
  });

  it('new IOC — bloom miss → enrichment queue populated', async () => {
    const result = await service.normalizeBatch(makeJob(['8.8.8.8']));
    expect(result.created).toBe(1);
    expect(result.bloomMisses).toBe(1);
    expect(result.bloomHits).toBe(0);
    // Enrichment queue should have a job
    expect(enrichQueueJobs.length).toBe(1);
    expect(enrichQueueJobs[0].data.normalizedValue).toBe('8.8.8.8');
  });

  it('duplicate IOC — bloom hit → enrichment queue NOT populated', async () => {
    // First pass: new IOC
    await service.normalizeBatch(makeJob(['1.2.3.4']));
    expect(enrichQueueJobs.length).toBe(1);

    // Second pass: same IOC — bloom should hit, enrichment skipped
    const result = await service.normalizeBatch(makeJob(['1.2.3.4']));
    expect(result.updated).toBe(1);
    expect(result.bloomHits).toBe(1);
    // Should still be just 1 enrichment job (from first pass)
    expect(enrichQueueJobs.length).toBe(1);
  });

  it('bloom hit but IOC not in DB (false positive) → enrichment still queued', async () => {
    // Manually add to bloom without adding to repo (simulates FP)
    const hash = buildDedupeHash('ip', '5.5.5.5', TENANT);
    await bloomManager.add(TENANT, hash);

    const result = await service.normalizeBatch(makeJob(['5.5.5.5']));
    expect(result.created).toBe(1);
    expect(result.bloomHits).toBe(1);
    // Bloom said exists, but DB said new → NOT an "existing" update → enrichment should queue
    expect(enrichQueueJobs.length).toBe(1);
    // False positive should be recorded
    expect(getBloomMetrics().falsePositiveTotal).toBe(1);
  });

  it('mixed batch — new + duplicate IOCs', async () => {
    // First pass: 2 new IOCs (use public IPs — 10.x are bogon/filtered)
    await service.normalizeBatch(makeJob(['44.44.44.1', '44.44.44.2']));
    expect(enrichQueueJobs.length).toBe(2);

    // Second pass: 1 duplicate + 1 new
    const result = await service.normalizeBatch(makeJob(['44.44.44.1', '44.44.44.3']));
    expect(result.bloomHits).toBe(1);
    expect(result.bloomMisses).toBe(1);
    // Only 1 new enrichment job (for 44.44.44.3), duplicate 44.44.44.1 skipped
    expect(enrichQueueJobs.length).toBe(3); // 2 from first + 1 new
  });

  it('service works correctly without bloom manager (disabled)', async () => {
    const plainService = new NormalizationService(
      repo as unknown as import('../src/repository.js').IOCRepository,
      logger,
    );
    // No setBloomManager call — bloom disabled

    const result = await plainService.normalizeBatch(makeJob(['9.9.9.9']));
    expect(result.created).toBe(1);
    expect(result.bloomHits).toBe(0);
    expect(result.bloomMisses).toBe(0);
    // Enrichment should always queue without bloom
    expect(enrichQueueJobs.length).toBe(1);
  });

  it('bloom filter adds hash after successful upsert', async () => {
    await service.normalizeBatch(makeJob(['7.7.7.7']));

    // Verify hash is now in bloom
    const hash = buildDedupeHash('ip', '7.7.7.7', TENANT);
    const inBloom = await bloomManager.check(TENANT, hash);
    expect(inBloom).toBe(true);
  });
});
