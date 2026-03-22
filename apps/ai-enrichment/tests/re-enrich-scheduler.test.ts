import { describe, it, expect, vi } from 'vitest';
import { ReEnrichScheduler, RE_ENRICH_TTL_HOURS } from '../src/workers/re-enrich-scheduler.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRepo(staleIOCs: any[] = []) {
  return {
    findStaleEnrichment: vi.fn().mockResolvedValue(staleIOCs),
  } as any;
}

function mockQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  } as any;
}

function makeStaleIOC(id: string, iocType = 'ip') {
  return {
    id,
    tenantId: 'tenant-1',
    iocType,
    normalizedValue: '192.168.1.1',
    confidence: 75,
    severity: 'high',
    enrichmentData: {},
    enrichedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
  };
}

describe('ReEnrichScheduler', () => {
  describe('scan', () => {
    it('finds stale IOCs and enqueues re-enrichment jobs', async () => {
      const stale = [makeStaleIOC('ioc-1'), makeStaleIOC('ioc-2')];
      const repo = mockRepo(stale);
      const queue = mockQueue();
      const scheduler = new ReEnrichScheduler(repo, queue, logger);

      const queued = await scheduler.scan();

      expect(queued).toBe(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(
        're-enrich-ioc-1',
        expect.objectContaining({ iocId: 'ioc-1', tenantId: 'tenant-1' }),
        expect.objectContaining({ priority: 10 }),
      );
    });

    it('returns 0 when no stale IOCs found', async () => {
      const repo = mockRepo([]);
      const queue = mockQueue();
      const scheduler = new ReEnrichScheduler(repo, queue, logger);

      const queued = await scheduler.scan();
      expect(queued).toBe(0);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('handles queue.add failures gracefully', async () => {
      const stale = [makeStaleIOC('ioc-1'), makeStaleIOC('ioc-2')];
      const repo = mockRepo(stale);
      const queue = mockQueue();
      queue.add.mockRejectedValueOnce(new Error('queue full')).mockResolvedValueOnce({});
      const scheduler = new ReEnrichScheduler(repo, queue, logger);

      const queued = await scheduler.scan();
      expect(queued).toBe(1); // Only second succeeded
    });

    it('handles repo error gracefully', async () => {
      const repo = mockRepo();
      repo.findStaleEnrichment.mockRejectedValue(new Error('DB down'));
      const queue = mockQueue();
      const scheduler = new ReEnrichScheduler(repo, queue, logger);

      const queued = await scheduler.scan();
      expect(queued).toBe(0);
    });

    it('uses lower priority (10) for re-enrichment jobs', async () => {
      const stale = [makeStaleIOC('ioc-1')];
      const repo = mockRepo(stale);
      const queue = mockQueue();
      const scheduler = new ReEnrichScheduler(repo, queue, logger);

      await scheduler.scan();
      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { priority: 10 },
      );
    });
  });

  describe('start/stop', () => {
    it('starts and stops the scheduler timer', () => {
      const repo = mockRepo();
      const queue = mockQueue();
      const scheduler = new ReEnrichScheduler(repo, queue, logger, 60_000);

      scheduler.start();
      // Starting again is a no-op (no duplicate timers)
      scheduler.start();
      scheduler.stop();
    });
  });

  describe('RE_ENRICH_TTL_HOURS', () => {
    it('has shorter TTL for IPs than hashes', () => {
      expect(RE_ENRICH_TTL_HOURS.ip).toBeLessThan(RE_ENRICH_TTL_HOURS.hash_sha256);
    });

    it('has TTL defined for common types', () => {
      expect(RE_ENRICH_TTL_HOURS.ip).toBe(24);
      expect(RE_ENRICH_TTL_HOURS.domain).toBe(72);
      expect(RE_ENRICH_TTL_HOURS.hash_sha256).toBe(168);
      expect(RE_ENRICH_TTL_HOURS.cve).toBe(72);
    });
  });
});
