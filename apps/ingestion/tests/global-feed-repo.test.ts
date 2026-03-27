import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalFeedRepository } from '../src/repositories/global-feed-repo.js';

function makeMockPrisma() {
  return {
    globalFeedCatalog: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

const FEED_ID = 'aaaa-bbbb-cccc-dddd';

function makeCatalogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID, name: 'Test OSINT Feed', feedType: 'rss',
    url: 'https://feed.example.com/rss', schedule: '*/30 * * * *',
    status: 'active', enabled: true, minPlanTier: 'free',
    sourceReliability: 'C', infoCred: 3, feedReliability: 51,
    subscriberCount: 0, industries: [], totalItemsIngested: 0,
    consecutiveFailures: 0, ...overrides,
  };
}

describe('GlobalFeedRepository', () => {
  let repo: GlobalFeedRepository;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = new GlobalFeedRepository(prisma as never);
  });

  describe('listCatalog', () => {
    it('returns all feeds when no filters', async () => {
      prisma.globalFeedCatalog.findMany.mockResolvedValue([makeCatalogEntry()]);
      const result = await repo.listCatalog();
      expect(result).toHaveLength(1);
      expect(prisma.globalFeedCatalog.findMany).toHaveBeenCalledWith({
        where: {}, orderBy: { name: 'asc' },
      });
    });

    it('applies feedType filter', async () => {
      prisma.globalFeedCatalog.findMany.mockResolvedValue([]);
      await repo.listCatalog({ feedType: 'nvd' });
      expect(prisma.globalFeedCatalog.findMany).toHaveBeenCalledWith({
        where: { feedType: 'nvd' }, orderBy: { name: 'asc' },
      });
    });

    it('applies minPlanTier filter', async () => {
      prisma.globalFeedCatalog.findMany.mockResolvedValue([]);
      await repo.listCatalog({ minPlanTier: 'starter' });
      expect(prisma.globalFeedCatalog.findMany).toHaveBeenCalledWith({
        where: { minPlanTier: 'starter' }, orderBy: { name: 'asc' },
      });
    });

    it('applies enabled filter', async () => {
      prisma.globalFeedCatalog.findMany.mockResolvedValue([]);
      await repo.listCatalog({ enabled: true });
      expect(prisma.globalFeedCatalog.findMany).toHaveBeenCalledWith({
        where: { enabled: true }, orderBy: { name: 'asc' },
      });
    });
  });

  describe('getCatalogEntry', () => {
    it('returns entry when found', async () => {
      const entry = makeCatalogEntry();
      prisma.globalFeedCatalog.findUnique.mockResolvedValue(entry);
      const result = await repo.getCatalogEntry(FEED_ID);
      expect(result).toEqual(entry);
    });

    it('returns null when not found', async () => {
      prisma.globalFeedCatalog.findUnique.mockResolvedValue(null);
      const result = await repo.getCatalogEntry('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createCatalogEntry', () => {
    it('creates with auto-computed feedReliability', async () => {
      prisma.globalFeedCatalog.create.mockResolvedValue(makeCatalogEntry());
      await repo.createCatalogEntry({
        name: 'Test Feed', feedType: 'rss', url: 'https://example.com',
        sourceReliability: 'B', infoCred: 2,
      });
      const call = prisma.globalFeedCatalog.create.mock.calls[0][0];
      // B2: (5-1)*14 + (6-2)*3 = 56+12 = 68
      expect(call.data.feedReliability).toBe(68);
      expect(call.data.sourceReliability).toBe('B');
      expect(call.data.infoCred).toBe(2);
    });

    it('uses defaults when sourceReliability/infoCred not specified', async () => {
      prisma.globalFeedCatalog.create.mockResolvedValue(makeCatalogEntry());
      await repo.createCatalogEntry({ name: 'Feed', feedType: 'rss', url: 'https://example.com' });
      const call = prisma.globalFeedCatalog.create.mock.calls[0][0];
      // C3: (5-2)*14 + (6-3)*3 = 42+9 = 51
      expect(call.data.feedReliability).toBe(51);
    });
  });

  describe('updateCatalogEntry', () => {
    it('calls prisma update with correct id', async () => {
      prisma.globalFeedCatalog.update.mockResolvedValue(makeCatalogEntry({ name: 'Updated' }));
      await repo.updateCatalogEntry(FEED_ID, { name: 'Updated' });
      expect(prisma.globalFeedCatalog.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: FEED_ID } }),
      );
    });

    it('recomputes feedReliability when sourceReliability changes', async () => {
      prisma.globalFeedCatalog.findUnique.mockResolvedValue(makeCatalogEntry());
      prisma.globalFeedCatalog.update.mockResolvedValue(makeCatalogEntry());
      await repo.updateCatalogEntry(FEED_ID, { sourceReliability: 'A' });
      const call = prisma.globalFeedCatalog.update.mock.calls[0][0];
      // A + existing infoCred 3: (5-0)*14 + (6-3)*3 = 70+9 = 79
      expect(call.data.feedReliability).toBe(79);
    });
  });

  describe('deleteCatalogEntry', () => {
    it('calls prisma delete', async () => {
      prisma.globalFeedCatalog.delete.mockResolvedValue(makeCatalogEntry());
      await repo.deleteCatalogEntry(FEED_ID);
      expect(prisma.globalFeedCatalog.delete).toHaveBeenCalledWith({ where: { id: FEED_ID } });
    });
  });

  describe('incrementSubscriberCount', () => {
    it('increments by +1', async () => {
      prisma.globalFeedCatalog.update.mockResolvedValue(makeCatalogEntry());
      await repo.incrementSubscriberCount(FEED_ID, 1);
      expect(prisma.globalFeedCatalog.update).toHaveBeenCalledWith({
        where: { id: FEED_ID },
        data: { subscriberCount: { increment: 1 } },
      });
    });

    it('decrements by -1', async () => {
      prisma.globalFeedCatalog.update.mockResolvedValue(makeCatalogEntry());
      await repo.incrementSubscriberCount(FEED_ID, -1);
      expect(prisma.globalFeedCatalog.update).toHaveBeenCalledWith({
        where: { id: FEED_ID },
        data: { subscriberCount: { increment: -1 } },
      });
    });
  });

  describe('updateFetchStats', () => {
    it('updates lastFetchAt and optional fields', async () => {
      const now = new Date();
      prisma.globalFeedCatalog.update.mockResolvedValue(makeCatalogEntry());
      await repo.updateFetchStats(FEED_ID, { lastFetchAt: now, totalItemsIngested: 500 });
      const call = prisma.globalFeedCatalog.update.mock.calls[0][0];
      expect(call.data.lastFetchAt).toBe(now);
      expect(call.data.totalItemsIngested).toBe(500);
    });
  });
});
