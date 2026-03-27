/**
 * @module FuzzyDedupe
 * @description Fuzzy deduplication for IOC values. Handles defanged variants,
 * port stripping, case normalization, plus-addressing, and other near-duplicates
 * that exact SHA256(type:value) deduplication misses.
 * DECISION-029 Phase F.
 */

import { createHash } from 'node:crypto';

// ── Defang / Refang ─────────────────────────────────────────────

/**
 * Strip common defang patterns from IOC values.
 * hxxp → http, [.] → ., (.) → ., {.} → ., [://] → ://, [@] → @
 */
export function stripDefang(value: string): string {
  return value
    .replace(/hxxps/gi, 'https')
    .replace(/hxxp/gi, 'http')
    .replace(/\[:\/{2}\]/g, '://')
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .replace(/\{\.\}/g, '.')
    .replace(/\[@\]/g, '@');
}

// ── Port Stripping ──────────────────────────────────────────────

/**
 * Strip port from IP address.
 * 192.168.1.1:8080 → 192.168.1.1
 * [::1]:8080 → ::1
 */
export function stripPort(ip: string): string {
  // IPv6 in brackets: [::1]:8080
  const ipv6Match = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (ipv6Match) return ipv6Match[1]!;

  // IPv4 with port: only strip if it looks like ip:port (exactly 3 dots before colon)
  const lastColon = ip.lastIndexOf(':');
  if (lastColon === -1) return ip;

  const beforeColon = ip.substring(0, lastColon);
  const afterColon = ip.substring(lastColon + 1);

  // If afterColon is all digits and beforeColon looks like IPv4
  if (/^\d+$/.test(afterColon) && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(beforeColon)) {
    return beforeColon;
  }

  return ip;
}

// ── IP Normalization ────────────────────────────────────────────

/** Strip leading zeros from IPv4 octets: 192.168.001.001 → 192.168.1.1 */
function normalizeIpOctets(ip: string): string {
  if (!ip.includes('.')) return ip; // IPv6, leave as-is
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return parts.map((p) => String(parseInt(p, 10) || 0)).join('.');
}

// ── URL Normalization ───────────────────────────────────────────

/**
 * Normalize URL for fuzzy dedup:
 * - Defang → refang
 * - Lowercase scheme + host (not path)
 * - Strip trailing /
 * - Strip utm_* params
 * - Strip fragment
 */
export function normalizeUrl(url: string): string {
  const refanged = stripDefang(url);

  try {
    const parsed = new URL(refanged);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip trailing slash (unless root)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    // Strip utm_* params
    const params = new URLSearchParams(parsed.search);
    const cleaned: [string, string][] = [];
    for (const [key, value] of params) {
      if (!key.toLowerCase().startsWith('utm_')) {
        cleaned.push([key, value]);
      }
    }
    parsed.search = cleaned.length > 0
      ? '?' + cleaned.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      : '';

    // Strip fragment
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return refanged;
  }
}

// ── Type-Specific Normalization ─────────────────────────────────

/**
 * Returns the canonical normalized form of an IOC value for fuzzy dedup.
 * This is more aggressive than the standard normalizeIOCValue — it strips
 * ports, defangs, leading zeros, plus-addressing, etc.
 */
export function normalizeIocValue(type: string, value: string): string {
  const defanged = stripDefang(value.trim());

  switch (type) {
    case 'ip': {
      const noPort = stripPort(defanged);
      return normalizeIpOctets(noPort).toLowerCase();
    }
    case 'domain':
      return defanged.toLowerCase().replace(/\.$/, '');
    case 'url':
      return normalizeUrl(value.trim()); // normalizeUrl handles defang internally
    case 'hash_md5':
    case 'hash_sha1':
    case 'hash_sha256':
      return defanged.toLowerCase().replace(/^0x/i, '');
    case 'cve':
      return defanged
        .toUpperCase()
        .replace(/_/g, '-')
        .replace(/^CVE\s/, 'CVE-');
    case 'email': {
      const lower = defanged.toLowerCase();
      // Strip plus-addressing: user+tag@domain → user@domain
      const atIdx = lower.indexOf('@');
      if (atIdx === -1) return lower;
      const local = lower.substring(0, atIdx);
      const domain = lower.substring(atIdx);
      const plusIdx = local.indexOf('+');
      if (plusIdx === -1) return lower;
      return local.substring(0, plusIdx) + domain;
    }
    default:
      return defanged.toLowerCase();
  }
}

// ── Fuzzy Hash ──────────────────────────────────────────────────

/**
 * Compute a fuzzy dedup hash for an IOC. Applies type-specific normalization
 * before hashing so that near-duplicates (defanged, port variants, case) collide.
 */
export function computeFuzzyHash(iocType: string, value: string): string {
  const canonical = normalizeIocValue(iocType, value);
  return createHash('sha256').update(`${iocType}:${canonical}`).digest('hex');
}

/**
 * Check if two IOC values are fuzzy duplicates of each other.
 */
export function areFuzzyDuplicates(type: string, value1: string, value2: string): boolean {
  return computeFuzzyHash(type, value1) === computeFuzzyHash(type, value2);
}
