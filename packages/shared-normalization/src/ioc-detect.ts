/**
 * @module @etip/shared-normalization/ioc-detect
 * @description Detect IOC type from a raw string value.
 * Supports: ip, domain, hash (md5/sha1/sha256), url, email, cve.
 */

/** Supported IOC types in the ETIP platform. */
export type IOCType = 'ip' | 'domain' | 'hash_md5' | 'hash_sha1' | 'hash_sha256' | 'url' | 'email' | 'cve' | 'unknown';

// ── Regex Patterns ───────────────────────────────────────────────────

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const IPV6_RE = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^[0-9a-fA-F]{1,4}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$/;
const DEFANGED_IP_RE = /\[\.\]|\(\.\)/g;
const MD5_RE = /^[0-9a-fA-F]{32}$/;
const SHA1_RE = /^[0-9a-fA-F]{40}$/;
const SHA256_RE = /^[0-9a-fA-F]{64}$/;
const URL_RE = /^https?:\/\//i;
const DEFANGED_URL_RE = /^h[tx]{2}ps?(?:\[:\]|:)\/\//i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CVE_RE = /^CVE-\d{4}-\d{4,}$/i;
const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const DEFANGED_DOMAIN_RE = /\[\.\]|\(\.\)/;

/**
 * Detect the IOC type from a raw value string.
 * Handles defanged notation (e.g., `192[.]168[.]1[.]1`, `hxxps[:]//`).
 *
 * @param raw - Raw IOC value (may be defanged)
 * @returns Detected IOC type
 */
export function detectIOCType(raw: string): IOCType {
  const trimmed = raw.trim();
  if (!trimmed) return 'unknown';

  // CVE first (most specific pattern)
  if (CVE_RE.test(trimmed)) return 'cve';

  // Email
  if (EMAIL_RE.test(trimmed)) return 'email';

  // URL (including defanged)
  if (URL_RE.test(trimmed) || DEFANGED_URL_RE.test(trimmed)) return 'url';

  // Hashes (by length — check before IP/domain since hashes are unambiguous)
  const hashCandidate = trimmed.replace(/^0x/i, '');
  if (SHA256_RE.test(hashCandidate)) return 'hash_sha256';
  if (SHA1_RE.test(hashCandidate)) return 'hash_sha1';
  if (MD5_RE.test(hashCandidate)) return 'hash_md5';

  // IP address (including defanged)
  const refangedIP = trimmed.replace(DEFANGED_IP_RE, '.');
  if (IPV4_RE.test(refangedIP)) return 'ip';
  if (IPV6_RE.test(refangedIP)) return 'ip';

  // Domain (including defanged)
  const refangedDomain = trimmed.replace(DEFANGED_IP_RE, '.');
  if (DOMAIN_RE.test(refangedDomain) || DEFANGED_DOMAIN_RE.test(trimmed)) {
    if (DOMAIN_RE.test(refangedDomain)) return 'domain';
  }

  return 'unknown';
}
