import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { lookup as dnsLookup } from 'node:dns';
import { isPublicAddress, checkDestinationUrl, safeFetch, createSafeLookup } from '../src/utils/safe-fetch.js';
import { loadConfig } from '../src/config.js';

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return { ...actual, lookup: vi.fn(actual.lookup) };
});

const BASE_ENV = {
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long',
  TI_SERVICE_JWT_SECRET: 'test-service-jwt-secret',
};

// ─── isPublicAddress ──────────────────────────────────────────────

describe('isPublicAddress', () => {
  it.each<[string, boolean]>([
    // IPv4 — public
    ['8.8.8.8', true],
    ['1.1.1.1', true],
    ['93.184.216.34', true], // ordinary public host
    ['100.63.255.255', true], // just below 100.64.0.0/10
    ['172.15.255.255', true], // just below 172.16.0.0/12
    ['172.32.0.1', true], // just above 172.16.0.0/12
    ['198.17.255.255', true], // just below 198.18.0.0/15
    // IPv4 — non-public
    ['0.0.0.0', false],
    ['0.5.5.5', false],
    ['10.0.0.1', false],
    ['10.255.255.255', false],
    ['100.64.0.1', false],
    ['100.127.255.255', false],
    ['127.0.0.1', false],
    ['127.255.255.255', false],
    ['169.254.169.254', false], // cloud metadata endpoint
    ['172.16.0.1', false],
    ['172.31.255.255', false],
    ['192.0.0.1', false],
    ['192.0.2.1', false],
    ['192.168.1.1', false],
    ['198.18.0.1', false],
    ['198.19.255.255', false],
    ['198.51.100.1', false],
    ['203.0.113.1', false],
    ['224.0.0.1', false],
    ['240.0.0.1', false],
    ['255.255.255.255', false],
    // IPv6 — non-public
    ['::', false],
    ['::1', false],
    ['fe80::1', false],
    ['fc00::1', false],
    ['fd12:3456:789a::1', false],
    ['ff02::1', false],
    ['2001:db8::1', false],
    ['::ffff:127.0.0.1', false], // IPv4-mapped, private
    ['::ffff:7f00:1', false], // same address, hex-group form
    ['::ffff:169.254.169.254', false],
    ['64:ff9b::a00:5', false], // NAT64 of 10.0.0.5
    // IPv6 — public
    ['2606:4700:4700::1111', true],
    ['::ffff:8.8.8.8', true],
    ['64:ff9b::808:808', true], // NAT64 of 8.8.8.8
    // invalid input
    ['not-an-ip', false],
    ['', false],
  ])('%s -> %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

// ─── WHATWG URL normalization of IP-literal hosts ────────────────

describe('URL normalizes IP-literal hosts before we ever see them', () => {
  it('hex form normalizes to dotted-decimal', () => {
    expect(new URL('http://0x7f000001/').hostname).toBe('127.0.0.1');
  });

  it('decimal integer form normalizes to dotted-decimal', () => {
    expect(new URL('http://2130706433/').hostname).toBe('127.0.0.1');
  });
});

// ─── checkDestinationUrl (save-time static check) ────────────────

describe('checkDestinationUrl', () => {
  beforeEach(() => {
    loadConfig({ ...BASE_ENV });
  });

  it('accepts an ordinary public https URL', () => {
    expect(checkDestinationUrl('https://splunk.example.com/collector')).toBeNull();
  });

  it('rejects a private IPv4 literal', () => {
    expect(checkDestinationUrl('http://127.0.0.1/')).toMatch(/publicly reachable/);
  });

  it('rejects localhost', () => {
    expect(checkDestinationUrl('http://localhost:6379')).toMatch(/publicly reachable/);
  });

  it('rejects *.internal and *.local hostnames', () => {
    expect(checkDestinationUrl('http://redis.internal')).not.toBeNull();
    expect(checkDestinationUrl('http://redis.local')).not.toBeNull();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(checkDestinationUrl('ftp://example.com')).not.toBeNull();
  });

  it('rejects URL userinfo', () => {
    expect(checkDestinationUrl('http://user:pass@example.com')).not.toBeNull();
  });

  it('rejects an unparseable URL', () => {
    expect(checkDestinationUrl('not a url')).not.toBeNull();
  });

  it('normalized hex IPv4 hosts are still caught', () => {
    expect(checkDestinationUrl('http://0x7f000001/')).not.toBeNull();
  });
});

// ─── safeFetch — literal IP destinations (no DNS involved) ───────

describe('safeFetch — rejects private IP literals outright', () => {
  beforeEach(() => {
    loadConfig({ ...BASE_ENV });
  });

  it.each([
    'http://127.0.0.1:1/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]:1/',
    'http://10.0.0.5/',
  ])('%s', async (url) => {
    await expect(safeFetch(url)).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
  });

  it('rejects a non-http(s) scheme', async () => {
    await expect(safeFetch('ftp://example.com/file')).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
  });

  it('rejects URL userinfo', async () => {
    await expect(safeFetch('http://user:pass@example.com/')).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
  });
});

// ─── safeFetch — DNS rebinding protection via custom lookup ──────

describe('safeFetch — hostname resolves to a private address', () => {
  beforeEach(() => {
    loadConfig({ ...BASE_ENV });
    vi.mocked(dnsLookup).mockReset();
  });

  it('rejects when the only resolved address is private', async () => {
    vi.mocked(dnsLookup).mockImplementation(((_host: string, _opts: unknown, cb: (err: null, addrs: unknown[]) => void) => {
      cb(null, [{ address: '10.0.0.5', family: 4 }]);
    }) as unknown as typeof dnsLookup);

    await expect(safeFetch('http://internal.example.com/')).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
  });

  it('rejects if ANY of multiple resolved addresses is private', async () => {
    vi.mocked(dnsLookup).mockImplementation(((_host: string, _opts: unknown, cb: (err: null, addrs: unknown[]) => void) => {
      cb(null, [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]);
    }) as unknown as typeof dnsLookup);

    await expect(safeFetch('http://mixed.example.com/')).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
  });

  it('rejects when DNS returns no addresses', async () => {
    vi.mocked(dnsLookup).mockImplementation(((_host: string, _opts: unknown, cb: (err: null, addrs: unknown[]) => void) => {
      cb(null, []);
    }) as unknown as typeof dnsLookup);

    await expect(safeFetch('http://empty.example.com/')).rejects.toBeInstanceOf(Error);
  });
});

// ─── safeFetch — real local server, dev escape hatch ─────────────

describe('safeFetch — against a real local server', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/slow') {
        // never responds — used to exercise the timeout path
        return;
      }
      if (req.url === '/trickle') {
        // keeps the socket busy (1 byte every 50ms) so an idle timeout never fires
        res.writeHead(200);
        const t = setInterval(() => res.write('x'), 50);
        res.on('close', () => clearInterval(t));
        return;
      }
      if (req.url === '/big') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        const chunk = Buffer.alloc(256 * 1024, 'x');
        for (let i = 0; i < 5; i++) res.write(chunk); // 1.25MB > 1MB cap
        res.end();
        return;
      }
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: 'http://127.0.0.1/other' });
        res.end();
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ echoedBody: body, method: req.method }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('enforces a total deadline even when the server trickles bytes (no idle timeout)', async () => {
    loadConfig({ ...BASE_ENV, TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: 'true' });
    const started = Date.now();
    await expect(safeFetch(`http://127.0.0.1:${port}/trickle`, { timeoutMs: 400 })).rejects.toMatchObject({ code: 'DESTINATION_TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('connects and round-trips a POST body when the dev escape hatch is ON', async () => {
    loadConfig({ ...BASE_ENV, TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: 'true' });
    const res = await safeFetch(`http://127.0.0.1:${port}/`, { method: 'POST', body: 'hello' });
    expect(res.ok).toBe(true);
    const json = await res.json<{ echoedBody: string; method: string }>();
    expect(json.echoedBody).toBe('hello');
    expect(json.method).toBe('POST');
  });

  it('does not follow a 3xx redirect — returns it as-is', async () => {
    loadConfig({ ...BASE_ENV, TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: 'true' });
    const res = await safeFetch(`http://127.0.0.1:${port}/redirect`);
    expect(res.status).toBe(302);
    expect(res.ok).toBe(false);
    expect(res.headers.location).toBe('http://127.0.0.1/other');
  });

  it('refuses the same server once the hatch is OFF', async () => {
    loadConfig({ ...BASE_ENV });
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
  });

  it('times out slow responses', async () => {
    loadConfig({ ...BASE_ENV, TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: 'true' });
    await expect(safeFetch(`http://127.0.0.1:${port}/slow`, { timeoutMs: 100 })).rejects.toMatchObject({
      code: 'DESTINATION_TIMEOUT',
    });
  });

  it('caps the response body at 1MB', async () => {
    loadConfig({ ...BASE_ENV, TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: 'true' });
    await expect(safeFetch(`http://127.0.0.1:${port}/big`)).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });
});

describe('production refuses to boot with the escape hatch on', () => {
  it('rejects TI_NODE_ENV=production with TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS=true', () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, TI_NODE_ENV: 'production', TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS: 'true' }),
    ).toThrow(/TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS/);
  });
});


describe('createSafeLookup — callback shape Node expects', () => {
  const publicAddrs = [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }];
  beforeEach(() => {
    vi.mocked(dnsLookup).mockReset();
    vi.mocked(dnsLookup).mockImplementation(((_h: string, _o: unknown, cb: (e: null, a: unknown[]) => void) => cb(null, publicAddrs)) as unknown as typeof dnsLookup);
  });

  it('returns the validated array when net.connect asks for all:true (Node 20 autoSelectFamily)', async () => {
    const result = await new Promise<{ err: Error | null; addr: unknown }>((res) =>
      createSafeLookup(false)('siem.example.com', { all: true }, (err, addr) => res({ err, addr })));
    expect(result.err).toBeNull();
    expect(result.addr).toEqual(publicAddrs);
  });

  it('returns a single address string when all is not requested', async () => {
    const result = await new Promise<{ err: Error | null; addr: unknown; fam: number }>((res) =>
      createSafeLookup(false)('siem.example.com', {}, (err, addr, fam) => res({ err, addr, fam })));
    expect(result.err).toBeNull();
    expect(result.addr).toBe('93.184.216.34');
    expect(result.fam).toBe(4);
  });

  it('rejects in the all:true path too if any address is private', async () => {
    vi.mocked(dnsLookup).mockImplementation(((_h: string, _o: unknown, cb: (e: null, a: unknown[]) => void) =>
      cb(null, [publicAddrs[0], { address: '10.0.0.7', family: 4 }])) as unknown as typeof dnsLookup);
    const err = await new Promise<Error | null>((res) => createSafeLookup(false)('x.example.com', { all: true }, (e) => res(e)));
    expect(err).not.toBeNull();
  });
});

describe('isPublicAddress — 6to4 embedded IPv4', () => {
  it.each([['2002:7f00:1::', false], ['2002:a00:1::', false], ['2002:5db8:d822::', true]])('%s → %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe('isPublicAddress — deprecated IPv4-compatible IPv6 (::/96)', () => {
  it.each([['::7f00:1', false], ['::127.0.0.1', false], ['::a00:5', false], ['::808:808', true]])('%s → %s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });
});

describe('schema rejects client-supplied ciphertext marker', () => {
  it('rejects a secret value starting with enc:v1:', async () => {
    const { CreateIntegrationSchema } = await import('../src/schemas/integration.js');
    const r = CreateIntegrationSchema.safeParse({
      name: 'x', type: 'webhook', triggers: ['alert.created'],
      webhookConfig: { url: 'https://hooks.example.com/x', secret: 'enc:v1:abc' },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('reserved prefix');
  });
});
