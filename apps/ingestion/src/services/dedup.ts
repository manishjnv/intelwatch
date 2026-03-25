/**
 * 3-Layer Deduplication Service
 * Layer 1: Bloom filter (Set-based) — sub-millisecond exact-match
 * Layer 2: Jaccard similarity — semantic near-duplicate detection on IOC sets
 * Layer 2b: Title n-gram similarity — catches same-campaign articles with disjoint IOC sets
 * Layer 3: LLM arbitration (Haiku) — resolves ambiguous cases, returns token counts for cost tracking
 * Differentiator: most TI platforms only do exact-match dedup. Jaccard + n-gram catches
 * semantic duplicates where two reports cover the same campaign with different IOC extractions.
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildDedupeKey } from '@etip/shared-utils';

export interface DedupArticle {
  id: string;
  tenantId: string;
  title: string;
  iocs: string[];          // normalized IOC values
  contentHash?: string;     // sha256 of content
}

export type DedupAction = 'skip' | 'merge' | 'create_new';
export type DedupLayer = 'bloom' | 'jaccard' | 'title_ngram' | 'llm' | 'none';

export interface DedupResult {
  isDuplicate: boolean;
  existingId: string | null;
  similarityScore: number;
  dedupLayer: DedupLayer;
  action: DedupAction;
}

/** Return type for arbitrate() — includes token usage for cost tracking */
export interface ArbitrateResult {
  action: DedupAction;
  inputTokens: number;
  outputTokens: number;
}

const JACCARD_DUPLICATE_THRESHOLD = 0.85;
const JACCARD_REVIEW_THRESHOLD = 0.60;
/**
 * Layer 2b: title word-overlap (unigram Jaccard) escalation threshold.
 * 0.40 = at least 40% of unique words shared — catches same-campaign articles
 * where key terms (actor name, malware family, target sector) overlap but phrasing differs.
 */
const TITLE_NGRAM_REVIEW_THRESHOLD = 0.40;

export class DedupService {
  private bloomSet: Set<string> = new Set();

  /** Layer 1: O(1) exact-match check via Set (Bloom filter approximation) */
  bloomCheck(dedupeKey: string): boolean {
    return this.bloomSet.has(dedupeKey);
  }

  bloomAdd(dedupeKey: string): void {
    this.bloomSet.add(dedupeKey);
  }

  bloomSize(): number {
    return this.bloomSet.size;
  }

  /** Layer 2: Jaccard similarity — |A∩B| / |A∪B| on IOC sets */
  jaccardSimilarity(setA: string[], setB: string[]): number {
    if (setA.length === 0 && setB.length === 0) return 1.0;
    if (setA.length === 0 || setB.length === 0) return 0.0;

    const a = new Set(setA);
    const b = new Set(setB);
    let intersection = 0;

    for (const item of a) {
      if (b.has(item)) intersection++;
    }

    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Layer 2b: Word-overlap (unigram Jaccard) similarity on article titles.
   * Uses unigrams by default (n=1) — captures shared vocabulary regardless of word order.
   * Catches same-campaign articles that share key terms (actor, malware, target sector)
   * but phrase them differently, which bigrams would miss.
   * Example: "APT29 deploys backdoor targeting healthcare" vs "APT29 healthcare backdoor campaign" → ~0.5
   */
  ngramSimilarity(a: string, b: string, n = 1): number {
    const getNgrams = (s: string, size: number): Set<string> => {
      const normalized = s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const tokens = normalized.split(/\s+/).filter(Boolean);
      const ngrams = new Set<string>();
      for (let i = 0; i <= tokens.length - size; i++) {
        ngrams.add(tokens.slice(i, i + size).join(' '));
      }
      return ngrams;
    };

    const setA = getNgrams(a, n);
    const setB = getNgrams(b, n);
    if (setA.size === 0 && setB.size === 0) return 1.0;
    if (setA.size === 0 || setB.size === 0) return 0.0;

    let intersection = 0;
    for (const gram of setA) {
      if (setB.has(gram)) intersection++;
    }
    return intersection / (setA.size + setB.size - intersection);
  }

  /** Layer 3: Build LLM arbiter prompt */
  buildArbiterPrompt(articleA: DedupArticle, articleB: DedupArticle): string {
    return [
      'You are a CTI deduplication analyst. Determine if these two articles report the same threat intelligence.',
      '',
      `Article A (${articleA.id}): "${articleA.title}"`,
      `IOCs: ${articleA.iocs.slice(0, 10).join(', ')}`,
      '',
      `Article B (${articleB.id}): "${articleB.title}"`,
      `IOCs: ${articleB.iocs.slice(0, 10).join(', ')}`,
      '',
      'Respond with JSON: { "is_duplicate": boolean, "reasoning": string }',
    ].join('\n');
  }

  /**
   * Layer 3: LLM arbitration via Haiku — resolves ambiguous similarity ranges.
   * Returns action + token counts so the pipeline can track AI cost for this stage.
   * Falls back to { action: 'merge', inputTokens: 0, outputTokens: 0 } on error (safe — do not discard).
   */
  async arbitrate(
    articleA: DedupArticle,
    articleB: DedupArticle,
    anthropicApiKey?: string,
    model?: string,
  ): Promise<ArbitrateResult> {
    if (!anthropicApiKey) return { action: 'merge', inputTokens: 0, outputTokens: 0 };
    try {
      const client = new Anthropic({ apiKey: anthropicApiKey });
      const prompt = this.buildArbiterPrompt(articleA, articleB);
      const message = await client.messages.create({
        model: model ?? 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        messages: [{ role: 'user', content: prompt }],
      });
      const inputTokens = message.usage?.input_tokens ?? 0;
      const outputTokens = message.usage?.output_tokens ?? 0;
      const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
      const parsed = JSON.parse(text.match(/\{[^}]+\}/)?.[0] ?? '{}') as { is_duplicate?: boolean };
      const action: DedupAction = parsed.is_duplicate === true ? 'skip' : 'create_new';
      return { action, inputTokens, outputTokens };
    } catch {
      return { action: 'merge', inputTokens: 0, outputTokens: 0 }; // safe fallback — do not discard on error
    }
  }

  /** Full 3-layer dedup pipeline */
  dedup(article: DedupArticle, existingArticles: DedupArticle[]): DedupResult {
    // Layer 1: Bloom filter exact-match on content hash
    if (article.contentHash) {
      const key = buildDedupeKey('article', article.contentHash, article.tenantId);
      if (this.bloomCheck(key)) {
        return {
          isDuplicate: true, existingId: null,
          similarityScore: 1.0, dedupLayer: 'bloom', action: 'skip',
        };
      }
      this.bloomAdd(key);
    }

    // Layer 2: Jaccard similarity on IOC sets
    let bestMatch: { id: string; score: number; existing: DedupArticle } | null = null;
    for (const existing of existingArticles) {
      const score = this.jaccardSimilarity(article.iocs, existing.iocs);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: existing.id, score, existing };
      }
    }

    if (bestMatch && bestMatch.score >= JACCARD_DUPLICATE_THRESHOLD) {
      return {
        isDuplicate: true, existingId: bestMatch.id,
        similarityScore: bestMatch.score, dedupLayer: 'jaccard', action: 'skip',
      };
    }

    if (bestMatch && bestMatch.score >= JACCARD_REVIEW_THRESHOLD) {
      // Jaccard in ambiguous range (0.60–0.85) → escalate to Layer 3
      return {
        isDuplicate: false, existingId: bestMatch.id,
        similarityScore: bestMatch.score, dedupLayer: 'llm', action: 'merge',
      };
    }

    // Layer 2b: Title n-gram similarity — catches same campaign, disjoint IOC sets
    // (Jaccard < 0.60 but titles clearly describe the same incident)
    if (bestMatch) {
      const titleScore = this.ngramSimilarity(article.title, bestMatch.existing.title);
      if (titleScore >= TITLE_NGRAM_REVIEW_THRESHOLD) {
        return {
          isDuplicate: false, existingId: bestMatch.id,
          similarityScore: titleScore, dedupLayer: 'llm', action: 'merge',
        };
      }
    }

    return {
      isDuplicate: false, existingId: null,
      similarityScore: bestMatch?.score ?? 0, dedupLayer: 'none', action: 'create_new',
    };
  }
}
