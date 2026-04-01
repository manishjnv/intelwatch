import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FeodoConnector } from '../src/connectors/feodo.js';

/* ── Fixtures ────────────────────────────────────────────────────────── */

const FIXTURES = join(__dirname, 'fixtures');
const FEODO_CSV = readFileSync(join(FIXTURES, 'feodo-botnet-c2.csv'), 'utf-8');

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

describe('FeodoConnector', () => {
  let connector: FeodoConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new FeodoConnector(createMockLogger());
  });

  it('parses fixture CSV and returns correct article count', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles).toHaveLength(3);
    expect(result.feedTitle).toBe('Feodo Tracker (abuse.ch)');
  });

  it('maps IP as primary IOC value', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    const first = result.articles[0]!;
    expect(first.rawMeta.iocValue).toBe('185.220.101.34');
    expect(first.rawMeta.iocType).toBe('ip');
    expect(first.rawMeta.source).toBe('feodo');
    expect(first.rawMeta.sourceConfidence).toBe(0.95);
    expect(first.rawMeta.bulkImport).toBe(true);
  });

  it('extracts port number', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.port).toBe(8080);
    expect(result.articles[1]!.rawMeta.port).toBe(443);
    expect(result.articles[2]!.rawMeta.port).toBe(447);
  });

  it('extracts malware family', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.malware).toBe('QakBot');
    expect(result.articles[0]!.rawMeta.malwareFamilies).toEqual(['QakBot']);
    expect(result.articles[1]!.rawMeta.malware).toBe('Emotet');
    expect(result.articles[2]!.rawMeta.malware).toBe('Dridex');
  });

  it('generates tags from malware name (lowercased)', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.tags).toEqual(['qakbot']);
    expect(result.articles[1]!.rawMeta.tags).toEqual(['emotet']);
  });

  it('constructs Feodo browse URL', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.url).toBe('https://feodotracker.abuse.ch/browse/host/185.220.101.34/');
  });

  it('includes title with malware and IP:port', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.title).toBe('[Feodo] QakBot — 185.220.101.34:8080');
  });

  it('parses publishedAt from first_seen_utc', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.publishedAt).toBeInstanceOf(Date);
    expect(result.articles[0]!.publishedAt!.toISOString()).toContain('2026-03-30');
  });

  it('sets author as abuse.ch', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.author).toBe('abuse.ch');
  });

  it('preserves lastOnline field', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles[0]!.rawMeta.lastOnline).toBe('2026-03-31');
  });

  it('skips comment lines in CSV', async () => {
    const csvWithComments = '# Comment only\n# Another comment\n';
    mockFetch.mockResolvedValueOnce(mockCsvResponse(csvWithComments));
    const result = await connector.fetch({ url: 'http://test/csv' });

    expect(result.articles).toHaveLength(0);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(connector.fetch({ url: 'http://test/csv' }))
      .rejects.toThrow('Feodo CSV HTTP 404');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

    await expect(connector.fetch({ url: 'http://test/csv' }))
      .rejects.toThrow('Feodo CSV fetch failed: ENOTFOUND');
  });

  it('respects maxItems limit', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    const result = await connector.fetch({ url: 'http://test/csv', maxItems: 2 });

    expect(result.articles).toHaveLength(2);
  });

  it('uses GET method for CSV download', async () => {
    mockFetch.mockResolvedValueOnce(mockCsvResponse(FEODO_CSV));
    await connector.fetch({ url: 'http://test/csv' });

    expect(mockFetch).toHaveBeenCalledWith('http://test/csv', expect.objectContaining({
      method: 'GET',
    }));
  });
});
