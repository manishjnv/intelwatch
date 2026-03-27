import { describe, it, expect } from 'vitest';
import {
  computeFuzzyHash,
  areFuzzyDuplicates,
  fuzzyNormalizeIocValue,
  stripDefang,
  stripPort,
  fuzzyNormalizeUrl,
} from '../src/index.js';

describe('computeFuzzyHash', () => {
  it('same value produces same hash', () => {
    const h1 = computeFuzzyHash('domain', 'evil.com');
    const h2 = computeFuzzyHash('domain', 'evil.com');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA256 hex
  });

  it('defanged vs clean domain produce same hash', () => {
    const h1 = computeFuzzyHash('domain', 'evil[.]com');
    const h2 = computeFuzzyHash('domain', 'evil.com');
    expect(h1).toBe(h2);
  });

  it('IP with port vs without produce same hash', () => {
    const h1 = computeFuzzyHash('ip', '192.168.1.1:8080');
    const h2 = computeFuzzyHash('ip', '192.168.1.1');
    expect(h1).toBe(h2);
  });

  it('IP with leading zeros vs without produce same hash', () => {
    const h1 = computeFuzzyHash('ip', '192.168.001.001');
    const h2 = computeFuzzyHash('ip', '192.168.1.1');
    expect(h1).toBe(h2);
  });

  it('URL with/without trailing slash produce same hash', () => {
    const h1 = computeFuzzyHash('url', 'http://example.com/path/');
    const h2 = computeFuzzyHash('url', 'http://example.com/path');
    expect(h1).toBe(h2);
  });

  it('URL with/without utm params produce same hash', () => {
    const h1 = computeFuzzyHash('url', 'http://example.com/page?utm_source=twitter&id=1');
    const h2 = computeFuzzyHash('url', 'http://example.com/page?id=1');
    expect(h1).toBe(h2);
  });

  it('hash uppercase vs lowercase produce same hash', () => {
    const md5 = 'd41d8cd98f00b204e9800998ecf8427e';
    const h1 = computeFuzzyHash('hash_md5', md5);
    const h2 = computeFuzzyHash('hash_md5', md5.toUpperCase());
    expect(h1).toBe(h2);
  });

  it('CVE case variants produce same hash', () => {
    const h1 = computeFuzzyHash('cve', 'CVE-2021-44228');
    const h2 = computeFuzzyHash('cve', 'cve-2021-44228');
    expect(h1).toBe(h2);
  });

  it('CVE underscore separator normalized to dash', () => {
    const h1 = computeFuzzyHash('cve', 'CVE_2021_44228');
    const h2 = computeFuzzyHash('cve', 'CVE-2021-44228');
    expect(h1).toBe(h2);
  });

  it('email plus-addressing stripped produces same hash', () => {
    const h1 = computeFuzzyHash('email', 'user+tag@example.com');
    const h2 = computeFuzzyHash('email', 'user@example.com');
    expect(h1).toBe(h2);
  });

  it('different IPs produce different hashes', () => {
    const h1 = computeFuzzyHash('ip', '192.168.1.1');
    const h2 = computeFuzzyHash('ip', '10.0.0.1');
    expect(h1).not.toBe(h2);
  });

  it('different domains produce different hashes', () => {
    const h1 = computeFuzzyHash('domain', 'evil.com');
    const h2 = computeFuzzyHash('domain', 'good.com');
    expect(h1).not.toBe(h2);
  });
});

describe('areFuzzyDuplicates', () => {
  it('evil[.]com vs evil.com → true', () => {
    expect(areFuzzyDuplicates('domain', 'evil[.]com', 'evil.com')).toBe(true);
  });

  it('evil.com vs good.com → false', () => {
    expect(areFuzzyDuplicates('domain', 'evil.com', 'good.com')).toBe(false);
  });
});

describe('fuzzyNormalizeIocValue', () => {
  it('returns canonical form for display', () => {
    expect(fuzzyNormalizeIocValue('domain', 'evil[.]com')).toBe('evil.com');
    expect(fuzzyNormalizeIocValue('ip', '192.168.001.001:8080')).toBe('192.168.1.1');
    expect(fuzzyNormalizeIocValue('email', 'User+tag@Example.COM')).toBe('user@example.com');
    expect(fuzzyNormalizeIocValue('cve', 'cve_2021_44228')).toBe('CVE-2021-44228');
  });
});

describe('stripDefang', () => {
  it('handles all defang variants', () => {
    expect(stripDefang('hxxp://evil[.]com/path')).toBe('http://evil.com/path');
    expect(stripDefang('hxxps://evil(.)com')).toBe('https://evil.com');
    expect(stripDefang('evil{.}com')).toBe('evil.com');
    expect(stripDefang('user[@]evil.com')).toBe('user@evil.com');
    expect(stripDefang('hxxp[://]evil.com')).toBe('http://evil.com');
  });

  it('clean value passes through unchanged', () => {
    expect(stripDefang('http://example.com')).toBe('http://example.com');
    expect(stripDefang('192.168.1.1')).toBe('192.168.1.1');
  });
});

describe('stripPort', () => {
  it('IPv4 with port → stripped', () => {
    expect(stripPort('192.168.1.1:8080')).toBe('192.168.1.1');
    expect(stripPort('10.0.0.1:443')).toBe('10.0.0.1');
  });

  it('IPv4 without port → unchanged', () => {
    expect(stripPort('192.168.1.1')).toBe('192.168.1.1');
  });

  it('IPv6 in brackets with port → stripped', () => {
    expect(stripPort('[::1]:8080')).toBe('::1');
  });
});

describe('fuzzyNormalizeUrl', () => {
  it('full normalization chain applied', () => {
    const result = fuzzyNormalizeUrl('hxxp://EVIL[.]COM/path/?utm_source=x#frag');
    expect(result).toContain('http://evil.com/path');
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('#frag');
  });
});
