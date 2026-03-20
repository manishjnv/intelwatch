import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RSSConnector } from '../src/connectors/rss.js';

// Mock rss-parser
vi.mock('rss-parser', () => {
  const MockParser = vi.fn().mockImplementation(() => ({
    parseURL: vi.fn(),
  }));
  return { default: MockParser };
});

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

const FEED_URL = 'https://example.com/feed.rss';

function makeFeedOutput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test Feed',
    description: 'A test RSS feed',
    items: [
      {
        title: 'Article 1',
        contentSnippet: 'First article content about malware threat.',
        link: 'https://example.com/article-1',
        pubDate: '2026-03-20T12:00:00Z',
        creator: 'John Analyst',
        guid: 'article-1-guid',
        categories: ['malware', 'threat-intel'],
      },
      {
        title: 'Article 2',
        content: 'Second article with HTML content.',
        link: 'https://example.com/article-2',
        isoDate: '2026-03-19T10:00:00Z',
        author: 'Jane Researcher',
        guid: 'article-2-guid',
        categories: ['apt'],
      },
    ],
    ...overrides,
  };
}

describe('RSSConnector', () => {
  let connector: RSSConnector;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    connector = new RSSConnector(logger as never);
  });

  it('fetches and parses an RSS feed', async () => {
    const Parser = (await import('rss-parser')).default;
    const mockInstance = new Parser();
    (mockInstance.parseURL as ReturnType<typeof vi.fn>).mockResolvedValue(makeFeedOutput());

    // Replace the internal parser
    (connector as unknown as Record<string, unknown>).parser = mockInstance;

    // We need to mock the parser created inside fetch() too
    // Since fetch() creates a new Parser, we mock the constructor
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue(makeFeedOutput()),
    }));

    const result = await connector.fetch({ url: FEED_URL });

    expect(result.articles).toHaveLength(2);
    expect(result.feedTitle).toBe('Test Feed');
    expect(result.feedDescription).toBe('A test RSS feed');
    expect(result.fetchDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('extracts article fields correctly', async () => {
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue(makeFeedOutput()),
    }));

    const result = await connector.fetch({ url: FEED_URL });
    const [a1, a2] = result.articles;

    expect(a1.title).toBe('Article 1');
    expect(a1.content).toBe('First article content about malware threat.');
    expect(a1.url).toBe('https://example.com/article-1');
    expect(a1.publishedAt).toEqual(new Date('2026-03-20T12:00:00Z'));
    expect(a1.author).toBe('John Analyst');
    expect(a1.rawMeta.guid).toBe('article-1-guid');

    expect(a2.title).toBe('Article 2');
    expect(a2.content).toBe('Second article with HTML content.');
    expect(a2.author).toBe('Jane Researcher');
    expect(a2.publishedAt).toEqual(new Date('2026-03-19T10:00:00Z'));
  });

  it('handles empty feed (no items)', async () => {
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({ title: 'Empty Feed', items: [] }),
    }));

    const result = await connector.fetch({ url: FEED_URL });

    expect(result.articles).toHaveLength(0);
    expect(result.feedTitle).toBe('Empty Feed');
  });

  it('handles missing optional fields', async () => {
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({
        items: [{ title: undefined, link: undefined, pubDate: undefined }],
      }),
    }));

    const result = await connector.fetch({ url: FEED_URL });

    expect(result.articles[0].title).toBe('(untitled)');
    expect(result.articles[0].url).toBeNull();
    expect(result.articles[0].publishedAt).toBeNull();
    expect(result.articles[0].author).toBeNull();
  });

  it('respects maxItems limit', async () => {
    const manyItems = Array.from({ length: 50 }, (_, i) => ({
      title: `Article ${i}`,
      link: `https://example.com/${i}`,
    }));

    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({ items: manyItems }),
    }));

    const result = await connector.fetch({ url: FEED_URL, maxItems: 10 });

    expect(result.articles).toHaveLength(10);
  });

  it('throws on missing URL', async () => {
    await expect(connector.fetch({ url: '' })).rejects.toThrow('RSS connector requires a feed URL');
  });

  it('throws on fetch failure', async () => {
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockRejectedValue(new Error('ENOTFOUND')),
    }));

    await expect(connector.fetch({ url: FEED_URL })).rejects.toThrow('Failed to fetch RSS feed: ENOTFOUND');
  });

  it('uses contentSnippet > content > summary fallback chain', async () => {
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({
        items: [
          { title: 'A', contentSnippet: 'snippet', content: 'full', summary: 'sum' },
          { title: 'B', content: 'full-only', summary: 'sum' },
          { title: 'C', summary: 'summary-only' },
          { title: 'D' },
        ],
      }),
    }));

    const result = await connector.fetch({ url: FEED_URL });

    expect(result.articles[0].content).toBe('snippet');
    expect(result.articles[1].content).toBe('full-only');
    expect(result.articles[2].content).toBe('summary-only');
    expect(result.articles[3].content).toBe('');
  });

  it('handles invalid date gracefully', async () => {
    const ParserClass = (await import('rss-parser')).default as unknown as ReturnType<typeof vi.fn>;
    ParserClass.mockImplementation(() => ({
      parseURL: vi.fn().mockResolvedValue({
        items: [{ title: 'Bad Date', pubDate: 'not-a-date' }],
      }),
    }));

    const result = await connector.fetch({ url: FEED_URL });

    expect(result.articles[0].publishedAt).toBeNull();
  });
});
