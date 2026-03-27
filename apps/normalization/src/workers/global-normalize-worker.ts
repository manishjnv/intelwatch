/**
 * @module GlobalNormalizeWorker
 * @description Consumes NORMALIZE_GLOBAL queue. Extracts IOCs from global_articles,
 * normalizes values, computes Bayesian confidence, filters via warninglist,
 * and upserts into global_iocs. DECISION-029 Phase B2.
 */

import { Worker, Queue, type Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { QUEUES } from '@etip/shared-utils';
import {
  detectIOCType,
  normalizeIOCValue,
  WarninglistMatcher,
  calculateBayesianConfidence,
  stixConfidenceTier,
  computeFuzzyHash,
  calculateCorroborationScore,
  calculateVelocityScore,
  type CorroborationSource,
} from '@etip/shared-normalization';
import { SeverityVotingService } from '../services/severity-voting.js';
import type { PrismaClient } from '@prisma/client';
import type pino from 'pino';

export interface GlobalNormalizeJobData {
  globalArticleId: string;
  globalFeedId: string;
}

export interface GlobalNormalizeDeps {
  prisma: PrismaClient;
  logger: pino.Logger;
  enrichGlobalQueue: Queue;
  warninglistMatcher?: WarninglistMatcher;
}

/** Build dedupe hash for global IOCs (no tenantId). */
export function buildGlobalDedupeHash(type: string, normalizedValue: string): string {
  return createHash('sha256').update(`${type}:${normalizedValue}`).digest('hex');
}

/** Simple IOC extraction from article text (title + content). */
export function extractIocsFromText(text: string): { rawValue: string; rawType: string }[] {
  if (!text) return [];
  const results: { rawValue: string; rawType: string }[] = [];
  const seen = new Set<string>();

  // Split text into tokens and check each
  // eslint-disable-next-line no-useless-escape
  const tokens = text.split(/[\s,;|<>"'()\[\]{}]+/).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.trim();
    if (cleaned.length < 3 || cleaned.length > 500) continue;
    const type = detectIOCType(cleaned);
    if (type === 'unknown') continue;
    const key = `${type}:${cleaned.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ rawValue: cleaned, rawType: type });
  }
  return results;
}

export function createGlobalNormalizeWorker(deps: GlobalNormalizeDeps): Worker {
  const { prisma, logger, enrichGlobalQueue } = deps;
  const redisUrl = new URL(process.env['TI_REDIS_URL'] ?? 'redis://localhost:6379');
  const password = decodeURIComponent(redisUrl.password || '');

  const matcher = deps.warninglistMatcher ?? new WarninglistMatcher();
  if (!deps.warninglistMatcher) matcher.loadDefaults();

  // Cache feed catalog lookups (5-min TTL)
  interface FeedCatalogEntry {
    feedReliability: number;
    admiraltySource: string;
    admiraltyCred: number;
    feedName: string;
  }
  const feedCatalogCache = new Map<string, { value: FeedCatalogEntry; expiresAt: number }>();

  async function getFeedCatalog(globalFeedId: string): Promise<FeedCatalogEntry> {
    const cached = feedCatalogCache.get(globalFeedId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const feed = await prisma.globalFeedCatalog.findUnique({
      where: { id: globalFeedId },
      select: { feedReliability: true, name: true },
    });
    const value: FeedCatalogEntry = {
      feedReliability: feed?.feedReliability ?? 50,
      admiraltySource: (feed as any)?.admiraltySource ?? 'D',
      admiraltyCred: (feed as any)?.admiraltyCred ?? 4,
      feedName: (feed as any)?.name ?? globalFeedId,
    };
    feedCatalogCache.set(globalFeedId, { value, expiresAt: Date.now() + 5 * 60_000 });
    return value;
  }

  async function getFeedReliability(globalFeedId: string): Promise<number> {
    const catalog = await getFeedCatalog(globalFeedId);
    return catalog.feedReliability;
  }

  const votingService = new SeverityVotingService(prisma);

  async function processJob(job: Job<GlobalNormalizeJobData>): Promise<void> {
    const { globalArticleId, globalFeedId } = job.data;

    // 1. Load article
    const article = await prisma.globalArticle.findUnique({
      where: { id: globalArticleId },
    });
    if (!article) {
      logger.warn({ globalArticleId }, 'Global article not found — skipping');
      return;
    }

    // 2. Idempotency: skip if not pending
    if (article.pipelineStatus !== 'pending') {
      logger.debug({ globalArticleId, status: article.pipelineStatus }, 'Article not pending — skipping');
      return;
    }

    // 3. Mark as normalizing
    await prisma.globalArticle.update({
      where: { id: globalArticleId },
      data: { pipelineStatus: 'normalizing' },
    });

    // 4. Extract IOCs from title + content
    const text = [article.title, article.content ?? ''].join(' ');
    const rawIocs = extractIocsFromText(text);

    const feedReliability = await getFeedReliability(globalFeedId);

    let newCount = 0;
    let updatedCount = 0;
    let filteredCount = 0;

    for (const raw of rawIocs) {
      // 5a. Normalize
      const normalizedValue = normalizeIOCValue(raw.rawValue, raw.rawType as Parameters<typeof normalizeIOCValue>[1]);

      // 5b. Dedupe hashes (exact + fuzzy)
      const dedupeHash = buildGlobalDedupeHash(raw.rawType, normalizedValue);
      const fuzzyDedupeHash = computeFuzzyHash(raw.rawType, raw.rawValue);

      // 5c. Warninglist check
      const wlMatch = matcher.check(raw.rawType, normalizedValue);
      if (wlMatch) {
        filteredCount++;
        continue;
      }

      // 5d. UPSERT into global_iocs — exact match first, then fuzzy
      let existing = await prisma.globalIoc.findUnique({ where: { dedupeHash } });

      // 5d-ii. Fuzzy match if no exact match
      if (!existing) {
        const fuzzyMatch = await prisma.globalIoc.findFirst({ where: { fuzzyDedupeHash } });
        if (fuzzyMatch) {
          existing = fuzzyMatch;
          logger.info(
            { newValue: raw.rawValue, existingValue: fuzzyMatch.value },
            `Fuzzy dedupe: merged ${raw.rawValue} into existing ${fuzzyMatch.value}`,
          );
        }
      }

      if (existing) {
        // Update existing: bump lastSeen, increment corroboration, append source
        const sources = (existing.sightingSources as string[]) ?? [];
        const newSources = sources.includes(globalFeedId) ? sources : [...sources, globalFeedId];

        // 4a-4b. Build corroboration sources and score
        const corrobSources: CorroborationSource[] = [];
        for (const srcId of newSources) {
          const catalog = await getFeedCatalog(srcId);
          corrobSources.push({
            feedId: srcId,
            feedName: catalog.feedName,
            admiraltySource: catalog.admiraltySource,
            admiraltyCred: catalog.admiraltyCred,
            feedReliability: catalog.feedReliability,
            firstSeenByFeed: existing.firstSeen ?? new Date(),
            lastSeenByFeed: new Date(),
          });
        }
        const corrobResult = calculateCorroborationScore(corrobSources);

        // 4d. Cast severity vote with this feed's Admiralty Code
        const feedCatalog = await getFeedCatalog(globalFeedId);
        const iocSeverity = (existing.severity as string) ?? 'medium';
        try {
          await votingService.castVote(existing.id, {
            feedId: globalFeedId,
            severity: iocSeverity,
            admiraltySource: feedCatalog.admiraltySource,
            admiraltyCred: feedCatalog.admiraltyCred,
          });
        } catch { /* vote failure non-fatal */ }

        // 5a. Feed corroboration into Bayesian confidence
        const updatedConfidence = calculateBayesianConfidence({
          feedReliability: feedCatalog.feedReliability,
          corroboration: corrobResult.score,
          aiScore: 50,
          daysSinceLastSeen: 0,
          iocType: existing.iocType,
        });

        // 5b. Velocity score
        let velocityData: Record<string, unknown> = {};
        try {
          const timestamps = [new Date(), ...(existing.lastSeen ? [existing.lastSeen] : [])];
          const velocityResult = calculateVelocityScore({
            timestamps: timestamps as Date[],
            feedSources: newSources,
            windowHours: 24,
          });
          velocityData = {
            velocityScore: velocityResult.velocityScore,
            velocityUpdatedAt: new Date(),
          };
        } catch { /* velocity failure non-fatal */ }

        await prisma.globalIoc.update({
          where: { id: existing.id },
          data: {
            lastSeen: new Date(),
            crossFeedCorroboration: corrobResult.score,
            sightingSources: newSources,
            confidence: updatedConfidence.score,
            stixConfidenceTier: stixConfidenceTier(updatedConfidence.score),
            ...velocityData,
          },
        });
        updatedCount++;
      } else {
        // 5e. Compute initial confidence
        const corroboration = Math.min(1 * 10, 100); // first sighting = 10
        const confidence = calculateBayesianConfidence({
          feedReliability,
          corroboration,
          aiScore: 50,
          daysSinceLastSeen: 0,
          iocType: raw.rawType,
        });

        // 5f. STIX tier
        const tier = stixConfidenceTier(confidence.score);

        // 5g. ATT&CK severity (stored in enrichmentData if applicable)
        const enrichmentData: Record<string, unknown> = {};
        // ATT&CK techniques would come from article extraction context
        // For now, stored as empty — enrichment worker fills it

        await prisma.globalIoc.create({
          data: {
            globalFeedId,
            iocType: raw.rawType,
            value: raw.rawValue,
            normalizedValue,
            dedupeHash,
            fuzzyDedupeHash,
            confidence: confidence.score,
            stixConfidenceTier: tier,
            lifecycle: 'new',
            sightingSources: [globalFeedId],
            crossFeedCorroboration: 1,
            enrichmentData: enrichmentData as any,
          },
        });
        newCount++;

        // 7. Enqueue for enrichment
        await enrichGlobalQueue.add('enrich-global', { globalIocId: dedupeHash }, {
          jobId: `enrich-${dedupeHash}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        });
      }
    }

    // 6. Mark article as normalized
    await prisma.globalArticle.update({
      where: { id: globalArticleId },
      data: { pipelineStatus: 'normalized' },
    });

    // 8. Log
    logger.info(
      { globalArticleId, newIocs: newCount, updated: updatedCount, filtered: filteredCount },
      `Normalized article ${globalArticleId}: ${newCount} new, ${updatedCount} updated, ${filteredCount} warninglist-filtered`,
    );
  }

  const worker = new Worker<GlobalNormalizeJobData>(
    QUEUES.NORMALIZE_GLOBAL,
    async (job) => { await processJob(job); },
    {
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port) || 6379,
        password: password || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      },
      concurrency: 5,
      limiter: { max: 30, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Global normalize job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Global normalize worker error');
  });

  logger.info('Global normalize worker started');
  return worker;
}
