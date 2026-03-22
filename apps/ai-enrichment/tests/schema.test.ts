import { describe, it, expect } from 'vitest';
import {
  EnrichJobSchema,
  VTResultSchema,
  AbuseIPDBResultSchema,
  EnrichmentResultSchema,
  TriggerEnrichmentSchema,
  HaikuTriageResultSchema,
  MitreTechniqueSchema,
  EvidenceSourceSchema,
  RecommendedActionSchema,
  GeolocationSchema,
  BatchEnrichmentSchema,
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

// ===== Session 22: New schema fields (#1,#2,#3,#7,#8) =====

describe('MitreTechniqueSchema', () => {
  it('validates valid MITRE technique T1071', () => {
    expect(MitreTechniqueSchema.safeParse({ techniqueId: 'T1071', name: 'Application Layer Protocol' }).success).toBe(true);
  });

  it('validates sub-technique T1071.001', () => {
    expect(MitreTechniqueSchema.safeParse({ techniqueId: 'T1071.001', name: 'Web Protocols', tactic: 'Command and Control' }).success).toBe(true);
  });

  it('rejects invalid technique ID', () => {
    expect(MitreTechniqueSchema.safeParse({ techniqueId: 'INVALID', name: 'Bad' }).success).toBe(false);
  });

  it('rejects technique ID with wrong format', () => {
    expect(MitreTechniqueSchema.safeParse({ techniqueId: 'T123', name: 'Short' }).success).toBe(false);
  });
});

describe('EvidenceSourceSchema', () => {
  it('validates complete evidence source', () => {
    const source = { provider: 'VirusTotal', dataPoint: '15/70 engines', interpretation: 'Moderate detection rate' };
    expect(EvidenceSourceSchema.safeParse(source).success).toBe(true);
  });
});

describe('RecommendedActionSchema', () => {
  it('validates action with priority', () => {
    expect(RecommendedActionSchema.safeParse({ action: 'Block at firewall', priority: 'immediate' }).success).toBe(true);
  });

  it('defaults priority to short_term', () => {
    const parsed = RecommendedActionSchema.parse({ action: 'Investigate' });
    expect(parsed.priority).toBe('short_term');
  });
});

describe('HaikuTriageResultSchema — new fields', () => {
  const baseResult = {
    riskScore: 75, confidence: 80, severity: 'HIGH',
    threatCategory: 'c2_server', reasoning: 'Test', tags: [],
    inputTokens: 100, outputTokens: 50, costUsd: 0.0001, durationMs: 200,
  };

  it('applies defaults for all new fields when absent', () => {
    const parsed = HaikuTriageResultSchema.parse(baseResult);
    expect(parsed.scoreJustification).toBe('');
    expect(parsed.evidenceSources).toEqual([]);
    expect(parsed.uncertaintyFactors).toEqual([]);
    expect(parsed.mitreTechniques).toEqual([]);
    expect(parsed.isFalsePositive).toBe(false);
    expect(parsed.falsePositiveReason).toBeNull();
    expect(parsed.malwareFamilies).toEqual([]);
    expect(parsed.attributedActors).toEqual([]);
    expect(parsed.recommendedActions).toEqual([]);
  });

  it('validates full result with all new fields populated', () => {
    const full = {
      ...baseResult,
      scoreJustification: 'High VT detection + known C2 ISP',
      evidenceSources: [{ provider: 'VT', dataPoint: '15/70', interpretation: 'Flagged by 15 engines' }],
      uncertaintyFactors: ['Limited AbuseIPDB history'],
      mitreTechniques: [{ techniqueId: 'T1071', name: 'App Layer Protocol', tactic: 'C2' }],
      isFalsePositive: false,
      falsePositiveReason: null,
      malwareFamilies: ['Cobalt Strike'],
      attributedActors: ['APT28'],
      recommendedActions: [{ action: 'Block IP at firewall', priority: 'immediate' }],
    };
    const result = HaikuTriageResultSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('limits recommendedActions to max 5', () => {
    const tooMany = {
      ...baseResult,
      recommendedActions: Array.from({ length: 7 }, (_, i) => ({ action: `Action ${i}`, priority: 'short_term' })),
    };
    const result = HaikuTriageResultSchema.safeParse(tooMany);
    expect(result.success).toBe(false);
  });
});

describe('HaikuTriageResultSchema — Session 23 fields', () => {
  const baseResult = {
    riskScore: 50, confidence: 60, severity: 'MEDIUM', threatCategory: 'unknown',
    reasoning: 'test', tags: [], inputTokens: 100, outputTokens: 50,
    costUsd: 0.001, durationMs: 200,
  };

  it('defaults stixLabels to empty array', () => {
    const result = HaikuTriageResultSchema.parse(baseResult);
    expect(result.stixLabels).toEqual([]);
  });

  it('accepts stixLabels with string values', () => {
    const result = HaikuTriageResultSchema.parse({ ...baseResult, stixLabels: ['malicious-activity', 'attribution'] });
    expect(result.stixLabels).toEqual(['malicious-activity', 'attribution']);
  });

  it('defaults cacheReadTokens and cacheCreationTokens to 0', () => {
    const result = HaikuTriageResultSchema.parse(baseResult);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });
});

describe('GeolocationSchema', () => {
  it('validates with defaults', () => {
    const result = GeolocationSchema.parse({});
    expect(result.countryCode).toBe('');
    expect(result.isp).toBe('');
    expect(result.isTor).toBe(false);
  });

  it('parses full geolocation data', () => {
    const result = GeolocationSchema.parse({
      countryCode: 'US', isp: 'Cloudflare Inc', usageType: 'CDN', isTor: false,
    });
    expect(result.countryCode).toBe('US');
    expect(result.isp).toBe('Cloudflare Inc');
  });
});

describe('EnrichmentResultSchema — Session 23 fields', () => {
  it('defaults enrichmentQuality to null', () => {
    const result = EnrichmentResultSchema.parse({
      enrichedAt: new Date().toISOString(), enrichmentStatus: 'enriched',
    });
    expect(result.enrichmentQuality).toBeNull();
    expect(result.geolocation).toBeNull();
  });

  it('accepts enrichmentQuality number and geolocation object', () => {
    const result = EnrichmentResultSchema.parse({
      enrichedAt: new Date().toISOString(), enrichmentStatus: 'enriched',
      enrichmentQuality: 85,
      geolocation: { countryCode: 'DE', isp: 'Hetzner', usageType: 'Hosting', isTor: false },
    });
    expect(result.enrichmentQuality).toBe(85);
    expect(result.geolocation?.countryCode).toBe('DE');
  });
});

describe('BatchEnrichmentSchema', () => {
  it('validates array of UUIDs', () => {
    const result = BatchEnrichmentSchema.safeParse({
      iocIds: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty array', () => {
    const result = BatchEnrichmentSchema.safeParse({ iocIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    const result = BatchEnrichmentSchema.safeParse({ iocIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
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
