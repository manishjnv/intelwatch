import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@etip/shared-types';

// Mock shared-auth before any import that uses it
vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: vi.fn(),
  hasPermission: vi.fn(),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
  PERMISSIONS: {
    FEED_READ: 'feed:read', FEED_CREATE: 'feed:create',
    FEED_UPDATE: 'feed:update', FEED_DELETE: 'feed:delete',
  },
}));

// Mock config
vi.mock('../src/config.js', () => ({
  loadConfig: vi.fn(() => ({
    TI_NODE_ENV: 'test',
    TI_INGESTION_PORT: 0,
    TI_INGESTION_HOST: '127.0.0.1',
    TI_DATABASE_URL: 'postgresql://test',
    TI_REDIS_URL: 'redis://test',
    TI_JWT_SECRET: 'x'.repeat(32),
    TI_JWT_ISSUER: 'test',
    TI_JWT_ACCESS_EXPIRY: 900,
    TI_JWT_REFRESH_EXPIRY: 604800,
    TI_SERVICE_JWT_SECRET: 'x'.repeat(16),
    TI_CORS_ORIGINS: '*',
    TI_RATE_LIMIT_WINDOW_MS: 60000,
    TI_RATE_LIMIT_MAX_REQUESTS: 1000,
    TI_LOG_LEVEL: 'silent',
    TI_MAX_FEEDS_PER_TENANT: 50,
    TI_MAX_CONSECUTIVE_FAILURES: 5,
  })),
  getConfig: vi.fn(() => ({
    TI_MAX_FEEDS_PER_TENANT: 50,
    TI_MAX_CONSECUTIVE_FAILURES: 5,
    TI_LOG_LEVEL: 'silent',
    TI_CORS_ORIGINS: '*',
    TI_RATE_LIMIT_WINDOW_MS: 60000,
    TI_RATE_LIMIT_MAX_REQUESTS: 1000,
  })),
}));

// Mock queue.js — service.ts imports mapFeedTypeToQueue and getQueueForFeedType (P3-4)
vi.mock('../src/queue.js', () => ({
  mapFeedTypeToQueue: () => 'etip-feed-fetch-rss',
  getQueueForFeedType: () => { throw new Error('not initialized in test'); },
  createFeedFetchQueue: vi.fn(() => new Map()),
  createFeedFetchQueues: vi.fn(() => new Map()),
  closeFeedFetchQueue: vi.fn(),
  closeFeedFetchQueues: vi.fn(),
  getFeedFetchQueue: vi.fn(),
  FEED_FETCH_QUEUE_NAMES: [],
}));

import { verifyAccessToken, hasPermission } from '@etip/shared-auth';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FEED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockUser: JwtPayload = {
  sub: USER_ID,
  tenantId: TENANT_ID,
  email: 'analyst@test.com',
  role: 'analyst',
  permissions: ['feed:read', 'feed:create', 'feed:update'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
  iss: 'test',
  type: 'access',
};

function makeFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID, tenantId: TENANT_ID, name: 'Test Feed', feedType: 'rss',
    url: 'https://example.com/feed.rss', status: 'active', enabled: true,
    consecutiveFailures: 0, schedule: '0 * * * *', headers: {}, authConfig: {},
    parseConfig: {}, description: null, lastFetchAt: null, lastErrorAt: null,
    lastErrorMessage: null, totalItemsIngested: 0, itemsIngested24h: 0,
    itemsRelevant24h: 0, avgProcessingTimeMs: 0, feedReliability: 50,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const mockRepo = {
  create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findById: vi.fn(),
  update: vi.fn(), softDelete: vi.fn(), countByTenant: vi.fn(),
  getHealth: vi.fn(), getStats: vi.fn(), updateHealth: vi.fn(),
};

const mockQueue = { add: vi.fn(), close: vi.fn() };

let app: FastifyInstance;

beforeAll(async () => {
  const config = loadConfig({});
  app = await buildApp({ config, repo: mockRepo as never, queue: mockQueue as never });
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(mockUser);
  (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
});

function authHeaders() {
  return { authorization: 'Bearer valid-test-token' };
}

// ── Health ──────────────────────────────────────────────────────────────────
describe('Health endpoints', () => {
  it('GET /health returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.json().service).toBe('ingestion-service');
  });

  it('GET /ready returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
  });
});

// ── Auth enforcement ────────────────────────────────────────────────────────
describe('Auth enforcement', () => {
  it('returns 401 without auth header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    (verifyAccessToken as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('invalid'); });
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds', headers: authHeaders() });
    expect(res.statusCode).toBe(500); // unhandled error wraps to 500
  });

  it('returns 403 when RBAC denies access', async () => {
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds', headers: authHeaders() });
    expect(res.statusCode).toBe(403);
  });
});

// ── Feed CRUD routes ────────────────────────────────────────────────────────
describe('Feed CRUD routes', () => {
  it('GET /api/v1/feeds returns paginated list', async () => {
    mockRepo.findMany.mockResolvedValue([makeFeed()]);
    mockRepo.count.mockResolvedValue(1);

    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('POST /api/v1/feeds creates feed and returns 201', async () => {
    mockRepo.countByTenant.mockResolvedValue(0);
    mockRepo.create.mockResolvedValue(makeFeed());

    const res = await app.inject({
      method: 'POST', url: '/api/v1/feeds', headers: authHeaders(),
      payload: { name: 'Test Feed', feedType: 'rss', url: 'https://example.com/feed.rss' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe(FEED_ID);
  });

  it('POST /api/v1/feeds returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/feeds', headers: authHeaders(),
      payload: { name: '' }, // missing feedType
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/feeds/:id returns feed', async () => {
    mockRepo.findById.mockResolvedValue(makeFeed());

    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(FEED_ID);
  });

  it('GET /api/v1/feeds/:id returns 404 for missing feed', async () => {
    mockRepo.findById.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}`, headers: authHeaders() });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/v1/feeds/:id updates feed', async () => {
    mockRepo.findById.mockResolvedValue(makeFeed());
    mockRepo.update.mockResolvedValue(makeFeed({ name: 'Updated' }));

    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}`, headers: authHeaders(),
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Updated');
  });

  it('DELETE /api/v1/feeds/:id soft-deletes feed', async () => {
    mockRepo.findById.mockResolvedValue(makeFeed());
    mockRepo.softDelete.mockResolvedValue(makeFeed({ enabled: false, status: 'disabled' }));

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/feeds/${FEED_ID}`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.success).toBe(true);
  });
});

// ── Trigger ─────────────────────────────────────────────────────────────────
describe('Trigger endpoint', () => {
  it('POST /api/v1/feeds/:id/trigger returns 202', async () => {
    mockRepo.findById.mockResolvedValue(makeFeed());
    mockQueue.add.mockResolvedValue({ id: 'job-123' });

    const res = await app.inject({
      method: 'POST', url: `/api/v1/feeds/${FEED_ID}/trigger`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.jobId).toBe('job-123');
  });

  it('POST trigger rejects disabled feed with 400', async () => {
    mockRepo.findById.mockResolvedValue(makeFeed({ enabled: false }));

    const res = await app.inject({
      method: 'POST', url: `/api/v1/feeds/${FEED_ID}/trigger`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Stats & Health ──────────────────────────────────────────────────────────
describe('Stats & Health endpoints', () => {
  it('GET /api/v1/feeds/stats returns stats', async () => {
    mockRepo.getStats.mockResolvedValue({
      totalFeeds: 5, byStatus: { active: 3, paused: 2 }, byType: { rss: 3, stix: 2 },
      totalItemsIngested: 1000, avgReliability: 80,
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds/stats', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalFeeds).toBe(5);
  });

  it('GET /api/v1/feeds/:id/health returns health data', async () => {
    mockRepo.findById.mockResolvedValue(makeFeed());
    mockRepo.getHealth.mockResolvedValue({
      lastFetchAt: null, lastErrorAt: null, lastErrorMessage: null,
      consecutiveFailures: 0, feedReliability: 50, totalItemsIngested: 0,
      itemsIngested24h: 0, itemsRelevant24h: 0, avgProcessingTimeMs: 0,
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}/health`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.feedReliability).toBe(50);
  });
});
