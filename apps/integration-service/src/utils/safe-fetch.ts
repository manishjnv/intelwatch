import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { AppError } from '@etip/shared-utils';
import { getConfig } from '../config.js';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB — ponytail: fixed cap, add a config knob if a real caller ever needs more
const DEFAULT_TIMEOUT_MS = 10000;

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface SafeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

/** IPv4 ranges (RFC 1918/5735/6598/etc.) that must never be reachable from a tenant-supplied URL. */
const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPublicV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === 0xffffffff) return false; // 255.255.255.255
  for (const [base, bits] of V4_BLOCKS) {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((n & mask) === (ipv4ToInt(base) & mask)) return false;
  }
  return true;
}

/** Expand any valid IPv6 textual form (incl. embedded IPv4) into 8 uint16 groups. */
function expandIPv6(ip: string): number[] {
  let addr = ip;
  let v4: number[] | null = null;
  const v4Match = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  const v4Text = v4Match?.[1];
  if (v4Text) {
    v4 = v4Text.split('.').map(Number);
    addr = addr.slice(0, -v4Text.length) + '0:0';
  }

  let headParts: string[];
  let tailParts: string[];
  if (addr.includes('::')) {
    const [head, tail] = addr.split('::');
    headParts = head ? head.split(':').filter(Boolean) : [];
    tailParts = tail ? tail.split(':').filter(Boolean) : [];
  } else {
    headParts = addr.split(':');
    tailParts = [];
  }
  const missing = 8 - (headParts.length + tailParts.length);
  const groups = [
    ...headParts.map((h) => parseInt(h, 16)),
    ...Array(Math.max(missing, 0)).fill(0),
    ...tailParts.map((h) => parseInt(h, 16)),
  ];

  if (v4) {
    groups[6] = ((v4[0] ?? 0) << 8) | (v4[1] ?? 0);
    groups[7] = ((v4[2] ?? 0) << 8) | (v4[3] ?? 0);
  }
  return groups.slice(0, 8);
}

function isPublicV6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // ::/96 — deprecated IPv4-compatible form (::a.b.c.d)
  if (g.slice(0, 6).every((x) => x === 0)) {
    return isPublicV4(`${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`);
  }
  // ::ffff:0:0/96 — IPv4-mapped
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isPublicV4(`${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`);
  }
  // 64:ff9b::/96 — NAT64
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isPublicV4(`${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`);
  }
  // 2002::/16 — 6to4, embeds an IPv4 in groups 1–2
  if (g[0] === 0x2002) {
    return isPublicV4(`${g[1]! >> 8}.${g[1]! & 0xff}.${g[2]! >> 8}.${g[2]! & 0xff}`);
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0]! & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((g[0]! & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  return true;
}

/** True if `ip` (a literal IPv4 or IPv6 address) is publicly routable. Invalid input is treated as non-public. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

function allowPrivateDestinations(): boolean {
  try {
    return getConfig().TI_INTEGRATION_ALLOW_PRIVATE_DESTINATIONS;
  } catch {
    return false; // config not loaded (e.g. unit test) → fail closed
  }
}

/**
 * Static (non-DNS) safety check for a tenant-supplied destination URL, used at save time.
 * Returns an error message, or null if the URL looks safe. The real, rebinding-proof
 * check happens at connect time inside safeFetch() via the custom DNS lookup below.
 */
export function checkDestinationUrl(url: string): string | null {
  const message = 'Destination must be a publicly reachable address';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return message;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return message;
  if (parsed.username || parsed.password) return message;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    return message;
  }
  if (allowPrivateDestinations()) return null;
  if (isIP(hostname) && !isPublicAddress(hostname)) return message;
  return null;
}

export function createSafeLookup(allowPrivate: boolean) {
  return (
    host: string,
    options: LookupOptions,
    callback: (err: Error | null, address: string | LookupAddress[], family: number) => void,
  ): void => {
    if (allowPrivate) {
      dnsLookup(host, options, callback);
      return;
    }
    dnsLookup(host, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as LookupAddress[];
      if (list.length === 0) {
        return callback(new Error('DNS lookup returned no addresses'), '', 0);
      }
      const nonPublic = list.find((a) => !isPublicAddress(a.address));
      if (nonPublic) {
        return callback(new AppError(400, 'Destination not allowed', 'DESTINATION_NOT_ALLOWED'), '', 0);
      }
      // Node 20 net.connect (autoSelectFamily, default on) asks for all:true and expects the array back.
      if (options.all) return callback(null, list, 0);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

/**
 * fetch-compatible HTTP(S) client that refuses to connect to non-public destinations.
 * DNS resolution is validated inside the socket's own `lookup` option, so the address
 * actually connected to is exactly the address that was checked — no rebinding TOCTOU.
 */
export function safeFetch(url: string, init: SafeFetchInit = {}): Promise<SafeFetchResponse> {
  const allowPrivate = allowPrivateDestinations();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new AppError(400, 'Invalid destination URL', 'DESTINATION_NOT_ALLOWED'));
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new AppError(400, 'Only http/https destinations are allowed', 'DESTINATION_NOT_ALLOWED'));
  }
  if (parsed.username || parsed.password) {
    return Promise.reject(new AppError(400, 'URL credentials are not allowed', 'DESTINATION_NOT_ALLOWED'));
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && isIP(hostname) && !isPublicAddress(hostname)) {
    return Promise.reject(new AppError(400, 'Destination not allowed', 'DESTINATION_NOT_ALLOWED'));
  }

  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const lookup = createSafeLookup(allowPrivate);

  const options: RequestOptions = { method: init.method ?? 'GET', headers: init.headers, lookup, timeout: timeoutMs };

  return new Promise<SafeFetchResponse>((resolve, reject) => {
    const onResponse = (res: IncomingMessage): void => {
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          settled = true;
          res.destroy();
          reject(new AppError(502, 'Response body exceeded 1MB limit', 'RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (settled) return;
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: res.statusMessage ?? '',
          headers: res.headers,
          text: () => Promise.resolve(bodyText),
          json: <T,>() => Promise.resolve(JSON.parse(bodyText) as T),
        });
      });
      res.on('error', (err) => {
        if (!settled) reject(err);
      });
    };

    const req = parsed.protocol === 'https:' ? httpsRequest(parsed, options, onResponse) : httpRequest(parsed, options, onResponse);

    // Socket `timeout` is idle-only; a trickling server could hold the request open forever.
    const deadline = setTimeout(() => {
      req.destroy();
      reject(new AppError(504, `Request to destination exceeded ${timeoutMs}ms`, 'DESTINATION_TIMEOUT'));
    }, timeoutMs);
    req.on('close', () => clearTimeout(deadline));

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError(504, `Request to destination timed out after ${timeoutMs}ms`, 'DESTINATION_TIMEOUT'));
    });
    req.on('error', (err: Error) => {
      if (err instanceof AppError) return reject(err);
      reject(new AppError(502, `Request failed: ${err.message}`, 'DESTINATION_REQUEST_FAILED'));
    });

    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
