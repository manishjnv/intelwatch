import { describe, it, expect } from 'vitest';
import { toPublicIoc, mapEnrichmentData } from '../src/routes/public/dto.js';
import {
  PublicIocEnrichmentDtoSchema,
  ApiKeyRotateResponseSchema,
} from '@etip/shared-types';

// ── Enrichment Metadata Mapping Tests ─────────────────────────────

describe('mapEnrichmentData', () => {
  const fullBlob = {
    vtResult: { positives: 42, total: 70, permalink: 'https://vt.example.com' },
    abuseipdbResult: { abuseConfidenceScore: 85, totalReports: 12 },
    haikuResult: {
      riskScore: 78,
      confidence: 85,
      severity: 'high',
      threatCategory: 'c2',
      reasoning: 'IP associated with known C2 infrastructure based on VT detections and AbuseIPDB reports.',
      tags: ['c2', 'cobalt-strike'],
      evidenceSources: ['virustotal', 'abuseipdb'],
    },
    enrichedAt: '2026-03-31T12:00:00.000Z',
    enrichmentStatus: 'enriched' as const,
    failureReason: null,
    externalRiskScore: 78,
    costBreakdown: { totalCostUsd: 0.003, providers: [] },
    enrichmentQuality: 92,
    geolocation: {
      countryCode: 'RU',
      isp: 'Evil Corp ISP',
      asn: 'AS12345',
      org: 'Evil Corp',
      city: 'Moscow',
      isTor: true,
      isProxy: false,
      isDatacenter: true,
    },
  };

  it('extracts all sources from a fully-enriched blob', () => {
    const result = mapEnrichmentData(fullBlob);
    expect(result).toBeDefined();
    expect(result!.status).toBe('enriched');
    expect(result!.sources).toEqual(['virustotal', 'abuseipdb', 'ai-triage']);
    expect(result!.externalRiskScore).toBe(78);
  });

  it('extracts geolocation subset (countryCode, isp, isTor only)', () => {
    const result = mapEnrichmentData(fullBlob);
    expect(result!.geolocation).toEqual({
      countryCode: 'RU',
      isp: 'Evil Corp ISP',
      isTor: true,
    });
    // Should NOT leak asn, org, city, isProxy, isDatacenter
    expect(result!.geolocation).not.toHaveProperty('asn');
    expect(result!.geolocation).not.toHaveProperty('isProxy');
  });

  it('extracts aiSummary from haikuResult.reasoning', () => {
    const result = mapEnrichmentData(fullBlob);
    expect(result!.aiSummary).toContain('C2 infrastructure');
  });

  it('strips cost data — no costBreakdown in output', () => {
    const result = mapEnrichmentData(fullBlob);
    expect(result).not.toHaveProperty('costBreakdown');
    expect(result).not.toHaveProperty('enrichmentQuality');
  });

  it('handles partial enrichment (only VT, no haiku/abuseipdb)', () => {
    const partial = {
      vtResult: { positives: 5, total: 70 },
      abuseipdbResult: null,
      haikuResult: null,
      enrichmentStatus: 'partial',
      externalRiskScore: 30,
      geolocation: null,
    };
    const result = mapEnrichmentData(partial);
    expect(result!.status).toBe('partial');
    expect(result!.sources).toEqual(['virustotal']);
    expect(result!.geolocation).toBeNull();
    expect(result!.aiSummary).toBeNull();
  });

  it('handles completely empty enrichment', () => {
    const empty = {
      vtResult: null,
      abuseipdbResult: null,
      haikuResult: null,
      enrichmentStatus: 'pending',
      externalRiskScore: null,
      geolocation: null,
    };
    const result = mapEnrichmentData(empty);
    expect(result!.status).toBe('pending');
    expect(result!.sources).toEqual([]);
    expect(result!.externalRiskScore).toBeNull();
  });

  it('returns undefined for null input', () => {
    expect(mapEnrichmentData(null)).toBeUndefined();
    expect(mapEnrichmentData(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object input', () => {
    expect(mapEnrichmentData('string')).toBeUndefined();
    expect(mapEnrichmentData(42)).toBeUndefined();
  });

  it('output validates against PublicIocEnrichmentDtoSchema', () => {
    const result = mapEnrichmentData(fullBlob);
    const parsed = PublicIocEnrichmentDtoSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

// ── toPublicIoc with enrichment flag ──────────────────────────────

describe('toPublicIoc with enrichment', () => {
  const rawIoc = {
    id: 'uuid-1',
    iocType: 'ip',
    value: '1.2.3.4',
    severity: 'high',
    tlp: 'amber',
    confidence: 85,
    lifecycle: 'active',
    tags: ['c2'],
    mitreAttack: ['T1059'],
    malwareFamilies: ['LockBit'],
    threatActors: ['APT28'],
    firstSeen: new Date('2026-03-01'),
    lastSeen: new Date('2026-03-31'),
    expiresAt: null,
    createdAt: new Date('2026-03-01'),
    enrichmentData: {
      vtResult: { positives: 42 },
      abuseipdbResult: null,
      haikuResult: null,
      enrichmentStatus: 'partial',
      externalRiskScore: 60,
      geolocation: null,
    },
  };

  it('omits enrichment when includeEnrichment=false (default)', () => {
    const result = toPublicIoc(rawIoc);
    expect(result).not.toHaveProperty('enrichment');
    expect(result.type).toBe('ip');
  });

  it('includes enrichment when includeEnrichment=true', () => {
    const result = toPublicIoc(rawIoc, true);
    expect(result).toHaveProperty('enrichment');
    const enriched = result as { enrichment?: { status: string; sources: string[] } };
    expect(enriched.enrichment!.status).toBe('partial');
    expect(enriched.enrichment!.sources).toEqual(['virustotal']);
  });

  it('omits enrichment when enrichmentData is null/absent', () => {
    const noEnrichment = { ...rawIoc, enrichmentData: null };
    const result = toPublicIoc(noEnrichment, true);
    expect(result).not.toHaveProperty('enrichment');
  });
});

// ── API Key Rotation Response Schema ──────────────────────────────

describe('ApiKeyRotateResponseSchema', () => {
  it('validates a well-formed rotation response', () => {
    const response = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      key: 'etip_abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
      prefix: 'etip_abc123d',
      name: 'My API Key (rotated-1711843200000)',
      scopes: ['ioc:read', 'feed:read'],
      graceExpiresAt: '2026-04-01T12:00:00.000Z',
      message: 'Old key remains valid for 24 hours.',
    };
    const result = ApiKeyRotateResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = ApiKeyRotateResponseSchema.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for id', () => {
    const result = ApiKeyRotateResponseSchema.safeParse({
      id: 'not-a-uuid',
      key: 'etip_test',
      prefix: 'etip_test1234',
      name: 'test',
      scopes: [],
      graceExpiresAt: '2026-04-01T12:00:00.000Z',
      message: 'test',
    });
    expect(result.success).toBe(false);
  });
});
