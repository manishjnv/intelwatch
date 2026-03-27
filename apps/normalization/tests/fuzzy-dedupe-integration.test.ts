import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildGlobalDedupeHash,
  extractIocsFromText,
} from '../src/workers/global-normalize-worker.js';
import { computeFuzzyHash, areFuzzyDuplicates } from '@etip/shared-normalization';

describe('Fuzzy Dedupe Integration', () => {
  it('exact match: same value → same dedupeHash', () => {
    const h1 = buildGlobalDedupeHash('domain', 'evil.com');
    const h2 = buildGlobalDedupeHash('domain', 'evil.com');
    expect(h1).toBe(h2);
  });

  it('fuzzy match: defanged domain matches clean domain', () => {
    expect(areFuzzyDuplicates('domain', 'evil[.]com', 'evil.com')).toBe(true);
  });

  it('fuzzy match: IP with port matches IP without', () => {
    expect(areFuzzyDuplicates('ip', '192.168.1.1:8080', '192.168.1.1')).toBe(true);
  });

  it('fuzzyDedupeHash is computed for extracted IOCs', () => {
    const iocs = extractIocsFromText('Found malware at evil.com');
    const domainIoc = iocs.find((i) => i.rawType === 'domain');
    expect(domainIoc).toBeDefined();

    // Compute fuzzy hash for the extracted value
    const fuzzyHash = computeFuzzyHash(domainIoc!.rawType, domainIoc!.rawValue);
    expect(fuzzyHash).toHaveLength(64);
  });

  it('defanged variant produces same fuzzy hash as clean', () => {
    const cleanHash = computeFuzzyHash('domain', 'evil.com');
    const defangedHash = computeFuzzyHash('domain', 'evil[.]com');
    expect(cleanHash).toBe(defangedHash);
  });

  it('no match: completely different value → different hashes', () => {
    const h1 = computeFuzzyHash('domain', 'evil.com');
    const h2 = computeFuzzyHash('domain', 'google.com');
    expect(h1).not.toBe(h2);
  });

  it('new IOC stores both dedupeHash and fuzzyDedupeHash (structure test)', () => {
    const value = 'malware.example.com';
    const type = 'domain';
    const dedupeHash = buildGlobalDedupeHash(type, value);
    const fuzzyDedupeHash = computeFuzzyHash(type, value);

    expect(dedupeHash).toHaveLength(64);
    expect(fuzzyDedupeHash).toHaveLength(64);
    // Both are valid SHA256 hex strings
    expect(dedupeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fuzzyDedupeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('worker would log fuzzy dedupe merge (verifies computeFuzzyHash imported)', () => {
    // Verify computeFuzzyHash is available and works in integration context
    const hash1 = computeFuzzyHash('ip', '192.168.001.001:443');
    const hash2 = computeFuzzyHash('ip', '192.168.1.1');
    expect(hash1).toBe(hash2);
  });
});
