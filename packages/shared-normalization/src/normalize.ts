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

/**
 * Refang URL: replace `hxxp` → `http`, `[:]` → `:`, `[.]` → `.`
 */
function normalizeURL(raw: string): string {
  return raw
    .replace(/hxxp/gi, 'http')
    .replace(/\[:\]/g, ':')
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .trim();
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
