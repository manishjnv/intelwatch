import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomizationClient } from '../src/services/customization-client.js';

// ── Silence logger noise in tests ──────────────────────────────────────────
function noop(): void {}
const mockLogger = { warn: noop, info: noop, error: noop, debug: noop, child: () => mockLogger } as never;

// ── Mock @etip/shared-auth so tests don't need TI_SERVICE_JWT_SECRET ───────
vi.mock('@etip/shared-auth', () => ({
  signServiceToken: () => 'test-service-token',
}));

const TENANT_ID = 'tenant-test-1';
const BASE_URL = 'http://localhost:3017';

function makeSubtaskData(overrides: Record<string, string> = []) {
  const defaults = [
    { subtask: 'classification', model: 'haiku', fallbackModel: 'haiku' },
    { subtask: 'ioc_extraction', model: 'sonnet', fallbackModel: 'haiku' },
    { subtask: 'deduplication', model: 'haiku', fallbackModel: 'haiku' },
    { subtask: 'summarization', model: 'sonnet', fallbackModel: 'haiku' },
  ];
  return defaults.map((d) => ({ ...d, ...((overrides as Record<string, unknown>)[d.subtask] ?? {}) }));
}

function mockFetchOk(data = makeSubtaskData()) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data, total: data.length }),
  });
}

describe('CustomizationClient', () => {
  let origFetch: typeof global.fetch;

  beforeEach(() => {
    origFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  describe('getSubtaskModels — happy path', () => {
    it('maps haiku alias → full model ID for classification', async () => {
      global.fetch = mockFetchOk();
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.classification).toBe('claude-haiku-4-5-20251001');
    });

    it('maps sonnet alias → full model ID for ioc_extraction', async () => {
      global.fetch = mockFetchOk();
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.ioc_extraction).toBe('claude-sonnet-4-20250514');
    });

    it('maps haiku alias → full model ID for deduplication', async () => {
      global.fetch = mockFetchOk();
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.deduplication).toBe('claude-haiku-4-5-20251001');
    });

    it('maps opus alias → full model ID', async () => {
      const data = makeSubtaskData();
      // Override ioc_extraction to opus
      const opusData = data.map((d) => d.subtask === 'ioc_extraction' ? { ...d, model: 'opus' } : d);
      global.fetch = mockFetchOk(opusData);
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.ioc_extraction).toBe('claude-opus-4-6');
    });

    it('passes x-tenant-id and x-service-token headers to the service', async () => {
      const fetchMock = mockFetchOk();
      global.fetch = fetchMock;
      const client = new CustomizationClient(BASE_URL, mockLogger);
      await client.getSubtaskModels(TENANT_ID);
      const [url, opts] = (fetchMock.mock.calls[0] as [string, RequestInit]);
      expect(url).toContain('/api/v1/customization/ai/subtasks');
      expect((opts.headers as Record<string, string>)['x-tenant-id']).toBe(TENANT_ID);
      expect((opts.headers as Record<string, string>)['x-service-token']).toBe('test-service-token');
    });
  });

  describe('getSubtaskModels — 5-minute cache', () => {
    it('returns cached result on second call without issuing a second HTTP request', async () => {
      const fetchMock = mockFetchOk();
      global.fetch = fetchMock;
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const first = await client.getSubtaskModels(TENANT_ID);
      const second = await client.getSubtaskModels(TENANT_ID);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('issues a second HTTP request after clearCache()', async () => {
      const fetchMock = mockFetchOk();
      global.fetch = fetchMock;
      const client = new CustomizationClient(BASE_URL, mockLogger);
      await client.getSubtaskModels(TENANT_ID);
      client.clearCache(TENANT_ID);
      await client.getSubtaskModels(TENANT_ID);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('caches independently per tenant', async () => {
      const fetchMock = mockFetchOk();
      global.fetch = fetchMock;
      const client = new CustomizationClient(BASE_URL, mockLogger);
      await client.getSubtaskModels('tenant-a');
      await client.getSubtaskModels('tenant-b');
      await client.getSubtaskModels('tenant-a'); // cache hit
      expect(fetchMock).toHaveBeenCalledTimes(2); // 2 misses, 1 hit
    });
  });

  describe('getSubtaskModels — fallback on error', () => {
    it('returns default models when fetch throws (network error)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.classification).toBe('claude-haiku-4-5-20251001');
      expect(models.ioc_extraction).toBe('claude-sonnet-4-20250514');
      expect(models.deduplication).toBe('claude-haiku-4-5-20251001');
    });

    it('returns default models when service returns HTTP 503', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.classification).toBe('claude-haiku-4-5-20251001');
      expect(models.ioc_extraction).toBe('claude-sonnet-4-20250514');
    });

    it('does NOT cache error responses (retries on next call)', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: makeSubtaskData(), total: 4 }),
        });
      global.fetch = fetchMock;
      const client = new CustomizationClient(BASE_URL, mockLogger);
      await client.getSubtaskModels(TENANT_ID); // fails → defaults
      const second = await client.getSubtaskModels(TENANT_ID); // succeeds → cached
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(second.classification).toBe('claude-haiku-4-5-20251001');
    });

    it('passes through unknown model strings as-is (BYOK / custom model IDs)', async () => {
      const data = makeSubtaskData().map((d) =>
        d.subtask === 'ioc_extraction' ? { ...d, model: 'ft:claude-3-custom:acme' } : d,
      );
      global.fetch = mockFetchOk(data);
      const client = new CustomizationClient(BASE_URL, mockLogger);
      const models = await client.getSubtaskModels(TENANT_ID);
      expect(models.ioc_extraction).toBe('ft:claude-3-custom:acme');
    });
  });
});
