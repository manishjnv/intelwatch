/**
 * @module @etip/shared-utils/tests/search-index
 * @description Tests for the shared IOC search-index document/job contract.
 */
import { describe, it, expect } from 'vitest';
import {
  IocDocumentSchema,
  IocIndexJobSchema,
  IOC_INDEX_JOB_OPTIONS,
  toIocDocument,
  iocIndexJobId,
  type IocRow,
} from '../src/index.js';

function baseRow(overrides: Partial<IocRow> = {}): IocRow {
  return {
    id: 'ioc-1',
    tenantId: 'tenant-1',
    feedSourceId: null,
    iocType: 'ip',
    value: '1.2.3.4',
    normalizedValue: '1.2.3.4',
    severity: 'info',
    tlp: 'amber',
    confidence: 80,
    lifecycle: 'active',
    tags: [],
    mitreAttack: [],
    malwareFamilies: [],
    threatActors: [],
    enrichmentData: null,
    enrichedAt: null,
    firstSeen: new Date('2026-01-01T00:00:00.000Z'),
    lastSeen: new Date('2026-01-02T00:00:00.000Z'),
    archivedAt: null,
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toIocDocument', () => {
  it('uppercases a lowercase tlp', () => {
    const doc = toIocDocument(baseRow({ tlp: 'amber' }));
    expect(doc.tlp).toBe('AMBER');
  });

  it('preserves severity info', () => {
    const doc = toIocDocument(baseRow({ severity: 'info' }));
    expect(doc.severity).toBe('info');
  });

  it('sets enriched true iff enrichedAt is set', () => {
    const notEnriched = toIocDocument(baseRow({ enrichedAt: null }));
    expect(notEnriched.enriched).toBe(false);
    expect(notEnriched.enrichedAt).toBeUndefined();

    const enrichedAt = new Date('2026-01-04T00:00:00.000Z');
    const enriched = toIocDocument(baseRow({ enrichedAt }));
    expect(enriched.enriched).toBe(true);
    expect(enriched.enrichedAt).toBe(enrichedAt.toISOString());
  });

  it('converts all dates to ISO strings', () => {
    const doc = toIocDocument(baseRow());
    expect(doc.firstSeen).toBe('2026-01-01T00:00:00.000Z');
    expect(doc.lastSeen).toBe('2026-01-02T00:00:00.000Z');
    expect(doc.updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('follows archivedAt for the archived flag', () => {
    expect(toIocDocument(baseRow({ archivedAt: null })).archived).toBe(false);
    expect(
      toIocDocument(baseRow({ archivedAt: new Date('2026-01-05T00:00:00.000Z') })).archived
    ).toBe(true);
  });

  it('omits sourceId when feedSourceId is null', () => {
    const doc = toIocDocument(baseRow({ feedSourceId: null }));
    expect(doc.sourceId).toBeUndefined();
    expect('sourceId' in doc).toBe(false);
  });

  it('includes sourceId when feedSourceId is set', () => {
    const doc = toIocDocument(baseRow({ feedSourceId: 'feed-1' }));
    expect(doc.sourceId).toBe('feed-1');
  });

  it('rounds externalRiskScore and enrichmentQuality from enrichmentData', () => {
    const doc = toIocDocument(
      baseRow({ enrichmentData: { externalRiskScore: 72.6, enrichmentQuality: 90 } })
    );
    expect(doc.externalRiskScore).toBe(73);
    expect(doc.enrichmentQuality).toBe(90);
  });

  it('clamps scores above 100 down to 100', () => {
    const doc = toIocDocument(baseRow({ enrichmentData: { externalRiskScore: 140 } }));
    expect(doc.externalRiskScore).toBe(100);
  });

  it('leaves scores absent when enrichmentData is null, non-object, or the field is non-numeric', () => {
    expect(toIocDocument(baseRow({ enrichmentData: null })).externalRiskScore).toBeUndefined();
    expect(
      toIocDocument(baseRow({ enrichmentData: 'not-an-object' })).externalRiskScore
    ).toBeUndefined();
    expect(
      toIocDocument(baseRow({ enrichmentData: { externalRiskScore: 'high' } }))
        .externalRiskScore
    ).toBeUndefined();
  });

  it('accepts a hash_sha256 type unchanged', () => {
    const doc = toIocDocument(baseRow({ iocType: 'hash_sha256' }));
    expect(doc.type).toBe('hash_sha256');
  });

  it('produces a document that passes IocDocumentSchema.parse', () => {
    const doc = toIocDocument(baseRow());
    expect(() => IocDocumentSchema.parse(doc)).not.toThrow();
  });

  it('throws on an invalid row (bad severity)', () => {
    expect(() => toIocDocument(baseRow({ severity: 'bogus' }))).toThrow();
  });
});

describe('IocIndexJobSchema', () => {
  it('rejects an index action without payload', () => {
    const result = IocIndexJobSchema.safeParse({
      iocId: 'ioc-1',
      tenantId: 'tenant-1',
      action: 'index',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an update action without iocType', () => {
    const result = IocIndexJobSchema.safeParse({
      iocId: 'ioc-1',
      tenantId: 'tenant-1',
      action: 'update',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid delete action without iocType', () => {
    const result = IocIndexJobSchema.safeParse({
      iocId: 'ioc-1',
      tenantId: 'tenant-1',
      action: 'delete',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid index action with a full document', () => {
    const doc = toIocDocument(baseRow());
    const result = IocIndexJobSchema.safeParse({
      iocId: 'ioc-1',
      tenantId: 'tenant-1',
      action: 'index',
      payload: doc,
    });
    expect(result.success).toBe(true);
  });
});

describe('iocIndexJobId', () => {
  it('produces the same id for the same updatedAt', () => {
    const a = iocIndexJobId('index', 'ioc-1', '2026-01-01T00:00:00.000Z');
    const b = iocIndexJobId('index', 'ioc-1', '2026-01-01T00:00:00.000Z');
    expect(a).toBe(b);
  });

  it('produces a different id for a different updatedAt', () => {
    const a = iocIndexJobId('index', 'ioc-1', '2026-01-01T00:00:00.000Z');
    const b = iocIndexJobId('index', 'ioc-1', '2026-01-02T00:00:00.000Z');
    expect(a).not.toBe(b);
  });

  it('treats a Date and its equivalent ISO string the same', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const a = iocIndexJobId('update', 'ioc-1', date);
    const b = iocIndexJobId('update', 'ioc-1', date.toISOString());
    expect(a).toBe(b);
  });

  it('ignores version for delete and needs no timestamp', () => {
    const id = iocIndexJobId('delete', 'ioc-1');
    expect(id).toBe('ioc-delete-ioc-1');
  });

  it('never contains a colon', () => {
    expect(iocIndexJobId('index', 'ioc-1', '2026-01-01T00:00:00.000Z')).not.toContain(':');
    expect(iocIndexJobId('update', 'ioc-1', '2026-01-01T00:00:00.000Z')).not.toContain(':');
    expect(iocIndexJobId('delete', 'ioc-1')).not.toContain(':');
  });

  it('throws when index is called without a version', () => {
    // @ts-expect-error - version is required for 'index'
    expect(() => iocIndexJobId('index', 'ioc-1')).toThrow();
  });
});

describe('IOC_INDEX_JOB_OPTIONS', () => {
  it('sets removeOnComplete and removeOnFail', () => {
    expect(IOC_INDEX_JOB_OPTIONS.removeOnComplete).toEqual({ count: 1000 });
    expect(IOC_INDEX_JOB_OPTIONS.removeOnFail).toEqual({ count: 5000 });
  });
});
