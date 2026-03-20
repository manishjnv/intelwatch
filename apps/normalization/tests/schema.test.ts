import { describe, it, expect } from 'vitest';
import {
  NormalizeIOCJobSchema,
  NormalizeBatchJobSchema,
  ListIOCsQuerySchema,
  IOCIdParamsSchema,
} from '../src/schema.js';

describe('NormalizeIOCJobSchema', () => {
  it('validates a complete IOC job', () => {
    const result = NormalizeIOCJobSchema.parse({
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test Feed',
      rawValue: '192.168.1.1',
      rawType: 'ip',
      calibratedConfidence: 75,
      corroborationCount: 2,
    });
    expect(result.rawValue).toBe('192.168.1.1');
    expect(result.calibratedConfidence).toBe(75);
  });

  it('rejects empty rawValue', () => {
    expect(() => NormalizeIOCJobSchema.parse({
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test',
      rawValue: '',
      rawType: 'ip',
    })).toThrow();
  });

  it('rejects invalid UUID for articleId', () => {
    expect(() => NormalizeIOCJobSchema.parse({
      articleId: 'not-a-uuid',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test',
      rawValue: '1.2.3.4',
      rawType: 'ip',
    })).toThrow();
  });

  it('accepts optional extraction metadata', () => {
    const result = NormalizeIOCJobSchema.parse({
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test',
      rawValue: '1.2.3.4',
      rawType: 'ip',
      extractionMeta: {
        threatActors: ['APT28'],
        malwareFamilies: ['Emotet'],
        mitreAttack: ['T1059'],
        tlp: 'RED',
        severity: 'high',
      },
    });
    expect(result.extractionMeta?.threatActors).toEqual(['APT28']);
  });

  it('clamps confidence to 0-100', () => {
    const result = NormalizeIOCJobSchema.parse({
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test',
      rawValue: '1.2.3.4',
      rawType: 'ip',
      calibratedConfidence: 50,
    });
    expect(result.calibratedConfidence).toBe(50);
  });
});

describe('NormalizeBatchJobSchema', () => {
  it('validates a batch with multiple IOCs', () => {
    const result = NormalizeBatchJobSchema.parse({
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test',
      iocs: [
        { rawValue: '1.2.3.4', rawType: 'ip' },
        { rawValue: 'evil.com', rawType: 'domain' },
      ],
    });
    expect(result.iocs).toHaveLength(2);
  });

  it('accepts empty iocs array', () => {
    const result = NormalizeBatchJobSchema.parse({
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test',
      iocs: [],
    });
    expect(result.iocs).toHaveLength(0);
  });
});

describe('ListIOCsQuerySchema', () => {
  it('applies defaults for missing params', () => {
    const result = ListIOCsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.sortBy).toBe('lastSeen');
    expect(result.sortOrder).toBe('desc');
  });

  it('validates IOC type filter', () => {
    const result = ListIOCsQuerySchema.parse({ type: 'ip' });
    expect(result.type).toBe('ip');
  });

  it('rejects invalid type', () => {
    expect(() => ListIOCsQuerySchema.parse({ type: 'invalid' })).toThrow();
  });

  it('coerces page and limit to numbers', () => {
    const result = ListIOCsQuerySchema.parse({ page: '2', limit: '25' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(25);
  });

  it('caps limit at 500', () => {
    expect(() => ListIOCsQuerySchema.parse({ limit: 501 })).toThrow();
  });

  it('accepts search parameter', () => {
    const result = ListIOCsQuerySchema.parse({ search: '192.168' });
    expect(result.search).toBe('192.168');
  });

  it('validates severity filter', () => {
    const result = ListIOCsQuerySchema.parse({ severity: 'high' });
    expect(result.severity).toBe('high');
  });

  it('validates lifecycle filter', () => {
    const result = ListIOCsQuerySchema.parse({ lifecycle: 'active' });
    expect(result.lifecycle).toBe('active');
  });

  it('validates sort options', () => {
    const result = ListIOCsQuerySchema.parse({ sortBy: 'confidence', sortOrder: 'asc' });
    expect(result.sortBy).toBe('confidence');
    expect(result.sortOrder).toBe('asc');
  });
});

describe('IOCIdParamsSchema', () => {
  it('validates UUID', () => {
    const result = IOCIdParamsSchema.parse({ id: '00000000-0000-0000-0000-000000000001' });
    expect(result.id).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('rejects non-UUID', () => {
    expect(() => IOCIdParamsSchema.parse({ id: 'not-uuid' })).toThrow();
  });
});
