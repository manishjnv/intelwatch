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
import { _resetRateLimits } from '../src/routes/feed-validation.js';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockUser: JwtPayload = {
  sub: USER_ID,
  tenantId: TENANT_ID,
  email: 'analyst@test.com',
  role: 'analyst',
  permissions: ['feed:read', 'feed:create'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
  iss: 'test',
  type: 'access',
};

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
  _resetRateLimits();
  (verifyAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(mockUser);
  (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
});

function authHeaders() {
  return { authorization: 'Bearer valid-test-token' };
}

describe('POST /api/v1/feeds/validate', () => {
  it('valid RSS URL returns valid=true with feedTitle and articleCount', async () => {
    const rssXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item><title>Article 1</title></item>
          <item><title>Article 2</title></item>
          <item><title>Article 3</title></item>
        </channel>
      </rss>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'application/rss+xml']]),
      text: vi.fn().mockResolvedValue(rssXml),
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/feeds/validate',
      headers: authHeaders(),
      payload: { url: 'https://example.com/feed.rss', feedType: 'rss' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(true);
    expect(body.data.feedTitle).toBe('Test Feed');
    expect(body.data.articleCount).toBe(3);
    expect(typeof body.data.responseTimeMs).toBe('number');
  });

  it('invalid (unreachable) URL returns valid=false with error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/feeds/validate',
      headers: authHeaders(),
      payload: { url: 'https://unreachable.example.com/feed', feedType: 'rss' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.error).toBe('unreachable');
  });

  it('non-feed URL returns valid=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: vi.fn().mockResolvedValue('<html><body>Not a feed</body></html>'),
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/feeds/validate',
      headers: authHeaders(),
      payload: { url: 'https://example.com/page.html', feedType: 'rss' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.error).toBe('not a valid feed');
  });

  it('timeout returns valid=false with timeout error', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/feeds/validate',
      headers: authHeaders(),
      payload: { url: 'https://slow.example.com/feed', feedType: 'rss' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.valid).toBe(false);
    expect(body.data.error).toBe('timeout');
  });

  it('rate limit: 6th request within 1 minute returns 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'application/rss+xml']]),
      text: vi.fn().mockResolvedValue('<rss><channel><title>Feed</title></channel></rss>'),
    }));

    const payload = { url: 'https://example.com/feed.rss', feedType: 'rss' };
    const opts = { method: 'POST' as const, url: '/api/v1/feeds/validate', headers: authHeaders(), payload };

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const res = await app.inject(opts);
      expect(res.statusCode).toBe(200);
    }

    // 6th should be rate limited
    const res = await app.inject(opts);
    expect(res.statusCode).toBe(429);
  });
});
