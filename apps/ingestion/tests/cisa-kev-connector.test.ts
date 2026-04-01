import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CisaKevConnector } from '../src/connectors/cisa-kev.js';
import kevFixture from './fixtures/cisa-kev-sample.json';

function createMockLogger() {
  return {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    debug: vi.fn(), fatal: vi.fn(), trace: vi.fn(), child: vi.fn(),
  };
}

describe('CisaKevConnector', () => {
  let connector: CisaKevConnector;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new CisaKevConnector(logger as never);
  });

  it('fetches and parses full KEV catalog', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/kev.json' });

    expect(result.articles).toHaveLength(5);
    expect(result.feedTitle).toBe('CISA Known Exploited Vulnerabilities');
    expect(result.fetchDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('maps CVE ID to iocValue in rawMeta', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/kev.json' });
    const log4j = result.articles[0]!;

    expect(log4j.rawMeta.iocValue).toBe('CVE-2021-44228');
    expect(log4j.rawMeta.iocType).toBe('cve');
    expect(log4j.rawMeta.source).toBe('cisa_kev');
    expect(log4j.rawMeta.isKEV).toBe(true);
    expect(log4j.rawMeta.sourceConfidence).toBe(95);
    expect(log4j.title).toContain('[CISA-KEV]');
    expect(log4j.title).toContain('CVE-2021-44228');
    expect(log4j.url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2021-44228');
  });

  it('includes vendor/product/action metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/kev.json' });
    const log4j = result.articles[0]!;

    expect(log4j.rawMeta.vendorProject).toBe('Apache');
    expect(log4j.rawMeta.product).toBe('Log4j');
    expect(log4j.rawMeta.requiredAction).toContain('Apply updates');
    expect(log4j.rawMeta.dueDate).toBe('2021-12-24');
  });

  it('flags ransomware campaign usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/kev.json' });
    const log4j = result.articles[0]!;
    const fortinet = result.articles[1]!;

    expect(log4j.rawMeta.knownRansomwareCampaignUse).toBe('Known');
    expect(fortinet.rawMeta.knownRansomwareCampaignUse).toBe('Unknown');
  });

  it('applies delta sync — filters by lastDateAdded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    // Only entries after 2025-01-01 should pass (CVE-2025-0282 and CVE-2026-9999)
    const result = await connector.fetch({
      url: 'http://test/kev.json',
      lastDateAdded: '2025-01-01',
    });

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0]!.rawMeta.iocValue).toBe('CVE-2025-0282');
    expect(result.articles[1]!.rawMeta.iocValue).toBe('CVE-2026-9999');
  });

  it('respects maxItems limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/kev.json', maxItems: 2 });
    expect(result.articles).toHaveLength(2);
  });

  it('throws on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    await expect(connector.fetch({ url: 'http://test/kev.json' }))
      .rejects.toThrow('CISA KEV HTTP 404');
  });

  it('throws on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(connector.fetch({ url: 'http://test/kev.json' }))
      .rejects.toThrow('CISA KEV request failed');
  });

  it('throws on invalid JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 200 }),
    );

    await expect(connector.fetch({ url: 'http://test/kev.json' }))
      .rejects.toThrow('CISA KEV invalid JSON');
  });

  it('throws when vulnerabilities array is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ title: 'bad', count: 0 }), { status: 200 }),
    );

    await expect(connector.fetch({ url: 'http://test/kev.json' }))
      .rejects.toThrow('missing vulnerabilities array');
  });

  it('sets bulkImport flag on all articles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(kevFixture), { status: 200 }),
    );

    const result = await connector.fetch({ url: 'http://test/kev.json' });
    for (const article of result.articles) {
      expect(article.rawMeta.bulkImport).toBe(true);
    }
  });
});
