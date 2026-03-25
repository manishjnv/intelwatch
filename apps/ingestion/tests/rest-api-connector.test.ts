import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RestAPIConnector } from '../src/connectors/rest-api.js';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

function makeApiResponse() {
  return {
    data: [
      {
        name: 'APT-29 Campaign Update',
        body: 'New phishing campaign targeting energy sector.',
        link: 'https://threatfeed.example.com/report/123',
        published: '2026-03-20T10:00:00Z',
        id: 'report-123',
      },
      {
        name: 'Ransomware IOCs',
        body: 'Indicators associated with LockBit 4.0 variant.',
        link: 'https://threatfeed.example.com/report/456',
        published: '2026-03-19T08:00:00Z',
        id: 'report-456',
      },
    ],
  };
}

describe('RestAPIConnector', () => {
  let connector: RestAPIConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new RestAPIConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and maps items using fieldMap', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify(makeApiResponse())),
    });

    const result = await connector.fetch({
      feedMeta: {
        url: 'https://api.threatfeed.example.com/indicators',
        responseArrayPath: 'data',
        fieldMap: {
          title: 'name',
          content: 'body',
          url: 'link',
          publishedAt: 'published',
          sourceId: 'id',
        },
      },
    });

    expect(result.articles).toHaveLength(2);

    const [a1, a2] = result.articles;
    expect(a1.title).toBe('APT-29 Campaign Update');
    expect(a1.content).toBe('New phishing campaign targeting energy sector.');
    expect(a1.url).toBe('https://threatfeed.example.com/report/123');
    expect(a1.publishedAt).toEqual(new Date('2026-03-20T10:00:00Z'));
    expect(a1.rawMeta.sourceId).toBe('report-123');

    expect(a2.title).toBe('Ransomware IOCs');
  });

  it('returns empty array when feedMeta has no URL', async () => {
    const result = await connector.fetch({
      feedMeta: { url: '' },
    });

    expect(result.articles).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty array when feedMeta validation fails', async () => {
    const result = await connector.fetch({
      feedMeta: { notAUrl: 123 },
    });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ issues: expect.stringContaining('url') }),
      'REST_API feedMeta validation failed',
    );
  });

  it('handles top-level array (empty responseArrayPath)', async () => {
    const topLevelArray = [
      { title: 'Item 1', desc: 'First item' },
      { title: 'Item 2', desc: 'Second item' },
    ];

    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify(topLevelArray)),
    });

    const result = await connector.fetch({
      feedMeta: {
        url: 'https://api.example.com/feed',
        responseArrayPath: '',
        fieldMap: { title: 'title', content: 'desc' },
      },
    });

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].title).toBe('Item 1');
    expect(result.articles[1].content).toBe('Second item');
  });

  it('handles nested responseArrayPath (dot notation)', async () => {
    const nestedResponse = {
      response: { results: { items: [{ t: 'Nested' }] } },
    };

    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify(nestedResponse)),
    });

    const result = await connector.fetch({
      feedMeta: {
        url: 'https://api.example.com/deep',
        responseArrayPath: 'response.results.items',
        fieldMap: { title: 't' },
      },
    });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe('Nested');
  });

  it('handles non-OK HTTP status gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: false, status: 500,
      headers: new Headers({}),
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await connector.fetch({
      feedMeta: { url: 'https://api.example.com/fail' },
    });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      'REST_API returned non-OK status',
    );
  });

  it('rejects oversized response (Content-Length header)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ 'content-length': String(11 * 1024 * 1024) }),
      text: () => Promise.resolve('{}'),
    });

    const result = await connector.fetch({
      feedMeta: { url: 'https://api.example.com/huge' },
    });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: expect.any(String) }),
      'REST_API response exceeds 10MB limit',
    );
  });

  it('handles network failure gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await connector.fetch({
      feedMeta: { url: 'https://api.example.com/down' },
    });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'ECONNREFUSED' }),
      'REST_API fetch failed',
    );
  });

  it('handles non-JSON response gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve('<html>Not JSON</html>'),
    });

    const result = await connector.fetch({
      feedMeta: { url: 'https://api.example.com/html' },
    });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.example.com/html' }),
      'REST_API response is not valid JSON',
    );
  });

  it('handles path resolving to non-array', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify({ data: 'not an array' })),
    });

    const result = await connector.fetch({
      feedMeta: { url: 'https://api.example.com/bad-path' },
    });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'data' }),
      'REST_API responseArrayPath did not resolve to an array',
    );
  });

  it('uses default fieldMap when not provided (title = untitled)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify({ data: [{ foo: 'bar' }] })),
    });

    const result = await connector.fetch({
      feedMeta: { url: 'https://api.example.com/no-map' },
    });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe('(untitled)');
  });

  it('sends POST request when method is POST', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    });

    await connector.fetch({
      feedMeta: {
        url: 'https://api.example.com/search',
        method: 'POST',
        body: { query: 'malware' },
      },
    });

    expect(fetchSpy.mock.calls[0][1].method).toBe('POST');
    expect(fetchSpy.mock.calls[0][1].body).toBe(JSON.stringify({ query: 'malware' }));
  });

  it('passes custom headers from feedMeta', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({}),
      text: () => Promise.resolve(JSON.stringify({ data: [] })),
    });

    await connector.fetch({
      feedMeta: {
        url: 'https://api.example.com/auth-feed',
        headers: { 'X-API-Key': 'secret-key-123' },
      },
    });

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('secret-key-123');
  });
});
