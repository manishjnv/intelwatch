import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { FirstEpssConnector, parseEpssCSV } from '../src/connectors/first-epss.js';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'epss-sample.csv');
const csvContent = readFileSync(FIXTURE_PATH, 'utf-8');

function createMockLogger() {
  return {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: vi.fn(),
  };
}

describe('parseEpssCSV', () => {
  it('parses all rows above minScore threshold', () => {
    const result = parseEpssCSV(csvContent, { maxItems: 300_000, minScore: 0.001 });

    // Fixture has 8 rows; 3 below 0.001 threshold (0.00032, 0.00001, 0.00089)
    expect(result.articles).toHaveLength(5);
  });

  it('extracts model date from comment line', () => {
    const result = parseEpssCSV(csvContent, { maxItems: 300_000, minScore: 0 });
    expect(result.modelDate).toBe('2026-03-31T00:00:00+0000');
  });

  it('maps EPSS score and percentile to rawMeta', () => {
    const result = parseEpssCSV(csvContent, { maxItems: 300_000, minScore: 0 });
    const log4j = result.articles[0]!;

    expect(log4j.rawMeta.iocValue).toBe('CVE-2021-44228');
    expect(log4j.rawMeta.iocType).toBe('cve');
    expect(log4j.rawMeta.source).toBe('first_epss');
    expect(log4j.rawMeta.epssScore).toBeCloseTo(0.97547, 4);
    expect(log4j.rawMeta.epssPercentile).toBeCloseTo(0.99961, 4);
    expect(log4j.rawMeta.epssModelDate).toBe('2026-03-31T00:00:00+0000');
    expect(log4j.rawMeta.bulkImport).toBe(true);
  });

  it('respects maxItems limit', () => {
    const result = parseEpssCSV(csvContent, { maxItems: 3, minScore: 0 });
    expect(result.articles).toHaveLength(3);
  });

  it('filters by minEpssScore', () => {
    const result = parseEpssCSV(csvContent, { maxItems: 300_000, minScore: 0.1 });

    // Only CVEs with epss >= 0.1: Log4j (0.975), Fortinet (0.451), PAN-OS (0.823), Ivanti (0.120), CVE-2026-0003 (0.552)
    expect(result.articles).toHaveLength(5);
    for (const a of result.articles) {
      expect(a.rawMeta.epssScore as number).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('skips invalid CVE format', () => {
    const csv = '#comment\ncve,epss,percentile\nNOT-A-CVE,0.5,0.5\nCVE-2021-44228,0.9,0.9\n';
    const result = parseEpssCSV(csv, { maxItems: 300_000, minScore: 0 });
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.rawMeta.iocValue).toBe('CVE-2021-44228');
  });

  it('handles empty content', () => {
    const result = parseEpssCSV('', { maxItems: 300_000, minScore: 0 });
    expect(result.articles).toHaveLength(0);
    expect(result.modelDate).toBeNull();
  });

  it('sets title and url correctly', () => {
    const result = parseEpssCSV(csvContent, { maxItems: 1, minScore: 0 });
    const article = result.articles[0]!;

    expect(article.title).toBe('[EPSS] CVE-2021-44228');
    expect(article.url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2021-44228');
    expect(article.author).toBe('FIRST.org');
  });
});

describe('FirstEpssConnector', () => {
  let connector: FirstEpssConnector;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new FirstEpssConnector(logger as never);
  });

  it('fetches and decompresses gzipped CSV', async () => {
    const gzipped = gzipSync(Buffer.from(csvContent, 'utf-8'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(gzipped, { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/epss.csv.gz' });

    // 5 rows above default minScore 0.001
    expect(result.articles).toHaveLength(5);
    expect(result.feedTitle).toBe('FIRST EPSS Scores');
    expect(result.fetchDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('fetches raw CSV when gzip is false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csvContent, { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/epss.csv', gzip: false });

    expect(result.articles).toHaveLength(5);
  });

  it('applies minEpssScore filter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csvContent, { status: 200 }),
    );

    const result = await connector.fetch({
      url: 'http://test/epss.csv', gzip: false, minEpssScore: 0.5,
    });

    // Log4j (0.975), PAN-OS (0.823), CVE-2026-0003 (0.552)
    expect(result.articles).toHaveLength(3);
  });

  it('throws on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    );

    await expect(connector.fetch({ url: 'http://test/epss.csv.gz' }))
      .rejects.toThrow('EPSS HTTP 500');
  });

  it('throws on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(connector.fetch({ url: 'http://test/epss.csv.gz' }))
      .rejects.toThrow('EPSS download failed');
  });

  it('throws on gzip decompression failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not gzipped data', { status: 200 }),
    );

    await expect(connector.fetch({ url: 'http://test/epss.csv.gz' }))
      .rejects.toThrow('gzip decompression failed');
  });

  it('sets bulkImport flag on all articles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(csvContent, { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/epss.csv', gzip: false });
    for (const article of result.articles) {
      expect(article.rawMeta.bulkImport).toBe(true);
    }
  });
});
