import { describe, it, expect } from 'vitest';
import { SearchQueryParamsSchema, IocIndexJobSchema } from '../src/schemas.js';

describe('SearchQueryParamsSchema — includeInactive', () => {
  it('defaults to false when omitted', () => {
    const parsed = SearchQueryParamsSchema.parse({ tenantId: 't1' });
    expect(parsed.includeInactive).toBe(false);
  });

  it('the string "false" stays false (not z.coerce.boolean, which would flip it to true)', () => {
    const parsed = SearchQueryParamsSchema.parse({ tenantId: 't1', includeInactive: 'false' });
    expect(parsed.includeInactive).toBe(false);
  });

  it('the string "true" becomes true', () => {
    const parsed = SearchQueryParamsSchema.parse({ tenantId: 't1', includeInactive: 'true' });
    expect(parsed.includeInactive).toBe(true);
  });
});

describe('IocIndexJobSchema (re-exported from @etip/shared-utils)', () => {
  it('rejects an index job without a payload', () => {
    expect(IocIndexJobSchema.safeParse({ action: 'index', iocId: 'i1', tenantId: 't1' }).success).toBe(false);
  });

  it('rejects an update job without iocType', () => {
    expect(
      IocIndexJobSchema.safeParse({ action: 'update', iocId: 'i1', tenantId: 't1', payload: {} }).success,
    ).toBe(false);
  });

  it('accepts a delete job with only iocId/tenantId', () => {
    expect(IocIndexJobSchema.safeParse({ action: 'delete', iocId: 'i1', tenantId: 't1' }).success).toBe(true);
  });
});
