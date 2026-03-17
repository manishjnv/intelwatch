import { describe, it, expect } from 'vitest';
import { detectIOCType, normalizeIOCValue, calculateCompositeConfidence, CONFIDENCE_WEIGHTS } from '../src/index.js';

describe('detectIOCType', () => {
  it('detects IPv4', () => { expect(detectIOCType('192.168.1.1')).toBe('ip'); expect(detectIOCType('8.8.8.8')).toBe('ip'); });
  it('detects defanged IPv4', () => { expect(detectIOCType('192[.]168[.]1[.]1')).toBe('ip'); });
  it('detects IPv6', () => { expect(detectIOCType('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('ip'); expect(detectIOCType('::1')).toBe('ip'); });
  it('detects domains', () => { expect(detectIOCType('example.com')).toBe('domain'); expect(detectIOCType('sub.domain.co.uk')).toBe('domain'); });
  it('detects defanged domains', () => { expect(detectIOCType('example[.]com')).toBe('domain'); });
  it('detects MD5', () => { expect(detectIOCType('d41d8cd98f00b204e9800998ecf8427e')).toBe('hash_md5'); });
  it('detects SHA-1', () => { expect(detectIOCType('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('hash_sha1'); });
  it('detects SHA-256', () => { expect(detectIOCType('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('hash_sha256'); });
  it('detects hashes with 0x prefix', () => { expect(detectIOCType('0xd41d8cd98f00b204e9800998ecf8427e')).toBe('hash_md5'); });
  it('detects URLs', () => { expect(detectIOCType('https://evil.com/payload')).toBe('url'); });
  it('detects defanged URLs', () => { expect(detectIOCType('hxxps[:]//evil.com')).toBe('url'); });
  it('detects emails', () => { expect(detectIOCType('attacker@evil.com')).toBe('email'); });
  it('detects CVEs', () => { expect(detectIOCType('CVE-2024-1234')).toBe('cve'); expect(detectIOCType('cve-2023-44487')).toBe('cve'); });
  it('returns unknown for empty/unrecognized', () => { expect(detectIOCType('')).toBe('unknown'); expect(detectIOCType('random text')).toBe('unknown'); });
});

describe('normalizeIOCValue', () => {
  it('refangs IPs', () => { expect(normalizeIOCValue('192[.]168[.]1[.]1', 'ip')).toBe('192.168.1.1'); });
  it('lowercases+refangs domains', () => { expect(normalizeIOCValue('EXAMPLE[.]COM', 'domain')).toBe('example.com'); });
  it('strips trailing dot', () => { expect(normalizeIOCValue('example.com.', 'domain')).toBe('example.com'); });
  it('strips 0x+lowercases hashes', () => { expect(normalizeIOCValue('0xD41D8CD98F00B204E9800998ECF8427E', 'hash_md5')).toBe('d41d8cd98f00b204e9800998ecf8427e'); });
  it('refangs URLs', () => { expect(normalizeIOCValue('hxxps[:]//evil[.]com', 'url')).toBe('https://evil.com'); });
  it('lowercases emails', () => { expect(normalizeIOCValue('Attacker@Evil.COM', 'email')).toBe('attacker@evil.com'); });
  it('uppercases CVEs', () => { expect(normalizeIOCValue('cve-2024-1234', 'cve')).toBe('CVE-2024-1234'); });
  it('handles empty string', () => { expect(normalizeIOCValue('', 'ip')).toBe(''); });
});

describe('calculateCompositeConfidence', () => {
  it('calculates weighted score with no decay', () => {
    const r = calculateCompositeConfidence({ feedReliability: 80, corroboration: 60, aiScore: 90, communityVotes: 70 }, 0);
    expect(r.score).toBe(76); expect(r.decayFactor).toBe(1);
  });
  it('applies time decay', () => {
    const r = calculateCompositeConfidence({ feedReliability: 100, corroboration: 100, aiScore: 100, communityVotes: 100 }, 69);
    expect(r.score).toBeLessThan(55); expect(r.score).toBeGreaterThan(45);
  });
  it('returns 0 for all-zero signals', () => { expect(calculateCompositeConfidence({ feedReliability: 0, corroboration: 0, aiScore: 0, communityVotes: 0 }, 0).score).toBe(0); });
  it('clamps to 0-100', () => { expect(calculateCompositeConfidence({ feedReliability: 100, corroboration: 100, aiScore: 100, communityVotes: 100 }, 0).score).toBeLessThanOrEqual(100); });
  it('rejects out-of-range signals', () => { expect(() => calculateCompositeConfidence({ feedReliability: 150, corroboration: 80, aiScore: 80, communityVotes: 80 }, 0)).toThrow(); });
  it('CONFIDENCE_WEIGHTS sum to 1.0', () => { expect(Object.values(CONFIDENCE_WEIGHTS).reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1.0); });
});
