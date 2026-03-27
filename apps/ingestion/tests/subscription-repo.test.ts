import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionRepository } from '../src/repositories/subscription-repo.js';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FEED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeMockPrisma() {
  return {
    tenantFeedSubscription: {
      upsert: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
}

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1', tenantId: TENANT_ID, globalFeedId: FEED_ID,
    enabled: true, alertConfig: {}, subscribedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('SubscriptionRepository', () => {
  let repo: SubscriptionRepository;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = new SubscriptionRepository(prisma as never);
  });

  describe('subscribe', () => {
    it('upserts a subscription record', async () => {
      prisma.tenantFeedSubscription.upsert.mockResolvedValue(makeSub());
      const result = await repo.subscribe(TENANT_ID, FEED_ID);
      expect(result.tenantId).toBe(TENANT_ID);
      expect(prisma.tenantFeedSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_globalFeedId: { tenantId: TENANT_ID, globalFeedId: FEED_ID } },
        }),
      );
    });

    it('duplicate subscribe does upsert (no error)', async () => {
      prisma.tenantFeedSubscription.upsert.mockResolvedValue(makeSub());
      await expect(repo.subscribe(TENANT_ID, FEED_ID)).resolves.toBeDefined();
    });
  });

  describe('unsubscribe', () => {
    it('deletes the subscription record', async () => {
      prisma.tenantFeedSubscription.delete.mockResolvedValue(makeSub());
      await repo.unsubscribe(TENANT_ID, FEED_ID);
      expect(prisma.tenantFeedSubscription.delete).toHaveBeenCalledWith({
        where: { tenantId_globalFeedId: { tenantId: TENANT_ID, globalFeedId: FEED_ID } },
      });
    });
  });

  describe('getSubscriptions', () => {
    it('returns filtered by tenantId', async () => {
      prisma.tenantFeedSubscription.findMany.mockResolvedValue([makeSub()]);
      const result = await repo.getSubscriptions(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(prisma.tenantFeedSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });
  });

  describe('isSubscribed', () => {
    it('returns true when count > 0', async () => {
      prisma.tenantFeedSubscription.count.mockResolvedValue(1);
      expect(await repo.isSubscribed(TENANT_ID, FEED_ID)).toBe(true);
    });

    it('returns false when count = 0', async () => {
      prisma.tenantFeedSubscription.count.mockResolvedValue(0);
      expect(await repo.isSubscribed(TENANT_ID, FEED_ID)).toBe(false);
    });
  });

  describe('getSubscriptionCount', () => {
    it('returns count for tenant', async () => {
      prisma.tenantFeedSubscription.count.mockResolvedValue(3);
      expect(await repo.getSubscriptionCount(TENANT_ID)).toBe(3);
    });
  });

  describe('getSubscribedTenants', () => {
    it('returns tenant IDs for a feed', async () => {
      prisma.tenantFeedSubscription.findMany.mockResolvedValue([
        { tenantId: 'tenant-1' },
        { tenantId: 'tenant-2' },
      ]);
      const result = await repo.getSubscribedTenants(FEED_ID);
      expect(result).toEqual(['tenant-1', 'tenant-2']);
    });
  });
});
