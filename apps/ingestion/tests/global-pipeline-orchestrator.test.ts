import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalPipelineOrchestrator, GLOBAL_QUEUE_NAMES } from '../src/services/global-pipeline-orchestrator.js';
import type { Queue } from 'bullmq';

function mockQueue(overrides: Partial<Record<string, unknown>> = {}): Queue {
  return {
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1,
      ...overrides,
    }),
    getFailed: vi.fn().mockResolvedValue([
      { retry: vi.fn().mockResolvedValue(undefined) },
      { retry: vi.fn().mockResolvedValue(undefined) },
    ]),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as Queue;
}

function mockPrisma() {
  return {
    globalArticle: {
      count: vi.fn().mockResolvedValue(42),
    },
    globalIoc: {
      count: vi.fn().mockResolvedValue(15),
    },
  } as any;
}

describe('GlobalPipelineOrchestrator', () => {
  let queues: Record<string, Queue>;
  let prisma: ReturnType<typeof mockPrisma>;
  let orchestrator: GlobalPipelineOrchestrator;

  beforeEach(() => {
    queues = {};
    for (const name of GLOBAL_QUEUE_NAMES) {
      queues[name] = mockQueue();
    }
    prisma = mockPrisma();
    orchestrator = new GlobalPipelineOrchestrator(queues, prisma);
  });

  // ─── getQueueHealth ──────────────────────────────────────────

  it('getQueueHealth: returns counts for all 6 global queues', async () => {
    const health = await orchestrator.getQueueHealth();
    expect(health.queues).toHaveLength(GLOBAL_QUEUE_NAMES.length);
    for (const entry of health.queues) {
      expect(GLOBAL_QUEUE_NAMES).toContain(entry.name);
      expect(entry.waiting).toBe(5);
      expect(entry.active).toBe(2);
      expect(entry.completed).toBe(100);
      expect(entry.failed).toBe(3);
    }
  });

  it('getQueueHealth: pipeline stats computed from Prisma', async () => {
    const health = await orchestrator.getQueueHealth();
    expect(health.pipeline.articlesProcessed24h).toBe(42);
    expect(health.pipeline.iocsCreated24h).toBe(15);
    expect(prisma.globalArticle.count).toHaveBeenCalled();
    expect(prisma.globalIoc.count).toHaveBeenCalled();
  });

  it('getQueueHealth: missing queue returns zero counts', async () => {
    const sparseQueues: Record<string, Queue> = {};
    sparseQueues[GLOBAL_QUEUE_NAMES[0]] = mockQueue();
    const orch = new GlobalPipelineOrchestrator(sparseQueues, prisma);
    const health = await orch.getQueueHealth();
    const missing = health.queues.find(q => q.name === GLOBAL_QUEUE_NAMES[1]);
    expect(missing?.waiting).toBe(0);
    expect(missing?.active).toBe(0);
  });

  // ─── retriggerFailed ─────────────────────────────────────────

  it('retriggerFailed: moves failed jobs to waiting', async () => {
    const count = await orchestrator.retriggerFailed(GLOBAL_QUEUE_NAMES[0]);
    expect(count).toBe(2);
    const q = queues[GLOBAL_QUEUE_NAMES[0]];
    expect(q.getFailed).toHaveBeenCalledWith(0, 1000);
  });

  it('retriggerFailed: returns correct count', async () => {
    const q = mockQueue();
    (q.getFailed as ReturnType<typeof vi.fn>).mockResolvedValue([
      { retry: vi.fn() }, { retry: vi.fn() }, { retry: vi.fn() },
    ]);
    queues[GLOBAL_QUEUE_NAMES[0]] = q;
    const count = await orchestrator.retriggerFailed(GLOBAL_QUEUE_NAMES[0]);
    expect(count).toBe(3);
  });

  it('retriggerFailed: invalid queue name → throws', async () => {
    await expect(orchestrator.retriggerFailed('nonexistent')).rejects.toThrow('Unknown queue');
  });

  // ─── pauseGlobalPipeline ─────────────────────────────────────

  it('pauseGlobalPipeline: pauses all global queues', async () => {
    await orchestrator.pauseGlobalPipeline();
    for (const name of GLOBAL_QUEUE_NAMES) {
      expect(queues[name].pause).toHaveBeenCalled();
    }
  });

  // ─── resumeGlobalPipeline ────────────────────────────────────

  it('resumeGlobalPipeline: resumes all global queues', async () => {
    await orchestrator.resumeGlobalPipeline();
    for (const name of GLOBAL_QUEUE_NAMES) {
      expect(queues[name].resume).toHaveBeenCalled();
    }
  });
});
