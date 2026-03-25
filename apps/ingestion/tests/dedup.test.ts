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

describe('DedupService — Layer 2b: Title n-gram similarity', () => {
  it('returns high score for titles sharing key CTI terms', () => {
    // Default n=1 (unigrams): {apt29, deploys, new, backdoor, targeting, healthcare}
    //   ∩ {apt29, deploys, backdoor, in, healthcare, campaign} = {apt29, deploys, backdoor, healthcare} = 4
    // union = 6+6-4 = 8  → 4/8 = 0.5
    const score = dedup.ngramSimilarity(
      'APT29 deploys new backdoor targeting healthcare',
      'APT29 deploys backdoor in healthcare campaign',
    );
    expect(score).toBeGreaterThan(0.4);
  });

  it('returns low score for unrelated titles', () => {
    const score = dedup.ngramSimilarity(
      'Ransomware campaign targets energy sector',
      'Stock market rally continues into Q4',
    );
    expect(score).toBeLessThan(0.2);
  });

  it('returns 1.0 for identical titles', () => {
    expect(dedup.ngramSimilarity('APT29 healthcare attack', 'APT29 healthcare attack')).toBe(1.0);
  });

  it('returns 0.0 for completely unrelated titles', () => {
    const score = dedup.ngramSimilarity('alpha bravo charlie', 'delta echo foxtrot');
    expect(score).toBe(0.0);
  });

  it('handles single-word titles', () => {
    expect(dedup.ngramSimilarity('ransomware', 'ransomware')).toBe(1.0);
    expect(dedup.ngramSimilarity('ransomware', 'trojan')).toBe(0.0);
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

  function mockAnthropicResponse(text: string, inputTokens = 42, outputTokens = 12) {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text }],
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        }),
      },
    }) as unknown as Anthropic);
  }

  beforeEach(() => { vi.clearAllMocks(); dedup = new DedupService(); });

  it('returns action=skip + token counts when Haiku says is_duplicate: true', async () => {
    mockAnthropicResponse('{ "is_duplicate": true, "reasoning": "same campaign" }', 50, 15);
    const result = await dedup.arbitrate(artA, artB, 'test-key');
    expect(result.action).toBe('skip');
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(15);
  });

  it('returns action=create_new when Haiku says is_duplicate: false', async () => {
    mockAnthropicResponse('{ "is_duplicate": false, "reasoning": "different actors" }');
    const result = await dedup.arbitrate(artA, artB, 'test-key');
    expect(result.action).toBe('create_new');
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it('falls back to { action: merge, tokens: 0 } when Anthropic throws', async () => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: vi.fn().mockRejectedValue(new Error('API error')) },
    }) as unknown as Anthropic);
    const result = await dedup.arbitrate(artA, artB, 'test-key');
    expect(result.action).toBe('merge');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('falls back to { action: merge, tokens: 0 } when no API key provided', async () => {
    const result = await dedup.arbitrate(artA, artB, undefined);
    expect(result.action).toBe('merge');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('returns create_new when Haiku returns text with no JSON object', async () => {
    mockAnthropicResponse('Not valid JSON at all');
    const result = await dedup.arbitrate(artA, artB, 'test-key');
    expect(result.action).toBe('create_new');
  });

  it('returns create_new when JSON is valid but is_duplicate field missing', async () => {
    mockAnthropicResponse('{ "reasoning": "not sure" }');
    const result = await dedup.arbitrate(artA, artB, 'test-key');
    expect(result.action).toBe('create_new');
  });
});

describe('DedupService — Full pipeline', () => {
  const makeArticle = (id: string, iocs: string[], title = `Article ${id}`, hash?: string): DedupArticle => ({
    id, tenantId: 'tenant-1', title, iocs, contentHash: hash,
  });

  it('detects exact duplicate via bloom (Layer 1)', () => {
    const article = makeArticle('a1', ['1.2.3.4'], 'Article a1', 'hash-abc');
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
    // intersection=4, union=6 → 4/6 ≈ 0.667 → review/merge range
    const result = dedup.dedup(newArticle, existing);
    expect(result.similarityScore).toBeCloseTo(0.667, 1);
    expect(result.action).toBe('merge');
    expect(result.dedupLayer).toBe('llm');
  });

  it('escalates to Layer 3 via title n-gram (Layer 2b) when IOCs are disjoint but titles share key terms', () => {
    // Same campaign, different IOC sets — IOC Jaccard = 0.0, but shared words reveal the same event
    // Title unigrams: {apt29, targets, healthcare} appear in both → score ~0.5 > threshold 0.40
    const existing = [makeArticle('e1', ['1.2.3.4', 'evil-c2.com'], 'APT29 backdoor targets healthcare networks')];
    const newArticle = makeArticle('a1', ['10.0.0.1', 'malware.net'], 'APT29 backdoor healthcare campaign');
    const result = dedup.dedup(newArticle, existing);
    // Jaccard IOC score = 0.0, title unigram score > 0.40 → Layer 2b escalates to LLM
    expect(result.dedupLayer).toBe('llm');
    expect(result.action).toBe('merge');
    expect(result.existingId).toBe('e1');
  });

  it('creates new for truly dissimilar articles (low Jaccard + low title n-gram)', () => {
    const existing = [makeArticle('e1', ['1.2.3.4', 'evil.com'], 'Ransomware hits energy grid')];
    const newArticle = makeArticle('a1', ['10.0.0.1', 'good.com', 'safe.net'], 'Banking trojan targets fintech apps');
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
