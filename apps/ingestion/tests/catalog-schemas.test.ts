import { describe, it, expect } from 'vitest';
import { CreateCatalogSchema, UpdateCatalogSchema, SubscribeSchema } from '../src/schemas/catalog.js';

describe('CreateCatalogSchema', () => {
  it('validates correct input', () => {
    const result = CreateCatalogSchema.safeParse({
      name: 'NVD CVE Feed',
      feedType: 'nvd',
      url: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = CreateCatalogSchema.safeParse({
      feedType: 'rss',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid feedType', () => {
    const result = CreateCatalogSchema.safeParse({
      name: 'Test',
      feedType: 'invalid_type',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults for minPlanTier, sourceReliability, infoCred', () => {
    const result = CreateCatalogSchema.parse({
      name: 'Test Feed',
      feedType: 'rss',
      url: 'https://example.com',
    });
    expect(result.minPlanTier).toBe('free');
    expect(result.sourceReliability).toBe('C');
    expect(result.infoCred).toBe(3);
  });
});

describe('UpdateCatalogSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateCatalogSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = UpdateCatalogSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('SubscribeSchema', () => {
  it('validates correct UUID', () => {
    const result = SubscribeSchema.safeParse({ globalFeedId: '12345678-1234-1234-1234-123456789abc' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = SubscribeSchema.safeParse({ globalFeedId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
