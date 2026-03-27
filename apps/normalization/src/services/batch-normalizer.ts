/**
 * @module BatchNormalizer
 * @description Batch processing for global article normalization.
 * Reduces DB round-trips by processing multiple articles at once:
 * intra-batch dedup, cache checks, batch upserts, batch enqueue.
 * DECISION-029 Phase F.
 */

import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import {
  detectIOCType,
  normalizeIOCValue,
  WarninglistMatcher,
  calculateBayesianConfidence,
  stixConfidenceTier,
  computeFuzzyHash,
  type IOCType,
} from '@etip/shared-normalization';
import type { PrismaClient } from '@prisma/client';
import type { GlobalCache } from '../../src/services/global-cache.js';

export interface BatchArticle {
  id: string;
  globalFeedId: string;
  title: string;
  content?: string | null;
}

export interface BatchResult {
  articlesProcessed: number;
  iocsNew: number;
  iocsUpdated: number;
  iocsWarninglistFiltered: number;
  iocsFuzzyDeduped: number;
  intraBatchDeduped: number;
  cacheHits: number;
  dbQueriesReduced: number;
  processingTimeMs: number;
}

interface ExtractedIoc {
  articleId: string;
  globalFeedId: string;
  rawValue: string;
  rawType: string;
  normalizedValue: string;
  dedupeHash: string;
  fuzzyHash: string;
}

export class BatchNormalizer {
  constructor(
    private prisma: PrismaClient,
    private cache: GlobalCache | null,
    private warninglistMatcher: WarninglistMatcher,
    private enrichQueue?: Queue,
  ) {}

  /**
   * Process a batch of articles: extract IOCs, dedupe, warninglist filter,
   * batch upsert, and enqueue for enrichment.
   */
  async processBatch(articles: BatchArticle[]): Promise<BatchResult> {
    const start = Date.now();
    let iocsNew = 0;
    let iocsUpdated = 0;
    let iocsWarninglistFiltered = 0;
    let iocsFuzzyDeduped = 0;
    let intraBatchDeduped = 0;
    let cacheHits = 0;
    let dbQueriesEstimated = 0;

    // 1. Extract IOCs from all articles
    const allIocs: ExtractedIoc[] = [];
    for (const article of articles) {
      const text = [article.title, article.content ?? ''].join(' ');
      const tokens = text.split(/[\s,;|<>"'()\[\]{}]+/).filter(Boolean);
      for (const token of tokens) {
        const cleaned = token.trim();
        if (cleaned.length < 3 || cleaned.length > 500) continue;
        const type = detectIOCType(cleaned);
        if (type === 'unknown') continue;
        const normalizedValue = normalizeIOCValue(cleaned, type as IOCType);
        const dedupeHash = createHash('sha256').update(`${type}:${normalizedValue}`).digest('hex');
        const fuzzyHash = computeFuzzyHash(type, cleaned);
        allIocs.push({
          articleId: article.id,
          globalFeedId: article.globalFeedId,
          rawValue: cleaned,
          rawType: type,
          normalizedValue,
          dedupeHash,
          fuzzyHash,
        });
      }
    }

    // 2. Intra-batch dedup (by dedupeHash)
    const seenHashes = new Map<string, ExtractedIoc>();
    const uniqueIocs: ExtractedIoc[] = [];
    for (const ioc of allIocs) {
      if (seenHashes.has(ioc.dedupeHash)) {
        intraBatchDeduped++;
        continue;
      }
      seenHashes.set(ioc.dedupeHash, ioc);
      uniqueIocs.push(ioc);
    }

    // 3. Warninglist filter
    const passedIocs: ExtractedIoc[] = [];
    for (const ioc of uniqueIocs) {
      const wlMatch = this.warninglistMatcher.check(ioc.rawType, ioc.normalizedValue);
      if (wlMatch) {
        iocsWarninglistFiltered++;
        continue;
      }
      passedIocs.push(ioc);
    }

    // 4. Cache check + DB check for existing IOCs
    const newIocs: ExtractedIoc[] = [];
    const existingIocs: ExtractedIoc[] = [];

    for (const ioc of passedIocs) {
      // Check cache first
      if (this.cache) {
        const known = await this.cache.isKnownIoc(ioc.dedupeHash);
        if (known) {
          cacheHits++;
          existingIocs.push(ioc);
          continue;
        }
        // Check fuzzy cache
        const fuzzyKnown = await this.cache.isKnownFuzzyHash(ioc.fuzzyHash);
        if (fuzzyKnown) {
          cacheHits++;
          iocsFuzzyDeduped++;
          existingIocs.push(ioc);
          continue;
        }
      }

      // DB check — single query for all would be ideal but Prisma findMany is fine
      dbQueriesEstimated++;
      const existing = await this.prisma.globalIoc.findUnique({
        where: { dedupeHash: ioc.dedupeHash },
      });

      if (existing) {
        existingIocs.push(ioc);
      } else {
        newIocs.push(ioc);
      }
    }

    // 5. Batch update existing IOCs (lastSeen + corroboration)
    for (const ioc of existingIocs) {
      await this.prisma.globalIoc.updateMany({
        where: { dedupeHash: ioc.dedupeHash },
        data: { lastSeen: new Date() },
      });
      iocsUpdated++;
    }

    // 6. Batch create new IOCs
    const newIocData = newIocs.map((ioc) => {
      const confidence = calculateBayesianConfidence({
        feedReliability: 50,
        corroboration: 10,
        aiScore: 50,
        daysSinceLastSeen: 0,
        iocType: ioc.rawType,
      });
      const tier = stixConfidenceTier(confidence.score);

      return {
        globalFeedId: ioc.globalFeedId,
        iocType: ioc.rawType,
        value: ioc.rawValue,
        normalizedValue: ioc.normalizedValue,
        dedupeHash: ioc.dedupeHash,
        fuzzyDedupeHash: ioc.fuzzyHash,
        confidence: confidence.score,
        stixConfidenceTier: tier,
        lifecycle: 'new' as const,
        sightingSources: [ioc.globalFeedId],
        crossFeedCorroboration: 1,
        enrichmentData: {},
      };
    });

    if (newIocData.length > 0) {
      // Use createMany for batch insert (single query)
      await this.prisma.globalIoc.createMany({ data: newIocData as any, skipDuplicates: true });
      iocsNew = newIocData.length;
      dbQueriesEstimated++; // single query for all creates
    }

    // 7. Update cache with new hashes
    if (this.cache) {
      for (const ioc of newIocs) {
        await this.cache.addKnownIoc(ioc.dedupeHash);
        await this.cache.addKnownFuzzyHash(ioc.fuzzyHash);
      }
    }

    // 8. Enqueue new IOCs for enrichment (batch)
    if (this.enrichQueue && newIocs.length > 0) {
      const jobs = newIocs.map((ioc) => ({
        name: 'enrich-global',
        data: { globalIocId: ioc.dedupeHash },
        opts: { jobId: `enrich-${ioc.dedupeHash}`, attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
      }));
      await this.enrichQueue.addBulk(jobs);
    }

    // 9. Update article pipeline status
    const articleIds = articles.map((a) => a.id);
    if (articleIds.length > 0) {
      await this.prisma.globalArticle.updateMany({
        where: { id: { in: articleIds } },
        data: { pipelineStatus: 'normalized' },
      });
    }

    // Estimated queries saved vs one-at-a-time processing
    const oneByOneEstimate = articles.length * 2 + allIocs.length * 3;
    const dbQueriesReduced = Math.max(0, oneByOneEstimate - dbQueriesEstimated - 3);

    return {
      articlesProcessed: articles.length,
      iocsNew,
      iocsUpdated,
      iocsWarninglistFiltered,
      iocsFuzzyDeduped,
      intraBatchDeduped,
      cacheHits,
      dbQueriesReduced,
      processingTimeMs: Date.now() - start,
    };
  }

  /**
   * Determine batch size based on queue depth.
   * Adaptive: low volume → immediate, high volume → batch for throughput.
   */
  determineBatchSize(queueDepth: number): number {
    if (queueDepth < 10) return 1;
    if (queueDepth <= 50) return 10;
    if (queueDepth <= 200) return 25;
    return 50;
  }
}
