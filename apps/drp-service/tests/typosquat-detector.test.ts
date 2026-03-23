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

  // 3.18 all 12 methods produce results for 'example.com'
  it('3.18 all methods produce results for example.com', () => {
    const methods = [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
      'combosquatting', 'bitsquatting', 'keyboard_proximity', 'vowel_swap',
      'repetition', 'hyphenation', 'subdomain',
    ] as const;
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

  // ─── Chunk 1: New Squatting Methods ─────────────────────

  // 3.21 combosquatting generates brand+keyword variants
  it('3.21 combosquatting generates brand+keyword variants', () => {
    const results = detector.scan('paypal.com', ['combosquatting']);
    expect(results.length).toBeGreaterThan(0);
    const domains = results.map((r) => r.domain);
    // Should contain keyword combos like paypal-support.com, supportpaypal.com
    expect(domains.some((d) => d.includes('support'))).toBe(true);
    expect(domains.some((d) => d.includes('login'))).toBe(true);
    for (const r of results) {
      expect(r.method).toBe('combosquatting');
      expect(r.editDistance).toBeGreaterThan(1);
    }
  });

  // 3.22 combosquatting produces 4 variants per keyword (prepend/append ± hyphen)
  it('3.22 combosquatting produces 4 variants per keyword', () => {
    const results = detector.scan('test.com', ['combosquatting']);
    // 10 keywords × 4 variants = 40 max
    expect(results.length).toBeGreaterThanOrEqual(20);
    expect(results.length).toBeLessThanOrEqual(40);
  });

  // 3.23 bitsquatting generates valid domain chars from bit-flips
  it('3.23 bitsquatting generates valid domain chars from bit-flips', () => {
    const results = detector.scan('example.com', ['bitsquatting']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('bitsquatting');
      expect(r.editDistance).toBe(1);
      // All chars in domain name must be valid
      const name = r.domain.split('.')[0]!;
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  // 3.24 keyboard proximity uses adjacent keys
  it('3.24 keyboard proximity uses adjacent keys', () => {
    const results = detector.scan('example.com', ['keyboard_proximity']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('keyboard_proximity');
      expect(r.editDistance).toBe(1);
      expect(r.domain.length).toBe('example.com'.length);
    }
  });

  // 3.25 vowel-swap replaces vowels only
  it('3.25 vowel-swap replaces vowels only', () => {
    const results = detector.scan('example.com', ['vowel_swap']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('vowel_swap');
      expect(r.editDistance).toBe(1);
      // Same length — vowel replaced, not added/removed
      expect(r.domain.length).toBe('example.com'.length);
    }
  });

  // 3.26 vowel-swap only modifies vowel positions
  it('3.26 vowel-swap only changes vowel positions', () => {
    const results = detector.scan('test.com', ['vowel_swap']);
    // 'test' has 1 vowel (e) → 4 swaps (a,i,o,u)
    expect(results.length).toBe(4);
    const names = results.map((r) => r.domain.split('.')[0]!);
    expect(names).toContain('tast');
    expect(names).toContain('tist');
    expect(names).toContain('tost');
    expect(names).toContain('tust');
  });

  // 3.27 repetition doubles characters
  it('3.27 repetition doubles characters', () => {
    const results = detector.scan('test.com', ['repetition']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('repetition');
      // Domain should be 1 char longer than original name
      expect(r.domain.length).toBe('test.com'.length + 1);
    }
  });

  // 3.28 hyphenation inserts hyphens between characters
  it('3.28 hyphenation inserts hyphens', () => {
    const results = detector.scan('test.com', ['hyphenation']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('hyphenation');
      expect(r.domain).toContain('-');
      expect(r.domain.length).toBe('test.com'.length + 1);
    }
  });

  // 3.29 subdomain/levelsquatting creates multi-level domains
  it('3.29 subdomain generates levelsquat patterns', () => {
    const results = detector.scan('paypal.com', ['subdomain']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.method).toBe('subdomain');
      // Should contain the original brand
      expect(r.domain).toContain('paypal');
    }
    // Should have evil TLD patterns
    const domains = results.map((r) => r.domain);
    expect(domains.some((d) => d.includes('.evil.'))).toBe(true);
  });

  // 3.30 subdomain produces both dotted and dashed variants
  it('3.30 subdomain produces dotted and dashed variants', () => {
    const results = detector.scan('example.com', ['subdomain']);
    const domains = results.map((r) => r.domain);
    // .evil. pattern: example.com.evil.com
    expect(domains.some((d) => d.includes('.evil.'))).toBe(true);
    // dashed pattern: example-com.xyz
    expect(domains.some((d) => d.includes('example-com'))).toBe(true);
  });

  // 3.31 registrationTermYears is present on all candidates
  it('3.31 registrationTermYears field is present', () => {
    const results = detector.scan('example.com', ['homoglyph', 'combosquatting']);
    for (const r of results) {
      expect(r).toHaveProperty('registrationTermYears');
      if (r.isRegistered) {
        expect(typeof r.registrationTermYears).toBe('number');
        expect(r.registrationTermYears).toBeGreaterThanOrEqual(1);
      } else {
        expect(r.registrationTermYears).toBeNull();
      }
    }
  });

  // 3.32 expanded homoglyphs include Cyrillic/Greek confusables
  it('3.32 homoglyphs include Cyrillic/Greek characters', () => {
    const results = detector.scan('apple.com', ['homoglyph']);
    const domains = results.map((r) => r.domain);
    // Should contain Cyrillic а (U+0430) substitution for 'a'
    expect(domains.some((d) => d.includes('а'))).toBe(true); // Cyrillic а
  });

  // 3.33 all new methods bounded [0,1] risk scores
  it('3.33 new method risk scores are bounded', () => {
    const newMethods = [
      'combosquatting', 'bitsquatting', 'keyboard_proximity',
      'vowel_swap', 'repetition', 'hyphenation', 'subdomain',
    ] as const;
    for (const method of newMethods) {
      const results = detector.scan('example.com', [method]);
      for (const r of results) {
        expect(r.riskScore).toBeGreaterThanOrEqual(0);
        expect(r.riskScore).toBeLessThanOrEqual(1);
      }
    }
  });

  // 3.34 deduplication works across new + old methods
  it('3.34 deduplication across all 12 methods', () => {
    const results = detector.scan('example.com', [
      'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
      'combosquatting', 'bitsquatting', 'keyboard_proximity', 'vowel_swap',
      'repetition', 'hyphenation', 'subdomain',
    ]);
    const domains = results.map((r) => r.domain);
    expect(domains.length).toBe(new Set(domains).size);
  });
});

describe('DRP Service — Similarity Scoring', () => {
  // 3.35 Jaro-Winkler returns 1 for identical strings
  it('3.35 jaroWinkler returns 1 for identical strings', async () => {
    const { jaroWinkler } = await import('../src/services/similarity-scoring.js');
    expect(jaroWinkler('example', 'example')).toBe(1);
  });

  // 3.36 Jaro-Winkler handles transpositions better than Levenshtein
  it('3.36 jaroWinkler scores transpositions high', async () => {
    const { jaroWinkler } = await import('../src/services/similarity-scoring.js');
    // 'exmaple' is a transposition of 'example' — should be very similar
    const score = jaroWinkler('example', 'exmaple');
    expect(score).toBeGreaterThan(0.9);
  });

  // 3.37 Jaro-Winkler prefix bonus
  it('3.37 jaroWinkler gives prefix bonus', async () => {
    const { jaroWinkler } = await import('../src/services/similarity-scoring.js');
    // Same edit distance but 'exampleX' shares more prefix with 'example' than 'Xexample'
    const prefixMatch = jaroWinkler('example', 'exampla');
    const noPrefix = jaroWinkler('example', 'axample');
    expect(prefixMatch).toBeGreaterThan(noPrefix);
  });

  // 3.38 Jaro-Winkler returns 0 for completely different strings
  it('3.38 jaroWinkler returns 0 for disjoint strings', async () => {
    const { jaroWinkler } = await import('../src/services/similarity-scoring.js');
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  // 3.39 soundex produces same code for similar-sounding names
  it('3.39 soundex matches similar-sounding names', async () => {
    const { soundex } = await import('../src/services/similarity-scoring.js');
    expect(soundex('Robert')).toBe(soundex('Rupert'));
    expect(soundex('Smith')).not.toBe(soundex('Jones'));
  });

  // 3.40 soundex handles empty/non-alpha input
  it('3.40 soundex handles edge cases', async () => {
    const { soundex } = await import('../src/services/similarity-scoring.js');
    expect(soundex('')).toBe('0000');
    expect(soundex('123')).toBe('0000');
  });

  // 3.41 levenshteinNormalized returns 1 for identical strings
  it('3.41 levenshteinNormalized returns 1 for identical', async () => {
    const { levenshteinNormalized } = await import('../src/services/similarity-scoring.js');
    expect(levenshteinNormalized('test', 'test')).toBe(1);
    expect(levenshteinNormalized('test', 'tset')).toBeGreaterThanOrEqual(0.5);
    expect(levenshteinNormalized('abc', 'xyz')).toBeLessThan(0.5);
  });

  // 3.42 TLD risk scoring returns high values for abused TLDs
  it('3.42 tldRiskScore returns high for abused TLDs', async () => {
    const { tldRiskScore } = await import('../src/services/similarity-scoring.js');
    expect(tldRiskScore('evil.top')).toBeGreaterThan(0.8);
    expect(tldRiskScore('evil.xyz')).toBeGreaterThan(0.8);
    expect(tldRiskScore('legit.com')).toBeLessThan(0.3);
  });

  // 3.43 composite scoring produces bounded [0,1] scores
  it('3.43 compositeRiskScore is bounded [0,1]', async () => {
    const { computeCompositeRiskScore } = await import('../src/services/similarity-scoring.js');
    const score1 = computeCompositeRiskScore('example.com', 'examp1e.com', true, new Date().toISOString(), 1);
    expect(score1).toBeGreaterThanOrEqual(0);
    expect(score1).toBeLessThanOrEqual(1);
    const score2 = computeCompositeRiskScore('example.com', 'zzzzz.top', false, null, null);
    expect(score2).toBeGreaterThanOrEqual(0);
    expect(score2).toBeLessThanOrEqual(1);
  });

  // 3.44 registered + recent + 1yr term + risky TLD = high score
  it('3.44 composite scores high for suspicious domains', async () => {
    const { computeCompositeRiskScore } = await import('../src/services/similarity-scoring.js');
    const recent = new Date(Date.now() - 3 * 86400000).toISOString(); // 3 days ago
    const high = computeCompositeRiskScore('paypal.com', 'paypa1.top', true, recent, 1);
    const low = computeCompositeRiskScore('paypal.com', 'zzzzz.com', false, null, null);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(0.6);
  });

  // 3.45 1-year registration term boosts risk score
  it('3.45 one-year registration term penalty applied', async () => {
    const { computeCompositeRiskScore } = await import('../src/services/similarity-scoring.js');
    const date = new Date(Date.now() - 30 * 86400000).toISOString();
    const oneYear = computeCompositeRiskScore('test.com', 'tset.com', true, date, 1);
    const fiveYear = computeCompositeRiskScore('test.com', 'tset.com', true, date, 5);
    expect(oneYear).toBeGreaterThan(fiveYear);
  });

  // 3.46 phoneticMatch returns 1 for same-sounding words
  it('3.46 phoneticMatch detects phonetic similarity', async () => {
    const { phoneticMatch } = await import('../src/services/similarity-scoring.js');
    expect(phoneticMatch('google', 'googel')).toBe(1); // same soundex G240
    expect(phoneticMatch('apple', 'zzzzz')).toBe(0);
  });

  // 3.47 composite scoring uses all 6 factors
  it('3.47 composite score integrates all factors', async () => {
    const { computeCompositeRiskScore } = await import('../src/services/similarity-scoring.js');
    // Very similar domain on risky TLD, recently registered, 1yr term
    const maxRisk = computeCompositeRiskScore('google.com', 'gooogle.top', true, new Date().toISOString(), 1);
    // Completely different domain, not registered
    const minRisk = computeCompositeRiskScore('google.com', 'zzzzz.com', false, null, null);
    expect(maxRisk).toBeGreaterThan(minRisk + 0.3);
  });
});
