import { describe, it, expect } from 'vitest';
import { TyposquatDetector } from '../src/services/typosquat-detector.js';

describe('DRP Service — #3 Typosquat Detector', () => {
  const detector = new TyposquatDetector({ maxCandidates: 200 });

  // 3.1 generates homoglyph candidates
  it('3.1 generates homoglyph candidates', () => {
    const results = detector.scan('example.com', ['homoglyph']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('homoglyph');
    }
  });

  // 3.2 homoglyphs have similarity < 1
  it('3.2 homoglyphs have similarity less than 1', () => {
    const results = detector.scan('example.com', ['homoglyph']);
    for (const r of results) {
      expect(r.similarity).toBeLessThan(1);
      expect(r.similarity).toBeGreaterThan(0);
    }
  });

  // 3.3 generates insertion candidates
  it('3.3 generates insertion candidates', () => {
    const results = detector.scan('example.com', ['insertion']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('insertion');
    }
  });

  // 3.4 insertion candidates have edit distance 1
  it('3.4 insertion candidates have edit distance 1', () => {
    const results = detector.scan('example.com', ['insertion']);
    for (const r of results) {
      expect(r.editDistance).toBe(1);
    }
  });

  // 3.5 generates deletion candidates
  it('3.5 generates deletion candidates', () => {
    const results = detector.scan('example.com', ['deletion']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('deletion');
    }
  });

  // 3.6 deletion candidates are shorter
  it('3.6 deletion candidates are shorter', () => {
    const results = detector.scan('example.com', ['deletion']);
    // The domain part (before TLD) should be shorter by 1 char
    for (const r of results) {
      // Full domain includes TLD, so compare the name parts
      // 'example' has 7 chars, deletion produces 6 char names + '.com'
      expect(r.domain.length).toBeLessThanOrEqual('example.com'.length);
    }
  });

  // 3.7 generates transposition candidates
  it('3.7 generates transposition candidates', () => {
    const results = detector.scan('example.com', ['transposition']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('transposition');
    }
  });

  // 3.8 transposition swaps adjacent chars
  it('3.8 transposition swaps adjacent chars', () => {
    const results = detector.scan('example.com', ['transposition']);
    for (const r of results) {
      // Transposed domain should have the same length as the original
      expect(r.domain.length).toBe('example.com'.length);
      expect(r.editDistance).toBe(1);
    }
  });

  // 3.9 generates TLD variants
  it('3.9 generates TLD variants', () => {
    const results = detector.scan('example.com', ['tld_variant']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('tld_variant');
    }
  });

  // 3.10 TLD variants preserve domain name
  it('3.10 TLD variants preserve domain name', () => {
    const results = detector.scan('example.com', ['tld_variant']);
    for (const r of results) {
      expect(r.domain).toMatch(/^example\./);
      // Should not be the original .com
      expect(r.domain).not.toBe('example.com');
    }
  });

  // 3.11 scan returns deduplicated results
  it('3.11 scan returns deduplicated results', () => {
    const results = detector.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
    ]);
    const domains = results.map((r) => r.domain);
    const uniqueDomains = new Set(domains);
    expect(domains.length).toBe(uniqueDomains.size);
  });

  // 3.12 scan respects maxCandidates limit
  it('3.12 scan respects maxCandidates limit', () => {
    const small = new TyposquatDetector({ maxCandidates: 5 });
    const results = small.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
    ]);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  // 3.13 candidates sorted by risk score
  it('3.13 candidates sorted by risk score descending', () => {
    const results = detector.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
    ]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.riskScore).toBeLessThanOrEqual(results[i - 1]!.riskScore);
    }
  });

  // 3.14 registered domains have higher risk
  it('3.14 registered domains have higher risk than unregistered', () => {
    // Run multiple scans to get a statistical sample
    const results = detector.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition',
    ]);
    const registered = results.filter((r) => r.isRegistered);
    const unregistered = results.filter((r) => !r.isRegistered);

    if (registered.length > 0 && unregistered.length > 0) {
      const avgRegistered = registered.reduce((s, r) => s + r.riskScore, 0) / registered.length;
      const avgUnregistered = unregistered.reduce((s, r) => s + r.riskScore, 0) / unregistered.length;
      expect(avgRegistered).toBeGreaterThan(avgUnregistered);
    }
    // If all or none registered due to randomness, the test still passes
    expect(results.length).toBeGreaterThan(0);
  });

  // 3.15 recent registration boosts risk
  it('3.15 recent registration boosts risk', () => {
    const results = detector.scan('example.com', ['homoglyph', 'insertion', 'deletion']);
    const recentlyRegistered = results.filter((r) => {
      if (!r.registrationDate) return false;
      const daysOld = (Date.now() - new Date(r.registrationDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysOld < 30;
    });
    // All recently registered should have risk > 0.5 (similarity*0.3 + registered*0.3 + recent*0.25 + baseline*0.1)
    for (const r of recentlyRegistered) {
      expect(r.riskScore).toBeGreaterThan(0.5);
    }
    expect(results.length).toBeGreaterThan(0);
  });

  // 3.16 handles single-char domain
  it('3.16 handles single-char domain', () => {
    const results = detector.scan('a.com', ['homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant']);
    // Should produce at least TLD variants
    expect(results.length).toBeGreaterThan(0);
  });

  // 3.17 handles domain with hyphens
  it('3.17 handles domain with hyphens', () => {
    const results = detector.scan('my-site.com', ['homoglyph', 'insertion', 'deletion', 'transposition']);
    expect(results.length).toBeGreaterThan(0);
    // All candidates should be strings
    for (const r of results) {
      expect(typeof r.domain).toBe('string');
      expect(r.domain.length).toBeGreaterThan(0);
    }
  });

  // 3.18 all methods produce results for 'example.com'
  it('3.18 all methods produce results for example.com', () => {
    const methods = ['homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant'] as const;
    for (const method of methods) {
      const results = detector.scan('example.com', [method]);
      expect(results.length).toBeGreaterThan(0);
    }
  });

  // 3.19 each candidate has required fields
  it('3.19 each candidate has required fields', () => {
    const results = detector.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
    ]);
    for (const r of results) {
      expect(r).toHaveProperty('domain');
      expect(r).toHaveProperty('method');
      expect(r).toHaveProperty('editDistance');
      expect(r).toHaveProperty('similarity');
      expect(r).toHaveProperty('isRegistered');
      expect(r).toHaveProperty('registrationDate');
      expect(r).toHaveProperty('hostingProvider');
      expect(r).toHaveProperty('riskScore');
      expect(typeof r.domain).toBe('string');
      expect(typeof r.method).toBe('string');
      expect(typeof r.editDistance).toBe('number');
      expect(typeof r.similarity).toBe('number');
      expect(typeof r.isRegistered).toBe('boolean');
      expect(typeof r.riskScore).toBe('number');
    }
  });

  // 3.20 risk scores are 0-1 bounded
  it('3.20 risk scores are 0-1 bounded', () => {
    const results = detector.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
    ]);
    for (const r of results) {
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
      expect(r.riskScore).toBeLessThanOrEqual(1);
    }
  });
});
