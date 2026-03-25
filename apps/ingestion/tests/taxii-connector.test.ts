import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TAXIIConnector } from '../src/connectors/taxii.js';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

const TAXII_URL = 'https://cti-taxii.example.com/taxii2';

function makeCollectionsResponse() {
  return {
    collections: [
      { id: 'collection-abc', title: 'Main Collection', can_read: true },
      { id: 'collection-def', title: 'Write Only', can_read: false },
    ],
  };
}

function makeStixBundle() {
  return {
    objects: [
      {
        type: 'indicator',
        id: 'indicator--abc123',
        name: 'Malicious IP indicator',
        description: 'Known C2 server used by APT-42',
        pattern: "[ipv4-addr:value = '203.0.113.50']",
        created: '2026-03-15T10:00:00Z',
        confidence: 85,
        labels: ['malicious-activity', 'c2'],
        kill_chain_phases: [{ kill_chain_name: 'mitre-attack', phase_name: 'command-and-control' }],
        external_references: [{ source_name: 'mitre', url: 'https://attack.mitre.org/T1071' }],
      },
      {
        type: 'indicator',
        id: 'indicator--def456',
        name: 'Phishing domain',
        pattern: "[domain-name:value = 'evil-login.example.com']",
        created: '2026-03-14T08:00:00Z',
      },
      {
        type: 'identity',
        id: 'identity--xyz789',
        name: 'MITRE',
      },
    ],
    more: false,
  };
}

describe('TAXIIConnector', () => {
  let connector: TAXIIConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new TAXIIConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and maps STIX indicators to FetchedArticle[]', async () => {
    // Discovery call
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCollectionsResponse()),
    });
    // Objects call
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeStixBundle()),
    });

    const result = await connector.fetch({ taxiiUrl: TAXII_URL });

    // Should only have 2 indicators (identity object filtered out)
    expect(result.articles).toHaveLength(2);

    const [a1, a2] = result.articles;
    expect(a1.title).toBe('Malicious IP indicator');
    expect(a1.content).toBe('Known C2 server used by APT-42');
    expect(a1.url).toBe('https://attack.mitre.org/T1071');
    expect(a1.publishedAt).toEqual(new Date('2026-03-15T10:00:00Z'));
    expect(a1.rawMeta.sourceId).toBe('indicator--abc123');
    expect(a1.rawMeta.stixPattern).toBe("[ipv4-addr:value = '203.0.113.50']");
    expect(a1.rawMeta.confidence).toBe(85);
    expect(a1.rawMeta.labels).toEqual(['malicious-activity', 'c2']);

    expect(a2.title).toBe('Phishing domain');
    expect(a2.rawMeta.confidence).toBeNull();
  });

  it('returns empty array when TI_TAXII_URL is not configured', async () => {
    const result = await connector.fetch({});

    expect(result.articles).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith('STIX/TAXII not configured — set TI_TAXII_URL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses explicit collectionId without discovery', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeStixBundle()),
    });

    const result = await connector.fetch({
      taxiiUrl: TAXII_URL,
      collectionId: 'my-collection',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/collections/my-collection/objects/');
    expect(result.articles).toHaveLength(2);
  });

  it('handles auth failure (401)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCollectionsResponse()),
    });
    fetchSpy.mockResolvedValueOnce({
      ok: false, status: 401,
      json: () => Promise.resolve({}),
    });

    const result = await connector.fetch({ taxiiUrl: TAXII_URL });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      'TAXII authentication failed',
    );
  });

  it('handles auth failure (403)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeCollectionsResponse()),
    });
    fetchSpy.mockResolvedValueOnce({
      ok: false, status: 403,
      json: () => Promise.resolve({}),
    });

    const result = await connector.fetch({ taxiiUrl: TAXII_URL });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      'TAXII authentication failed',
    );
  });

  it('sends basic auth header when credentials provided', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeStixBundle()),
    });

    await connector.fetch({
      taxiiUrl: TAXII_URL,
      username: 'admin',
      password: 'secret',
      collectionId: 'col-1',
    });

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Basic ${btoa('admin:secret')}`);
  });

  it('handles network failure gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await connector.fetch({ taxiiUrl: TAXII_URL, collectionId: 'col-1' });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'ECONNREFUSED' }),
      'TAXII fetch failed',
    );
  });

  it('returns empty when no readable collections found', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ collections: [{ id: 'c1', can_read: false }] }),
    });

    const result = await connector.fetch({ taxiiUrl: TAXII_URL });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ taxiiUrl: TAXII_URL }),
      'No readable TAXII collections found',
    );
  });

  it('passes addedAfter filter in query params', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve(makeStixBundle()),
    });

    await connector.fetch({
      taxiiUrl: TAXII_URL,
      collectionId: 'col-1',
      addedAfter: '2026-03-01T00:00:00Z',
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('added_after=2026-03-01');
  });

  it('handles empty STIX bundle', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ objects: [] }),
    });

    const result = await connector.fetch({ taxiiUrl: TAXII_URL, collectionId: 'col-1' });

    expect(result.articles).toHaveLength(0);
  });
});
