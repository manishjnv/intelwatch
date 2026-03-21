import { describe, it, expect } from 'vitest';
import {
  isBogonIP,
  isIPv6Bogon,
  isSafeDomain,
  isSafeURL,
  isPlaceholderHash,
  applyQualityFilters,
} from '../src/filters.js';

describe('isBogonIP', () => {
  it('filters RFC 1918 private ranges', () => {
    expect(isBogonIP('10.0.0.1')).toBe(true);
    expect(isBogonIP('10.255.255.255')).toBe(true);
    expect(isBogonIP('172.16.0.1')).toBe(true);
    expect(isBogonIP('172.31.255.255')).toBe(true);
    expect(isBogonIP('192.168.0.1')).toBe(true);
    expect(isBogonIP('192.168.255.255')).toBe(true);
  });

  it('filters loopback', () => {
    expect(isBogonIP('127.0.0.1')).toBe(true);
    expect(isBogonIP('127.255.255.255')).toBe(true);
  });

  it('filters link-local', () => {
    expect(isBogonIP('169.254.0.1')).toBe(true);
  });

  it('filters CGNAT (RFC 6598)', () => {
    expect(isBogonIP('100.64.0.1')).toBe(true);
    expect(isBogonIP('100.127.255.255')).toBe(true);
  });

  it('filters documentation ranges (RFC 5737)', () => {
    expect(isBogonIP('192.0.2.1')).toBe(true);
    expect(isBogonIP('198.51.100.1')).toBe(true);
    expect(isBogonIP('203.0.113.1')).toBe(true);
  });

  it('filters multicast and reserved', () => {
    expect(isBogonIP('224.0.0.1')).toBe(true);
    expect(isBogonIP('240.0.0.1')).toBe(true);
    expect(isBogonIP('255.255.255.255')).toBe(true);
  });

  it('allows legitimate public IPs', () => {
    expect(isBogonIP('8.8.8.8')).toBe(false);
    expect(isBogonIP('1.1.1.1')).toBe(false);
    expect(isBogonIP('185.199.108.1')).toBe(false);
    expect(isBogonIP('93.184.216.34')).toBe(false);
  });

  it('filters 0.0.0.0/8', () => {
    expect(isBogonIP('0.0.0.0')).toBe(true);
    expect(isBogonIP('0.1.2.3')).toBe(true);
  });

  it('handles invalid input gracefully', () => {
    expect(isBogonIP('not-an-ip')).toBe(false);
    expect(isBogonIP('999.999.999.999')).toBe(false);
    expect(isBogonIP('')).toBe(false);
  });
});

describe('isSafeDomain', () => {
  it('filters known safe domains', () => {
    expect(isSafeDomain('google.com')).toBe(true);
    expect(isSafeDomain('github.com')).toBe(true);
    expect(isSafeDomain('virustotal.com')).toBe(true);
    expect(isSafeDomain('mitre.org')).toBe(true);
    expect(isSafeDomain('example.com')).toBe(true);
  });

  it('filters subdomains of safe domains', () => {
    expect(isSafeDomain('mail.google.com')).toBe(true);
    expect(isSafeDomain('api.github.com')).toBe(true);
    expect(isSafeDomain('attack.mitre.org')).toBe(true);
  });

  it('allows unknown domains', () => {
    expect(isSafeDomain('evil-malware.xyz')).toBe(false);
    expect(isSafeDomain('c2-server.ru')).toBe(false);
    expect(isSafeDomain('dropper.cc')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSafeDomain('GOOGLE.COM')).toBe(true);
    expect(isSafeDomain('GitHub.Com')).toBe(true);
  });

  it('handles trailing dot', () => {
    expect(isSafeDomain('google.com.')).toBe(true);
  });
});

describe('isSafeURL', () => {
  it('filters URLs with safe domains', () => {
    expect(isSafeURL('https://google.com/search')).toBe(true);
    expect(isSafeURL('https://github.com/repo')).toBe(true);
  });

  it('allows URLs with unknown domains', () => {
    expect(isSafeURL('https://evil.xyz/payload.exe')).toBe(false);
  });

  it('handles invalid URLs gracefully', () => {
    expect(isSafeURL('not-a-url')).toBe(false);
  });
});

describe('isPlaceholderHash', () => {
  it('filters all-zero hashes', () => {
    expect(isPlaceholderHash('0'.repeat(32))).toBe(true);
    expect(isPlaceholderHash('0'.repeat(64))).toBe(true);
  });

  it('filters all-F hashes', () => {
    expect(isPlaceholderHash('f'.repeat(32))).toBe(true);
    expect(isPlaceholderHash('F'.repeat(64))).toBe(true);
  });

  it('filters empty-string hashes', () => {
    expect(isPlaceholderHash('d41d8cd98f00b204e9800998ecf8427e')).toBe(true); // MD5("")
    expect(isPlaceholderHash('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe(true); // SHA1("")
    expect(isPlaceholderHash('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(true); // SHA256("")
  });

  it('allows real hashes', () => {
    expect(isPlaceholderHash('5d41402abc4b2a76b9719d911017c592')).toBe(false);
    expect(isPlaceholderHash('a94a8fe5ccb19ba61c4c0873d391e987982fbbd3')).toBe(false);
  });
});

describe('applyQualityFilters', () => {
  it('filters bogon IPs', () => {
    const result = applyQualityFilters('192.168.1.1', 'ip');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('bogon_ip');
  });

  it('allows public IPs', () => {
    expect(applyQualityFilters('8.8.8.8', 'ip').passed).toBe(true);
  });

  it('filters safe domains', () => {
    const result = applyQualityFilters('google.com', 'domain');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('safe_domain');
  });

  it('filters safe URLs', () => {
    const result = applyQualityFilters('https://github.com/repo', 'url');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('safe_url');
  });

  it('filters placeholder hashes', () => {
    const result = applyQualityFilters('0'.repeat(32), 'hash_md5');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('placeholder_hash');
  });

  it('filters safe email domains', () => {
    const result = applyQualityFilters('user@gmail.com', 'email');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('safe_email_domain');
  });

  it('allows malicious email domains', () => {
    expect(applyQualityFilters('admin@evil-c2.xyz', 'email').passed).toBe(true);
  });

  it('passes CVEs through without filtering', () => {
    expect(applyQualityFilters('CVE-2024-12345', 'cve').passed).toBe(true);
  });

  it('allows suspicious domains', () => {
    expect(applyQualityFilters('malware-drop.xyz', 'domain').passed).toBe(true);
  });

  it('filters bogon IPv6 addresses', () => {
    const result = applyQualityFilters('::1', 'ipv6');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('bogon_ipv6');
  });

  it('allows public IPv6 addresses', () => {
    expect(applyQualityFilters('2607:f8b0:4004:800::200e', 'ipv6').passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Improvement A2: IPv6 bogon filters
// ═══════════════════════════════════════════════════════════════════

describe('isIPv6Bogon', () => {
  it('filters loopback ::1', () => {
    expect(isIPv6Bogon('::1')).toBe(true);
  });

  it('filters unspecified ::', () => {
    expect(isIPv6Bogon('::')).toBe(true);
  });

  it('filters link-local fe80::', () => {
    expect(isIPv6Bogon('fe80::1')).toBe(true);
    expect(isIPv6Bogon('fe80::1234:5678:abcd:ef01')).toBe(true);
  });

  it('filters unique-local fc00::/fd00::', () => {
    expect(isIPv6Bogon('fc00::1')).toBe(true);
    expect(isIPv6Bogon('fd12:3456::1')).toBe(true);
  });

  it('filters documentation 2001:db8::', () => {
    expect(isIPv6Bogon('2001:db8::1')).toBe(true);
    expect(isIPv6Bogon('2001:db8:1234::1')).toBe(true);
  });

  it('filters multicast ff00::', () => {
    expect(isIPv6Bogon('ff02::1')).toBe(true);
    expect(isIPv6Bogon('ff05::2')).toBe(true);
  });

  it('filters IPv4-mapped ::ffff:', () => {
    expect(isIPv6Bogon('::ffff:192.168.1.1')).toBe(true);
  });

  it('allows public IPv6 addresses', () => {
    expect(isIPv6Bogon('2607:f8b0:4004:800::200e')).toBe(false); // Google
    expect(isIPv6Bogon('2001:4860:4860::8888')).toBe(false); // Google DNS
    expect(isIPv6Bogon('2606:4700::1111')).toBe(false); // Cloudflare
  });

  it('is case-insensitive', () => {
    expect(isIPv6Bogon('FE80::1')).toBe(true);
    expect(isIPv6Bogon('2001:DB8::1')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Improvement C5: Partial defang URL filter safety
// ═══════════════════════════════════════════════════════════════════

describe('isSafeURL — partial defang handling', () => {
  it('handles fully defanged URLs', () => {
    expect(isSafeURL('hxxps[:]//google[.]com/search')).toBe(true);
  });

  it('handles standard URLs', () => {
    expect(isSafeURL('https://google.com/search')).toBe(true);
    expect(isSafeURL('https://evil-c2.xyz/payload')).toBe(false);
  });

  it('returns false for non-URL strings', () => {
    expect(isSafeURL('not-a-url')).toBe(false);
  });
});
