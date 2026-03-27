/**
 * @module GlobalPipelineOrchestrator
 * @description Manages global pipeline health, retrigger, pause/resume.
 * DECISION-029 Phase C.
 */
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { QUEUES, AppError } from '@etip/shared-utils';

/** All global queue names for pipeline operations */
export const GLOBAL_QUEUE_NAMES = [
  QUEUES.FEED_FETCH_GLOBAL_RSS,
  QUEUES.FEED_FETCH_GLOBAL_NVD,
  QUEUES.FEED_FETCH_GLOBAL_STIX,
  QUEUES.FEED_FETCH_GLOBAL_REST,
  QUEUES.NORMALIZE_GLOBAL,
  QUEUES.ENRICH_GLOBAL,
] as const;

export interface QueueHealthEntry {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface PipelineStats {
  articlesProcessed24h: number;
  iocsCreated24h: number;
  iocsEnriched24h: number;
  avgNormalizeLatencyMs: number;
  avgEnrichLatencyMs: number;
}

export interface GlobalQueueHealth {
  queues: QueueHealthEntry[];
  pipeline: PipelineStats;
}

export class GlobalPipelineOrchestrator {
  constructor(
    private readonly queues: Record<string, Queue>,
    private readonly prisma: PrismaClient,
  ) {}

  async getQueueHealth(): Promise<GlobalQueueHealth> {
    const entries: QueueHealthEntry[] = [];

    for (const name of GLOBAL_QUEUE_NAMES) {
      const q = this.queues[name];
      if (!q) {
        entries.push({ name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
        continue;
      }
      const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      entries.push({
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    }

    // Pipeline stats from DB (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [articlesProcessed, iocsCreated, iocsEnriched] = await Promise.all([
      this.prisma.globalArticle.count({
        where: { pipelineStatus: 'normalized', createdAt: { gte: since } },
      }),
      this.prisma.globalIoc.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.globalIoc.count({
        where: { enrichmentQuality: { gt: 0 }, createdAt: { gte: since } },
      }),
    ]);

    return {
      queues: entries,
      pipeline: {
        articlesProcessed24h: articlesProcessed,
        iocsCreated24h: iocsCreated,
        iocsEnriched24h: iocsEnriched,
        avgNormalizeLatencyMs: 0, // TODO: track in metrics
        avgEnrichLatencyMs: 0,
      },
    };
  }

  async retriggerFailed(queueName: string): Promise<number> {
    const q = this.queues[queueName];
    if (!q) {
      throw new AppError(400, `Unknown queue: ${queueName}`, 'INVALID_QUEUE');
    }

    const failed = await q.getFailed(0, 1000);
    let count = 0;
    for (const job of failed) {
      await job.retry();
      count++;
    }
    return count;
  }

  async pauseGlobalPipeline(): Promise<void> {
    for (const name of GLOBAL_QUEUE_NAMES) {
      const q = this.queues[name];
      if (q) await q.pause();
    }
  }

  async resumeGlobalPipeline(): Promise<void> {
    for (const name of GLOBAL_QUEUE_NAMES) {
      const q = this.queues[name];
      if (q) await q.resume();
    }
  }
}
