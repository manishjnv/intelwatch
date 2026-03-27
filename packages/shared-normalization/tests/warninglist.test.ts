import { describe, it, expect, beforeEach } from 'vitest';
import { WarninglistMatcher, isIpInCidr, type WarninglistEntry } from '../src/warninglist.js';

describe('WarninglistMatcher', () => {
  let matcher: WarninglistMatcher;

  beforeEach(() => {
    matcher = new WarninglistMatcher();
    matcher.loadDefaults();
  });

  it('loadDefaults loads 5 built-in lists', () => {
    expect(matcher.getMatchedListNames()).toHaveLength(5);
  });

  it('check: Google DNS 8.8.8.8 → match (known DNS resolver)', () => {
    const result = matcher.check('ip', '8.8.8.8');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Known DNS resolvers');
    expect(result!.category).toBe('known_benign');
    expect(result!.matchType).toBe('string');
  });

  it('check: Cloudflare 1.1.1.1 → match', () => {
    const result = matcher.check('ip', '1.1.1.1');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Known DNS resolvers');
  });

  it('check: Random IP 45.33.32.1 → null (no match)', () => {
    expect(matcher.check('ip', '45.33.32.1')).toBeNull();
  });

  it('check: *.cloudflare.com hostname match (cdn.cloudflare.com)', () => {
    const result = matcher.check('domain', 'cdn.cloudflare.com');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Known CDN domains');
    expect(result!.matchType).toBe('hostname');
  });

  it('check: google.com → match (known safe domain)', () => {
    const result = matcher.check('domain', 'google.com');
    expect(result).not.toBeNull();
    expect(result!.category).toBe('false_positive');
  });

  it('check: malicious-domain.com → null', () => {
    expect(matcher.check('domain', 'malicious-domain.com')).toBeNull();
  });

  it('check: Private IP 192.168.1.1 → match (RFC1918)', () => {
    const result = matcher.check('ip', '192.168.1.1');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('RFC1918 private IPs');
    expect(result!.matchType).toBe('cidr');
  });

  it('check: Private IP 10.0.0.5 → match (RFC1918)', () => {
    const result = matcher.check('ip', '10.0.0.5');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('RFC1918 private IPs');
  });

  it('check: case-insensitive domain match (Google.com → match)', () => {
    const result = matcher.check('domain', 'Google.com');
    expect(result).not.toBeNull();
  });

  it('checkBatch: mixed IOCs → correct matches map', () => {
    const iocs = [
      { type: 'ip', value: '8.8.8.8' },
      { type: 'domain', value: 'evil.com' },
      { type: 'ip', value: '192.168.0.1' },
    ];
    const results = matcher.checkBatch(iocs);
    expect(results.size).toBe(3);
    expect(results.get('8.8.8.8')).not.toBeNull();
    expect(results.get('evil.com')).toBeNull();
    expect(results.get('192.168.0.1')).not.toBeNull();
  });

  it('loadCustom: appends to existing lists', () => {
    const custom: WarninglistEntry = {
      name: 'My Custom List',
      type: 'string',
      category: 'false_positive',
      values: ['custom-safe.example.com'],
    };
    matcher.loadCustom([custom]);
    expect(matcher.getMatchedListNames()).toHaveLength(6);
    expect(matcher.check('domain', 'custom-safe.example.com')).not.toBeNull();
  });

  it('check: regex type matches', () => {
    const regexMatcher = new WarninglistMatcher();
    regexMatcher.loadCustom([{
      name: 'Test regex',
      type: 'regex',
      category: 'false_positive',
      values: ['^test-.*\\.example\\.com$'],
    }]);
    expect(regexMatcher.check('domain', 'test-foo.example.com')).not.toBeNull();
    expect(regexMatcher.check('domain', 'real-threat.example.com')).toBeNull();
  });

  it('check: bare hostname match (cloudflare.com matches *.cloudflare.com)', () => {
    const result = matcher.check('domain', 'cloudflare.com');
    // Should match either CDN domains or safe domains
    expect(result).not.toBeNull();
  });
});

describe('isIpInCidr', () => {
  it('8.8.8.1 in 8.8.8.0/24 → true', () => {
    expect(isIpInCidr('8.8.8.1', '8.8.8.0/24')).toBe(true);
  });

  it('8.8.9.1 in 8.8.8.0/24 → false', () => {
    expect(isIpInCidr('8.8.9.1', '8.8.8.0/24')).toBe(false);
  });

  it('10.5.3.2 in 10.0.0.0/8 → true', () => {
    expect(isIpInCidr('10.5.3.2', '10.0.0.0/8')).toBe(true);
  });

  it('172.16.5.1 in 172.16.0.0/16 → true', () => {
    expect(isIpInCidr('172.16.5.1', '172.16.0.0/16')).toBe(true);
  });

  it('172.17.0.1 in 172.16.0.0/16 → false', () => {
    expect(isIpInCidr('172.17.0.1', '172.16.0.0/16')).toBe(false);
  });

  it('returns false for invalid CIDR', () => {
    expect(isIpInCidr('1.2.3.4', 'not-a-cidr')).toBe(false);
  });

  it('returns false for unsupported prefix length', () => {
    expect(isIpInCidr('1.2.3.4', '1.2.0.0/12')).toBe(false);
  });
});
