import { describe, it, expect, beforeEach } from 'vitest';
import { DedupService, type DedupArticle } from '../src/services/dedup.js';

let dedup: DedupService;

beforeEach(() => { dedup = new DedupService(); });

describe('DedupService — Layer 1: Bloom filter', () => {
  it('reports false for unseen keys', () => {
    expect(dedup.bloomCheck('key-1')).toBe(false);
  });

  it('reports true after adding key', () => {
    dedup.bloomAdd('key-1');
    expect(dedup.bloomCheck('key-1')).toBe(true);
  });

  it('tracks bloom set size', () => {
    dedup.bloomAdd('a');
    dedup.bloomAdd('b');
    dedup.bloomAdd('a'); // duplicate
    expect(dedup.bloomSize()).toBe(2);
  });
});

describe('DedupService — Layer 2: Jaccard similarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(dedup.jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1.0);
  });

  it('returns 0.0 for disjoint sets', () => {
    expect(dedup.jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0.0);
  });

  it('returns correct score for overlapping sets', () => {
    // {a,b,c} ∩ {b,c,d} = {b,c}, union = {a,b,c,d} → 2/4 = 0.5
    expect(dedup.jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
  });

  it('handles empty sets', () => {
    expect(dedup.jaccardSimilarity([], [])).toBe(1.0);
    expect(dedup.jaccardSimilarity(['a'], [])).toBe(0.0);
  });
});

describe('DedupService — Layer 3: LLM arbiter prompt', () => {
  it('builds a comparison prompt', () => {
    const a: DedupArticle = { id: 'a1', tenantId: 't1', title: 'APT29 Campaign', iocs: ['1.2.3.4'] };
    const b: DedupArticle = { id: 'b1', tenantId: 't1', title: 'Cozy Bear Attack', iocs: ['1.2.3.4', '5.6.7.8'] };
    const prompt = dedup.buildArbiterPrompt(a, b);

    expect(prompt).toContain('APT29 Campaign');
    expect(prompt).toContain('Cozy Bear Attack');
    expect(prompt).toContain('1.2.3.4');
  });
});

describe('DedupService — Full pipeline', () => {
  const makeArticle = (id: string, iocs: string[], hash?: string): DedupArticle => ({
    id, tenantId: 'tenant-1', title: `Article ${id}`, iocs, contentHash: hash,
  });

  it('detects exact duplicate via bloom (Layer 1)', () => {
    const article = makeArticle('a1', ['1.2.3.4'], 'hash-abc');
    // First pass — adds to bloom
    const r1 = dedup.dedup(article, []);
    expect(r1.isDuplicate).toBe(false);
    expect(r1.dedupLayer).toBe('none');

    // Second pass — bloom detects it
    const r2 = dedup.dedup(article, []);
    expect(r2.isDuplicate).toBe(true);
    expect(r2.dedupLayer).toBe('bloom');
    expect(r2.action).toBe('skip');
  });

  it('detects near-duplicate via Jaccard (Layer 2)', () => {
    const existing = [makeArticle('e1', ['1.2.3.4', '5.6.7.8', 'evil.com', 'bad.org', 'malware.exe'])];
    const newArticle = makeArticle('a1', ['1.2.3.4', '5.6.7.8', 'evil.com', 'bad.org', 'trojan.dll']);
    // Jaccard = 4/6 ≈ 0.67 → merge range, OR 4/5 after dedup = 0.8
    // Actually: {1.2.3.4, 5.6.7.8, evil.com, bad.org, trojan.dll} ∩ {1.2.3.4, 5.6.7.8, evil.com, bad.org, malware.exe} = 4
    // union = 6, score = 4/6 = 0.667 → review/merge range
    const result = dedup.dedup(newArticle, existing);
    expect(result.similarityScore).toBeCloseTo(0.667, 1);
    expect(result.action).toBe('merge');
  });

  it('creates new for dissimilar articles', () => {
    const existing = [makeArticle('e1', ['1.2.3.4', 'evil.com'])];
    const newArticle = makeArticle('a1', ['10.0.0.1', 'good.com', 'safe.net']);
    const result = dedup.dedup(newArticle, existing);

    expect(result.isDuplicate).toBe(false);
    expect(result.action).toBe('create_new');
    expect(result.dedupLayer).toBe('none');
  });

  it('handles article with no content hash', () => {
    const article = makeArticle('a1', ['1.2.3.4']);
    const result = dedup.dedup(article, []);
    expect(result.isDuplicate).toBe(false);
  });
});
