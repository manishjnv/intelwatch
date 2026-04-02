import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OTXConnector } from '../src/connectors/otx.js';
import pulseFixture from './fixtures/otx-pulse-sample.json';

function createMockLogger() {
  return {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: vi.fn(),
  };
}

describe('OTXConnector', () => {
  let connector: OTXConnector;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new OTXConnector(logger as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Fixture with pagination disabled for single-page tests */
  const singlePageFixture = { ...pulseFixture, next: null };

  /* ── Type mapping ──────────────────────────────────────────────────── */

  it('maps all supported OTX indicator types to ETIP IOC types', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(singlePageFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });

    // Pulse 1: 13 indicators, 2 unsupported (YARA, Mutex), 1 inactive = 10 active supported
    // Pulse 2: 3 indicators, all supported
    // Total: 13 supported IOCs
    expect(result.articles.length).toBe(13);

    const types = result.articles.map((a) => a.rawMeta.iocType);
    expect(types).toContain('md5');
    expect(types).toContain('sha1');
    expect(types).toContain('sha256');
    expect(types).toContain('ip');
    expect(types).toContain('ipv6');
    expect(types).toContain('domain');
    expect(types).toContain('url');
    expect(types).toContain('email');
    expect(types).toContain('cve');
  });

  it('maps FileHash-MD5 → md5 with correct iocValue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(singlePageFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });
    const md5Article = result.articles.find((a) => a.rawMeta.iocValue === 'd41d8cd98f00b204e9800998ecf8427e');

    expect(md5Article).toBeDefined();
    expect(md5Article!.rawMeta.iocType).toBe('md5');
    expect(md5Article!.rawMeta.bulkImport).toBe(true);
    expect(md5Article!.rawMeta.source).toBe('alienvault-otx');
    expect(md5Article!.rawMeta.sourceConfidence).toBe(70);
  });

  it('maps hostname → domain (same ETIP type)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(singlePageFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });
    const hostname = result.articles.find((a) => a.rawMeta.iocValue === 'cdn.malware-c2.example.com');

    expect(hostname).toBeDefined();
    expect(hostname!.rawMeta.iocType).toBe('domain');
  });

  /* ── Unsupported types ─────────────────────────────────────────────── */

  it('skips unsupported indicator types (YARA, Mutex) with warning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(singlePageFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });

    const yaraArticle = result.articles.find((a) => a.rawMeta.iocType === 'YARA');
    const mutexArticle = result.articles.find((a) => a.rawMeta.iocType === 'Mutex');
    expect(yaraArticle).toBeUndefined();
    expect(mutexArticle).toBeUndefined();

    // Should log warnings for skipped types
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'YARA' }),
      expect.stringContaining('Unsupported'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Mutex' }),
      expect.stringContaining('Unsupported'),
    );
  });

  /* ── Inactive indicators ───────────────────────────────────────────── */

  it('skips inactive indicators (is_active=0)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(singlePageFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });

    // Indicator 100013 has is_active=0
    const inactive = result.articles.find((a) => a.rawMeta.iocValue === '098f6bcd4621d373cade4e832627b4f6');
    expect(inactive).toBeUndefined();
  });

  /* ── Pulse metadata carried forward ────────────────────────────────── */

  it('carries Pulse metadata (tags, malwareFamilies, mitreAttack, pulseId)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(singlePageFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });
    const firstArticle = result.articles[0]!;

    expect(firstArticle.rawMeta.pulseId).toBe('6614a1b2c3d4e5f6a7b8c9d0');
    expect(firstArticle.rawMeta.pulseName).toBe('APT29 Cozy Bear Campaign - March 2026');
    expect(firstArticle.rawMeta.tags).toEqual(['apt29', 'cozy-bear', 'phishing', 'government']);
    expect(firstArticle.rawMeta.malwareFamilies).toEqual(['WellMess', 'WellMail']);
    expect(firstArticle.rawMeta.mitreAttack).toEqual(['T1566', 'T1071']);
    expect(firstArticle.rawMeta.targetedCountries).toEqual(['US', 'GB', 'DE']);
    expect(firstArticle.author).toBe('AlienVault');
  });

  /* ── Pagination ────────────────────────────────────────────────────── */

  it('paginates through multiple pages', async () => {
    const page1 = { ...pulseFixture, next: 'https://otx.alienvault.com/api/v1/pulses/subscribed?page=2' };
    const page2 = {
      results: [{
        id: 'page2-pulse', name: 'Page 2 Pulse', description: 'test',
        author_name: 'Tester', created: '2026-03-30T00:00:00Z', modified: '2026-03-30T00:00:00Z',
        tags: [], targeted_countries: [], malware_families: [], attack_ids: [], references: [],
        indicators: [{
          id: 300001, type: 'IPv4', indicator: '10.0.0.1', title: 'test',
          description: 'test', created: '2026-03-30T00:00:00Z', is_active: 1,
        }],
      }],
      count: 1,
      next: null,
    };

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await connector.fetch({ apiKey: 'test-key' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // 13 from page 1 + 1 from page 2
    expect(result.articles.length).toBe(14);
  });

  it('stops pagination when maxPages reached', async () => {
    const page = { ...pulseFixture, next: 'https://otx.alienvault.com/api/v1/pulses/subscribed?page=2' };

    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await connector.fetch({ apiKey: 'test-key', maxPages: 1 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.articles.length).toBe(13);
  });

  /* ── Delta sync ────────────────────────────────────────────────────── */

  it('passes modified_since parameter for delta sync', async () => {
    const noNextFixture = { ...pulseFixture, next: null };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noNextFixture), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await connector.fetch({ apiKey: 'test-key', modifiedSince: '2026-03-28T00:00:00Z' });

    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('modified_since=2026-03-28T00%3A00%3A00Z');
  });

  it('returns latestModified timestamp for cursor persistence', async () => {
    const noNextFixture = { ...pulseFixture, next: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noNextFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });

    // Pulse 1 modified: 2026-03-29T14:30:00.000Z (latest)
    // Pulse 2 modified: 2026-03-26T12:00:00.000Z
    expect(result.latestModified).toBe('2026-03-29T14:30:00.000Z');
  });

  /* ── Auth ──────────────────────────────────────────────────────────── */

  it('sends X-OTX-API-Key header', async () => {
    const noNextFixture = { ...pulseFixture, next: null };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noNextFixture), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await connector.fetch({ apiKey: 'my-secret-key' });

    const headers = fetchSpy.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers['X-OTX-API-Key']).toBe('my-secret-key');
  });

  /* ── Rate limit (429) handling ─────────────────────────────────────── */

  it('retries on 429 with exponential backoff', async () => {
    const noNextFixture = { ...pulseFixture, next: null };
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(noNextFixture), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await connector.fetch({ apiKey: 'test-key', retryDelayMs: 10 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.articles.length).toBe(13);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429 }),
      expect.stringContaining('rate limit'),
    );
  });

  it('throws after max retries on persistent 429', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('', { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(connector.fetch({ apiKey: 'test-key', maxRetries: 2, retryDelayMs: 10 }))
      .rejects.toThrow('OTX rate limited after 2 retries');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  /* ── Error handling ────────────────────────────────────────────────── */

  it('throws on HTTP error (non-429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    ));

    await expect(connector.fetch({ apiKey: 'test-key' }))
      .rejects.toThrow('OTX HTTP 403');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(connector.fetch({ apiKey: 'test-key' }))
      .rejects.toThrow('OTX request failed');
  });

  it('throws on invalid JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('not json', { status: 200 }),
    ));

    await expect(connector.fetch({ apiKey: 'test-key' }))
      .rejects.toThrow('OTX invalid JSON');
  });

  it('throws when results array is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0 }), { status: 200 }),
    ));

    await expect(connector.fetch({ apiKey: 'test-key' }))
      .rejects.toThrow('missing results array');
  });

  /* ── ConnectorResult shape ─────────────────────────────────────────── */

  it('returns correct ConnectorResult shape', async () => {
    const noNextFixture = { ...pulseFixture, next: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noNextFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });

    expect(result.feedTitle).toBe('AlienVault OTX');
    expect(result.feedDescription).toContain('2 Pulses');
    expect(result.fetchDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.articles.length).toBeGreaterThan(0);
  });

  it('sets bulkImport flag on all articles', async () => {
    const noNextFixture = { ...pulseFixture, next: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noNextFixture), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });
    for (const article of result.articles) {
      expect(article.rawMeta.bulkImport).toBe(true);
    }
  });

  /* ── Empty response ────────────────────────────────────────────────── */

  it('handles empty Pulse list gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [], count: 0, next: null }), { status: 200 }),
    ));

    const result = await connector.fetch({ apiKey: 'test-key' });

    expect(result.articles).toHaveLength(0);
    expect(result.latestModified).toBeNull();
  });
});
