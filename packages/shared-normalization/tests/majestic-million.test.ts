import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseMajesticCsv,
  buildMajesticEntry,
  extractDomainFromUrl,
  loadMajesticMillion,
} from '../src/majestic-million.js';
import { WarninglistMatcher, type WarninglistMatch } from '../src/warninglist.js';

const FIXTURE_PATH = join(import.meta.dirname, 'fixtures', 'majestic-sample.csv');
const fixtureContent = readFileSync(FIXTURE_PATH, 'utf-8');

// ═══════════════════════════════════════════════════════════════════
// 1. CSV Parsing
// ═══════════════════════════════════════════════════════════════════

describe('parseMajesticCsv', () => {
  it('extracts correct Domain column from CSV', () => {
    const domains = parseMajesticCsv(fixtureContent);
    expect(domains).toContain('google.com');
    expect(domains).toContain('facebook.com');
    expect(domains).toContain('amazon.com');
    expect(domains).toContain('bbc.co.uk');
    expect(domains).toContain('nytimes.com');
    // Must NOT contain the header value
    expect(domains).not.toContain('Domain');
  });

  it('respects topN limit — only first N rows loaded', () => {
    const domains = parseMajesticCsv(fixtureContent, 5);
    expect(domains).toHaveLength(5);
    expect(domains[0]).toBe('google.com');
    expect(domains[4]).toBe('instagram.com');
  });

  it('lowercases all domains', () => {
    const csv = 'GlobalRank,TldRank,Domain,TLD\n1,1,EXAMPLE.COM,com\n';
    const domains = parseMajesticCsv(csv);
    expect(domains[0]).toBe('example.com');
  });

  it('handles empty CSV gracefully', () => {
    expect(parseMajesticCsv('')).toHaveLength(0);
  });

  it('handles CSV with only header row', () => {
    expect(parseMajesticCsv('GlobalRank,TldRank,Domain,TLD\n')).toHaveLength(0);
  });

  it('skips blank lines', () => {
    const csv = 'GlobalRank,TldRank,Domain,TLD\n1,1,a.com,com\n\n2,2,b.com,com\n';
    const domains = parseMajesticCsv(csv);
    expect(domains).toEqual(['a.com', 'b.com']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. buildMajesticEntry
// ═══════════════════════════════════════════════════════════════════

describe('buildMajesticEntry', () => {
  it('returns WarninglistEntry with correct shape and action: flag', () => {
    const entry = buildMajesticEntry(['google.com', 'facebook.com']);
    expect(entry.name).toBe('Majestic Million Top Domains');
    expect(entry.type).toBe('hostname');
    expect(entry.category).toBe('false_positive');
    expect(entry.action).toBe('flag');
    expect(entry.values).toEqual(['google.com', 'facebook.com']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. extractDomainFromUrl
// ═══════════════════════════════════════════════════════════════════

describe('extractDomainFromUrl', () => {
  it('extracts hostname from standard URL', () => {
    expect(extractDomainFromUrl('https://cdn.microsoft.com/malware.exe')).toBe('cdn.microsoft.com');
  });

  it('extracts hostname from URL with port', () => {
    expect(extractDomainFromUrl('http://example.com:8080/path')).toBe('example.com');
  });

  it('handles defanged URL (hxxps)', () => {
    expect(extractDomainFromUrl('hxxps://evil[.]com/payload')).toBe('evil.com');
  });

  it('returns null for invalid input', () => {
    expect(extractDomainFromUrl('not-a-url')).toBeNull();
  });

  it('lowercases the hostname', () => {
    expect(extractDomainFromUrl('https://CDN.Microsoft.COM/file')).toBe('cdn.microsoft.com');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. WarninglistMatcher integration — domain matching
// ═══════════════════════════════════════════════════════════════════

describe('Majestic Million + WarninglistMatcher integration', () => {
  /**
   * Use a matcher with ONLY Majestic loaded (no defaults) to test
   * Majestic-specific matching without interference from built-in lists.
   */
  function createMajesticMatcher(): WarninglistMatcher {
    const matcher = new WarninglistMatcher();
    const domains = parseMajesticCsv(fixtureContent);
    matcher.loadCustom([buildMajesticEntry(domains)]);
    return matcher;
  }

  it('exact domain match returns warninglist hit (google.com)', () => {
    const matcher = createMajesticMatcher();
    const result = matcher.check('domain', 'google.com');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Majestic Million Top Domains');
    expect(result!.matchType).toBe('hostname');
    expect(result!.action).toBe('flag');
  });

  it('subdomain match works (mail.google.com matches google.com)', () => {
    const matcher = createMajesticMatcher();
    const result = matcher.check('domain', 'mail.google.com');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Majestic Million Top Domains');
    expect(result!.action).toBe('flag');
  });

  it('subdomain match on multi-part TLD (www.bbc.co.uk matches bbc.co.uk)', () => {
    const matcher = createMajesticMatcher();
    const result = matcher.check('domain', 'www.bbc.co.uk');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Majestic Million Top Domains');
  });

  it('URL IOC → domain extracted → matched', () => {
    const matcher = createMajesticMatcher();
    const url = 'https://cdn.nytimes.com/article.html';
    const domain = extractDomainFromUrl(url);
    expect(domain).toBe('cdn.nytimes.com');
    const result = matcher.check('domain', domain!);
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Majestic Million Top Domains');
  });

  it('unknown domain returns no match', () => {
    const matcher = createMajesticMatcher();
    expect(matcher.check('domain', 'evil-c2-server.xyz')).toBeNull();
  });

  it('case-insensitive matching (BBC.CO.UK)', () => {
    const matcher = createMajesticMatcher();
    const result = matcher.check('domain', 'BBC.CO.UK');
    expect(result).not.toBeNull();
    expect(result!.listName).toBe('Majestic Million Top Domains');
  });

  it('default lists return action "drop" (backward compat)', () => {
    const matcher = new WarninglistMatcher();
    matcher.loadDefaults();
    const result = matcher.check('ip', '8.8.8.8');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('drop');
  });

  it('defaults + Majestic together — defaults checked first', () => {
    const matcher = new WarninglistMatcher();
    matcher.loadDefaults();
    matcher.loadCustom([buildMajesticEntry(parseMajesticCsv(fixtureContent))]);

    // google.com is in "Known safe domains" (type: string, checked first → action: drop)
    const googleResult = matcher.check('domain', 'google.com');
    expect(googleResult).not.toBeNull();
    expect(googleResult!.listName).toBe('Known safe domains');
    expect(googleResult!.action).toBe('drop');

    // bbc.co.uk is ONLY in Majestic → action: flag
    const bbcResult = matcher.check('domain', 'bbc.co.uk');
    expect(bbcResult).not.toBeNull();
    expect(bbcResult!.listName).toBe('Majestic Million Top Domains');
    expect(bbcResult!.action).toBe('flag');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Confidence penalty + tagging (caller-side logic)
// ═══════════════════════════════════════════════════════════════════

describe('confidence penalty and tagging', () => {
  it('confidence penalty applied correctly (-30 default)', () => {
    const originalConfidence = 75;
    const penalty = 30;
    const penalized = Math.max(0, originalConfidence - penalty);
    expect(penalized).toBe(45);
  });

  it('confidence penalty floors at 0', () => {
    const originalConfidence = 20;
    const penalty = 30;
    const penalized = Math.max(0, originalConfidence - penalty);
    expect(penalized).toBe(0);
  });

  it('possible-false-positive tag added when action is flag', () => {
    const matcher = new WarninglistMatcher();
    matcher.loadCustom([buildMajesticEntry(['target-legit-domain.com'])]);

    const result = matcher.check('domain', 'target-legit-domain.com');
    expect(result!.action).toBe('flag');

    // Caller adds tag based on action
    const tags: string[] = ['malware'];
    if (result!.action === 'flag') {
      tags.push('possible-false-positive');
    }
    expect(tags).toContain('possible-false-positive');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. loadMajesticMillion
// ═══════════════════════════════════════════════════════════════════

describe('loadMajesticMillion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns entry when csvContent is provided (testing shortcut)', async () => {
    const entry = await loadMajesticMillion({ csvContent: fixtureContent, topN: 10 });
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('Majestic Million Top Domains');
    expect(entry!.values).toHaveLength(10);
    expect(entry!.action).toBe('flag');
  });

  it('returns null when disabled via config', async () => {
    const entry = await loadMajesticMillion({ enabled: false });
    expect(entry).toBeNull();
  });

  it('download failure → graceful skip, returns null + logs warning', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    try {
      const logger = { info: vi.fn(), warn: vi.fn() };
      // Use a non-existent cache path so it must download
      const entry = await loadMajesticMillion(
        { cachePath: '/tmp/nonexistent-test-majestic-xxx.csv' },
        logger,
      );
      expect(entry).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Majestic Million download failed'),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('HTTP non-200 response → graceful skip', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);
    try {
      const logger = { info: vi.fn(), warn: vi.fn() };
      const entry = await loadMajesticMillion(
        { cachePath: '/tmp/nonexistent-test-majestic-yyy.csv' },
        logger,
      );
      expect(entry).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('respects topN config', async () => {
    const entry = await loadMajesticMillion({ csvContent: fixtureContent, topN: 3 });
    expect(entry!.values).toHaveLength(3);
    expect(entry!.values).toEqual(['google.com', 'facebook.com', 'youtube.com']);
  });
});
