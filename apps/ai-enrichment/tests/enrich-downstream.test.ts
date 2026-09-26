import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnrichJob, EnrichmentResult } from '../src/schema.js';
import { iocIndexJobId } from '@etip/shared-utils';

// Mock config before enrich-worker imports it
vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    TI_REDIS_URL: 'redis://localhost:6379/0',
    TI_ENRICHMENT_CONCURRENCY: 1,
    TI_GRAPH_SYNC_ENABLED: true,
    TI_IOC_INDEX_ENABLED: true,
    TI_CORRELATE_ENABLED: true,
  }),
}));

// Mock bullmq before any imports that use it
vi.mock('bullmq', () => {
  let processorFn: ((job: unknown) => Promise<unknown>) | null = null;

  const MockQueue = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'downstream-job-1' }),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  const MockWorker = vi.fn().mockImplementation((_queue: string, processor: (job: unknown) => Promise<unknown>) => {
    processorFn = processor;
    return {
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
  });

  return {
    Queue: MockQueue,
    Worker: MockWorker,
    __getProcessor: () => processorFn,
  };
});

// Must import after mock
import { createEnrichWorker, buildGraphProperties, type DownstreamQueues } from '../src/workers/enrich-worker.js';

function makeEnrichJob(overrides: Partial<EnrichJob> = {}): EnrichJob {
  return {
    iocId: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    iocType: 'ip',
    normalizedValue: '192.168.1.1',
    confidence: 80,
    severity: 'high',
    ...overrides,
  };
}

function makeSuccessResult(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
  return {
    vtResult: null,
    abuseipdbResult: null,
    haikuResult: null,
    enrichedAt: new Date().toISOString(),
    enrichmentStatus: 'enriched',
    failureReason: null,
    externalRiskScore: 75,
    costBreakdown: null,
    enrichmentQuality: 85,
    geolocation: null,
    ...overrides,
  };
}

function makeFailedResult(): EnrichmentResult {
  return {
    vtResult: null, abuseipdbResult: null, haikuResult: null,
    enrichedAt: new Date().toISOString(), enrichmentStatus: 'failed',
    failureReason: 'Provider error', externalRiskScore: null,
    costBreakdown: null, enrichmentQuality: null, geolocation: null,
  };
}

function createMockDownstream(): DownstreamQueues {
  return {
    graphSync: { add: vi.fn().mockResolvedValue({ id: 'gs-1' }), close: vi.fn() } as unknown as DownstreamQueues['graphSync'],
    iocIndex: { add: vi.fn().mockResolvedValue({ id: 'ix-1' }), close: vi.fn() } as unknown as DownstreamQueues['iocIndex'],
    correlate: { add: vi.fn().mockResolvedValue({ id: 'co-1' }), close: vi.fn() } as unknown as DownstreamQueues['correlate'],
    cacheInvalidate: { add: vi.fn().mockResolvedValue({ id: 'ci-1' }), close: vi.fn() } as unknown as DownstreamQueues['cacheInvalidate'],
  };
}

function createMockLogger() {
  return {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    fatal: vi.fn(), trace: vi.fn(), child: vi.fn().mockReturnThis(),
  };
}

describe('Enrich Worker — Downstream Enqueue', () => {
  let mockService: { enrichIOC: ReturnType<typeof vi.fn> };
  let mockLogger: ReturnType<typeof createMockLogger>;
  let downstream: DownstreamQueues;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = { enrichIOC: vi.fn() };
    mockLogger = createMockLogger();
    downstream = createMockDownstream();
  });

  it('enqueues to all 4 downstream queues on successful enrichment', async () => {
    const result = makeSuccessResult();
    mockService.enrichIOC.mockResolvedValue(result);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    const jobData = makeEnrichJob();
    await processor({ id: 'job-1', data: jobData });

    // Verify all 4 downstream queues called
    expect((downstream.graphSync as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalled();
    expect((downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalled();
    expect((downstream.correlate as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalled();
    expect((downstream.cacheInvalidate as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalled();
  });

  it('(#6) uses deterministic jobId for deduplication', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    const jobData = makeEnrichJob();
    await processor({ id: 'job-1', data: jobData });

    // graph-sync uses deterministic jobId
    expect((downstream.graphSync as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'graph-sync',
      expect.any(Object),
      { jobId: `graph-sync-${jobData.iocId}` },
    );

    // ioc-index uses deterministic jobId derived from action + iocId + enrichedAt version
    const call = (downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add.mock.calls[0];
    expect(call[2].jobId).toBe(iocIndexJobId('update', jobData.iocId, call[1].payload.enrichedAt));

    // correlate uses deterministic jobId
    expect((downstream.correlate as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'correlate',
      expect.any(Object),
      { jobId: `correlate-${jobData.iocId}` },
    );
  });

  it('(#9) IOC_INDEX sends a partial "update" job with enrichment fields', async () => {
    const result = makeSuccessResult({ externalRiskScore: 90, enrichmentQuality: 85 });
    mockService.enrichIOC.mockResolvedValue(result);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    const jobData = makeEnrichJob();
    await processor({ id: 'job-1', data: jobData });

    expect((downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'ioc-index',
      expect.objectContaining({
        action: 'update',
        iocId: jobData.iocId,
        tenantId: jobData.tenantId,
        iocType: jobData.iocType,
        payload: expect.objectContaining({
          enriched: true,
          enrichedAt: expect.any(String),
          severity: 'high',
          confidence: 80,
          externalRiskScore: 90,
          enrichmentQuality: 85,
        }),
      }),
      expect.any(Object),
    );
  });

  it('(#9) IOC_INDEX job validates against IocIndexJobSchema', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult({ externalRiskScore: 72.6, enrichmentQuality: 41.4 }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await processor({ id: 'job-1', data: makeEnrichJob() });

    const { IocIndexJobSchema } = await import('@etip/shared-utils');
    const [, job] = (downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add.mock.calls[0];
    expect(() => IocIndexJobSchema.parse(job)).not.toThrow();
    // 72.6 rounds to 73
    expect(job.payload.externalRiskScore).toBe(73);
    expect(job.payload.enrichmentQuality).toBe(41);
  });

  it('(#9) omits externalRiskScore/enrichmentQuality from payload when null', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult({ externalRiskScore: null, enrichmentQuality: null }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await processor({ id: 'job-1', data: makeEnrichJob() });

    const [, job] = (downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add.mock.calls[0];
    expect('externalRiskScore' in job.payload).toBe(false);
    expect('enrichmentQuality' in job.payload).toBe(false);
  });

  it('(#9) two enrichments with different enrichedAt get different jobIds', async () => {
    mockService.enrichIOC
      .mockResolvedValueOnce(makeSuccessResult({ enrichedAt: '2026-01-01T00:00:00.000Z' }))
      .mockResolvedValueOnce(makeSuccessResult({ enrichedAt: '2026-01-02T00:00:00.000Z' }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    const jobData = makeEnrichJob();
    await processor({ id: 'job-1', data: jobData });
    await processor({ id: 'job-2', data: jobData });

    const calls = (downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add.mock.calls;
    expect(calls[0][2].jobId).not.toBe(calls[1][2].jobId);
  });

  it('(#9) invalid severity is skipped with a warn log, never throws', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult());
    const jobData = makeEnrichJob({ severity: 'bogus' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await expect(processor({ id: 'job-1', data: jobData })).resolves.toBeDefined();

    expect((downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('(#10) emits CACHE_INVALIDATE event after enrichment', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await processor({ id: 'job-1', data: makeEnrichJob() });

    expect((downstream.cacheInvalidate as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'cache-invalidate',
      { tenantId: expect.any(String), eventType: 'ioc.enriched' },
    );
  });

  it('does NOT enqueue downstream on failed enrichment', async () => {
    mockService.enrichIOC.mockResolvedValue(makeFailedResult());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await processor({ id: 'job-2', data: makeEnrichJob() });

    expect((downstream.graphSync as unknown as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
    expect((downstream.cacheInvalidate as unknown as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when downstream is not provided', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await expect(processor({ id: 'job-3', data: makeEnrichJob() })).resolves.toBeDefined();
  });

  it('skips disabled downstream queues (null)', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult());
    const partialDownstream: DownstreamQueues = {
      graphSync: null,
      iocIndex: downstream.iocIndex,
      correlate: null,
      cacheInvalidate: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream: partialDownstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    await processor({ id: 'job-4', data: makeEnrichJob() });

    expect((partialDownstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledTimes(1);
  });

  it('handles downstream enqueue failure gracefully', async () => {
    mockService.enrichIOC.mockResolvedValue(makeSuccessResult());
    (downstream.graphSync as unknown as { add: ReturnType<typeof vi.fn> }).add.mockRejectedValue(new Error('Redis down'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    const result = await processor({ id: 'job-5', data: makeEnrichJob() });
    expect(result).toBeDefined();
    expect((downstream.iocIndex as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalled();
  });

  it('returns failed result for invalid job data without downstream enqueue', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createEnrichWorker({ service: mockService as any, logger: mockLogger as any, downstream });
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<unknown> };
    const processor = __getProcessor();

    const result = await processor({ id: 'job-6', data: { iocId: 'not-a-uuid' } });
    expect((result as EnrichmentResult).enrichmentStatus).toBe('failed');
    expect((downstream.graphSync as unknown as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
  });
});

describe('buildGraphProperties (#7)', () => {
  it('strips null fields from result', () => {
    const props = buildGraphProperties({
      vtResult: null, abuseipdbResult: null, haikuResult: null,
      enrichedAt: '2026-03-24T00:00:00Z', enrichmentStatus: 'enriched',
      failureReason: null, externalRiskScore: 75, costBreakdown: null,
      enrichmentQuality: 85, geolocation: null,
    });

    expect(props.externalRiskScore).toBe(75);
    expect(props.enrichmentQuality).toBe(85);
    expect(props.enrichedAt).toBe('2026-03-24T00:00:00Z');
    expect(props).not.toHaveProperty('vtDetectionRate');
    expect(props).not.toHaveProperty('geolocation');
    expect(props).not.toHaveProperty('costBreakdown');
    expect(props).not.toHaveProperty('failureReason');
  });

  it('includes VT fields when vtResult is present', () => {
    const props = buildGraphProperties({
      vtResult: { malicious: 5, suspicious: 1, harmless: 60, undetected: 4, totalEngines: 70, detectionRate: 7.1, tags: ['trojan'], lastAnalysisDate: null },
      abuseipdbResult: null, haikuResult: null,
      enrichedAt: '2026-03-24T00:00:00Z', enrichmentStatus: 'enriched',
      failureReason: null, externalRiskScore: 50, costBreakdown: null,
      enrichmentQuality: 60, geolocation: null,
    });

    expect(props.vtDetectionRate).toBe(7.1);
    expect(props.vtMalicious).toBe(5);
    expect(props.vtTags).toEqual(['trojan']);
  });

  it('includes AbuseIPDB fields when present', () => {
    const props = buildGraphProperties({
      vtResult: null,
      abuseipdbResult: { abuseConfidenceScore: 95, totalReports: 42, numDistinctUsers: 10, lastReportedAt: null, isp: 'Bad ISP', countryCode: 'RU', usageType: '', isWhitelisted: false, isTor: false },
      haikuResult: null,
      enrichedAt: '2026-03-24T00:00:00Z', enrichmentStatus: 'enriched',
      failureReason: null, externalRiskScore: 90, costBreakdown: null,
      enrichmentQuality: 80, geolocation: null,
    });

    expect(props.abuseConfidenceScore).toBe(95);
    expect(props.abuseTotalReports).toBe(42);
    expect(props.abuseCountryCode).toBe('RU');
  });
});
