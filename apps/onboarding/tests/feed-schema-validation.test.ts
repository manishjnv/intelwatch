import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { DemoSeeder, type DemoSeederDeps } from '../src/services/demo-seeder.js';

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/* ── Zod schemas copied from ingestion to validate without cross-module import ── */

const FEED_TYPES = [
  'stix', 'taxii', 'misp', 'rss', 'rest_api', 'nvd',
  'csv_upload', 'json_upload', 'webhook', 'email_imap',
] as const;
const FeedTypeEnum = z.enum(FEED_TYPES);
const cronRegex = /^[\d\s*/\-,]+$/;

const CreateFeedSchema = z.object({
  name: z.string().min(1).max(255),
  feedType: FeedTypeEnum,
  url: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  schedule: z.string().regex(cronRegex, 'Invalid cron expression').default('0 * * * *'),
  parseConfig: z.record(z.unknown()).optional(),
});

const FieldMapSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),
  sourceId: z.string().optional(),
});

const RestFeedMetaSchema = z.object({
  url: z.string().min(1),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  responseArrayPath: z.string().default('data'),
  fieldMap: FieldMapSchema.default({}),
});

function createMockClient() {
  return { post: vi.fn().mockResolvedValue({ data: { id: 'ok' } }) };
}

function createMockClients(): DemoSeederDeps {
  return {
    iocClient: createMockClient() as unknown as DemoSeederDeps['iocClient'],
    actorClient: createMockClient() as unknown as DemoSeederDeps['actorClient'],
    malwareClient: createMockClient() as unknown as DemoSeederDeps['malwareClient'],
    vulnClient: createMockClient() as unknown as DemoSeederDeps['vulnClient'],
    ingestionClient: createMockClient() as unknown as DemoSeederDeps['ingestionClient'],
  };
}

describe('DemoSeeder — Feed Schema Validation', () => {
  let seeder: DemoSeeder;
  let clients: DemoSeederDeps;

  function getCapturedFeeds(): Array<Record<string, unknown>> {
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    return post.mock.calls.map((c: unknown[]) => c[1] as Record<string, unknown>);
  }

  beforeEach(async () => {
    seeder = new DemoSeeder();
    clients = createMockClients();
    seeder.setClients(clients);
    await seeder.seed('t1', ['feeds']);
  });

  it('all seeded feeds have valid FeedTypeEnum values (never "json")', () => {
    const feeds = getCapturedFeeds();
    expect(feeds.length).toBeGreaterThanOrEqual(10);
    for (const feed of feeds) {
      expect(feed.feedType).not.toBe('json');
      const result = FeedTypeEnum.safeParse(feed.feedType);
      expect(result.success).toBe(true);
    }
  });

  it('all seeded feeds use "feedType" field (not "type")', () => {
    const feeds = getCapturedFeeds();
    for (const feed of feeds) {
      expect(feed).toHaveProperty('feedType');
      expect(feed).not.toHaveProperty('type');
    }
  });

  it('all seeded feeds pass CreateFeedSchema validation', () => {
    const feeds = getCapturedFeeds();
    for (const feed of feeds) {
      const result = CreateFeedSchema.safeParse(feed);
      if (!result.success) {
        throw new Error(`Feed "${feed.name}" failed validation: ${result.error.message}`);
      }
      expect(result.success).toBe(true);
    }
  });

  it('all seeded feeds have valid cron expressions', () => {
    const feeds = getCapturedFeeds();
    for (const feed of feeds) {
      expect(typeof feed.schedule).toBe('string');
      expect(cronRegex.test(feed.schedule as string)).toBe(true);
    }
  });

  it('rest_api feeds have feedMeta that passes RestFeedMetaSchema', () => {
    const feeds = getCapturedFeeds();
    const restFeeds = feeds.filter((f) => f.feedType === 'rest_api');
    expect(restFeeds.length).toBeGreaterThanOrEqual(4);

    for (const feed of restFeeds) {
      // REST connector builds feedMeta as { url: feed.url, ...feed.parseConfig }
      const feedMeta = { url: feed.url, ...(feed.parseConfig as Record<string, unknown>) };
      const result = RestFeedMetaSchema.safeParse(feedMeta);
      if (!result.success) {
        throw new Error(`REST feed "${feed.name}" feedMeta failed: ${result.error.message}`);
      }
      expect(result.success).toBe(true);
    }
  });

  it('rest_api feeds have responseArrayPath in parseConfig', () => {
    const feeds = getCapturedFeeds();
    const restFeeds = feeds.filter((f) => f.feedType === 'rest_api');
    for (const feed of restFeeds) {
      const pc = feed.parseConfig as Record<string, unknown>;
      expect(pc).toHaveProperty('responseArrayPath');
    }
  });

  it('rest_api feeds have fieldMap with at least title mapping', () => {
    const feeds = getCapturedFeeds();
    const restFeeds = feeds.filter((f) => f.feedType === 'rest_api');
    for (const feed of restFeeds) {
      const pc = feed.parseConfig as Record<string, unknown>;
      const fm = pc.fieldMap as Record<string, string>;
      expect(fm).toBeDefined();
      expect(fm.title).toBeDefined();
    }
  });

  it('rss feeds have a valid URL', () => {
    const feeds = getCapturedFeeds();
    const rssFeeds = feeds.filter((f) => f.feedType === 'rss');
    expect(rssFeeds.length).toBeGreaterThanOrEqual(4);
    for (const feed of rssFeeds) {
      expect(typeof feed.url).toBe('string');
      expect((feed.url as string).startsWith('https://')).toBe(true);
    }
  });

  it('nvd feed has no URL (handled by connector)', () => {
    const feeds = getCapturedFeeds();
    const nvdFeeds = feeds.filter((f) => f.feedType === 'nvd');
    expect(nvdFeeds.length).toBe(1);
    expect(nvdFeeds[0].url).toBeFalsy();
  });

  it('feed types cover all 3 queue lanes: rss, rest_api, nvd', () => {
    const feeds = getCapturedFeeds();
    const types = new Set(feeds.map((f) => f.feedType));
    expect(types.has('rss')).toBe(true);
    expect(types.has('rest_api')).toBe(true);
    expect(types.has('nvd')).toBe(true);
  });

  it('all feeds are enabled by default', () => {
    const feeds = getCapturedFeeds();
    for (const feed of feeds) {
      expect(feed.enabled).toBe(true);
    }
  });

  it('MalwareBazaar feed uses POST method', () => {
    const feeds = getCapturedFeeds();
    const mb = feeds.find((f) => f.name === 'MalwareBazaar Recent');
    expect(mb).toBeDefined();
    const pc = mb!.parseConfig as Record<string, unknown>;
    expect(pc.method).toBe('POST');
    expect(pc.body).toBeDefined();
  });
});
