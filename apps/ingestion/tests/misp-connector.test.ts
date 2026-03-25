import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MISPConnector, extractTlp, applySightingConfidence, extractGalaxies, parseRetryDelay, deduplicateIocs, isIpv6 } from '../src/connectors/misp.js';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

/** Minimal MISP restSearch response with 2 events. */
function makeMispResponse(overrides: Record<string, unknown> = {}) {
  return {
    response: [
      {
        Event: {
          id: '101',
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          info: 'APT28 phishing campaign targeting EU government',
          date: '2026-03-25',
          timestamp: '1742900000',
          publish_timestamp: '1742900100',
          threat_level_id: '1',
          analysis: '2',
          Orgc: { name: 'CIRCL' },
          Tag: [
            { name: 'tlp:amber', colour: '#FFC000' },
            { name: 'misp-galaxy:threat-actor="APT28"' },
          ],
          Attribute: [
            { id: '1001', type: 'ip-dst', value: '198.51.100.42', category: 'Network activity', to_ids: true, comment: 'C2 server' },
            { id: '1002', type: 'domain', value: 'evil-phish.example.com', category: 'Network activity', to_ids: true },
            { id: '1003', type: 'sha256', value: 'a'.repeat(64), category: 'Payload delivery', to_ids: true },
            { id: '1004', type: 'email-src', value: 'phisher@evil.test', category: 'Payload delivery', to_ids: false },
            { id: '1005', type: 'text', value: 'Free-text note', category: 'Other' },
          ],
        },
      },
      {
        Event: {
          id: '102',
          info: 'Ransomware IOCs from honeypot',
          timestamp: '1742800000',
          threat_level_id: '2',
          Tag: [{ name: 'tlp:green' }],
          Attribute: [
            { id: '2001', type: 'md5', value: 'd41d8cd98f00b204e9800998ecf8427e', to_ids: true },
            { id: '2002', type: 'url', value: 'http://ransom.example.com/pay', to_ids: true },
          ],
        },
      },
    ],
    ...overrides,
  };
}

/** Build a mock fetch Response with both text() and json() */
function mockRes(status: number, body: unknown, headers: Headers = new Headers()) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  };
}

const BASE_OPTS = {
  baseUrl: 'https://misp.example.org',
  apiKey: 'test-misp-key-123',
};

describe('MISPConnector', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and maps MISP events to FetchedArticle[]', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(2);
    expect(result.feedTitle).toBe('MISP (https://misp.example.org)');

    const [a1, a2] = result.articles;
    expect(a1.title).toContain('MISP #101');
    expect(a1.title).toContain('APT28 phishing');
    expect(a1.url).toBe('https://misp.example.org/events/view/101');
    expect(a1.author).toBe('CIRCL');
    expect(a1.rawMeta.sourceId).toBe('misp-101');
    expect(a1.rawMeta.tlp).toBe('TLP:AMBER');
    expect(a1.rawMeta.threatLevel).toBe('high');
    expect(a1.rawMeta.iocCount).toBe(4); // text attribute excluded

    expect(a2.title).toContain('MISP #102');
    expect(a2.rawMeta.tlp).toBe('TLP:GREEN');
    expect(a2.rawMeta.threatLevel).toBe('medium');
  });

  it('maps IOC attributes with correct types', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ type: string; value: string; mispType: string }>;

    expect(iocs).toHaveLength(4);
    expect(iocs[0]).toMatchObject({ type: 'ipv4', value: '198.51.100.42', mispType: 'ip-dst' });
    expect(iocs[1]).toMatchObject({ type: 'domain', value: 'evil-phish.example.com' });
    expect(iocs[2]).toMatchObject({ type: 'sha256', value: 'a'.repeat(64) });
    expect(iocs[3]).toMatchObject({ type: 'email', value: 'phisher@evil.test' });
  });

  it('returns empty array when MISP returns empty response', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, { response: [] }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.info).toHaveBeenCalled();
  });

  it('handles 403 auth failure gracefully', async () => {
    fetchSpy.mockResolvedValue(mockRes(403, { message: 'Authentication failed' }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      'MISP auth failed — check API key',
    );
  });

  it('retries on 429 with backoff then gives up after max retries', async () => {
    fetchSpy.mockResolvedValue(mockRes(429, {}, new Headers({ 'Retry-After': '0' })));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    // 1 initial + 3 retries = 4 total calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429, attempts: 4 }),
      'MISP rate limited — max retries exhausted',
    );
  });

  it('succeeds after 429 retry when second attempt works', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockRes(429, {}, new Headers({ 'Retry-After': '0' })))
      .mockResolvedValueOnce(mockRes(200, {
          response: [{ Event: { id: '1', info: 'After retry', timestamp: '1742900000', Attribute: [] } }],
        }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toContain('After retry');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429, attempt: 1 }),
      'MISP rate limited — retrying after delay',
    );
  });

  it('handles network timeout gracefully', async () => {
    fetchSpy.mockRejectedValue(new Error('AbortError: timeout'));

    const result = await connector.fetch({ ...BASE_OPTS, timeoutMs: 100 });

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'AbortError: timeout' }),
      'MISP network request failed',
    );
  });

  it('handles invalid JSON response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: () => Promise.resolve('not valid json {{{'),
    });

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('handles malformed MISP response (Zod validation fail)', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, { wrong: 'shape' }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ errors: expect.any(Array) }),
      'MISP response failed validation',
    );
  });

  it('sends correct Authorization header and POST body', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, { response: [] }));

    await connector.fetch({ ...BASE_OPTS, tags: ['tlp:green', 'type:osint'], limit: 25 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://misp.example.org/events/restSearch');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('test-misp-key-123');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.limit).toBe(25);
    expect(body.tags).toEqual(['tlp:green', 'type:osint']);
    expect(body.returnFormat).toBe('json');
    expect(body.published).toBe(true);
  });

  it('paginates through multiple pages', async () => {
    const page1Events = Array.from({ length: 50 }, (_, i) => ({
      Event: {
        id: String(i + 1),
        info: `Event ${i + 1}`,
        timestamp: '1742900000',
        Attribute: [],
      },
    }));
    const page2Events = [
      { Event: { id: '51', info: 'Event 51', timestamp: '1742900000', Attribute: [] } },
    ];

    fetchSpy
      .mockResolvedValueOnce(mockRes(200, { response: page1Events }))
      .mockResolvedValueOnce(mockRes(200, { response: page2Events }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(51);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Verify page parameter increments
    const body1 = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const body2 = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(body1.page).toBe(1);
    expect(body2.page).toBe(2);
  });

  it('stops pagination when page returns fewer items than limit', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse())); // 2 events, limit=50

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // No second page fetch
  });

  it('handles 500 server error gracefully', async () => {
    fetchSpy.mockResolvedValue(mockRes(500, { message: 'Internal server error' }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      'MISP API returned non-OK status',
    );
  });

  // ── P1-8: Response size guard ────────────────────────────────────────

  it('rejects response when content-length exceeds 10MB', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ 'content-length': String(11 * 1024 * 1024) }),
      text: () => Promise.resolve(''),
    });

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 11 * 1024 * 1024, maxBytes: 10 * 1024 * 1024 }),
      'MISP response exceeds size limit (content-length)',
    );
  });

  it('rejects response when body text exceeds 10MB', async () => {
    const hugeBody = 'x'.repeat(10 * 1024 * 1024 + 1);
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers(), // no content-length
      text: () => Promise.resolve(hugeBody),
    });

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ size: hugeBody.length, maxBytes: 10 * 1024 * 1024 }),
      'MISP response body exceeds size limit',
    );
  });

  it('accepts response under 10MB size limit', async () => {
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ 'content-length': '500' }),
      text: () => Promise.resolve(JSON.stringify({ response: [] })),
    });

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('extracts composite attribute values (ip-dst|port)', async () => {
    const response = {
      response: [{
        Event: {
          id: '200',
          info: 'Composite test',
          timestamp: '1742900000',
          Attribute: [
            { id: '3001', type: 'ip-dst|port', value: '10.0.0.1|8443', to_ids: true },
            { id: '3002', type: 'filename|sha256', value: 'malware.exe|' + 'b'.repeat(64), to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ type: string; value: string }>;

    expect(iocs[0]).toMatchObject({ type: 'ipv4', value: '10.0.0.1' });
    expect(iocs[1]).toMatchObject({ type: 'sha256', value: 'b'.repeat(64) });
  });

  it('parses Unix epoch timestamps to Date objects', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles[0].publishedAt).toBeInstanceOf(Date);
    expect(result.articles[0].publishedAt!.getTime()).toBe(1742900100 * 1000);
  });

  it('handles event with no attributes', async () => {
    const response = {
      response: [{
        Event: { id: '300', info: 'No attributes event', timestamp: '1742900000' },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].rawMeta.iocCount).toBe(0);
    expect(result.articles[0].content).not.toContain('IOC Attributes');
  });

  // ── P2-14: Event correlation ID passthrough ──────────────────────────

  it('passes MISP event UUID through rawMeta as mispEventUuid', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    const result = await connector.fetch(BASE_OPTS);

    // Event 101 has uuid, event 102 does not
    expect(result.articles[0].rawMeta.mispEventUuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.articles[1].rawMeta.mispEventUuid).toBeNull();
  });

  it('strips trailing slashes from baseUrl', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, { response: [] }));

    await connector.fetch({ ...BASE_OPTS, baseUrl: 'https://misp.example.org///' });

    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toBe('https://misp.example.org/events/restSearch');
  });

  // ── P0-1: MISP Object support ────────────────────────────────────────

  it('extracts IOCs from MISP Objects (grouped attributes)', async () => {
    const response = {
      response: [{
        Event: {
          id: '400',
          info: 'File object test',
          timestamp: '1742900000',
          Attribute: [
            { id: '4001', type: 'ip-dst', value: '10.0.0.1', to_ids: true },
          ],
          Object: [
            {
              id: '5001',
              name: 'file',
              meta_category: 'file',
              comment: 'Dropped malware',
              Attribute: [
                { id: '5002', type: 'md5', value: 'd41d8cd98f00b204e9800998ecf8427e', to_ids: true },
                { id: '5003', type: 'sha256', value: 'c'.repeat(64), to_ids: true },
                { id: '5004', type: 'filename', value: 'evil.exe' }, // not in type map — skipped
              ],
            },
            {
              id: '5010',
              name: 'network-connection',
              meta_category: 'network',
              Attribute: [
                { id: '5011', type: 'ip-dst', value: '192.168.1.1', to_ids: true },
                { id: '5012', type: 'domain', value: 'c2.example.com', to_ids: true },
              ],
            },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    const meta = result.articles[0].rawMeta;
    const iocs = meta.iocs as Array<{ type: string; value: string; objectName: string | null }>;

    // 1 flat + 2 from file object + 2 from network object = 5
    expect(meta.iocCount).toBe(5);
    expect(iocs[0]).toMatchObject({ value: '10.0.0.1', objectName: null }); // flat
    expect(iocs[1]).toMatchObject({ type: 'md5', objectName: 'file' });
    expect(iocs[2]).toMatchObject({ type: 'sha256', objectName: 'file' });
    expect(iocs[3]).toMatchObject({ type: 'ipv4', value: '192.168.1.1', objectName: 'network-connection' });
    expect(iocs[4]).toMatchObject({ type: 'domain', value: 'c2.example.com', objectName: 'network-connection' });

    // Object metadata
    const objects = meta.objects as Array<{ name: string; iocCount: number }>;
    expect(objects).toHaveLength(2);
    expect(objects[0]).toMatchObject({ name: 'file', iocCount: 2 });
    expect(objects[1]).toMatchObject({ name: 'network-connection', iocCount: 2 });
  });

  it('handles event with Objects but no flat Attributes', async () => {
    const response = {
      response: [{
        Event: {
          id: '401',
          info: 'Objects only',
          timestamp: '1742900000',
          Object: [{
            id: '6001', name: 'file',
            Attribute: [
              { id: '6002', type: 'sha256', value: 'e'.repeat(64), to_ids: true },
            ],
          }],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    expect(result.articles[0].rawMeta.iocCount).toBe(1);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ objectName: string }>;
    expect(iocs[0].objectName).toBe('file');
  });

  it('passes custom publishedAfter filter', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, { response: [] }));

    await connector.fetch({ ...BASE_OPTS, publishedAfter: '1700000000' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.timestamp).toBe('1700000000');
  });

  // ── P1-6: Incremental fetch cursor ────────────────────────────────────

  it('returns latestEventTimestamp from the highest publish_timestamp', async () => {
    const response = {
      response: [
        { Event: { id: '1', info: 'Old', timestamp: '1700000000', publish_timestamp: '1700000100', Attribute: [] } },
        { Event: { id: '2', info: 'Newest', timestamp: '1742900000', publish_timestamp: '1742900500', Attribute: [] } },
        { Event: { id: '3', info: 'Mid', timestamp: '1720000000', publish_timestamp: '1720000200', Attribute: [] } },
      ],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.latestEventTimestamp).toBe('1742900500');
  });

  it('returns null latestEventTimestamp when no events fetched', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, { response: [] }));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.latestEventTimestamp).toBeNull();
  });

  it('falls back to event timestamp when publish_timestamp is absent', async () => {
    const response = {
      response: [
        { Event: { id: '1', info: 'No publish_ts', timestamp: '1742800000', Attribute: [] } },
      ],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);

    expect(result.latestEventTimestamp).toBe('1742800000');
  });
});

// ── P0-5: to_ids filtering ──────────────────────────────────────────────

describe('MISPConnector to_ids filtering', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('includes all IOC attributes by default (onlyIdsAttributes=false)', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ toIds: boolean }>;
    // Event 101 has 4 IOC attrs: 3 with to_ids=true, 1 with to_ids=false
    expect(iocs).toHaveLength(4);
    expect(iocs.filter((i) => !i.toIds)).toHaveLength(1);
  });

  it('filters out to_ids=false attributes when onlyIdsAttributes=true', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    const result = await connector.fetch({ ...BASE_OPTS, onlyIdsAttributes: true });
    const iocs = result.articles[0].rawMeta.iocs as Array<{ toIds: boolean; value: string }>;

    // Only 3 with to_ids=true (email-src with to_ids=false is excluded)
    expect(iocs).toHaveLength(3);
    expect(iocs.every((i) => i.toIds)).toBe(true);
    expect(iocs.find((i) => i.value === 'phisher@evil.test')).toBeUndefined();
  });

  it('filters Object-level attributes when onlyIdsAttributes=true', async () => {
    const response = {
      response: [{
        Event: {
          id: '800', info: 'to_ids object test', timestamp: '1742900000',
          Attribute: [],
          Object: [{
            id: '8001', name: 'file',
            Attribute: [
              { id: '8002', type: 'md5', value: 'abc123', to_ids: true },
              { id: '8003', type: 'sha256', value: 'def456', to_ids: false },
            ],
          }],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch({ ...BASE_OPTS, onlyIdsAttributes: true });
    const iocs = result.articles[0].rawMeta.iocs as Array<{ value: string }>;
    expect(iocs).toHaveLength(1);
    expect(iocs[0].value).toBe('abc123');
  });
});

// ── P0-4: Galaxy/cluster enrichment ─────────────────────────────────────

describe('extractGalaxies', () => {
  it('extracts threat actors from galaxy tags', () => {
    const tags = [
      { name: 'misp-galaxy:threat-actor="APT28"' },
      { name: 'misp-galaxy:threat-actor="Fancy Bear"' },
    ];
    const result = extractGalaxies(tags);
    expect(result.threatActors).toEqual(['APT28', 'Fancy Bear']);
  });

  it('extracts MITRE ATT&CK techniques', () => {
    const tags = [
      { name: 'misp-galaxy:mitre-attack-pattern="Spearphishing Attachment - T1566.001"' },
      { name: 'misp-galaxy:mitre-attack-pattern="Command and Scripting Interpreter - T1059"' },
    ];
    const result = extractGalaxies(tags);
    expect(result.mitreTechniques).toHaveLength(2);
    expect(result.mitreTechniques[0]).toContain('T1566.001');
  });

  it('extracts malware families and tools', () => {
    const tags = [
      { name: 'misp-galaxy:mitre-malware="Emotet"' },
      { name: 'misp-galaxy:tool="Mimikatz"' },
    ];
    const result = extractGalaxies(tags);
    expect(result.malwareFamilies).toEqual(['Emotet']);
    expect(result.tools).toEqual(['Mimikatz']);
  });

  it('deduplicates galaxy values', () => {
    const tags = [
      { name: 'misp-galaxy:threat-actor="APT28"' },
      { name: 'misp-galaxy:threat-actor="APT28"' },
    ];
    const result = extractGalaxies(tags);
    expect(result.threatActors).toEqual(['APT28']);
  });

  it('ignores non-galaxy tags', () => {
    const tags = [
      { name: 'tlp:green' },
      { name: 'type:osint' },
    ];
    const result = extractGalaxies(tags);
    expect(result.threatActors).toEqual([]);
    expect(result.mitreTechniques).toEqual([]);
  });

  it('returns empty arrays when no galaxy tags present', () => {
    const result = extractGalaxies([]);
    expect(result.threatActors).toEqual([]);
    expect(result.malwareFamilies).toEqual([]);
  });
});

describe('MISPConnector galaxy enrichment in articles', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('includes galaxy enrichment in rawMeta', async () => {
    const response = {
      response: [{
        Event: {
          id: '700', info: 'Galaxy test', timestamp: '1742900000',
          Tag: [
            { name: 'misp-galaxy:threat-actor="APT28"' },
            { name: 'misp-galaxy:mitre-attack-pattern="Phishing - T1566"' },
            { name: 'misp-galaxy:tool="Mimikatz"' },
            { name: 'tlp:green' },
          ],
          Attribute: [],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    const galaxies = result.articles[0].rawMeta.galaxies as any;
    expect(galaxies).toBeDefined();
    expect(galaxies.threatActors).toEqual(['APT28']);
    expect(galaxies.mitreTechniques).toEqual(['Phishing - T1566']);
    expect(galaxies.tools).toEqual(['Mimikatz']);
  });

  it('omits galaxies field when no galaxy tags present', async () => {
    const response = {
      response: [{
        Event: {
          id: '701', info: 'No galaxies', timestamp: '1742900000',
          Tag: [{ name: 'tlp:green' }],
          Attribute: [],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    expect(result.articles[0].rawMeta.galaxies).toBeUndefined();
  });
});

// ── P0-3: Warning list filtering ────────────────────────────────────────

describe('MISPConnector warning list filtering', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('flags IOCs with warning list matches', async () => {
    const response = {
      response: [{
        Event: {
          id: '600', info: 'Warning list test', timestamp: '1742900000',
          Attribute: [
            { id: '6001', type: 'domain', value: 'google.com', to_ids: true, warnings: [{ name: 'Top 1000 domains' }] },
            { id: '6002', type: 'ip-dst', value: '198.51.100.1', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ value: string; warningListMatch: boolean; warningLists: string[] }>;

    expect(iocs[0].warningListMatch).toBe(true);
    expect(iocs[0].warningLists).toEqual(['Top 1000 domains']);
    expect(iocs[1].warningListMatch).toBe(false);
    expect(iocs[1].warningLists).toEqual([]);
  });

  it('handles multiple warning list matches on same attribute', async () => {
    const response = {
      response: [{
        Event: {
          id: '601', info: 'Multi-warning test', timestamp: '1742900000',
          Attribute: [
            { id: '6010', type: 'ip-dst', value: '8.8.8.8', to_ids: true, warnings: [
              { name: 'Known DNS resolvers' },
              { name: 'Google IPs' },
            ]},
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ warningLists: string[] }>;
    expect(iocs[0].warningLists).toEqual(['Known DNS resolvers', 'Google IPs']);
  });
});

// ── P0-2: Sighting-based confidence ─────────────────────────────────────

describe('applySightingConfidence', () => {
  it('boosts confidence for positive sightings', () => {
    const iocs = [
      { type: 'ipv4', mispType: 'ip-dst', value: '1.2.3.4', toIds: true, comment: null, category: null, attrTlp: null, objectName: null, _attrId: '100' },
    ] as any[];
    const sightings = [
      { Sighting: { attribute_id: '100', type: '0' } },
      { Sighting: { attribute_id: '100', type: '0' } },
      { Sighting: { attribute_id: '100', type: '0' } },
    ];
    applySightingConfidence(iocs, sightings);
    expect(iocs[0].sightingConfidence).toBe(80); // 50 + 3*10
  });

  it('lowers confidence for false-positive sightings', () => {
    const iocs = [
      { type: 'domain', mispType: 'domain', value: 'google.com', toIds: true, comment: null, category: null, attrTlp: null, objectName: null, _attrId: '200' },
    ] as any[];
    const sightings = [
      { Sighting: { attribute_id: '200', type: '1' } },
      { Sighting: { attribute_id: '200', type: '1' } },
    ];
    applySightingConfidence(iocs, sightings);
    expect(iocs[0].sightingConfidence).toBe(20); // 50 - 2*15
  });

  it('clamps confidence to 0-100 range', () => {
    const iocs = [
      { type: 'ipv4', mispType: 'ip-dst', value: '1.1.1.1', toIds: true, comment: null, category: null, attrTlp: null, objectName: null, _attrId: '300' },
    ] as any[];
    // 4 FP sightings → 50 - 60 = -10 → clamped to 0
    const sightings = [
      { Sighting: { attribute_id: '300', type: '1' } },
      { Sighting: { attribute_id: '300', type: '1' } },
      { Sighting: { attribute_id: '300', type: '1' } },
      { Sighting: { attribute_id: '300', type: '1' } },
    ];
    applySightingConfidence(iocs, sightings);
    expect(iocs[0].sightingConfidence).toBe(0);
  });

  it('does not set confidence when no sightings exist', () => {
    const iocs = [
      { type: 'md5', mispType: 'md5', value: 'abc', toIds: true, comment: null, category: null, attrTlp: null, objectName: null, _attrId: '400' },
    ] as any[];
    applySightingConfidence(iocs, []);
    expect(iocs[0].sightingConfidence).toBeUndefined();
  });
});

describe('MISPConnector sightings integration', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches sightings when enableSightings=true and applies confidence', async () => {
    const eventResponse = {
      response: [{
        Event: {
          id: '500', info: 'Sighting test', timestamp: '1742900000',
          Attribute: [
            { id: '5001', type: 'ip-dst', value: '10.0.0.1', to_ids: true },
          ],
        },
      }],
    };
    const sightingsResponse = [
      { Sighting: { attribute_id: '5001', type: '0' } },
      { Sighting: { attribute_id: '5001', type: '0' } },
    ];

    fetchSpy
      .mockResolvedValueOnce(mockRes(200, eventResponse))
      .mockResolvedValueOnce(mockRes(200, sightingsResponse));

    const result = await connector.fetch({ ...BASE_OPTS, enableSightings: true });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // Second call should be to sightings endpoint
    expect(fetchSpy.mock.calls[1][0]).toContain('/sightings/restSearch/event/500');
    const iocs = result.articles[0].rawMeta.iocs as Array<{ sightingConfidence: number }>;
    expect(iocs[0].sightingConfidence).toBe(70); // 50 + 2*10
  });

  it('skips sightings fetch when enableSightings is not set', async () => {
    fetchSpy.mockResolvedValue(mockRes(200, makeMispResponse()));

    await connector.fetch(BASE_OPTS);

    // Only 1 call (events), no sightings call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('extractTlp', () => {
  it('extracts TLP:AMBER from tag array', () => {
    expect(extractTlp([{ name: 'tlp:amber' }])).toBe('TLP:AMBER');
  });

  it('extracts TLP:WHITE (case-insensitive)', () => {
    expect(extractTlp([{ name: 'TLP:White' }])).toBe('TLP:WHITE');
  });

  it('returns first TLP match when multiple present', () => {
    expect(extractTlp([{ name: 'tlp:red' }, { name: 'tlp:green' }])).toBe('TLP:RED');
  });

  it('returns null when no TLP tags present', () => {
    expect(extractTlp([{ name: 'apt28' }, { name: 'type:osint' }])).toBeNull();
  });

  it('handles empty tag array', () => {
    expect(extractTlp([])).toBeNull();
  });
});

// ── P1-7: parseRetryDelay ─────────────────────────────────────────────

describe('parseRetryDelay', () => {
  it('uses Retry-After header when present (seconds)', () => {
    const headers = new Headers({ 'Retry-After': '30' });
    expect(parseRetryDelay(headers, 0)).toBe(30_000);
  });

  it('handles Retry-After: 0 as immediate retry', () => {
    const headers = new Headers({ 'Retry-After': '0' });
    expect(parseRetryDelay(headers, 0)).toBe(0);
  });

  it('caps Retry-After at 60s max', () => {
    const headers = new Headers({ 'Retry-After': '120' });
    expect(parseRetryDelay(headers, 0)).toBe(60_000);
  });

  it('uses X-RateLimit-Reset as fallback header', () => {
    const headers = new Headers({ 'X-RateLimit-Reset': '10' });
    expect(parseRetryDelay(headers, 0)).toBe(10_000);
  });

  it('falls back to exponential backoff when no header', () => {
    const headers = new Headers();
    expect(parseRetryDelay(headers, 0)).toBe(5_000);  // 5s * 2^0
    expect(parseRetryDelay(headers, 1)).toBe(10_000); // 5s * 2^1
    expect(parseRetryDelay(headers, 2)).toBe(20_000); // 5s * 2^2
  });

  it('caps exponential backoff at 60s', () => {
    const headers = new Headers();
    expect(parseRetryDelay(headers, 10)).toBe(60_000); // 5s * 2^10 = 5120s, capped
  });
});

// ── P1-9: Attribute-level dedup ─────────────────────────────────────────

describe('deduplicateIocs', () => {
  const makeIoc = (type: string, value: string) => ({
    type, mispType: type, value, toIds: true, comment: null,
    category: null, attrTlp: null, objectName: null, _attrId: '1',
    warningListMatch: false, warningLists: [],
  }) as any;

  it('removes duplicate IOCs by (type, value)', () => {
    const iocs = [
      makeIoc('ipv4', '1.2.3.4'),
      makeIoc('domain', 'evil.com'),
      makeIoc('ipv4', '1.2.3.4'), // duplicate
      makeIoc('domain', 'evil.com'), // duplicate
    ];
    const result = deduplicateIocs(iocs);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(2);
  });

  it('keeps first occurrence (preserves flat attr over object attr)', () => {
    const flat = { ...makeIoc('ipv4', '10.0.0.1'), objectName: null, comment: 'C2 server' };
    const fromObj = { ...makeIoc('ipv4', '10.0.0.1'), objectName: 'file', comment: null };
    const result = deduplicateIocs([flat, fromObj]);
    expect(result.unique).toHaveLength(1);
    expect(result.unique[0].comment).toBe('C2 server'); // first one kept
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('treats same value with different types as distinct', () => {
    const iocs = [
      makeIoc('md5', 'abc123'),
      makeIoc('sha256', 'abc123'),
    ];
    const result = deduplicateIocs(iocs);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('returns zero duplicates when all unique', () => {
    const iocs = [makeIoc('ipv4', '1.1.1.1'), makeIoc('domain', 'x.com')];
    const result = deduplicateIocs(iocs);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('handles empty array', () => {
    const result = deduplicateIocs([]);
    expect(result.unique).toHaveLength(0);
    expect(result.duplicatesRemoved).toBe(0);
  });
});

describe('MISPConnector dedup in articles', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('deduplicates IOCs across flat attributes and Objects', async () => {
    const response = {
      response: [{
        Event: {
          id: '900', info: 'Dedup test', timestamp: '1742900000',
          Attribute: [
            { id: '9001', type: 'ip-dst', value: '10.0.0.1', to_ids: true },
            { id: '9002', type: 'domain', value: 'evil.com', to_ids: true },
          ],
          Object: [{
            id: '9010', name: 'network-connection',
            Attribute: [
              { id: '9011', type: 'ip-dst', value: '10.0.0.1', to_ids: true }, // dup of 9001
              { id: '9012', type: 'domain', value: 'evil.com', to_ids: true }, // dup of 9002
              { id: '9013', type: 'domain', value: 'unique.com', to_ids: true },
            ],
          }],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    const meta = result.articles[0].rawMeta;

    expect(meta.iocCount).toBe(3); // 2 flat + 1 unique from object
    expect(meta.iocDuplicatesRemoved).toBe(2);
    const values = (meta.iocs as Array<{ value: string }>).map((i) => i.value);
    expect(values).toEqual(['10.0.0.1', 'evil.com', 'unique.com']);
  });

  it('omits iocDuplicatesRemoved when no duplicates', async () => {
    const response = {
      response: [{
        Event: {
          id: '901', info: 'No dups', timestamp: '1742900000',
          Attribute: [
            { id: '9101', type: 'ip-dst', value: '1.1.1.1', to_ids: true },
            { id: '9102', type: 'domain', value: 'safe.com', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));

    const result = await connector.fetch(BASE_OPTS);
    expect(result.articles[0].rawMeta.iocDuplicatesRemoved).toBeUndefined();
  });
});

// ── P1-10: MISP flat file feed ──────────────────────────────────────────

describe('MISPConnector.fetchFeed (flat file)', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  const FEED_URL = 'https://misp-feed.example.org/feed';

  const manifest = {
    'uuid-aaa': { timestamp: '1742900000', info: 'Event A' },
    'uuid-bbb': { timestamp: '1742800000', info: 'Event B' },
  };

  const eventA = {
    Event: {
      id: '10', info: 'Event A — APT campaign', timestamp: '1742900000',
      publish_timestamp: '1742900100',
      Attribute: [
        { id: '101', type: 'ip-dst', value: '10.0.0.1', to_ids: true },
      ],
    },
  };

  const eventB = {
    Event: {
      id: '20', info: 'Event B — Ransomware', timestamp: '1742800000',
      publish_timestamp: '1742800100',
      Attribute: [
        { id: '201', type: 'domain', value: 'ransom.example.com', to_ids: true },
      ],
    },
  };

  it('fetches manifest then individual event files', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockRes(200, manifest))    // manifest.json
      .mockResolvedValueOnce(mockRes(200, eventA))       // uuid-aaa.json
      .mockResolvedValueOnce(mockRes(200, eventB));      // uuid-bbb.json

    const result = await connector.fetchFeed({ feedUrl: FEED_URL });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0][0]).toBe(`${FEED_URL}/manifest.json`);
    expect(fetchSpy.mock.calls[1][0]).toBe(`${FEED_URL}/uuid-aaa.json`);
    expect(fetchSpy.mock.calls[2][0]).toBe(`${FEED_URL}/uuid-bbb.json`);

    expect(result.articles).toHaveLength(2);
    expect(result.feedTitle).toContain('MISP Feed');
    expect(result.latestEventTimestamp).toBe('1742900100');
  });

  it('filters events by publishedAfter timestamp', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockRes(200, manifest))
      .mockResolvedValueOnce(mockRes(200, eventA));
      // eventB (timestamp 1742800000) is filtered out since publishedAfter > it

    const result = await connector.fetchFeed({
      feedUrl: FEED_URL,
      publishedAfter: '1742850000',
    });

    // Only uuid-aaa passes the filter (timestamp 1742900000 > 1742850000)
    expect(fetchSpy).toHaveBeenCalledTimes(2); // manifest + 1 event
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toContain('Event A');
  });

  it('returns empty result when manifest fetch fails', async () => {
    fetchSpy.mockResolvedValue(mockRes(404, { error: 'Not found' }));

    const result = await connector.fetchFeed({ feedUrl: FEED_URL });

    expect(result.articles).toHaveLength(0);
    expect(result.latestEventTimestamp).toBeNull();
  });

  it('skips individual event files that fail to fetch', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockRes(200, manifest))
      .mockResolvedValueOnce(mockRes(500, {}))           // uuid-aaa fails
      .mockResolvedValueOnce(mockRes(200, eventB));      // uuid-bbb ok

    const result = await connector.fetchFeed({ feedUrl: FEED_URL });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toContain('Event B');
  });

  it('passes Authorization header when apiKey provided', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockRes(200, { 'uuid-ccc': { timestamp: '1742900000' } }))
      .mockResolvedValueOnce(mockRes(200, eventA));

    await connector.fetchFeed({ feedUrl: FEED_URL, apiKey: 'my-feed-key' });

    for (const call of fetchSpy.mock.calls) {
      expect(call[1].headers.Authorization).toBe('my-feed-key');
    }
  });

  it('does not send Authorization header when apiKey is undefined', async () => {
    fetchSpy.mockResolvedValueOnce(mockRes(200, {})); // empty manifest

    await connector.fetchFeed({ feedUrl: FEED_URL });

    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('returns null latestEventTimestamp when manifest is empty', async () => {
    fetchSpy.mockResolvedValueOnce(mockRes(200, {}));

    const result = await connector.fetchFeed({ feedUrl: FEED_URL });

    expect(result.articles).toHaveLength(0);
    expect(result.latestEventTimestamp).toBeNull();
  });
});

// ── IPv6 detection ──────────────────────────────────────────────────────

describe('isIpv6', () => {
  it('detects full IPv6 address', () => {
    expect(isIpv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
  });

  it('detects compressed IPv6', () => {
    expect(isIpv6('::1')).toBe(true);
    expect(isIpv6('fe80::1')).toBe(true);
  });

  it('detects IPv4-mapped IPv6', () => {
    expect(isIpv6('::ffff:192.168.1.1')).toBe(true);
  });

  it('returns false for IPv4', () => {
    expect(isIpv6('192.168.1.1')).toBe(false);
    expect(isIpv6('10.0.0.1')).toBe(false);
  });
});

describe('MISPConnector IPv6 type resolution', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps IPv4 ip-dst to ipv4 and IPv6 ip-dst to ipv6', async () => {
    const response = {
      response: [{
        Event: {
          id: '1100', info: 'IPv6 test', timestamp: '1742900000',
          Attribute: [
            { id: '11001', type: 'ip-dst', value: '10.0.0.1', to_ids: true },
            { id: '11002', type: 'ip-dst', value: '2001:db8::1', to_ids: true },
            { id: '11003', type: 'ip-src', value: '::ffff:192.168.0.1', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));
    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ type: string; value: string }>;

    expect(iocs[0]).toMatchObject({ type: 'ipv4', value: '10.0.0.1' });
    expect(iocs[1]).toMatchObject({ type: 'ipv6', value: '2001:db8::1' });
    expect(iocs[2]).toMatchObject({ type: 'ipv6', value: '::ffff:192.168.0.1' });
  });

  it('resolves ip-dst|port IPv6 composite correctly', async () => {
    const response = {
      response: [{
        Event: {
          id: '1101', info: 'IPv6 composite', timestamp: '1742900000',
          Attribute: [
            { id: '11010', type: 'ip-dst|port', value: '2001:db8::1|443', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));
    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ type: string; value: string; originalContext: string }>;

    expect(iocs[0].type).toBe('ipv6');
    expect(iocs[0].value).toBe('2001:db8::1');
    expect(iocs[0].originalContext).toBe('443');
  });
});

// ── first_seen / last_seen passthrough ──────────────────────────────────

describe('MISPConnector first_seen/last_seen', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('passes first_seen and last_seen through to IOC metadata', async () => {
    const response = {
      response: [{
        Event: {
          id: '1200', info: 'Temporal test', timestamp: '1742900000',
          Attribute: [
            { id: '12001', type: 'ip-dst', value: '10.0.0.1', to_ids: true, first_seen: '2026-01-15T00:00:00Z', last_seen: '2026-03-20T12:00:00Z' },
            { id: '12002', type: 'domain', value: 'old.example.com', to_ids: true, first_seen: '2024-06-01T00:00:00Z' },
            { id: '12003', type: 'sha256', value: 'f'.repeat(64), to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));
    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ firstSeen: string | null; lastSeen: string | null }>;

    expect(iocs[0].firstSeen).toBe('2026-01-15T00:00:00Z');
    expect(iocs[0].lastSeen).toBe('2026-03-20T12:00:00Z');
    expect(iocs[1].firstSeen).toBe('2024-06-01T00:00:00Z');
    expect(iocs[1].lastSeen).toBeNull();
    expect(iocs[2].firstSeen).toBeNull();
    expect(iocs[2].lastSeen).toBeNull();
  });
});

// ── Composite value context preservation ────────────────────────────────

describe('MISPConnector composite context', () => {
  let connector: MISPConnector;
  let logger: ReturnType<typeof createMockLogger>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new MISPConnector(logger as never);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('preserves filename as originalContext for filename|sha256', async () => {
    const response = {
      response: [{
        Event: {
          id: '1300', info: 'Context test', timestamp: '1742900000',
          Attribute: [
            { id: '13001', type: 'filename|sha256', value: 'dropper.exe|' + 'a'.repeat(64), to_ids: true },
            { id: '13002', type: 'filename|md5', value: 'payload.dll|deadbeef12345678', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));
    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ value: string; originalContext: string | null }>;

    expect(iocs[0].value).toBe('a'.repeat(64));
    expect(iocs[0].originalContext).toBe('dropper.exe');
    expect(iocs[1].value).toBe('deadbeef12345678');
    expect(iocs[1].originalContext).toBe('payload.dll');
  });

  it('preserves port as originalContext for ip-dst|port', async () => {
    const response = {
      response: [{
        Event: {
          id: '1301', info: 'Port context', timestamp: '1742900000',
          Attribute: [
            { id: '13010', type: 'ip-dst|port', value: '10.0.0.1|8443', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));
    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ value: string; originalContext: string | null }>;

    expect(iocs[0].value).toBe('10.0.0.1');
    expect(iocs[0].originalContext).toBe('8443');
  });

  it('sets originalContext to null for simple (non-composite) types', async () => {
    const response = {
      response: [{
        Event: {
          id: '1302', info: 'Simple type', timestamp: '1742900000',
          Attribute: [
            { id: '13020', type: 'domain', value: 'example.com', to_ids: true },
          ],
        },
      }],
    };

    fetchSpy.mockResolvedValue(mockRes(200, response));
    const result = await connector.fetch(BASE_OPTS);
    const iocs = result.articles[0].rawMeta.iocs as Array<{ originalContext: string | null }>;

    expect(iocs[0].originalContext).toBeNull();
  });
});
