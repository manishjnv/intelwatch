import { describe, it, expect, vi } from 'vitest';
import { ListArticlesQuerySchema, ArticleIdParamsSchema } from '../src/schema.js';

describe('Article Schemas', () => {
  describe('ListArticlesQuerySchema', () => {
    it('parses valid query with defaults', () => {
      const result = ListArticlesQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.feedId).toBeUndefined();
      expect(result.pipelineStatus).toBeUndefined();
    });

    it('parses all filter parameters', () => {
      const result = ListArticlesQuerySchema.parse({
        page: '2',
        limit: '25',
        feedId: '550e8400-e29b-41d4-a716-446655440000',
        pipelineStatus: 'triaged',
        isCtiRelevant: 'true',
        articleType: 'threat_report',
        search: 'ransomware',
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
      expect(result.feedId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.pipelineStatus).toBe('triaged');
      expect(result.isCtiRelevant).toBe(true);
      expect(result.articleType).toBe('threat_report');
      expect(result.search).toBe('ransomware');
    });

    it('coerces string page and limit to numbers', () => {
      const result = ListArticlesQuerySchema.parse({ page: '3', limit: '100' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(100);
    });

    it('rejects invalid pipeline status', () => {
      expect(() => ListArticlesQuerySchema.parse({ pipelineStatus: 'invalid' })).toThrow();
    });

    it('rejects invalid article type', () => {
      expect(() => ListArticlesQuerySchema.parse({ articleType: 'podcast' })).toThrow();
    });

    it('rejects limit above 500', () => {
      expect(() => ListArticlesQuerySchema.parse({ limit: '501' })).toThrow();
    });

    it('rejects page below 1', () => {
      expect(() => ListArticlesQuerySchema.parse({ page: '0' })).toThrow();
    });

    it('rejects non-uuid feedId', () => {
      expect(() => ListArticlesQuerySchema.parse({ feedId: 'not-a-uuid' })).toThrow();
    });

    it('transforms isCtiRelevant string to boolean', () => {
      const trueResult = ListArticlesQuerySchema.parse({ isCtiRelevant: 'true' });
      expect(trueResult.isCtiRelevant).toBe(true);

      const falseResult = ListArticlesQuerySchema.parse({ isCtiRelevant: 'false' });
      expect(falseResult.isCtiRelevant).toBe(false);
    });

    it('accepts all valid pipeline statuses', () => {
      const statuses = ['ingested', 'triaged', 'extracted', 'enriched', 'deduplicated', 'persisted', 'failed'];
      for (const status of statuses) {
        const result = ListArticlesQuerySchema.parse({ pipelineStatus: status });
        expect(result.pipelineStatus).toBe(status);
      }
    });

    it('accepts all valid article types', () => {
      const types = ['threat_report', 'vulnerability_advisory', 'news', 'blog', 'irrelevant'];
      for (const type of types) {
        const result = ListArticlesQuerySchema.parse({ articleType: type });
        expect(result.articleType).toBe(type);
      }
    });

    it('truncates search to max 200 characters', () => {
      expect(() => ListArticlesQuerySchema.parse({ search: 'a'.repeat(201) })).toThrow();
    });
  });

  describe('ArticleIdParamsSchema', () => {
    it('parses valid UUID', () => {
      const result = ArticleIdParamsSchema.parse({ id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('rejects non-UUID', () => {
      expect(() => ArticleIdParamsSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });

    it('rejects missing id', () => {
      expect(() => ArticleIdParamsSchema.parse({})).toThrow();
    });
  });
});
