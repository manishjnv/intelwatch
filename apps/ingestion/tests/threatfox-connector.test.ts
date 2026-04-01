import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ThreatFoxConnector } from '../src/connectors/threatfox.js';

/* ── Fixtures ────────────────────────────────────────────────────────── */

const FIXTURES = join(__dirname, 'fixtures');
const THREATFOX_JSON = JSON.parse(readFileSync(join(FIXTURES, 'threatfox-recent.json'), 'utf-8'));

/* ── Mock logger ─────────────────────────────────────────────────────── */

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() } as any;
}

/* ── Mock global fetch ───────────────────────────────────────────────── */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockOkResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(Buffer.from(JSON.stringify(data))),
  } as unknown as Response;
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe('ThreatFoxConnector', () => {
  let connector: ThreatFoxConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new ThreatFoxConnector(createMockLogger());
  });

  it('parses fixture JSON and returns correct article count', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    expect(result.articles).toHaveLength(3);
    expect(result.feedTitle).toBe('ThreatFox (abuse.ch)');
    expect(result.fetchDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('maps URL IOC correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    const urlIoc = result.articles[0]!;
    expect(urlIoc.rawMeta.iocValue).toBe('http://evil.example.com/payload.exe');
    expect(urlIoc.rawMeta.iocType).toBe('url');
    expect(urlIoc.rawMeta.source).toBe('threatfox');
    expect(urlIoc.rawMeta.malwareFamilies).toEqual(['Emotet', 'Heodo', 'Geodo']);
    expect(urlIoc.rawMeta.tags).toEqual(['emotet', 'epoch5', 'loader']);
    expect(urlIoc.rawMeta.sourceConfidence).toBe(0.75);
    expect(urlIoc.rawMeta.bulkImport).toBe(true);
  });

  it('extracts IP from ip:port format', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    const ipIoc = result.articles[1]!;
    expect(ipIoc.rawMeta.iocValue).toBe('185.220.101.34');
    expect(ipIoc.rawMeta.iocType).toBe('ip');
    expect(ipIoc.rawMeta.sourceConfidence).toBe(0.9);
  });

  it('maps sha256 hash type', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    const hashIoc = result.articles[2]!;
    expect(hashIoc.rawMeta.iocType).toBe('sha256');
    expect(hashIoc.rawMeta.sourceConfidence).toBe(1.0);
    expect(hashIoc.rawMeta.malwareFamilies).toEqual(['TrickBot', 'Trickster']);
  });

  it('parses publishedAt dates correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    expect(result.articles[0]!.publishedAt).toBeInstanceOf(Date);
    expect(result.articles[0]!.publishedAt!.toISOString()).toContain('2026-03-30');
  });

  it('sends POST with correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ query_status: 'ok', data: [] }));
    await connector.fetch({ apiUrl: 'http://test/api', days: 7 });

    expect(mockFetch).toHaveBeenCalledWith('http://test/api', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: 'get_iocs', days: 7 }),
    }));
  });

  it('handles no_result status gracefully', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ query_status: 'no_result' }));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    expect(result.articles).toHaveLength(0);
  });

  it('throws on API error status', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ query_status: 'illegal_query' }));

    await expect(connector.fetch({ apiUrl: 'http://test/api' }))
      .rejects.toThrow('ThreatFox API error: illegal_query');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(connector.fetch({ apiUrl: 'http://test/api' }))
      .rejects.toThrow('ThreatFox API HTTP 500');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(connector.fetch({ apiUrl: 'http://test/api' }))
      .rejects.toThrow('ThreatFox API request failed: ECONNREFUSED');
  });

  it('respects maxItems limit', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api', maxItems: 2 });

    expect(result.articles).toHaveLength(2);
  });

  it('preserves threatfoxId and malpediaUrl in rawMeta', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    expect(result.articles[0]!.rawMeta.threatfoxId).toBe('1100001');
    expect(result.articles[0]!.rawMeta.malpediaUrl).toContain('malpedia');
  });

  it('sets author from reporter field', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse(THREATFOX_JSON));
    const result = await connector.fetch({ apiUrl: 'http://test/api' });

    expect(result.articles[0]!.author).toBe('abuse_ch');
    expect(result.articles[2]!.author).toBe('virustracker');
  });
});
