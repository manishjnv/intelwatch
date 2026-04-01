import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleSafeBrowsingProvider } from '../src/providers/google-safe-browsing.js';
import type { RateLimiter } from '../src/rate-limiter.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRateLimiter(): RateLimiter {
  return {
    canRequest: vi.fn().mockReturnValue(true),
    recordRequest: vi.fn(),
    msUntilReady: vi.fn().mockReturnValue(0),
    acquire: vi.fn().mockResolvedValue(undefined),
    stats: vi.fn().mockReturnValue({ used: 0, max: 8000, windowMs: 86_400_000 }),
  } as unknown as RateLimiter;
}

/** GSB API response with threat matches */
function gsbThreatResponse(matches: Array<{ threatType: string; platformType: string; threat: { url: string } }>) {
  return { matches };
}

/** GSB API response for safe URLs (empty matches) */
function gsbSafeResponse() {
  return {};
}

describe('GoogleSafeBrowsingProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-04-01T12:00:00Z') });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- supports() ---

  describe('supports', () => {
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    it('supports url type', () => {
      expect(provider.supports('url')).toBe(true);
    });

    it('supports domain type', () => {
      expect(provider.supports('domain')).toBe(true);
    });

    it('supports fqdn type', () => {
      expect(provider.supports('fqdn')).toBe(true);
    });

    it('does not support ip type', () => {
      expect(provider.supports('ip')).toBe(false);
    });

    it('does not support hash types', () => {
      expect(provider.supports('hash_md5')).toBe(false);
      expect(provider.supports('hash_sha256')).toBe(false);
    });

    it('does not support email type', () => {
      expect(provider.supports('email')).toBe(false);
    });

    it('does not support cve type', () => {
      expect(provider.supports('cve')).toBe(false);
    });
  });

  // --- lookup: safe URL ---

  it('returns safe=true for clean URL', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbSafeResponse()), { status: 200 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    const result = await provider.lookup('url', 'https://example.com');

    expect(result).not.toBeNull();
    expect(result!.safe).toBe(true);
    expect(result!.threats).toEqual([]);
    expect(result!.checkedAt).toBe('2026-04-01T12:00:00.000Z');
  });

  // --- lookup: malicious URL ---

  it('returns threats for malicious URL', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbThreatResponse([
      { threatType: 'MALWARE', platformType: 'ANY_PLATFORM', threat: { url: 'http://malware.example.com/bad' } },
      { threatType: 'SOCIAL_ENGINEERING', platformType: 'ANY_PLATFORM', threat: { url: 'http://malware.example.com/bad' } },
    ])), { status: 200 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    const result = await provider.lookup('url', 'http://malware.example.com/bad');

    expect(result).not.toBeNull();
    expect(result!.safe).toBe(false);
    expect(result!.threats).toHaveLength(2);
    expect(result!.threats[0]).toEqual({ type: 'MALWARE', platform: 'ANY_PLATFORM' });
    expect(result!.threats[1]).toEqual({ type: 'SOCIAL_ENGINEERING', platform: 'ANY_PLATFORM' });
  });

  // --- batch lookup: 5 URLs in single request ---

  it('batch lookup sends 5 URLs in single API call', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbThreatResponse([
      { threatType: 'MALWARE', platformType: 'ANY_PLATFORM', threat: { url: 'http://bad1.com' } },
      { threatType: 'UNWANTED_SOFTWARE', platformType: 'ANY_PLATFORM', threat: { url: 'http://bad3.com' } },
    ])), { status: 200 }));

    const limiter = mockRateLimiter();
    const provider = new GoogleSafeBrowsingProvider('test-key', limiter, logger);

    const urls = ['http://bad1.com', 'http://clean2.com', 'http://bad3.com', 'http://clean4.com', 'http://clean5.com'];
    const results = await provider.batchLookup('url', urls);

    // Single API call for 5 URLs
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(limiter.acquire).toHaveBeenCalledTimes(1);

    // Verify request body contains all 5 URLs
    const callArgs = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.threatInfo.threatEntries).toHaveLength(5);

    // 5 results back
    expect(results).toHaveLength(5);
    // bad1.com has threat
    expect(results[0]!.safe).toBe(false);
    expect(results[0]!.threats).toHaveLength(1);
    // clean2.com is safe
    expect(results[1]!.safe).toBe(true);
    // bad3.com has threat
    expect(results[2]!.safe).toBe(false);
    // clean4, clean5 safe
    expect(results[3]!.safe).toBe(true);
    expect(results[4]!.safe).toBe(true);
  });

  // --- domain → URL prefix conversion ---

  it('prefixes domains with http:// before lookup', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbSafeResponse()), { status: 200 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    await provider.lookup('domain', 'example.com');

    const callArgs = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.threatInfo.threatEntries[0].url).toBe('http://example.com');
  });

  it('prefixes fqdn with http:// before lookup', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbSafeResponse()), { status: 200 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    await provider.lookup('fqdn', 'www.example.com');

    const callArgs = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.threatInfo.threatEntries[0].url).toBe('http://www.example.com');
  });

  it('does not prefix url type values', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbSafeResponse()), { status: 200 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    await provider.lookup('url', 'https://example.com/path');

    const callArgs = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.threatInfo.threatEntries[0].url).toBe('https://example.com/path');
  });

  // --- non-URL IOC types skipped ---

  it('returns null for unsupported IOC types', async () => {
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    expect(await provider.lookup('ip', '1.2.3.4')).toBeNull();
    expect(await provider.lookup('hash_sha256', 'abc123')).toBeNull();
    expect(await provider.lookup('email', 'a@b.com')).toBeNull();
    expect(await provider.lookup('cve', 'CVE-2024-1234')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // --- missing API key → skip ---

  it('returns null when API key is empty', async () => {
    const provider = new GoogleSafeBrowsingProvider('', mockRateLimiter(), logger);

    const result = await provider.lookup('url', 'https://example.com');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // --- rate limiter integration ---

  it('acquires rate limiter before making request', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbSafeResponse()), { status: 200 }));
    const limiter = mockRateLimiter();
    const provider = new GoogleSafeBrowsingProvider('test-key', limiter, logger);

    await provider.lookup('url', 'https://example.com');

    expect(limiter.acquire).toHaveBeenCalledTimes(1);
  });

  // --- API error → graceful degradation ---

  it('returns null on HTTP 429 (rate limited by API)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    const result = await provider.lookup('url', 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns null on HTTP 500 server error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    const result = await provider.lookup('url', 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    const result = await provider.lookup('url', 'https://example.com');

    expect(result).toBeNull();
  });

  // --- request body format ---

  it('sends correct GSB v4 request body format', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(gsbSafeResponse()), { status: 200 }));
    const provider = new GoogleSafeBrowsingProvider('test-key', mockRateLimiter(), logger);

    await provider.lookup('url', 'https://test.com');

    const callArgs = fetchSpy.mock.calls[0]!;
    const url = callArgs[0] as string;
    expect(url).toContain('safebrowsing.googleapis.com/v4/threatMatches:find');
    expect(url).toContain('key=test-key');

    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.client).toEqual({ clientId: 'etip', clientVersion: '1.0' });
    expect(body.threatInfo.threatTypes).toEqual([
      'MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION',
    ]);
    expect(body.threatInfo.platformTypes).toEqual(['ANY_PLATFORM']);
    expect(body.threatInfo.threatEntryTypes).toEqual(['URL']);
  });
});
