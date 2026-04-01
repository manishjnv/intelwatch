import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IPinfoProvider } from '../src/providers/ipinfo.js';
import type { RateLimiter } from '../src/rate-limiter.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRateLimiter(): RateLimiter {
  return {
    canRequest: vi.fn().mockReturnValue(true),
    recordRequest: vi.fn(),
    msUntilReady: vi.fn().mockReturnValue(0),
    acquire: vi.fn().mockResolvedValue(undefined),
    stats: vi.fn().mockReturnValue({ used: 0, max: 1200, windowMs: 86_400_000 }),
  } as unknown as RateLimiter;
}

/** Full IPinfo API response for 8.8.8.8 */
function ipinfoFullResponse() {
  return {
    ip: '8.8.8.8',
    hostname: 'dns.google',
    city: 'Mountain View',
    region: 'California',
    country: 'US',
    loc: '37.4056,-122.0775',
    org: 'AS15169 Google LLC',
    postal: '94043',
    timezone: 'America/Los_Angeles',
  };
}

/** IPinfo response with privacy fields (paid tier) */
function ipinfoPrivacyResponse() {
  return {
    ...ipinfoFullResponse(),
    privacy: {
      vpn: true,
      proxy: false,
      tor: true,
      relay: false,
      hosting: false,
    },
  };
}

/** IPinfo response with minimal fields */
function ipinfoMinimalResponse() {
  return {
    ip: '192.168.1.1',
    bogon: true,
  };
}

describe('IPinfoProvider', () => {
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
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    it('supports ip type', () => {
      expect(provider.supports('ip')).toBe(true);
    });

    it('supports ipv6 type', () => {
      expect(provider.supports('ipv6')).toBe(true);
    });

    it('does not support domain type', () => {
      expect(provider.supports('domain')).toBe(false);
    });

    it('does not support url type', () => {
      expect(provider.supports('url')).toBe(false);
    });

    it('does not support hash types', () => {
      expect(provider.supports('hash_md5')).toBe(false);
      expect(provider.supports('hash_sha256')).toBe(false);
    });

    it('does not support cve type', () => {
      expect(provider.supports('cve')).toBe(false);
    });

    it('does not support email type', () => {
      expect(provider.supports('email')).toBe(false);
    });
  });

  // --- successful IP lookup ---

  it('returns full geo + ASN data for valid IP', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(ipinfoFullResponse()), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result).not.toBeNull();
    expect(result!.hostname).toBe('dns.google');
    expect(result!.city).toBe('Mountain View');
    expect(result!.region).toBe('California');
    expect(result!.country).toBe('US');
    expect(result!.latitude).toBeCloseTo(37.4056);
    expect(result!.longitude).toBeCloseTo(-122.0775);
    expect(result!.asn).toBe('AS15169');
    expect(result!.orgName).toBe('Google LLC');
    expect(result!.postal).toBe('94043');
    expect(result!.timezone).toBe('America/Los_Angeles');
    expect(result!.isVpn).toBe(false);
    expect(result!.isProxy).toBe(false);
    expect(result!.isTor).toBe(false);
    expect(result!.checkedAt).toBe('2026-04-01T12:00:00.000Z');
  });

  // --- org field parsing ---

  it('parses org field "AS1234 Company Name" into asn + orgName', async () => {
    const response = { ...ipinfoFullResponse(), org: 'AS9009 M247 Europe SRL' };
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '1.2.3.4');

    expect(result!.asn).toBe('AS9009');
    expect(result!.orgName).toBe('M247 Europe SRL');
  });

  it('handles org field with only ASN (no org name)', async () => {
    const response = { ...ipinfoFullResponse(), org: 'AS12345' };
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '1.2.3.4');

    expect(result!.asn).toBe('AS12345');
    expect(result!.orgName).toBe('');
  });

  it('handles missing org field gracefully', async () => {
    const response = { ...ipinfoFullResponse() };
    delete (response as Record<string, unknown>).org;
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '1.2.3.4');

    expect(result!.asn).toBe('');
    expect(result!.orgName).toBe('');
  });

  // --- loc field parsing ---

  it('parses loc field "37.77,-122.41" into latitude/longitude', async () => {
    const response = { ...ipinfoFullResponse(), loc: '37.7749,-122.4194' };
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '1.2.3.4');

    expect(result!.latitude).toBeCloseTo(37.7749);
    expect(result!.longitude).toBeCloseTo(-122.4194);
  });

  it('handles missing loc field gracefully', async () => {
    const response = { ...ipinfoFullResponse() };
    delete (response as Record<string, unknown>).loc;
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '1.2.3.4');

    expect(result!.latitude).toBe(0);
    expect(result!.longitude).toBe(0);
  });

  // --- IPv6 address lookup ---

  it('looks up IPv6 address successfully', async () => {
    const response = {
      ...ipinfoFullResponse(),
      ip: '2001:4860:4860::8888',
    };
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ipv6', '2001:4860:4860::8888');

    expect(result).not.toBeNull();
    expect(result!.city).toBe('Mountain View');

    // Verify correct URL was called
    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(callUrl).toContain('2001%3A4860%3A4860%3A%3A8888');
  });

  // --- privacy/VPN detection ---

  it('extracts VPN/proxy/Tor flags from privacy field', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(ipinfoPrivacyResponse()), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '1.2.3.4');

    expect(result!.isVpn).toBe(true);
    expect(result!.isProxy).toBe(false);
    expect(result!.isTor).toBe(true);
  });

  it('defaults VPN/proxy/Tor to false when privacy field absent', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(ipinfoFullResponse()), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result!.isVpn).toBe(false);
    expect(result!.isProxy).toBe(false);
    expect(result!.isTor).toBe(false);
  });

  // --- non-IP IOC types skipped ---

  it('returns null for unsupported IOC types without API call', async () => {
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    expect(await provider.lookup('domain', 'example.com')).toBeNull();
    expect(await provider.lookup('url', 'https://example.com')).toBeNull();
    expect(await provider.lookup('hash_sha256', 'abc123')).toBeNull();
    expect(await provider.lookup('cve', 'CVE-2024-1234')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // --- missing token → provider skipped ---

  it('returns null when API token is empty', async () => {
    const provider = new IPinfoProvider('', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // --- rate limiter integration ---

  it('acquires rate limiter before making request', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(ipinfoFullResponse()), { status: 200 }));
    const limiter = mockRateLimiter();
    const provider = new IPinfoProvider('test-token', limiter, logger);

    await provider.lookup('ip', '8.8.8.8');

    expect(limiter.acquire).toHaveBeenCalledTimes(1);
  });

  // --- API errors → graceful degradation ---

  it('returns null on HTTP 429 (rate limited by API)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result).toBeNull();
  });

  it('returns null on HTTP 403 (invalid token)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result).toBeNull();
  });

  it('returns null on HTTP 500 server error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '8.8.8.8');

    expect(result).toBeNull();
  });

  // --- request format validation ---

  it('sends correct request URL with token', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(ipinfoFullResponse()), { status: 200 }));
    const provider = new IPinfoProvider('my-secret-token', mockRateLimiter(), logger);

    await provider.lookup('ip', '8.8.8.8');

    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(callUrl).toBe('https://ipinfo.io/8.8.8.8?token=my-secret-token');

    const callOpts = fetchSpy.mock.calls[0]![1]!;
    expect(callOpts.headers).toEqual({ Accept: 'application/json' });
  });

  // --- bogon / minimal response ---

  it('returns empty result for bogon/private IP', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(ipinfoMinimalResponse()), { status: 200 }));
    const provider = new IPinfoProvider('test-token', mockRateLimiter(), logger);

    const result = await provider.lookup('ip', '192.168.1.1');

    expect(result).not.toBeNull();
    expect(result!.city).toBe('');
    expect(result!.asn).toBe('');
    expect(result!.latitude).toBe(0);
    expect(result!.longitude).toBe(0);
  });
});
