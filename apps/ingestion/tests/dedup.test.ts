import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DedupService, type DedupArticle } from '../src/services/dedup.js';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('@anthropic-ai/sdk');

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

describe('DedupService — Layer 3: arbitrate() Haiku call', () => {
  const artA: DedupArticle = { id: 'a1', tenantId: 't1', title: 'APT29 Campaign', iocs: ['1.2.3.4', 'evil.com'] };
  const artB: DedupArticle = { id: 'b1', tenantId: 't1', title: 'Cozy Bear TTP', iocs: ['1.2.3.4', 'evil.com'] };

  function mockAnthropicResponse(text: string) {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text }],
        }),
      },
    }) as unknown as Anthropic);
  }

  beforeEach(() => { vi.clearAllMocks(); dedup = new DedupService(); });

  it('returns skip when Haiku says is_duplicate: true', async () => {
    mockAnthropicResponse('{ "is_duplicate": true, "reasoning": "same campaign" }');
    const action = await dedup.arbitrate(artA, artB, 'test-key');
    expect(action).toBe('skip');
  });

  it('returns create_new when Haiku says is_duplicate: false', async () => {
    mockAnthropicResponse('{ "is_duplicate": false, "reasoning": "different actors" }');
    const action = await dedup.arbitrate(artA, artB, 'test-key');
    expect(action).toBe('create_new');
  });

  it('falls back to merge when Anthropic throws', async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: vi.fn().mockRejectedValue(new Error('API error')) },
    }) as unknown as Anthropic);
    const action = await dedup.arbitrate(artA, artB, 'test-key');
    expect(action).toBe('merge');
  });

  it('falls back to merge when no API key provided', async () => {
    const action = await dedup.arbitrate(artA, artB, undefined);
    expect(action).toBe('merge');
  });

  it('returns create_new when Haiku returns text with no JSON object', async () => {
    // No {…} found → no duplicate signal → keep the article (create_new is the safe choice)
    mockAnthropicResponse('Not valid JSON at all');
    const action = await dedup.arbitrate(artA, artB, 'test-key');
    expect(action).toBe('create_new');
  });

  it('returns create_new when JSON is valid but is_duplicate field missing', async () => {
    mockAnthropicResponse('{ "reasoning": "not sure" }');
    const action = await dedup.arbitrate(artA, artB, 'test-key');
    expect(action).toBe('create_new');
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
