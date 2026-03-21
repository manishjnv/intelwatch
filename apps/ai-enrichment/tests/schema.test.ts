import { describe, it, expect } from 'vitest';
import {
  EnrichJobSchema,
  VTResultSchema,
  AbuseIPDBResultSchema,
  EnrichmentResultSchema,
  TriggerEnrichmentSchema,
} from '../src/schema.js';

describe('EnrichJobSchema', () => {
  it('validates valid job data', () => {
    const job = {
      iocId: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      iocType: 'ip',
      normalizedValue: '185.220.101.34',
      confidence: 75,
      severity: 'high',
    };
    const result = EnrichJobSchema.safeParse(job);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = EnrichJobSchema.safeParse({ iocId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const job = {
      iocId: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      iocType: 'ip', normalizedValue: '1.2.3.4',
      confidence: 150, severity: 'high',
    };
    const result = EnrichJobSchema.safeParse(job);
    expect(result.success).toBe(false);
  });
});

describe('VTResultSchema', () => {
  it('validates VT API response', () => {
    const vt = {
      malicious: 15, suspicious: 2, harmless: 50, undetected: 3,
      totalEngines: 70, detectionRate: 21, tags: ['trojan'],
    };
    expect(VTResultSchema.safeParse(vt).success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const vt = { malicious: 0, suspicious: 0, harmless: 0, undetected: 0, totalEngines: 0, detectionRate: 0 };
    const parsed = VTResultSchema.parse(vt);
    expect(parsed.tags).toEqual([]);
    expect(parsed.lastAnalysisDate).toBeNull();
  });
});

describe('AbuseIPDBResultSchema', () => {
  it('validates AbuseIPDB API response', () => {
    const abuse = {
      abuseConfidenceScore: 85, totalReports: 42, numDistinctUsers: 12,
    };
    const parsed = AbuseIPDBResultSchema.parse(abuse);
    expect(parsed.abuseConfidenceScore).toBe(85);
    expect(parsed.isTor).toBe(false);
    expect(parsed.countryCode).toBe('');
  });
});

describe('EnrichmentResultSchema', () => {
  it('validates enrichment result', () => {
    const result = {
      vtResult: null, abuseipdbResult: null,
      enrichedAt: '2026-03-21T00:00:00Z',
      enrichmentStatus: 'skipped',
    };
    expect(EnrichmentResultSchema.safeParse(result).success).toBe(true);
  });
});

describe('TriggerEnrichmentSchema', () => {
  it('validates UUID iocId', () => {
    expect(TriggerEnrichmentSchema.safeParse({ iocId: '00000000-0000-0000-0000-000000000001' }).success).toBe(true);
  });

  it('rejects non-UUID', () => {
    expect(TriggerEnrichmentSchema.safeParse({ iocId: 'not-a-uuid' }).success).toBe(false);
  });
});
