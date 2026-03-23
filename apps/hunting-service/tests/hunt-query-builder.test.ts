import { describe, it, expect, beforeEach } from 'vitest';
import { HuntQueryBuilder } from '../src/services/hunt-query-builder.js';
import type { HuntQuery, EsDslQuery } from '../src/schemas/hunting.js';

describe('Hunting Service — #1 Hunt Query Builder', () => {
  let builder: HuntQueryBuilder;

  beforeEach(() => {
    builder = new HuntQueryBuilder({
      defaultTimeRangeDays: 30,
      maxResults: 1000,
    });
  });

  function makeQuery(overrides: Partial<HuntQuery> = {}): HuntQuery {
    return {
      fields: [{ field: 'value', operator: 'eq', value: '1.2.3.4' }],
      limit: 100,
      offset: 0,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      ...overrides,
    };
  }

  // ─── Core DSL generation ─────────────────────────────────

  it('1.1. generates valid ES DSL with tenant filter', () => {
    const dsl = builder.buildEsDsl(makeQuery(), 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({ term: { tenantId: 'tenant-1' } });
    expect(dsl.size).toBe(100);
    expect(dsl.from).toBe(0);
  });

  it('1.2. applies eq operator as term query', () => {
    const dsl = builder.buildEsDsl(makeQuery(), 'tenant-1');
    expect(dsl.query.bool.must).toContainEqual({ term: { value: '1.2.3.4' } });
  });

  it('1.3. applies neq operator as must_not', () => {
    const query = makeQuery({
      fields: [{ field: 'status', operator: 'neq', value: 'false_positive' }],
    });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.must_not).toContainEqual({ term: { status: 'false_positive' } });
  });

  it('1.4. applies contains operator as wildcard', () => {
    const query = makeQuery({
      fields: [{ field: 'description', operator: 'contains', value: 'malware' }],
    });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.must).toContainEqual({
      wildcard: { description: { value: '*malware*' } },
    });
  });

  it('1.5. applies range operator with valueTo', () => {
    const query = makeQuery({
      fields: [{ field: 'confidence', operator: 'range', value: 0.5, valueTo: 0.9 }],
    });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.must).toContainEqual({
      range: { confidence: { gte: 0.5, lte: 0.9 } },
    });
  });

  it('1.6. applies gt/gte/lt/lte operators correctly', () => {
    const operators = [
      { operator: 'gt' as const, expectedKey: 'gt' },
      { operator: 'gte' as const, expectedKey: 'gte' },
      { operator: 'lt' as const, expectedKey: 'lt' },
      { operator: 'lte' as const, expectedKey: 'lte' },
    ];
    for (const { operator, expectedKey } of operators) {
      const query = makeQuery({
        fields: [{ field: 'score', operator, value: 50 }],
      });
      const dsl = builder.buildEsDsl(query, 'tenant-1');
      expect(dsl.query.bool.must).toContainEqual({
        range: { score: { [expectedKey]: 50 } },
      });
    }
  });

  it('1.7. applies exists operator', () => {
    const query = makeQuery({
      fields: [{ field: 'enrichmentData', operator: 'exists', value: true }],
    });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.must).toContainEqual({ exists: { field: 'enrichmentData' } });
  });

  // ─── Filters ─────────────────────────────────────────────

  it('1.8. filters by entity types', () => {
    const query = makeQuery({ entityTypes: ['ip', 'domain'] });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({ terms: { type: ['ip', 'domain'] } });
  });

  it('1.9. filters by severity', () => {
    const query = makeQuery({ severities: ['critical', 'high'] });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({ terms: { severity: ['critical', 'high'] } });
  });

  it('1.10. applies relative time range (lastDays)', () => {
    const query = makeQuery({ timeRange: { lastDays: 7 } });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({
      range: { updatedAt: { gte: 'now-7d', lte: 'now' } },
    });
  });

  it('1.11. applies absolute time range', () => {
    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-31T23:59:59Z';
    const query = makeQuery({ timeRange: { from, to } });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({
      range: { updatedAt: { gte: from, lte: to } },
    });
  });

  it('1.12. applies default time range when none specified', () => {
    const dsl = builder.buildEsDsl(makeQuery(), 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({
      range: { updatedAt: { gte: 'now-30d', lte: 'now' } },
    });
  });

  it('1.13. caps limit to maxResults', () => {
    const query = makeQuery({ limit: 5000 });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.size).toBe(1000);
  });

  // ─── Quick search ─────────────────────────────────────────

  it('1.14. builds multi_match quick search DSL', () => {
    const dsl = builder.buildQuickSearchDsl('evil.com', 'tenant-1', ['domain']);
    expect(dsl.query.bool.must[0]).toHaveProperty('multi_match');
    const mm = (dsl.query.bool.must[0] as Record<string, unknown>).multi_match as Record<string, unknown>;
    expect(mm.query).toBe('evil.com');
    expect(mm.fuzziness).toBe('AUTO');
  });

  // ─── Validation ───────────────────────────────────────────

  it('1.15. validates empty fields array', () => {
    const query = makeQuery({ fields: [] });
    const result = builder.validateQuery(query);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one field condition is required');
  });

  it('1.16. validates range without valueTo', () => {
    const query = makeQuery({
      fields: [{ field: 'score', operator: 'range', value: 10 }],
    });
    const result = builder.validateQuery(query);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('1.17. throws on contains with non-string value', () => {
    const query = makeQuery({
      fields: [{ field: 'score', operator: 'contains', value: 123 }],
    });
    expect(() => builder.buildEsDsl(query, 'tenant-1')).toThrow('contains operator requires string value');
  });

  it('1.18. throws on range without valueTo', () => {
    const query = makeQuery({
      fields: [{ field: 'score', operator: 'range', value: 10 }],
    });
    expect(() => builder.buildEsDsl(query, 'tenant-1')).toThrow('range operator requires valueTo');
  });

  it('1.19. applies tag filters individually', () => {
    const query = makeQuery({ tags: ['apt', 'phishing'] });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.query.bool.filter).toContainEqual({ term: { tags: 'apt' } });
    expect(dsl.query.bool.filter).toContainEqual({ term: { tags: 'phishing' } });
  });

  it('1.20. respects sort configuration', () => {
    const query = makeQuery({ sortBy: 'severity', sortOrder: 'asc' });
    const dsl = builder.buildEsDsl(query, 'tenant-1');
    expect(dsl.sort).toContainEqual({ severity: { order: 'asc' } });
  });
});
