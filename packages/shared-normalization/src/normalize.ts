/**
 * @module @etip/shared-normalization/normalize
 * @description Normalize raw IOC values into canonical form.
 * Rules: lowercase domains, refang IPs, strip hash prefixes,
 * normalize URLs, lowercase emails, uppercase CVEs.
 */
import { type IOCType } from './ioc-detect.js';

/**
 * Normalize an IOC value based on its detected type.
 * Produces a deterministic canonical form for deduplication.
 *
 * @param value - Raw IOC value
 * @param type - Detected IOC type
 * @returns Normalized IOC value
 */
export function normalizeIOCValue(value: string, type: IOCType): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  switch (type) {
    case 'ip':
      return normalizeIP(trimmed);
    case 'domain':
      return normalizeDomain(trimmed);
    case 'hash_md5':
    case 'hash_sha1':
    case 'hash_sha256':
      return normalizeHash(trimmed);
    case 'url':
      return normalizeURL(trimmed);
    case 'email':
      return normalizeEmail(trimmed);
    case 'cve':
      return normalizeCVE(trimmed);
    default:
      return trimmed;
  }
}

/**
 * Refang IP address: replace `[.]` and `(.)` with `.`
 */
function normalizeIP(raw: string): string {
  return raw
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .trim();
}

/**
 * Refang and lowercase domain.
 * Strip trailing dots. Remove protocol prefixes if accidentally included.
 */
function normalizeDomain(raw: string): string {
  return raw
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .toLowerCase()
    .replace(/\.$/, '')
    .trim();
}

/**
 * Strip `0x` prefix and lowercase hex hash.
 */
function normalizeHash(raw: string): string {
  return raw
    .replace(/^0x/i, '')
    .toLowerCase()
    .trim();
}

/** Tracking/analytics query params to strip for dedup */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'twclid', 'li_fat_id',
  'mc_cid', 'mc_eid',
  '_ga', '_gl', '_hsenc', '_hsmi', 'hsa_cam', 'hsa_grp', 'hsa_ad',
  'ref', 'referer', 'referrer', 'source', 'clickid',
  'spm', 'scm', 'pvid', 'algo_pvid',
]);

/**
 * Refang URL, strip tracking params, normalize encoding, sort query params.
 * Produces deterministic canonical form for deduplication.
 */
function normalizeURL(raw: string): string {
  let refanged = raw
    .replace(/hxxp/gi, 'http')
    .replace(/\[:\]/g, ':')
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .trim();

  try {
    const parsed = new URL(refanged);

    // Lowercase scheme + host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if ((parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }

    // Remove trailing slash on path (unless root)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    // Strip tracking params and sort remaining
    const params = new URLSearchParams(parsed.search);
    const cleaned: [string, string][] = [];
    for (const [key, value] of params) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        cleaned.push([key, value]);
      }
    }
    cleaned.sort((a, b) => a[0].localeCompare(b[0]));
    parsed.search = cleaned.length > 0
      ? '?' + cleaned.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      : '';

    // Remove fragment (not sent to server, irrelevant for IOC matching)
    parsed.hash = '';

    return parsed.toString();
  } catch {
    // If URL parsing fails, return the refanged version as-is
    return refanged;
  }
}

/**
 * Lowercase email. Email local parts are technically case-sensitive
 * per RFC, but in practice all major providers are case-insensitive.
 */
function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

/**
 * Uppercase CVE ID (e.g., `cve-2024-1234` → `CVE-2024-1234`).
 */
function normalizeCVE(raw: string): string {
  return raw.toUpperCase().trim();
}
