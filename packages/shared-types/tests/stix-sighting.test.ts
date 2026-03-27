import { describe, it, expect } from 'vitest';
import { StixSightingSchema, buildStixSighting } from '../src/stix.js';

describe('StixSightingSchema', () => {
  const validSighting = {
    type: 'sighting' as const,
    spec_version: '2.1' as const,
    id: 'sighting--12345678-1234-1234-1234-123456789abc',
    created: '2026-03-28T00:00:00.000Z',
    modified: '2026-03-28T00:00:00.000Z',
    sighting_of_ref: 'indicator--12345678-1234-1234-1234-123456789abc',
  };

  it('validates a correct sighting object', () => {
    const result = StixSightingSchema.safeParse(validSighting);
    expect(result.success).toBe(true);
  });

  it('rejects missing sighting_of_ref', () => {
    const { sighting_of_ref, ...noRef } = validSighting;
    const result = StixSightingSchema.safeParse(noRef);
    expect(result.success).toBe(false);
  });

  it('rejects count < 1', () => {
    const result = StixSightingSchema.safeParse({ ...validSighting, count: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence > 100', () => {
    const result = StixSightingSchema.safeParse({ ...validSighting, confidence: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects confidence < 0', () => {
    const result = StixSightingSchema.safeParse({ ...validSighting, confidence: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts all optional fields', () => {
    const full = {
      ...validSighting,
      first_seen: '2026-03-01T00:00:00.000Z',
      last_seen: '2026-03-28T00:00:00.000Z',
      count: 5,
      observed_data_refs: ['observed-data--aaa'],
      where_sighted_refs: ['identity--bbb'],
      summary: false,
      confidence: 80,
    };
    const result = StixSightingSchema.safeParse(full);
    expect(result.success).toBe(true);
  });
});

describe('buildStixSighting', () => {
  it('produces valid id with sighting-- prefix', () => {
    const sighting = buildStixSighting({ sightingOfRef: 'indicator--test' });
    expect(sighting.id).toMatch(/^sighting--[0-9a-f-]{36}$/);
  });

  it('sets type and spec_version', () => {
    const sighting = buildStixSighting({ sightingOfRef: 'indicator--test' });
    expect(sighting.type).toBe('sighting');
    expect(sighting.spec_version).toBe('2.1');
  });

  it('includes optional fields when provided', () => {
    const sighting = buildStixSighting({
      sightingOfRef: 'indicator--test',
      firstSeen: '2026-03-01T00:00:00.000Z',
      lastSeen: '2026-03-28T00:00:00.000Z',
      count: 3,
      whereSightedRefs: ['identity--org1'],
      confidence: 75,
    });
    expect(sighting.first_seen).toBe('2026-03-01T00:00:00.000Z');
    expect(sighting.last_seen).toBe('2026-03-28T00:00:00.000Z');
    expect(sighting.count).toBe(3);
    expect(sighting.where_sighted_refs).toEqual(['identity--org1']);
    expect(sighting.confidence).toBe(75);
  });

  it('minimal call produces schema-valid output', () => {
    const sighting = buildStixSighting({ sightingOfRef: 'indicator--test' });
    const result = StixSightingSchema.safeParse(sighting);
    expect(result.success).toBe(true);
  });
});
