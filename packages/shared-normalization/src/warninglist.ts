/**
 * @module WarninglistMatcher
 * @description MISP Warninglist-style false-positive filtering for IOC values.
 * Curated lists of known-good IPs, domains, and CIDRs that commonly trigger false positives.
 * DECISION-029 Phase B1.
 */

export interface WarninglistEntry {
  name: string;
  type: 'string' | 'regex' | 'cidr' | 'hostname';
  category: 'false_positive' | 'known_benign';
  values: string[];
}

export interface WarninglistMatch {
  listName: string;
  category: 'false_positive' | 'known_benign';
  matchType: 'string' | 'regex' | 'cidr' | 'hostname';
}

/** Simple CIDR check for /8, /16, /24 (covers 99% of warninglist CIDRs) */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  if (!network || !prefixStr) return false;
  const prefix = parseInt(prefixStr, 10);
  if (![8, 16, 24].includes(prefix)) return false;

  const ipParts = ip.split('.').map(Number);
  const netParts = network.split('.').map(Number);
  if (ipParts.length !== 4 || netParts.length !== 4) return false;
  if (ipParts.some((p) => isNaN(p)) || netParts.some((p) => isNaN(p))) return false;

  const octetsToCheck = prefix / 8;
  for (let i = 0; i < octetsToCheck; i++) {
    if (ipParts[i] !== netParts[i]) return false;
  }
  return true;
}

const DEFAULT_LISTS: WarninglistEntry[] = [
  {
    name: 'Known DNS resolvers',
    type: 'string',
    category: 'known_benign',
    values: ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1', '9.9.9.9', '208.67.222.222'],
  },
  {
    name: 'Known CDN domains',
    type: 'hostname',
    category: 'known_benign',
    values: ['*.cloudflare.com', '*.akamai.net', '*.fastly.net', '*.cloudfront.net'],
  },
  {
    name: 'Known safe domains',
    type: 'string',
    category: 'false_positive',
    values: [
      'google.com', 'microsoft.com', 'apple.com', 'github.com', 'amazon.com',
      'facebook.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'cloudflare.com',
      'akamai.com', 'fastly.com', 'mozilla.org', 'wikipedia.org', 'ubuntu.com',
      'debian.org', 'redhat.com', 'oracle.com', 'ibm.com', 'adobe.com',
    ],
  },
  {
    name: 'Known safe CIDRs',
    type: 'cidr',
    category: 'known_benign',
    values: ['8.8.8.0/24', '1.1.1.0/24'],
  },
  {
    name: 'RFC1918 private IPs',
    type: 'cidr',
    category: 'false_positive',
    values: ['10.0.0.0/8', '172.16.0.0/16', '192.168.0.0/16'],
  },
];

export class WarninglistMatcher {
  private lists: WarninglistEntry[] = [];

  loadDefaults(): void {
    this.lists = [...DEFAULT_LISTS];
  }

  loadCustom(lists: WarninglistEntry[]): void {
    this.lists.push(...lists);
  }

  check(_iocType: string, value: string): WarninglistMatch | null {
    const lowerValue = value.toLowerCase().trim();

    for (const list of this.lists) {
      switch (list.type) {
        case 'string': {
          const found = list.values.some((v) => v.toLowerCase() === lowerValue);
          if (found) return { listName: list.name, category: list.category, matchType: 'string' };
          break;
        }
        case 'hostname': {
          for (const pattern of list.values) {
            if (pattern.startsWith('*.')) {
              const suffix = pattern.slice(1).toLowerCase(); // e.g. ".cloudflare.com"
              if (lowerValue.endsWith(suffix) || lowerValue === suffix.slice(1)) {
                return { listName: list.name, category: list.category, matchType: 'hostname' };
              }
            } else if (lowerValue === pattern.toLowerCase()) {
              return { listName: list.name, category: list.category, matchType: 'hostname' };
            }
          }
          break;
        }
        case 'cidr': {
          for (const cidr of list.values) {
            if (isIpInCidr(value.trim(), cidr)) {
              return { listName: list.name, category: list.category, matchType: 'cidr' };
            }
          }
          break;
        }
        case 'regex': {
          for (const pattern of list.values) {
            try {
              if (new RegExp(pattern, 'i').test(value)) {
                return { listName: list.name, category: list.category, matchType: 'regex' };
              }
            } catch { /* invalid regex — skip */ }
          }
          break;
        }
      }
    }

    return null;
  }

  checkBatch(iocs: { type: string; value: string }[]): Map<string, WarninglistMatch | null> {
    const results = new Map<string, WarninglistMatch | null>();
    for (const ioc of iocs) {
      results.set(ioc.value, this.check(ioc.type, ioc.value));
    }
    return results;
  }

  getMatchedListNames(): string[] {
    return this.lists.map((l) => l.name);
  }
}
