import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IOCRepository } from '../src/repository.js';

describe('Improvement C1: Lifecycle transitions (repository)', () => {
  let mockDb: {
    ioc: {
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let repo: IOCRepository;

  beforeEach(async () => {
    mockDb = {
      ioc: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    // Import dynamically to avoid Prisma client import issues in test
    const { IOCRepository } = await import('../src/repository.js');
    repo = new IOCRepository(mockDb as never);
  });

  it('calls updateMany for all 3 transitions', async () => {
    mockDb.ioc.updateMany
      .mockResolvedValueOnce({ count: 5 })  // ACTIVE → AGING
      .mockResolvedValueOnce({ count: 3 })  // AGING → EXPIRED
      .mockResolvedValueOnce({ count: 1 }); // EXPIRED → ARCHIVED

    const result = await repo.transitionLifecycles({
      staleDays: 30,
      expireDays: 60,
      archiveDays: 90,
      batchSize: 1000,
    });

    expect(result).toEqual({ aged: 5, expired: 3, archived: 1 });
    expect(mockDb.ioc.updateMany).toHaveBeenCalledTimes(3);
  });

  it('passes correct lifecycle values to updateMany', async () => {
    mockDb.ioc.updateMany.mockResolvedValue({ count: 0 });

    await repo.transitionLifecycles({
      staleDays: 30,
      expireDays: 60,
      archiveDays: 90,
      batchSize: 1000,
    });

    // First call: ACTIVE → AGING
    const activeCall = mockDb.ioc.updateMany.mock.calls[0][0];
    expect(activeCall.where.lifecycle).toBe('active');
    expect(activeCall.data.lifecycle).toBe('aging');

    // Second call: AGING → EXPIRED
    const agingCall = mockDb.ioc.updateMany.mock.calls[1][0];
    expect(agingCall.where.lifecycle).toBe('aging');
    expect(agingCall.data.lifecycle).toBe('expired');

    // Third call: EXPIRED → ARCHIVED
    const expiredCall = mockDb.ioc.updateMany.mock.calls[2][0];
    expect(expiredCall.where.lifecycle).toBe('expired');
    expect(expiredCall.data.lifecycle).toBe('archived');
  });

  it('uses correct date thresholds', async () => {
    mockDb.ioc.updateMany.mockResolvedValue({ count: 0 });
    const before = Date.now();

    await repo.transitionLifecycles({
      staleDays: 30,
      expireDays: 60,
      archiveDays: 90,
      batchSize: 1000,
    });

    const after = Date.now();

    // ACTIVE → AGING: lastSeen < (now - 30 days)
    const staleThreshold = mockDb.ioc.updateMany.mock.calls[0][0].where.lastSeen.lt;
    const expectedStale = before - 30 * 24 * 60 * 60 * 1000;
    expect(staleThreshold.getTime()).toBeGreaterThanOrEqual(expectedStale - 1000);
    expect(staleThreshold.getTime()).toBeLessThanOrEqual(after - 30 * 24 * 60 * 60 * 1000 + 1000);

    // AGING → EXPIRED: lastSeen < (now - 60 days)
    const expireThreshold = mockDb.ioc.updateMany.mock.calls[1][0].where.lastSeen.lt;
    const expectedExpire = before - 60 * 24 * 60 * 60 * 1000;
    expect(expireThreshold.getTime()).toBeGreaterThanOrEqual(expectedExpire - 1000);
  });

  it('returns zero counts when no IOCs match', async () => {
    mockDb.ioc.updateMany.mockResolvedValue({ count: 0 });

    const result = await repo.transitionLifecycles({
      staleDays: 30,
      expireDays: 60,
      archiveDays: 90,
      batchSize: 1000,
    });

    expect(result).toEqual({ aged: 0, expired: 0, archived: 0 });
  });
});
