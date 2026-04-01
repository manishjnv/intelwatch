import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  BulkFileConnector,
  parseCSV,
  parsePlaintext,
  parseJSONL,
  type BulkFileConnectorOptions,
} from '../src/connectors/bulk-file.js';

/* ── Fixtures ────────────────────────────────────────────────────────── */

const FIXTURES = join(__dirname, 'fixtures');
const CSV_CONTENT = readFileSync(join(FIXTURES, 'sample-abuse.csv'), 'utf-8');
const TXT_CONTENT = readFileSync(join(FIXTURES, 'sample-iocs.txt'), 'utf-8');
const JSONL_CONTENT = readFileSync(join(FIXTURES, 'sample.jsonl'), 'utf-8');

/* ── Mock logger ─────────────────────────────────────────────────────── */

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

/* ── parseCSV ────────────────────────────────────────────────────────── */

describe('parseCSV', () => {
  it('parses abuse.ch CSV format (# comments, quoted fields)', () => {
    const articles = parseCSV(CSV_CONTENT, {
      hasHeaders: false,
      columnMap: { value: 2, type: 4 },
    });

    expect(articles).toHaveLength(3);
    expect(articles[0].rawMeta.iocValue).toBe('http://evil.com/malware.exe');
    expect(articles[0].rawMeta.iocType).toBe('malware_download');
    expect(articles[0].rawMeta.bulkImport).toBe(true);
  });

  it('uses custom delimiter', () => {
    const tsvContent = '192.168.1.1\tip\thigh\n10.0.0.1\tip\tlow\n';
    const articles = parseCSV(tsvContent, {
      delimiter: '\t',
      hasHeaders: false,
      columnMap: { value: 0, type: 1 },
    });

    expect(articles).toHaveLength(2);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[1].rawMeta.iocValue).toBe('10.0.0.1');
  });

  it('maps columns by name when hasHeaders=true', () => {
    const content = 'indicator,type,confidence\n192.168.1.1,ip,85\nevil.com,domain,70\n';
    const articles = parseCSV(content, {
      hasHeaders: true,
      columnMap: { value: 'indicator', type: 'type' },
    });

    expect(articles).toHaveLength(2);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[0].rawMeta.iocType).toBe('ip');
    expect(articles[1].rawMeta.iocValue).toBe('evil.com');
  });

  it('maps columns by index when hasHeaders=false', () => {
    const content = '192.168.1.1,ip,85\nevil.com,domain,70\n';
    const articles = parseCSV(content, {
      hasHeaders: false,
      columnMap: { value: 0, type: 1 },
    });

    expect(articles).toHaveLength(2);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[0].rawMeta.iocType).toBe('ip');
  });

  it('skips empty lines and comment lines', () => {
    const content = '# comment\n\n192.168.1.1,ip\n\n# another comment\nevil.com,domain\n';
    const articles = parseCSV(content, {
      hasHeaders: false,
      columnMap: { value: 0, type: 1 },
    });

    expect(articles).toHaveLength(2);
  });

  it('respects maxItems limit', () => {
    const content = '192.168.1.1,ip\n10.0.0.1,ip\nevil.com,domain\nbad.org,domain\n';
    const articles = parseCSV(content, {
      hasHeaders: false,
      columnMap: { value: 0, type: 1 },
      maxItems: 2,
    });

    expect(articles).toHaveLength(2);
  });

  it('handles missing optional columns gracefully', () => {
    const content = '192.168.1.1\n10.0.0.1\n';
    const articles = parseCSV(content, {
      hasHeaders: false,
      columnMap: { value: 0 },
    });

    expect(articles).toHaveLength(2);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[0].rawMeta.iocType).toBeUndefined();
  });

  it('returns empty array for empty content', () => {
    const articles = parseCSV('', { hasHeaders: false, columnMap: { value: 0 } });
    expect(articles).toHaveLength(0);
  });
});

/* ── parsePlaintext ──────────────────────────────────────────────────── */

describe('parsePlaintext', () => {
  it('parses one IOC per line from fixture', () => {
    const articles = parsePlaintext(TXT_CONTENT);

    expect(articles).toHaveLength(5);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[1].rawMeta.iocValue).toBe('10.0.0.1');
    expect(articles[2].rawMeta.iocValue).toBe('evil.com');
    expect(articles[3].rawMeta.iocValue).toBe('bad-domain.org');
    expect(articles[4].rawMeta.iocValue).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('skips comment lines starting with #', () => {
    const content = '# comment\n192.168.1.1\n# another comment\nevil.com\n';
    const articles = parsePlaintext(content);

    expect(articles).toHaveLength(2);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[1].rawMeta.iocValue).toBe('evil.com');
  });

  it('skips blank lines', () => {
    const content = '\n192.168.1.1\n\n\nevil.com\n\n';
    const articles = parsePlaintext(content);

    expect(articles).toHaveLength(2);
  });

  it('trims whitespace from IOC values', () => {
    const content = '  192.168.1.1  \n\tevil.com\t\n';
    const articles = parsePlaintext(content);

    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[1].rawMeta.iocValue).toBe('evil.com');
  });

  it('respects maxItems limit', () => {
    const content = '1.1.1.1\n2.2.2.2\n3.3.3.3\n4.4.4.4\n';
    const articles = parsePlaintext(content, { maxItems: 2 });

    expect(articles).toHaveLength(2);
  });

  it('returns empty array for empty content', () => {
    expect(parsePlaintext('')).toHaveLength(0);
  });

  it('sets bulkImport flag on rawMeta', () => {
    const articles = parsePlaintext('192.168.1.1\n');
    expect(articles[0].rawMeta.bulkImport).toBe(true);
  });
});

/* ── parseJSONL ──────────────────────────────────────────────────────── */

describe('parseJSONL', () => {
  it('parses one JSON object per line from fixture', () => {
    const articles = parseJSONL(JSONL_CONTENT, {
      fieldMap: { value: 'ioc_value', type: 'ioc_type' },
    });

    expect(articles).toHaveLength(3);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[0].rawMeta.iocType).toBe('ip');
    expect(articles[2].rawMeta.iocValue).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(articles[2].rawMeta.iocType).toBe('md5');
  });

  it('applies field mapping for nested paths', () => {
    const content = '{"data":{"indicator":"192.168.1.1","kind":"ip"}}\n';
    const articles = parseJSONL(content, {
      fieldMap: { value: 'data.indicator', type: 'data.kind' },
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].rawMeta.iocValue).toBe('192.168.1.1');
    expect(articles[0].rawMeta.iocType).toBe('ip');
  });

  it('skips invalid JSON lines', () => {
    const content = '{"ioc_value":"192.168.1.1","ioc_type":"ip"}\nnot-valid-json\n{"ioc_value":"evil.com","ioc_type":"domain"}\n';
    const articles = parseJSONL(content, {
      fieldMap: { value: 'ioc_value', type: 'ioc_type' },
    });

    expect(articles).toHaveLength(2);
  });

  it('skips blank lines', () => {
    const content = '{"ioc_value":"1.1.1.1","ioc_type":"ip"}\n\n\n{"ioc_value":"2.2.2.2","ioc_type":"ip"}\n';
    const articles = parseJSONL(content, {
      fieldMap: { value: 'ioc_value', type: 'ioc_type' },
    });

    expect(articles).toHaveLength(2);
  });

  it('returns empty array for empty content', () => {
    expect(parseJSONL('', { fieldMap: { value: 'v' } })).toHaveLength(0);
  });

  it('preserves all original fields in rawMeta', () => {
    const content = '{"ioc_value":"evil.com","ioc_type":"domain","confidence":70,"tags":["phishing"]}\n';
    const articles = parseJSONL(content, {
      fieldMap: { value: 'ioc_value', type: 'ioc_type' },
    });

    expect(articles[0].rawMeta.confidence).toBe(70);
    expect(articles[0].rawMeta.tags).toEqual(['phishing']);
  });
});

/* ── BulkFileConnector.fetch ─────────────────────────────────────────── */

describe('BulkFileConnector.fetch', () => {
  let connector: BulkFileConnector;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    logger = createMockLogger();
    connector = new BulkFileConnector(logger as never);
  });

  it('downloads file via HTTP GET and parses plaintext', async () => {
    const mockResponse = new Response(TXT_CONTENT, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await connector.fetch({
      url: 'https://example.com/iocs.txt',
      format: 'plaintext',
    });

    expect(result.articles).toHaveLength(5);
    expect(result.fetchDurationMs).toBeGreaterThanOrEqual(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/iocs.txt',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('downloads and parses CSV', async () => {
    const mockResponse = new Response(CSV_CONTENT, {
      status: 200,
      headers: { 'content-type': 'text/csv' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await connector.fetch({
      url: 'https://example.com/feed.csv',
      format: 'csv',
      columnMap: { value: 2, type: 4 },
    });

    expect(result.articles).toHaveLength(3);
    expect(result.articles[0].rawMeta.iocValue).toBe('http://evil.com/malware.exe');
  });

  it('downloads and parses JSONL', async () => {
    const mockResponse = new Response(JSONL_CONTENT, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await connector.fetch({
      url: 'https://example.com/feed.jsonl',
      format: 'jsonl',
      fieldMap: { value: 'ioc_value', type: 'ioc_type' },
    });

    expect(result.articles).toHaveLength(3);
  });

  it('decompresses gzip content before parsing', async () => {
    const compressed = gzipSync(Buffer.from(TXT_CONTENT));
    const mockResponse = new Response(compressed, {
      status: 200,
      headers: { 'content-encoding': 'gzip' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await connector.fetch({
      url: 'https://example.com/iocs.txt.gz',
      format: 'plaintext',
      compression: 'gzip',
    });

    expect(result.articles).toHaveLength(5);
  });

  it('throws on HTTP error response', async () => {
    const mockResponse = new Response('Not Found', { status: 404 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    await expect(
      connector.fetch({ url: 'https://example.com/missing.txt', format: 'plaintext' }),
    ).rejects.toThrow('HTTP 404');
  });

  it('throws on missing URL', async () => {
    await expect(
      connector.fetch({ url: '', format: 'plaintext' }),
    ).rejects.toThrow('requires a URL');
  });

  it('respects maxItems in fetch', async () => {
    const mockResponse = new Response(TXT_CONTENT, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await connector.fetch({
      url: 'https://example.com/iocs.txt',
      format: 'plaintext',
      maxItems: 2,
    });

    expect(result.articles).toHaveLength(2);
  });

  it('sends correct User-Agent and custom headers', async () => {
    const mockResponse = new Response('1.1.1.1\n', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    await connector.fetch({
      url: 'https://example.com/iocs.txt',
      format: 'plaintext',
      headers: { 'X-Api-Key': 'secret123' },
    });

    const calledHeaders = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(calledHeaders['User-Agent']).toContain('ETIP-IntelWatch');
    expect(calledHeaders['X-Api-Key']).toBe('secret123');
  });
});
