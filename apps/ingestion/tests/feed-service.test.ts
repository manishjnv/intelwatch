import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedService } from '../src/service.js';

// Mock config
vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    TI_MAX_FEEDS_PER_TENANT: 50,
    TI_MAX_CONSECUTIVE_FAILURES: 5,
  }),
}));

function createMockRepo() {
  return {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    countByTenant: vi.fn(),
    getHealth: vi.fn(),
    getStats: vi.fn(),
    updateHealth: vi.fn(),
  };
}

function createMockQueue() {
  return { add: vi.fn() };
}

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

const TENANT_ID = 'tenant-uuid-1';
const FEED_ID = 'feed-uuid-1';

function makeFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID,
    tenantId: TENANT_ID,
    name: 'Test RSS Feed',
    feedType: 'rss',
    url: 'https://example.com/feed.rss',
    status: 'active',
    enabled: true,
    consecutiveFailures: 0,
    schedule: '0 * * * *',
    headers: {},
    authConfig: {},
    parseConfig: {},
    description: null,
    lastFetchAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    totalItemsIngested: 0,
    itemsIngested24h: 0,
    itemsRelevant24h: 0,
    avgProcessingTimeMs: 0,
    feedReliability: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('FeedService.createFeed', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let queue: ReturnType<typeof createMockQueue>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    queue = createMockQueue();
    service = new FeedService(repo as never, queue as never, createMockLogger() as never);
  });

  it('creates a feed with valid RSS config', async () => {
    const feed = makeFeed();
    repo.countByTenant.mockResolvedValue(0);
    repo.create.mockResolvedValue(feed);

    const result = await service.createFeed(TENANT_ID, {
      name: 'Test RSS Feed', feedType: 'rss', url: 'https://example.com/feed.rss',
    });

    expect(result.id).toBe(FEED_ID);
    expect(result.feedType).toBe('rss');
    expect(repo.create).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ name: 'Test RSS Feed' }));
  });

  it('rejects when tenant feed limit is reached', async () => {
    repo.countByTenant.mockResolvedValue(50);

    await expect(
      service.createFeed(TENANT_ID, { name: 'Extra Feed', feedType: 'rss', url: 'https://example.com/feed.rss' }),
    ).rejects.toThrow('Feed limit reached');
  });

  it('sets default schedule to hourly when omitted', async () => {
    repo.countByTenant.mockResolvedValue(0);
    repo.create.mockResolvedValue(makeFeed());

    await service.createFeed(TENANT_ID, { name: 'No Schedule', feedType: 'rss', url: 'https://example.com/feed.rss' });

    expect(repo.create).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ schedule: '0 * * * *' }));
  });
});

describe('FeedService.listFeeds', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new FeedService(repo as never, createMockQueue() as never, createMockLogger() as never);
  });

  it('returns paginated results', async () => {
    repo.findMany.mockResolvedValue([makeFeed(), makeFeed({ id: 'feed-2' })]);
    repo.count.mockResolvedValue(2);

    const result = await service.listFeeds(TENANT_ID, { page: 1, limit: 50 });

    expect(result.data).toHaveLength(2);
    expect(result.pagination).toEqual({ page: 1, limit: 50, total: 2, totalPages: 1 });
  });

  it('calculates totalPages correctly', async () => {
    repo.findMany.mockResolvedValue([]);
    repo.count.mockResolvedValue(120);

    const result = await service.listFeeds(TENANT_ID, { page: 1, limit: 50 });

    expect(result.pagination.totalPages).toBe(3);
  });
});

describe('FeedService.getFeed', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new FeedService(repo as never, createMockQueue() as never, createMockLogger() as never);
  });

  it('returns feed when found', async () => {
    repo.findById.mockResolvedValue(makeFeed());

    const result = await service.getFeed(TENANT_ID, FEED_ID);
    expect(result.id).toBe(FEED_ID);
  });

  it('throws 404 when not found', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.getFeed(TENANT_ID, FEED_ID)).rejects.toThrow('Feed not found');
  });
});

describe('FeedService.updateFeed', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new FeedService(repo as never, createMockQueue() as never, createMockLogger() as never);
  });

  it('updates feed fields', async () => {
    repo.findById.mockResolvedValue(makeFeed());
    repo.update.mockResolvedValue(makeFeed({ name: 'Updated Name' }));

    const result = await service.updateFeed(TENANT_ID, FEED_ID, { name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('resets consecutiveFailures when status set to active', async () => {
    repo.findById.mockResolvedValue(makeFeed({ status: 'error', consecutiveFailures: 3 }));
    repo.update.mockResolvedValue(makeFeed({ status: 'active', consecutiveFailures: 0 }));

    await service.updateFeed(TENANT_ID, FEED_ID, { status: 'active' });

    expect(repo.update).toHaveBeenCalledWith(
      TENANT_ID, FEED_ID,
      expect.objectContaining({ status: 'active', consecutiveFailures: 0 }),
    );
  });

  it('throws 404 for missing feed', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.updateFeed(TENANT_ID, FEED_ID, { name: 'X' })).rejects.toThrow('Feed not found');
  });
});

describe('FeedService.deleteFeed', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new FeedService(repo as never, createMockQueue() as never, createMockLogger() as never);
  });

  it('soft-deletes an existing feed', async () => {
    repo.findById.mockResolvedValue(makeFeed());
    repo.softDelete.mockResolvedValue(makeFeed({ enabled: false, status: 'disabled' }));

    const result = await service.deleteFeed(TENANT_ID, FEED_ID);
    expect(result).toEqual({ success: true });
    expect(repo.softDelete).toHaveBeenCalledWith(TENANT_ID, FEED_ID);
  });

  it('throws 404 for missing feed', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.deleteFeed(TENANT_ID, FEED_ID)).rejects.toThrow('Feed not found');
  });
});

describe('FeedService.triggerFeed', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let queue: ReturnType<typeof createMockQueue>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    queue = createMockQueue();
    service = new FeedService(repo as never, queue as never, createMockLogger() as never);
  });

  it('enqueues a feed fetch job', async () => {
    repo.findById.mockResolvedValue(makeFeed());
    queue.add.mockResolvedValue({ id: 'job-1' });

    const result = await service.triggerFeed(TENANT_ID, FEED_ID);

    expect(result.jobId).toBe('job-1');
    expect(result.message).toBe('Feed fetch queued');
    expect(queue.add).toHaveBeenCalledWith(
      'etip-feed-fetch',
      expect.objectContaining({ feedId: FEED_ID, tenantId: TENANT_ID }),
      expect.any(Object),
    );
  });

  it('rejects disabled feed', async () => {
    repo.findById.mockResolvedValue(makeFeed({ enabled: false }));

    await expect(service.triggerFeed(TENANT_ID, FEED_ID)).rejects.toThrow('Feed is disabled');
  });

  it('rejects feed with circuit-breaker open', async () => {
    repo.findById.mockResolvedValue(makeFeed({ consecutiveFailures: 5 }));

    await expect(service.triggerFeed(TENANT_ID, FEED_ID)).rejects.toThrow('circuit-breaker open');
  });
});

describe('FeedService.getFeedHealth', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new FeedService(repo as never, createMockQueue() as never, createMockLogger() as never);
  });

  it('returns health data', async () => {
    repo.findById.mockResolvedValue(makeFeed());
    repo.getHealth.mockResolvedValue({
      lastFetchAt: null, lastErrorAt: null, lastErrorMessage: null,
      consecutiveFailures: 0, feedReliability: 50, totalItemsIngested: 0,
      itemsIngested24h: 0, itemsRelevant24h: 0, avgProcessingTimeMs: 0,
    });

    const health = await service.getFeedHealth(TENANT_ID, FEED_ID);
    expect(health.feedReliability).toBe(50);
  });
});

describe('FeedService.getFeedStats', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: FeedService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new FeedService(repo as never, createMockQueue() as never, createMockLogger() as never);
  });

  it('returns aggregate stats', async () => {
    repo.getStats.mockResolvedValue({
      totalFeeds: 3, byStatus: { active: 2, paused: 1 }, byType: { rss: 2, stix: 1 },
      totalItemsIngested: 500, avgReliability: 75,
    });

    const stats = await service.getFeedStats(TENANT_ID);
    expect(stats.totalFeeds).toBe(3);
    expect(stats.avgReliability).toBe(75);
  });
});
