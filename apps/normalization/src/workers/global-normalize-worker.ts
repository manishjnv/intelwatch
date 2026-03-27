/**
 * @module GlobalNormalizeWorker
 * @description Consumes NORMALIZE_GLOBAL queue. Extracts IOCs from global_articles,
 * normalizes values, computes Bayesian confidence, filters via warninglist,
 * and upserts into global_iocs. DECISION-029 Phase B2.
 */

import { Worker, Queue, type Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { QUEUES, EVENTS } from '@etip/shared-utils';
import {
  detectIOCType,
  normalizeIOCValue,
  WarninglistMatcher,
  calculateBayesianConfidence,
  stixConfidenceTier,
  calculateAttackSeverity,
} from '@etip/shared-normalization';
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

  // Cache feed reliability lookups (5-min TTL)
  const reliabilityCache = new Map<string, { value: number; expiresAt: number }>();

  async function getFeedReliability(globalFeedId: string): Promise<number> {
    const cached = reliabilityCache.get(globalFeedId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const feed = await prisma.globalFeedCatalog.findUnique({
      where: { id: globalFeedId },
      select: { feedReliability: true },
    });
    const value = feed?.feedReliability ?? 50;
    reliabilityCache.set(globalFeedId, { value, expiresAt: Date.now() + 5 * 60_000 });
    return value;
  }

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

      // 5b. Dedupe hash
      const dedupeHash = buildGlobalDedupeHash(raw.rawType, normalizedValue);

      // 5c. Warninglist check
      const wlMatch = matcher.check(raw.rawType, normalizedValue);
      if (wlMatch) {
        filteredCount++;
        continue;
      }

      // 5d. UPSERT into global_iocs
      const existing = await prisma.globalIoc.findUnique({ where: { dedupeHash } });

      if (existing) {
        // Update existing: bump lastSeen, increment corroboration, append source
        const sources = existing.sightingSources ?? [];
        const newSources = sources.includes(globalFeedId) ? sources : [...sources, globalFeedId];

        await prisma.globalIoc.update({
          where: { dedupeHash },
          data: {
            lastSeen: new Date(),
            crossFeedCorroboration: newSources.length,
            sightingSources: newSources,
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
            confidence: confidence.score,
            stixConfidenceTier: tier,
            lifecycle: 'new',
            sightingSources: [globalFeedId],
            crossFeedCorroboration: 1,
            enrichmentData,
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
