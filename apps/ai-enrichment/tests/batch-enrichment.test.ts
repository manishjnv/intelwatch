import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchEnrichmentService } from '../src/batch-enrichment.js';
import type { BatchItem } from '../src/batch-enrichment.js';
import { EnrichmentCostTracker } from '../src/cost-tracker.js';
import pino from 'pino';

// Mock shared-enrichment sanitizer
vi.mock('@etip/shared-enrichment', () => ({
  sanitizeLLMInput: vi.fn((text: string) => ({
    sanitized: text, injectionDetected: false, matchedPatterns: [],
  })),
}));

const logger = pino({ level: 'silent' });

function makeBatchItems(count: number): BatchItem[] {
  return Array.from({ length: count }, (_, i) => ({
    customId: `ioc-${i}`,
    iocType: 'ip',
    normalizedValue: `192.168.1.${i}`,
    vtResult: null,
    abuseResult: null,
    confidence: 50,
  }));
}

describe('BatchEnrichmentService', () => {
  let costTracker: EnrichmentCostTracker;

  beforeEach(() => {
    costTracker = new EnrichmentCostTracker();
  });

  it('isEnabled returns false when client is null', () => {
    const svc = new BatchEnrichmentService(null, 'haiku', costTracker, logger);
    expect(svc.isEnabled()).toBe(false);
  });

  it('isEnabled returns true when client is provided', () => {
    const mockClient = { batches: {} } as any;
    const svc = new BatchEnrichmentService(mockClient, 'haiku', costTracker, logger);
    expect(svc.isEnabled()).toBe(true);
  });

  it('submitBatch throws BATCH_NOT_ENABLED when client is null', async () => {
    const svc = new BatchEnrichmentService(null, 'haiku', costTracker, logger);
    await expect(svc.submitBatch(makeBatchItems(10), 'tenant-1'))
      .rejects.toThrow('Batch enrichment not enabled');
  });

  it('submitBatch throws BATCH_TOO_SMALL when below minimum', async () => {
    const mockClient = {
      batches: { create: vi.fn() },
    } as any;
    const svc = new BatchEnrichmentService(mockClient, 'haiku', costTracker, logger, 10);
    await expect(svc.submitBatch(makeBatchItems(5), 'tenant-1'))
      .rejects.toThrow('minimum 10 items');
  });

  it('submitBatch calls client.batches.create and returns batchId', async () => {
    const mockClient = {
      batches: {
        create: vi.fn().mockResolvedValue({ id: 'batch-123' }),
      },
    } as any;
    const svc = new BatchEnrichmentService(mockClient, 'haiku', costTracker, logger, 10);
    const result = await svc.submitBatch(makeBatchItems(10), 'tenant-1');

    expect(result.batchId).toBe('batch-123');
    expect(result.itemCount).toBe(10);
    expect(result.status).toBe('submitted');
    expect(mockClient.batches.create).toHaveBeenCalledTimes(1);
  });

  it('checkStatus returns batch status from client', async () => {
    const mockClient = {
      batches: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'batch-123',
          processing_status: 'ended',
          request_counts: { total: 10 },
          created_at: '2026-03-22T00:00:00Z',
        }),
      },
    } as any;
    const svc = new BatchEnrichmentService(mockClient, 'haiku', costTracker, logger);
    const status = await svc.checkStatus('batch-123');

    expect(status.batchId).toBe('batch-123');
    expect(status.status).toBe('ended');
    expect(status.itemCount).toBe(10);
  });

  it('processResults processes succeeded items and tracks cost', async () => {
    const resultEntries = [
      {
        custom_id: 'ioc-0',
        result: {
          type: 'succeeded',
          message: {
            content: [{ type: 'text', text: JSON.stringify({ risk_score: 75, severity: 'HIGH' }) }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
      },
      {
        custom_id: 'ioc-1',
        result: { type: 'errored', error: { message: 'timeout' } },
      },
    ];

    const mockClient = {
      batches: {
        results: vi.fn().mockResolvedValue(resultEntries),
      },
    } as any;

    const svc = new BatchEnrichmentService(mockClient, 'haiku', costTracker, logger);
    const results = await svc.processResults('batch-123');

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].result).toEqual({ risk_score: 75, severity: 'HIGH' });
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('errored');
  });

  it('processResults handles JSON parse errors gracefully', async () => {
    const resultEntries = [
      {
        custom_id: 'ioc-0',
        result: {
          type: 'succeeded',
          message: {
            content: [{ type: 'text', text: 'not json at all' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
      },
    ];

    const mockClient = {
      batches: { results: vi.fn().mockResolvedValue(resultEntries) },
    } as any;

    const svc = new BatchEnrichmentService(mockClient, 'haiku', costTracker, logger);
    const results = await svc.processResults('batch-456');

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('JSON parse error');
  });
});
