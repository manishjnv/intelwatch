import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { URLhausConnector } from '../src/connectors/urlhaus.js';

/* ── Fixtures ────────────────────────────────────────────────────────── */

const FIXTURES = join(__dirname, 'fixtures');
const URLHAUS_CSV = readFileSync(join(FIXTURES, 'urlhaus-recent.csv'), 'utf-8');

/* ── Mock logger ─────────────────────────────────────────────────────── */

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() } as any;
}

/* ── Mock global fetch ───────────────────────────────────────────────── */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockCsvResponse(content: string) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(Buffer.from(content)),
  } as unknown as Response;
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe('URLhausConnector', () => {
  let connector: URLhausConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new URLhausConnector(createMockLogger());
  });

  it('parses fixture CSV and returns correct article count', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles).toHaveLength(3);
    expect(result.feedTitle).toBe('URLhaus (abuse.ch)');
  });

  it('maps URL IOC correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    const first = result.articles[0]!;
    expect(first.rawMeta.iocValue).toBe('http://evil.example.com/malware.exe');
    expect(first.rawMeta.iocType).toBe('url');
    expect(first.rawMeta.source).toBe('urlhaus');
    expect(first.rawMeta.sourceConfidence).toBe(0.8);
    expect(first.rawMeta.bulkImport).toBe(true);
  });

  it('extracts urlStatus and threat from CSV columns', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.urlStatus).toBe('online');
    expect(result.articles[0]!.rawMeta.threat).toBe('malware_download');
    expect(result.articles[1]!.rawMeta.urlStatus).toBe('offline');
  });

  it('parses tags from comma-separated field', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.tags).toEqual(['emotet']);
    expect(result.articles[1]!.rawMeta.tags).toEqual(['qakbot', 'dll']);
  });

  it('sets malwareFamilies from tags', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.malwareFamilies).toEqual(['emotet']);
    expect(result.articles[1]!.rawMeta.malwareFamilies).toEqual(['qakbot', 'dll']);
  });

  it('preserves urlhausId and urlhausLink', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.urlhausId).toBe('123456');
    expect(result.articles[0]!.rawMeta.urlhausLink).toBe('https://urlhaus.abuse.ch/url/123456');
    expect(result.articles[0]!.url).toBe('https://urlhaus.abuse.ch/url/123456');
  });

  it('parses publishedAt dates', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.publishedAt).toBeInstanceOf(Date);
  });

  it('sets author from reporter column', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.author).toBe('abuse_ch');
    expect(result.articles[1]!.author).toBe('anonymous');
  });

  it('skips comment lines in CSV', async () => {
    const csvWithComments = '# Comment 1\n# Comment 2\n"1","2026-01-01","http://a.com","online","","threat","tag","link","reporter"\n';
    mockFetch.mockResolvedValueOnce(mockCsvResponse(csvWithComments));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles).toHaveLength(1);
  });

  it('handles empty CSV', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse('# Only comments\n'));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles).toHaveLength(0);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(connector.fetch({ url: 'http://test/csv' }))
      .rejects.toThrow('URLhaus CSV HTTP 503');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await expect(connector.fetch({ url: 'http://test/csv' }))
      .rejects.toThrow('URLhaus CSV fetch failed: ETIMEDOUT');
  });

  it('respects maxItems limit', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    const result = await connector.fetch({ url: 'http://test/csv', maxItems: 1 });

    expect(result.articles).toHaveLength(1);
  });

  it('uses GET method for CSV download', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(URLHAUS_CSV));
    await connector.fetch({ url: 'http://test/csv' });

    expect(mockFetch).toHaveBeenCalledWith('http://test/csv', expect.objectContaining({
      method: 'GET',
    }));
  });
});
