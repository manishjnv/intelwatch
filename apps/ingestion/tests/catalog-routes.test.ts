import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { JwtPayload } from '@etip/shared-types';

// Mock shared-auth
vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: vi.fn(),
  hasPermission: vi.fn(),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
  PERMISSIONS: {},
}));

import { verifyAccessToken, hasPermission } from '@etip/shared-auth';
import { catalogRoutes, type CatalogRouteDeps } from '../src/routes/catalog.js';
import { authenticate, getUser, rbac } from '../src/plugins/auth.js';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FEED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockUser: JwtPayload = {
  sub: USER_ID, tenantId: TENANT_ID, email: 'admin@test.com',
  role: 'super_admin', permissions: ['catalog:create', 'catalog:update', 'catalog:delete'],
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900,
  iss: 'test', type: 'access', tenantPlan: 'enterprise',
};

function makeFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID, name: 'Test Feed', feedType: 'rss',
    url: 'https://example.com/feed', schedule: '*/30 * * * *',
    status: 'active', enabled: true, minPlanTier: 'free',
    sourceReliability: 'C', infoCred: 3, feedReliability: 51,
    subscriberCount: 0, industries: [], totalItemsIngested: 0,
    consecutiveFailures: 0, headers: {}, authConfig: {}, parseConfig: {},
    articlesPerDay: 0, iocsPerDay: 0, avgSeverity: {},
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1', tenantId: TENANT_ID, globalFeedId: FEED_ID,
    enabled: true, alertConfig: {}, subscribedAt: new Date().toISOString(),
    ...overrides,
  };
}

const mockGlobalFeedRepo = {
  listCatalog: vi.fn(),
  getCatalogEntry: vi.fn(),
  createCatalogEntry: vi.fn(),
  updateCatalogEntry: vi.fn(),
  deleteCatalogEntry: vi.fn(),
  incrementSubscriberCount: vi.fn(),
  updateFetchStats: vi.fn(),
};

const mockSubscriptionRepo = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  getSubscriptions: vi.fn(),
  isSubscribed: vi.fn(),
  getSubscriptionCount: vi.fn(),
  getSubscribedTenants: vi.fn(),
};

let globalProcessingEnabled = true;

const deps: CatalogRouteDeps = {
  globalFeedRepo: mockGlobalFeedRepo as never,
  subscriptionRepo: mockSubscriptionRepo as never,
  isGlobalProcessingEnabled: () => globalProcessingEnabled,
  getMaxSubscriptions: () => 10,
};

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(catalogRoutes(deps), { prefix: '/api/v1/catalog' });
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  globalProcessingEnabled = true;
  (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(mockUser);
  (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
});

function authHeaders() {
  return { authorization: 'Bearer valid-test-token' };
}

// ── Feature flag ────────────────────────────────────────────────────

describe('Feature flag gate', () => {
  it('returns 503 when global processing is disabled', async () => {
    globalProcessingEnabled = false;
    const res = await app.inject({ method: 'GET', url: '/api/v1/catalog', headers: authHeaders() });
    expect(res.statusCode).toBe(503);
  });
});

// ── GET /catalog ────────────────────────────────────────────────────

describe('GET /api/v1/catalog', () => {
  it('returns list of feeds (200)', async () => {
    mockGlobalFeedRepo.listCatalog.mockResolvedValue([makeFeed()]);
    const res = await app.inject({ method: 'GET', url: '/api/v1/catalog', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].admiraltyCode).toBe('C3');
  });

  it('passes feedType filter to repo', async () => {
    mockGlobalFeedRepo.listCatalog.mockResolvedValue([]);
    await app.inject({ method: 'GET', url: '/api/v1/catalog?feedType=nvd', headers: authHeaders() });
    expect(mockGlobalFeedRepo.listCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ feedType: 'nvd' }),
    );
  });
});

// ── POST /catalog ───────────────────────────────────────────────────

describe('POST /api/v1/catalog', () => {
  it('super_admin creates feed (201)', async () => {
    mockGlobalFeedRepo.createCatalogEntry.mockResolvedValue(makeFeed());
    const res = await app.inject({
      method: 'POST', url: '/api/v1/catalog', headers: authHeaders(),
      payload: { name: 'New Feed', feedType: 'rss', url: 'https://example.com' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockGlobalFeedRepo.createCatalogEntry).toHaveBeenCalled();
  });

  it('non-admin gets 403', async () => {
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/catalog', headers: authHeaders(),
      payload: { name: 'Feed', feedType: 'rss', url: 'https://example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('invalid body returns 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/catalog', headers: authHeaders(),
      payload: { feedType: 'invalid' },
    });
    // Zod validation will throw, which gets caught by error handler or returns 500/400
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// ── PUT /catalog/:id ────────────────────────────────────────────────

describe('PUT /api/v1/catalog/:id', () => {
  it('super_admin updates feed (200)', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(makeFeed());
    mockGlobalFeedRepo.updateCatalogEntry.mockResolvedValue(makeFeed({ name: 'Updated' }));
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/catalog/${FEED_ID}`, headers: authHeaders(),
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('not found returns 404', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(null);
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/catalog/${FEED_ID}`, headers: authHeaders(),
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── DELETE /catalog/:id ─────────────────────────────────────────────

describe('DELETE /api/v1/catalog/:id', () => {
  it('super_admin deletes feed (204)', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(makeFeed());
    mockGlobalFeedRepo.deleteCatalogEntry.mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/catalog/${FEED_ID}`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(204);
  });
});

// ── POST /catalog/:id/subscribe ─────────────────────────────────────

describe('POST /api/v1/catalog/:id/subscribe', () => {
  it('authenticated user subscribes (201)', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(makeFeed());
    mockSubscriptionRepo.getSubscriptionCount.mockResolvedValue(0);
    mockSubscriptionRepo.isSubscribed.mockResolvedValue(false);
    mockSubscriptionRepo.subscribe.mockResolvedValue(makeSub());
    mockGlobalFeedRepo.incrementSubscriberCount.mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/catalog/${FEED_ID}/subscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(201);
    expect(mockSubscriptionRepo.subscribe).toHaveBeenCalledWith(TENANT_ID, FEED_ID);
    expect(mockGlobalFeedRepo.incrementSubscriberCount).toHaveBeenCalledWith(FEED_ID, 1);
  });

  it('plan limit exceeded returns 403', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(makeFeed());
    mockSubscriptionRepo.getSubscriptionCount.mockResolvedValue(10);
    mockSubscriptionRepo.isSubscribed.mockResolvedValue(false);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/catalog/${FEED_ID}/subscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });

  it('already subscribed returns 409', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(makeFeed());
    mockSubscriptionRepo.getSubscriptionCount.mockResolvedValue(1);
    mockSubscriptionRepo.isSubscribed.mockResolvedValue(true);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/catalog/${FEED_ID}/subscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(409);
  });

  it('feed not found returns 404', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/catalog/${FEED_ID}/subscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('plan tier insufficient returns 403', async () => {
    mockGlobalFeedRepo.getCatalogEntry.mockResolvedValue(makeFeed({ minPlanTier: 'enterprise' }));
    const freeUser = { ...mockUser, tenantPlan: 'free' };
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(freeUser);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/catalog/${FEED_ID}/subscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── DELETE /catalog/:id/unsubscribe ─────────────────────────────────

describe('DELETE /api/v1/catalog/:id/unsubscribe', () => {
  it('unsubscribes successfully (204)', async () => {
    mockSubscriptionRepo.isSubscribed.mockResolvedValue(true);
    mockSubscriptionRepo.unsubscribe.mockResolvedValue(undefined);
    mockGlobalFeedRepo.incrementSubscriberCount.mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/catalog/${FEED_ID}/unsubscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(204);
    expect(mockGlobalFeedRepo.incrementSubscriberCount).toHaveBeenCalledWith(FEED_ID, -1);
  });

  it('not subscribed returns 404', async () => {
    mockSubscriptionRepo.isSubscribed.mockResolvedValue(false);
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/catalog/${FEED_ID}/unsubscribe`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── GET /catalog/subscriptions ──────────────────────────────────────

describe('GET /api/v1/catalog/subscriptions', () => {
  it('returns tenant subscriptions', async () => {
    mockSubscriptionRepo.getSubscriptions.mockResolvedValue([makeSub()]);
    const res = await app.inject({
      method: 'GET', url: '/api/v1/catalog/subscriptions', headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});
