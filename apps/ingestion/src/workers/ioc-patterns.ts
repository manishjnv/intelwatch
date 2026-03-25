/**
 * IOC Detection Patterns — 20+ types covering all major indicator categories.
 * Extracted from pipeline.ts to keep file under 400 lines.
 *
 * Order matters: more specific patterns first to avoid substring matches
 * (e.g., SHA512 before SHA256 before SHA1 before MD5).
 */

export interface IOCPattern {
  re: RegExp;
  type: string;
}

export const IOC_PATTERNS: IOCPattern[] = [
  // ── Hashes (most specific first) ─────────────────────────────────────
  { re: /\b[a-f0-9]{128}\b/gi, type: 'hash_sha512' },
  { re: /\b[a-f0-9]{64}\b/gi, type: 'hash_sha256' },
  { re: /\b[a-f0-9]{40}\b/gi, type: 'hash_sha1' },
  { re: /\b[a-f0-9]{32}\b/gi, type: 'hash_md5' },

  // ── Vulnerabilities ──────────────────────────────────────────────────
  { re: /\bCVE-\d{4}-\d{4,}\b/gi, type: 'cve' },

  // ── MITRE ATT&CK techniques ──────────────────────────────────────────
  { re: /\b(?:T\d{4})(?:\.\d{3})?\b/g, type: 'mitre_technique' },

  // ── Network indicators ───────────────────────────────────────────────
  // IPv6 (full and compressed)
  { re: /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, type: 'ipv6' },
  { re: /\b(?:[0-9a-f]{1,4}:){1,7}:[0-9a-f]{0,4}\b/gi, type: 'ipv6' },
  // CIDR ranges (before plain IP to avoid partial match)
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\/(?:8|1[0-9]|2[0-9]|3[0-2])\b/g, type: 'cidr' },
  // IPv4
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, type: 'ip' },
  // Defanged IPs: 192[.]168[.]1[.]1 or 192(.)168(.)1(.)1
  { re: /\b\d{1,3}(?:\[\.\]|\(\.\))\d{1,3}(?:\[\.\]|\(\.\))\d{1,3}(?:\[\.\]|\(\.\))\d{1,3}\b/g, type: 'ip' },
  // ASN
  { re: /\bAS\d{4,6}\b/g, type: 'asn' },

  // ── URLs (before domains to capture full URLs) ───────────────────────
  // Defanged URLs: hxxps[:]// or hxxp://
  { re: /hxxps?(?:\[:\]|:)\/\/[^\s"'<>]{5,200}/gi, type: 'url' },
  // Standard URLs with paths
  { re: /https?:\/\/[^\s"'<>]{5,200}/gi, type: 'url' },

  // ── Domains ──────────────────────────────────────────────────────────
  // Includes emerging TLDs (.cloud .dev .security .ai .app .tech) common in malicious infra
  { re: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|xyz|ru|cn|tk|top|info|biz|cc|pw|ws|club|online|site|live|me|co|uk|de|fr|jp|kr|br|in|cloud|dev|security|ai|app|tech)\b/gi, type: 'domain' },
  // Defanged domains: evil[.]com
  { re: /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\[\.\][a-z]{2,10}\b/gi, type: 'domain' },

  // ── Email addresses ──────────────────────────────────────────────────
  { re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, type: 'email' },

  // ── Cryptocurrency ───────────────────────────────────────────────────
  // Bitcoin (P2PKH, P2SH, Bech32)
  { re: /\b(?:1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b/g, type: 'bitcoin_address' },
  // Ethereum
  { re: /\b0x[a-fA-F0-9]{40}\b/g, type: 'ethereum_address' },
  // Monero
  { re: /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g, type: 'monero_address' },

  // ── TLS/SSL fingerprints ─────────────────────────────────────────────
  // JA3/JA3S (labeled with prefix)
  { re: /\bja3s?[_: ]+[a-f0-9]{32}\b/gi, type: 'ja3_fingerprint' },

  // ── Windows artifacts ────────────────────────────────────────────────
  // Registry keys
  { re: /\b(?:HKLM|HKCU|HKCR|HKU|HKCC)\\[^\s"']{10,200}/g, type: 'registry_key' },
  // Windows file paths
  { re: /\b[A-Z]:\\(?:[^\s"'\\]+\\)*[^\s"'\\]+\.[a-z]{2,4}\b/g, type: 'file_path' },

  // ── Unix file paths (suspicious locations) ───────────────────────────
  { re: /\/(?:tmp|var\/tmp|dev\/shm|etc\/cron)\/[^\s"']{3,100}/g, type: 'file_path' },

  // ── YARA rule names ──────────────────────────────────────────────────
  { re: /\brule\s+([A-Za-z_][A-Za-z0-9_]{3,60})\s*\{/g, type: 'yara_rule' },
];

/** Common domains that produce false positives during IOC extraction */
export const COMMON_SAFE_DOMAINS = [
  'google.com', 'github.com', 'microsoft.com', 'amazon.com', 'cloudflare.com',
  'facebook.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'apple.com',
  'mozilla.org', 'w3.org', 'example.com', 'intelwatch.in', 'wikipedia.org',
  'reddit.com', 'stackoverflow.com', 'npmjs.com', 'docker.com', 'ubuntu.com',
  'debian.org', 'redhat.com', 'amazonaws.com', 'azure.com', 'googleapis.com',
  'gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fastly.net', 'akamai.net',
  'mitre.org', 'nist.gov', 'cisa.gov', 'us-cert.gov', 'cert.org',
];

/** Check if an IPv4 address is in a private/reserved range */
export function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
  const a = parts[0]!;
  const b = parts[1]!;
  return (
    a === 10 ||                           // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12
    (a === 192 && b === 168) ||           // 192.168.0.0/16
    a === 127 ||                           // 127.0.0.0/8
    a === 0 ||                             // 0.0.0.0/8
    (a === 169 && b === 254)              // 169.254.0.0/16 (link-local)
  );
}

/**
 * G4a: Check if an IPv6 address is in the link-local range (fe80::/10).
 * Link-local addresses are non-routable and should be filtered out at ingestion.
 */
export function isLinkLocalIPv6(ip: string): boolean {
  return ip.toLowerCase().startsWith('fe80');
}

/** Check if domain matches a known safe domain (including subdomains) */
export function isCommonDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  for (const safe of COMMON_SAFE_DOMAINS) {
    if (d === safe || d.endsWith(`.${safe}`)) return true;
  }
  return false;
}
