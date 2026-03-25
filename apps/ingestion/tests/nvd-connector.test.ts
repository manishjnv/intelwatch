import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NVDConnector } from '../src/connectors/nvd.js';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

/** Minimal NVD 2.0 CVE response. */
function makeNvdResponse(overrides: Record<string, unknown> = {}) {
  return {
    resultsPerPage: 2,
    startIndex: 0,
    totalResults: 2,
    vulnerabilities: [
      {
        cve: {
          id: 'CVE-2026-1234',
          published: '2026-03-20T14:00:00.000',
          lastModified: '2026-03-20T15:00:00.000',
          descriptions: [
            { lang: 'en', value: 'A critical buffer overflow in ExampleLib allows RCE via crafted input.' },
          ],
          metrics: {
            cvssMetricV31: [
              { cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL' } },
            ],
          },
          weaknesses: [{ description: [{ lang: 'en', value: 'CWE-120' }] }],
          references: [{ url: 'https://example.com/advisory-1234', source: 'vendor' }],
        },
      },
      {
        cve: {
          id: 'CVE-2026-5678',
          published: '2026-03-19T10:00:00.000',
          lastModified: '2026-03-19T11:00:00.000',
          descriptions: [
            { lang: 'en', value: 'XSS in WebApp admin panel.' },
          ],
          metrics: {},
          weaknesses: [],
          references: [],
        },
      },
    ],
    ...overrides,
  };
}

describe('NVDConnector', () => {
  let connector: NVDConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new NVDConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and maps CVEs to FetchedArticle[]', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeNvdResponse()),
    });

    const result = await connector.fetch({});

    expect(result.articles).toHaveLength(2);
    expect(result.feedTitle).toBe('NVD - National Vulnerability Database');

    const [a1, a2] = result.articles;
    expect(a1.title).toContain('CVE-2026-1234');
    expect(a1.content).toContain('buffer overflow');
    expect(a1.url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2026-1234');
    expect(a1.publishedAt).toEqual(new Date('2026-03-20T14:00:00.000'));
    expect(a1.rawMeta.sourceId).toBe('CVE-2026-1234');
    expect(a1.rawMeta.cvssV3BaseScore).toBe(9.8);
    expect(a1.rawMeta.severity).toBe('CRITICAL');
    expect(a1.rawMeta.cweIds).toEqual(['CWE-120']);

    expect(a2.title).toContain('CVE-2026-5678');
    expect(a2.rawMeta.cvssV3BaseScore).toBeNull();
  });

  it('returns empty array on empty results', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeNvdResponse({ totalResults: 0, vulnerabilities: [] })),
    });

    const result = await connector.fetch({});

    expect(result.articles).toHaveLength(0);
    expect(logger.info).toHaveBeenCalled();
  });

  it('handles 403 rate limit gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    });

    const result = await connector.fetch({});

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      'NVD rate limited — stopping pagination',
    );
  });

  it('handles network timeout gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('AbortError: timeout'));

    const result = await connector.fetch({ timeoutMs: 100 });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'AbortError: timeout' }),
      'NVD network request failed',
    );
  });

  it('handles invalid JSON response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Unexpected token')),
    });

    const result = await connector.fetch({});

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('handles malformed NVD response (Zod validation fail)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ wrong: 'shape' }),
    });

    const result = await connector.fetch({});

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errors: expect.any(Array) }),
      'NVD response failed validation',
    );
  });

  it('passes apiKey as query parameter when provided', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeNvdResponse({ totalResults: 0, vulnerabilities: [] })),
    });

    await connector.fetch({ apiKey: 'test-key-123' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('apiKey=test-key-123');
  });

  it('paginates through multiple pages', async () => {
    const page1 = makeNvdResponse({ totalResults: 3, resultsPerPage: 2, startIndex: 0 });
    const page2 = {
      ...makeNvdResponse({ totalResults: 3, resultsPerPage: 1, startIndex: 2 }),
      vulnerabilities: [{
        cve: {
          id: 'CVE-2026-9999',
          published: '2026-03-18T08:00:00.000',
          lastModified: '2026-03-18T09:00:00.000',
          descriptions: [{ lang: 'en', value: 'Third CVE.' }],
        },
      }],
    };

    fetchSpy
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(page2) });

    const result = await connector.fetch({ apiKey: 'fast-key' });

    expect(result.articles).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses custom date window from options', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeNvdResponse({ totalResults: 0, vulnerabilities: [] })),
    });

    await connector.fetch({
      pubStartDate: '2026-01-01T00:00:00Z',
      pubEndDate: '2026-01-31T23:59:59Z',
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('pubStartDate=2026-01-01');
    expect(calledUrl).toContain('pubEndDate=2026-01-31');
  });
});
