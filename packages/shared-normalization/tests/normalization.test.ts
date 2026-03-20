import { describe, it, expect } from 'vitest';
import {
  detectIOCType,
  normalizeIOCValue,
  calculateCompositeConfidence,
  CONFIDENCE_WEIGHTS,
  type IOCType,
} from '../src/index.js';

// ── IOC Type Detection ──────────────────────────────────────────────

describe('detectIOCType', () => {
  it('detects IPv4 addresses', () => {
    expect(detectIOCType('192.168.1.1')).toBe('ip');
    expect(detectIOCType('8.8.8.8')).toBe('ip');
    expect(detectIOCType('255.255.255.255')).toBe('ip');
  });

  it('detects defanged IPv4 addresses', () => {
    expect(detectIOCType('192[.]168[.]1[.]1')).toBe('ip');
    expect(detectIOCType('10(.)0(.)0(.)1')).toBe('ip');
  });

  it('detects IPv6 addresses', () => {
    expect(detectIOCType('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('ip');
    expect(detectIOCType('::1')).toBe('ip');
  });

  it('detects domains', () => {
    expect(detectIOCType('example.com')).toBe('domain');
    expect(detectIOCType('sub.domain.example.co.uk')).toBe('domain');
    expect(detectIOCType('malware-c2.evil.org')).toBe('domain');
  });

  it('detects defanged domains', () => {
    expect(detectIOCType('example[.]com')).toBe('domain');
    expect(detectIOCType('evil(.)org')).toBe('domain');
  });

  it('detects MD5 hashes', () => {
    expect(detectIOCType('d41d8cd98f00b204e9800998ecf8427e')).toBe('hash_md5');
  });

  it('detects SHA-1 hashes', () => {
    expect(detectIOCType('da39a3ee5e6b4b0d3255bfef95601890afd80709')).toBe('hash_sha1');
  });

  it('detects SHA-256 hashes', () => {
    expect(detectIOCType('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('hash_sha256');
  });

  it('detects hashes with 0x prefix', () => {
    expect(detectIOCType('0xd41d8cd98f00b204e9800998ecf8427e')).toBe('hash_md5');
    expect(detectIOCType('0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('hash_sha256');
  });

  it('detects URLs', () => {
    expect(detectIOCType('https://malware.evil.com/payload.exe')).toBe('url');
    expect(detectIOCType('http://192.168.1.1:8080/c2')).toBe('url');
  });

  it('detects defanged URLs', () => {
    expect(detectIOCType('hxxps[:]//malware.evil.com/payload')).toBe('url');
    expect(detectIOCType('hxxp://evil.com')).toBe('url');
  });

  it('detects email addresses', () => {
    expect(detectIOCType('attacker@evil.com')).toBe('email');
    expect(detectIOCType('phishing@bank-secure.co.uk')).toBe('email');
  });

  it('detects CVE identifiers', () => {
    expect(detectIOCType('CVE-2024-1234')).toBe('cve');
    expect(detectIOCType('cve-2023-44487')).toBe('cve');
    expect(detectIOCType('CVE-2021-44228')).toBe('cve');
  });

  it('returns unknown for empty or unrecognized strings', () => {
    expect(detectIOCType('')).toBe('unknown');
    expect(detectIOCType('  ')).toBe('unknown');
    expect(detectIOCType('random text')).toBe('unknown');
    expect(detectIOCType('12345')).toBe('unknown');
  });
});

// ── IOC Value Normalization ─────────────────────────────────────────

describe('normalizeIOCValue', () => {
  it('refangs defanged IP addresses', () => {
    expect(normalizeIOCValue('192[.]168[.]1[.]1', 'ip')).toBe('192.168.1.1');
    expect(normalizeIOCValue('10(.)0(.)0(.)1', 'ip')).toBe('10.0.0.1');
  });

  it('lowercases and refangs domains', () => {
    expect(normalizeIOCValue('EXAMPLE[.]COM', 'domain')).toBe('example.com');
    expect(normalizeIOCValue('Evil(.)ORG.', 'domain')).toBe('evil.org');
  });

  it('strips trailing dot from domains', () => {
    expect(normalizeIOCValue('example.com.', 'domain')).toBe('example.com');
  });

  it('lowercases and strips 0x prefix from hashes', () => {
    expect(normalizeIOCValue('0xD41D8CD98F00B204E9800998ECF8427E', 'hash_md5'))
      .toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(normalizeIOCValue('E3B0C44298FC1C149AFBF4C8996FB924', 'hash_sha1'))
      .toBe('e3b0c44298fc1c149afbf4c8996fb924');
  });

  it('refangs defanged URLs', () => {
    expect(normalizeIOCValue('hxxps[:]//evil[.]com/payload', 'url'))
      .toBe('https://evil.com/payload');
    expect(normalizeIOCValue('hxxp://evil(.)com', 'url'))
      .toBe('http://evil.com');
  });

  it('lowercases email addresses', () => {
    expect(normalizeIOCValue('Attacker@Evil.COM', 'email')).toBe('attacker@evil.com');
  });

  it('uppercases CVE identifiers', () => {
    expect(normalizeIOCValue('cve-2024-1234', 'cve')).toBe('CVE-2024-1234');
  });

  it('returns trimmed value for unknown type', () => {
    expect(normalizeIOCValue('  some value  ', 'unknown')).toBe('some value');
  });

  it('handles empty string gracefully', () => {
    expect(normalizeIOCValue('', 'ip')).toBe('');
    expect(normalizeIOCValue('  ', 'domain')).toBe('');
  });
});

// ── Composite Confidence Scoring ────────────────────────────────────

describe('calculateCompositeConfidence', () => {
  it('calculates weighted score with no decay (0 days)', () => {
    const result = calculateCompositeConfidence(
      { feedReliability: 80, corroboration: 60, aiScore: 90, communityVotes: 70 },
      0,
    );
    // 0.30*80 + 0.25*60 + 0.25*90 + 0.20*70 = 24 + 15 + 22.5 + 14 = 75.5 → 76
    expect(result.score).toBe(76);
    expect(result.decayFactor).toBe(1);
    expect(result.daysSinceLastSeen).toBe(0);
  });

  it('applies exponential time decay', () => {
    const result = calculateCompositeConfidence(
      { feedReliability: 100, corroboration: 100, aiScore: 100, communityVotes: 100 },
      69, // ~half-life
    );
    // Raw = 100, decay = e^(-0.69) ≈ 0.501
    expect(result.score).toBeLessThan(55);
    expect(result.score).toBeGreaterThan(45);
    expect(result.decayFactor).toBeLessThan(0.55);
  });

  it('returns 0 score for all-zero signals', () => {
    const result = calculateCompositeConfidence(
      { feedReliability: 0, corroboration: 0, aiScore: 0, communityVotes: 0 },
      0,
    );
    expect(result.score).toBe(0);
  });

  it('clamps score to 0-100 range', () => {
    const result = calculateCompositeConfidence(
      { feedReliability: 100, corroboration: 100, aiScore: 100, communityVotes: 100 },
      0,
    );
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('treats negative daysSinceLastSeen as 0', () => {
    const result = calculateCompositeConfidence(
      { feedReliability: 80, corroboration: 80, aiScore: 80, communityVotes: 80 },
      -5,
    );
    expect(result.decayFactor).toBe(1);
  });

  it('rejects out-of-range signal values', () => {
    expect(() =>
      calculateCompositeConfidence(
        { feedReliability: 150, corroboration: 80, aiScore: 80, communityVotes: 80 },
        0,
      ),
    ).toThrow();
  });

  it('CONFIDENCE_WEIGHTS sum to 1.0', () => {
    const sum = Object.values(CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
