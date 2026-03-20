/**
 * IOC Quality Filters — Second-layer defense before DB storage.
 * Filters bogon IPs, reserved ranges, documentation IPs, and safe domains
 * that may have slipped through ingestion's first-pass filtering.
 */

/** RFC 5737 documentation, RFC 6598 CGNAT, RFC 1918 private, plus bogon ranges */
const BOGON_RANGES: Array<{ prefix: number[]; mask: number }> = [
  // RFC 1918 — Private
  { prefix: [10], mask: 8 },
  { prefix: [172, 16], mask: 12 },
  { prefix: [192, 168], mask: 16 },
  // Loopback
  { prefix: [127], mask: 8 },
  // Link-local
  { prefix: [169, 254], mask: 16 },
  // APIPA / This network
  { prefix: [0], mask: 8 },
  // CGNAT (RFC 6598)
  { prefix: [100, 64], mask: 10 },
  // Documentation (RFC 5737)
  { prefix: [192, 0, 2], mask: 24 },
  { prefix: [198, 51, 100], mask: 24 },
  { prefix: [203, 0, 113], mask: 24 },
  // Benchmarking (RFC 2544)
  { prefix: [198, 18], mask: 15 },
  // Multicast
  { prefix: [224], mask: 4 },
  // Reserved / broadcast
  { prefix: [240], mask: 4 },
  { prefix: [255, 255, 255, 255], mask: 32 },
];

/** Check if IPv4 falls in any bogon/reserved range */
export function isBogonIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;

  for (const range of BOGON_RANGES) {
    const prefixLen = range.prefix.length;
    let match = true;
    for (let i = 0; i < prefixLen; i++) {
      if (parts[i] !== range.prefix[i]) {
        // For masks that don't align on octet boundary, check partial
        if (i === prefixLen - 1 && range.mask % 8 !== 0) {
          const shift = 8 - (range.mask % 8);
          if ((parts[i]! >> shift) === (range.prefix[i]! >> shift)) continue;
        }
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/** Extended safe domain list — domains that should never be stored as IOCs */
const SAFE_DOMAINS = new Set([
  // Search engines
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com',
  // Social / tech
  'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'reddit.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'tumblr.com',
  // Developer platforms
  'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
  'npmjs.com', 'pypi.org', 'docker.com', 'hub.docker.com',
  // Cloud providers
  'amazonaws.com', 'azure.com', 'microsoft.com', 'office.com', 'live.com',
  'google.cloud', 'cloudflare.com', 'akamai.com', 'fastly.com',
  // CDNs
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  // Security / CTI sources (should not be flagged as IOCs)
  'virustotal.com', 'shodan.io', 'censys.io', 'abuseipdb.com',
  'mitre.org', 'attack.mitre.org', 'cve.org', 'nvd.nist.gov',
  'cisa.gov', 'us-cert.cisa.gov', 'cert.org',
  'malwarebazaar.abuse.ch', 'urlhaus.abuse.ch', 'threatfox.abuse.ch',
  'otx.alienvault.com', 'exchange.xforce.ibmcloud.com',
  // Documentation / placeholder
  'example.com', 'example.org', 'example.net', 'test.com', 'localhost',
  // Email providers
  'gmail.com', 'outlook.com', 'hotmail.com', 'protonmail.com', 'yahoo.co.jp',
  // OS / software
  'apple.com', 'mozilla.org', 'wikipedia.org', 'w3.org',
  'ubuntu.com', 'debian.org', 'fedoraproject.org', 'archlinux.org',
]);

/** Check if a domain (or its parent) is in the safe list */
export function isSafeDomain(domain: string): boolean {
  const lower = domain.toLowerCase().replace(/\.$/, '');
  if (SAFE_DOMAINS.has(lower)) return true;
  // Check parent domains (e.g., mail.google.com → google.com)
  const parts = lower.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (SAFE_DOMAINS.has(parent)) return true;
  }
  return false;
}

/** Check if a URL points to a safe domain */
export function isSafeURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isSafeDomain(parsed.hostname);
  } catch {
    return false;
  }
}

/** Check if a hash looks like documentation / placeholder (all zeros, all f's, sequential) */
export function isPlaceholderHash(hash: string): boolean {
  const lower = hash.toLowerCase();
  // All zeros or all f's
  if (/^0+$/.test(lower) || /^f+$/.test(lower)) return true;
  // Common test hashes
  if (lower === 'd41d8cd98f00b204e9800998ecf8427e') return true; // MD5 of empty string
  if (lower === 'da39a3ee5e6b4b0d3255bfef95601890afd80709') return true; // SHA1 of empty string
  if (lower === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') return true; // SHA256 of empty string
  return false;
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

/**
 * Apply all quality filters to an IOC before storage.
 * Returns { passed: false, reason } if the IOC should be skipped.
 */
export function applyQualityFilters(normalizedValue: string, iocType: string): FilterResult {
  switch (iocType) {
    case 'ip':
      if (isBogonIP(normalizedValue)) return { passed: false, reason: 'bogon_ip' };
      break;
    case 'domain':
    case 'fqdn':
      if (isSafeDomain(normalizedValue)) return { passed: false, reason: 'safe_domain' };
      break;
    case 'url':
      if (isSafeURL(normalizedValue)) return { passed: false, reason: 'safe_url' };
      break;
    case 'hash_md5':
    case 'hash_sha1':
    case 'hash_sha256':
    case 'hash_sha512':
      if (isPlaceholderHash(normalizedValue)) return { passed: false, reason: 'placeholder_hash' };
      break;
    case 'email': {
      // Filter emails from safe domains
      const domain = normalizedValue.split('@')[1];
      if (domain && isSafeDomain(domain)) return { passed: false, reason: 'safe_email_domain' };
      break;
    }
  }
  return { passed: true };
}
