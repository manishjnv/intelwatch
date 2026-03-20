/**
 * 3-Layer Deduplication Service
 * Layer 1: Bloom filter (Set-based) — sub-millisecond exact-match
 * Layer 2: Jaccard similarity — semantic near-duplicate detection on IOC sets
 * Layer 3: LLM arbitration stub — for ambiguous cases (0.60-0.85 similarity)
 * Differentiator: most TI platforms only do exact-match dedup. Jaccard catches
 * semantic duplicates where two reports cover the same campaign with slightly
 * different IOC extractions.
 */
import { buildDedupeKey } from '@etip/shared-utils';

export interface DedupArticle {
  id: string;
  tenantId: string;
  title: string;
  iocs: string[];          // normalized IOC values
  contentHash?: string;     // sha256 of content
}

export type DedupAction = 'skip' | 'merge' | 'create_new';
export type DedupLayer = 'bloom' | 'jaccard' | 'llm' | 'none';

export interface DedupResult {
  isDuplicate: boolean;
  existingId: string | null;
  similarityScore: number;
  dedupLayer: DedupLayer;
  action: DedupAction;
}

const JACCARD_DUPLICATE_THRESHOLD = 0.85;
const JACCARD_REVIEW_THRESHOLD = 0.60;

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

  /** Layer 3: Build LLM arbiter prompt (stub — actual LLM call deferred) */
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
    let bestMatch: { id: string; score: number } | null = null;
    for (const existing of existingArticles) {
      const score = this.jaccardSimilarity(article.iocs, existing.iocs);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: existing.id, score };
      }
    }

    if (bestMatch && bestMatch.score >= JACCARD_DUPLICATE_THRESHOLD) {
      return {
        isDuplicate: true, existingId: bestMatch.id,
        similarityScore: bestMatch.score, dedupLayer: 'jaccard', action: 'skip',
      };
    }

    if (bestMatch && bestMatch.score >= JACCARD_REVIEW_THRESHOLD) {
      // Layer 3 territory: needs LLM arbitration (stub — returns merge suggestion)
      return {
        isDuplicate: false, existingId: bestMatch.id,
        similarityScore: bestMatch.score, dedupLayer: 'llm', action: 'merge',
      };
    }

    return {
      isDuplicate: false, existingId: null,
      similarityScore: bestMatch?.score ?? 0, dedupLayer: 'none', action: 'create_new',
    };
  }
}
