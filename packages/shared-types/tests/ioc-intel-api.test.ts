/**
 * @module @etip/shared-types/tests/ioc-intel-api
 * @description Unit tests for IOC, Intel entity, and API response schemas.
 */
import { describe, it, expect } from 'vitest';
import {
  CanonicalIOCSchema,
  IocTypeSchema,
  IocStateSchema,
  IOC_TRANSITIONS,
  TlpSchema,
  SeveritySchema,
  ConfidenceInputsSchema,
  CanonicalThreatActorSchema,
  CanonicalMalwareSchema,
  CanonicalVulnerabilitySchema,
  NormalizedIntelSchema,
  EntityTypeSchema,
  PaginationQuerySchema,
  SortedPaginationQuerySchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  DateRangeSchema,
} from '../src/index.js';

const NOW = new Date().toISOString();
const UUID = '550e8400-e29b-41d4-a716-446655440000';

// ── IOC Schema Tests ───────────────────────────────────────────────

describe('IocTypeSchema', () => {
  it('accepts all 14 valid IOC types', () => {
    const types = [
      'ip', 'ipv6', 'domain', 'fqdn', 'url', 'email',
      'md5', 'sha1', 'sha256', 'sha512', 'asn', 'cidr',
      'cve', 'bitcoin_address',
    ];
    for (const t of types) {
      expect(IocTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid IOC type', () => {
    expect(() => IocTypeSchema.parse('invalid')).toThrow();
  });
});

describe('CanonicalIOCSchema', () => {
  const validIOC = {
    id: UUID,
    tenantId: 'tenant-1',
    type: 'ip' as const,
    value: '192.168.1.1',
    normalizedValue: '192.168.1.1',
    state: 'NEW' as const,
    firstSeen: NOW,
    lastSeen: NOW,
    tlp: 'AMBER' as const,
    confidence: 75,
    severity: 'HIGH' as const,
    tags: ['apt'],
    mitreAttack: ['T1059'],
    malwareFamilies: [],
    threatActors: [],
    sourceRefs: [{ feedId: UUID, feedName: 'OTX' }],
    dedupeHash: 'a'.repeat(64),
    normalizedAt: NOW,
    schemaVersion: '3.0' as const,
  };

  it('accepts a valid CanonicalIOC', () => {
    const result = CanonicalIOCSchema.parse(validIOC);
    expect(result.id).toBe(UUID);
    expect(result.type).toBe('ip');
    expect(result.schemaVersion).toBe('3.0');
  });

  it('applies default values for optional fields', () => {
    const minimal = {
      ...validIOC,
      tags: undefined,
      mitreAttack: undefined,
      malwareFamilies: undefined,
      threatActors: undefined,
      state: undefined,
      tlp: undefined,
      confidence: undefined,
      severity: undefined,
    };
    const result = CanonicalIOCSchema.parse(minimal);
    expect(result.tags).toEqual([]);
    expect(result.state).toBe('NEW');
    expect(result.tlp).toBe('AMBER');
    expect(result.confidence).toBe(50);
    expect(result.severity).toBe('MEDIUM');
  });

  it('rejects missing required fields', () => {
    expect(() => CanonicalIOCSchema.parse({})).toThrow();
  });

  it('rejects invalid confidence range', () => {
    expect(() => CanonicalIOCSchema.parse({ ...validIOC, confidence: 150 })).toThrow();
    expect(() => CanonicalIOCSchema.parse({ ...validIOC, confidence: -1 })).toThrow();
  });

  it('rejects empty sourceRefs', () => {
    expect(() => CanonicalIOCSchema.parse({ ...validIOC, sourceRefs: [] })).toThrow();
  });

  it('rejects wrong schemaVersion', () => {
    expect(() => CanonicalIOCSchema.parse({ ...validIOC, schemaVersion: '2.0' })).toThrow();
  });
});

describe('IOC_TRANSITIONS', () => {
  it('NEW can transition to ACTIVE or REVOKED', () => {
    expect(IOC_TRANSITIONS.NEW).toEqual(['ACTIVE', 'REVOKED']);
  });

  it('ARCHIVED is terminal (no transitions)', () => {
    expect(IOC_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it('ACTIVE supports aging, false positive, revoked', () => {
    expect(IOC_TRANSITIONS.ACTIVE).toContain('AGING');
    expect(IOC_TRANSITIONS.ACTIVE).toContain('FALSE_POSITIVE');
    expect(IOC_TRANSITIONS.ACTIVE).toContain('REVOKED');
  });

  it('AGING can re-activate', () => {
    expect(IOC_TRANSITIONS.AGING).toContain('ACTIVE');
  });
});

describe('TlpSchema', () => {
  it('accepts WHITE, GREEN, AMBER, RED', () => {
    for (const v of ['WHITE', 'GREEN', 'AMBER', 'RED']) {
      expect(TlpSchema.parse(v)).toBe(v);
    }
  });
  it('rejects invalid TLP', () => {
    expect(() => TlpSchema.parse('PURPLE')).toThrow();
  });
});

describe('ConfidenceInputsSchema', () => {
  it('validates correct inputs', () => {
    const result = ConfidenceInputsSchema.parse({
      feedReliability: 80,
      corroborationCount: 3,
      aiConfidence: 90,
      communityScore: 70,
      ageDays: 10,
    });
    expect(result.feedReliability).toBe(80);
  });

  it('rejects out-of-range values', () => {
    expect(() => ConfidenceInputsSchema.parse({
      feedReliability: 150,
      corroborationCount: 3,
      aiConfidence: 90,
      communityScore: 70,
      ageDays: 10,
    })).toThrow();
  });
});

// ── Intel Entity Schema Tests ──────────────────────────────────────

describe('CanonicalThreatActorSchema', () => {
  it('accepts valid threat actor', () => {
    const actor = CanonicalThreatActorSchema.parse({
      id: UUID,
      tenantId: 'tenant-1',
      name: 'APT29',
      normalizedAt: NOW,
      schemaVersion: '3.0',
    });
    expect(actor.name).toBe('APT29');
    expect(actor.motivation).toBe('unknown');
    expect(actor.aliases).toEqual([]);
  });
});

describe('CanonicalMalwareSchema', () => {
  it('accepts valid malware', () => {
    const malware = CanonicalMalwareSchema.parse({
      id: UUID,
      tenantId: 'tenant-1',
      name: 'Emotet',
      malwareType: 'trojan',
      normalizedAt: NOW,
      schemaVersion: '3.0',
    });
    expect(malware.malwareType).toBe('trojan');
  });
});

describe('CanonicalVulnerabilitySchema', () => {
  it('accepts valid vulnerability', () => {
    const vuln = CanonicalVulnerabilitySchema.parse({
      id: UUID,
      tenantId: 'tenant-1',
      cveId: 'CVE-2024-12345',
      normalizedAt: NOW,
      schemaVersion: '3.0',
    });
    expect(vuln.cveId).toBe('CVE-2024-12345');
    expect(vuln.exploitedInWild).toBe(false);
  });

  it('rejects malformed CVE ID', () => {
    expect(() => CanonicalVulnerabilitySchema.parse({
      id: UUID, tenantId: 'tenant-1', cveId: 'NOT-A-CVE',
      normalizedAt: NOW, schemaVersion: '3.0',
    })).toThrow();
  });
});

describe('NormalizedIntelSchema', () => {
  it('wraps any entity type', () => {
    const intel = NormalizedIntelSchema.parse({
      entityType: 'ioc',
      entityId: UUID,
      tenantId: 'tenant-1',
      data: { value: '8.8.8.8' },
      sourceRefs: [{ feedId: UUID, feedName: 'OTX' }],
      normalizedAt: NOW,
    });
    expect(intel.enriched).toBe(false);
  });
});

// ── API Response Schema Tests ──────────────────────────────────────

describe('PaginationQuerySchema', () => {
  it('applies defaults', () => {
    const result = PaginationQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('coerces string numbers', () => {
    const result = PaginationQuerySchema.parse({ page: '3', limit: '25' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });

  it('rejects limit > 500', () => {
    expect(() => PaginationQuerySchema.parse({ limit: 501 })).toThrow();
  });

  it('rejects page < 1', () => {
    expect(() => PaginationQuerySchema.parse({ page: 0 })).toThrow();
  });
});

describe('SortedPaginationQuerySchema', () => {
  it('applies sort defaults', () => {
    const result = SortedPaginationQuerySchema.parse({});
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortDir).toBe('desc');
  });
});

describe('ErrorResponseSchema', () => {
  it('validates error shape', () => {
    const result = ErrorResponseSchema.parse({
      error: { code: 'NOT_FOUND', message: 'IOC not found' },
    });
    expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('HealthResponseSchema', () => {
  it('validates health check', () => {
    const result = HealthResponseSchema.parse({
      status: 'ok',
      service: 'ioc-service',
      version: '1.0.0',
      uptime: 3600,
      timestamp: NOW,
    });
    expect(result.status).toBe('ok');
  });
});

describe('DateRangeSchema', () => {
  it('accepts empty range', () => {
    const result = DateRangeSchema.parse({});
    expect(result.from).toBeUndefined();
  });

  it('accepts full range', () => {
    const result = DateRangeSchema.parse({ from: NOW, to: NOW });
    expect(result.from).toBe(NOW);
  });
});
