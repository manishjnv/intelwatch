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
    FEED_READ:   'feed:read',
    FEED_CREATE: 'feed:create',
    FEED_UPDATE: 'feed:update',
    FEED_DELETE: 'feed:delete',
  },
}));

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

import { verifyAccessToken, hasPermission } from '@etip/shared-auth';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FeedPolicyStore } from '../src/services/feed-policy-store.js';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FEED_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID   = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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
  findAllActive: vi.fn(),
};

const mockQueue = { add: vi.fn(), close: vi.fn() };

let app: FastifyInstance;
let policyStore: FeedPolicyStore;

beforeAll(async () => {
  policyStore = new FeedPolicyStore();
  const config = loadConfig({});
  app = await buildApp({ config, repo: mockRepo as never, queue: mockQueue as never, policyStore });
  await app.ready();
});

afterAll(async () => { await app.close(); });

beforeEach(() => {
  vi.clearAllMocks();
  (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(mockUser);
  (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
  mockRepo.findById.mockResolvedValue(makeFeed());
  // Reset store between tests
  policyStore.deletePolicy(TENANT_ID, FEED_ID);
});

function authHeaders() {
  return { authorization: 'Bearer valid-test-token' };
}

// ── GET /api/v1/feeds/policies ───────────────────────────────────────────────
describe('GET /api/v1/feeds/policies', () => {
  it('returns 200 with empty array when no policies exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds/policies', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns 200 with list of policies', async () => {
    policyStore.setPolicy(TENANT_ID, FEED_ID, { dailyLimit: 50, category: 'ioc_feed' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds/policies', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].dailyLimit).toBe(50);
    expect(body.data[0].category).toBe('ioc_feed');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds/policies' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when RBAC denies access', async () => {
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await app.inject({ method: 'GET', url: '/api/v1/feeds/policies', headers: authHeaders() });
    expect(res.statusCode).toBe(403);
  });
});

// ── GET /api/v1/feeds/:id/policy ─────────────────────────────────────────────
describe('GET /api/v1/feeds/:id/policy', () => {
  it('returns 200 with auto-initialised defaults for known feed', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.feedId).toBe(FEED_ID);
    expect(body.data.dailyLimit).toBe(100);       // default
    expect(body.data.aiEnabled).toBe(true);       // default
    expect(body.data.currentDayCount).toBe(0);
  });

  it('returns 200 with existing policy values', async () => {
    policyStore.setPolicy(TENANT_ID, FEED_ID, { dailyLimit: 30, aiEnabled: false });
    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.dailyLimit).toBe(30);
    expect(body.data.aiEnabled).toBe(false);
  });

  it('returns 404 when feed does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders() });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/feeds/${FEED_ID}/policy` });
    expect(res.statusCode).toBe(401);
  });
});

// ── PUT /api/v1/feeds/:id/policy ─────────────────────────────────────────────
describe('PUT /api/v1/feeds/:id/policy', () => {
  it('returns 200 and creates policy with supplied fields', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders(),
      payload: { dailyLimit: 250, aiEnabled: false, category: 'vuln_feed' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.dailyLimit).toBe(250);
    expect(body.data.aiEnabled).toBe(false);
    expect(body.data.category).toBe('vuln_feed');
  });

  it('returns 200 for partial update (only dailyLimit)', async () => {
    policyStore.setPolicy(TENANT_ID, FEED_ID, { dailyLimit: 50, aiEnabled: false });
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders(),
      payload: { dailyLimit: 99 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.dailyLimit).toBe(99);
    expect(body.data.aiEnabled).toBe(false); // preserved
  });

  it('returns 400 for invalid dailyLimit (negative)', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders(),
      payload: { dailyLimit: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for unknown category value', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders(),
      payload: { category: 'invalid_category' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when feed does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders(),
      payload: { dailyLimit: 50 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when RBAC denies FEED_UPDATE', async () => {
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/feeds/${FEED_ID}/policy`, headers: authHeaders(),
      payload: { dailyLimit: 50 },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── POST /api/v1/feeds/:id/policy/reset ──────────────────────────────────────
describe('POST /api/v1/feeds/:id/policy/reset', () => {
  it('returns 200 and resets currentDayCount to 0', async () => {
    policyStore.setPolicy(TENANT_ID, FEED_ID, { dailyLimit: 100 });
    policyStore.incrementCount(TENANT_ID, FEED_ID, 75);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/feeds/${FEED_ID}/policy/reset`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.currentDayCount).toBe(0);
  });

  it('auto-inits policy and resets on first call', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/feeds/${FEED_ID}/policy/reset`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentDayCount).toBe(0);
  });

  it('returns 404 when feed does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/feeds/${FEED_ID}/policy/reset`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when RBAC denies FEED_UPDATE', async () => {
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/feeds/${FEED_ID}/policy/reset`, headers: authHeaders(),
    });
    expect(res.statusCode).toBe(403);
  });
});
