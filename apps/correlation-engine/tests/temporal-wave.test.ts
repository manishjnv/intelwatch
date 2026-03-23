import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalWaveService } from '../src/services/temporal-wave.js';
import type { CorrelatedIOC } from '../src/schemas/correlation.js';

function makeIOC(id: string, tenantId: string, firstSeen: Date): CorrelatedIOC {
  return {
    id, tenantId, iocType: 'ip', value: `10.0.0.${id}`, normalizedValue: `10.0.0.${id}`,
    confidence: 80, severity: 'HIGH', tags: [], mitreAttack: [],
    malwareFamilies: [], threatActors: [], sourceFeedIds: [],
    firstSeen: firstSeen.toISOString(), lastSeen: firstSeen.toISOString(),
    enrichmentQuality: 0.5,
  };
}

describe('Correlation Engine — #3 TemporalWaveService', () => {
  let svc: TemporalWaveService;

  beforeEach(() => {
    svc = new TemporalWaveService({ zScoreThreshold: 2.0, bucketSizeMs: 3600 * 1000, minBuckets: 3 });
  });

  it('1. mean computes correctly', () => {
    expect(svc.mean([2, 4, 6])).toBe(4);
  });

  it('2. mean returns 0 for empty array', () => {
    expect(svc.mean([])).toBe(0);
  });

  it('3. stddev returns 0 for single value', () => {
    expect(svc.stddev([5])).toBe(0);
  });

  it('4. stddev computes correctly for known values', () => {
    // stddev of [2, 4, 4, 4, 5, 5, 7, 9] = 2.0
    const sd = svc.stddev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(2.0, 1);
  });

  it('5. zScore returns Infinity when stddev is 0 and value > mean', () => {
    expect(svc.zScore(10, 5, 0)).toBe(Infinity);
  });

  it('6. zScore returns 0 when stddev is 0 and value equals mean', () => {
    expect(svc.zScore(5, 5, 0)).toBe(0);
  });

  it('7. detects a spike in IOC volume', () => {
    const now = Date.now();
    const iocs = new Map<string, CorrelatedIOC>();

    // Normal hours: 2 IOCs each (hours 1-5)
    for (let h = 1; h <= 5; h++) {
      for (let i = 0; i < 2; i++) {
        const id = `normal-${h}-${i}`;
        iocs.set(id, makeIOC(id, 't1', new Date(now - h * 3600 * 1000)));
      }
    }

    // Spike hour: 20 IOCs
    for (let i = 0; i < 20; i++) {
      const id = `spike-${i}`;
      iocs.set(id, makeIOC(id, 't1', new Date(now - 500)));
    }

    const waves = svc.detectWaves('t1', iocs, 24);
    expect(waves.length).toBeGreaterThanOrEqual(1);
    expect(waves[0]!.zScore).toBeGreaterThanOrEqual(2.0);
    expect(waves[0]!.iocCount).toBe(20);
  });

  it('8. returns empty when not enough buckets', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC('a', 't1', new Date()));

    const waves = svc.detectWaves('t1', iocs, 24);
    expect(waves).toHaveLength(0);
  });

  it('9. isolates tenants', () => {
    const now = Date.now();
    const iocs = new Map<string, CorrelatedIOC>();

    for (let h = 0; h < 6; h++) {
      iocs.set(`t2-${h}`, makeIOC(`t2-${h}`, 't2', new Date(now - h * 3600 * 1000)));
    }

    const waves = svc.detectWaves('t1', iocs, 24);
    expect(waves).toHaveLength(0);
  });

  it('10. waves are sorted by z-score descending', () => {
    const now = Date.now();
    const iocs = new Map<string, CorrelatedIOC>();

    // Create varying volume across hours
    const volumes = [2, 2, 2, 2, 15, 2, 2, 25]; // Two spikes
    for (let h = 0; h < volumes.length; h++) {
      for (let i = 0; i < volumes[h]!; i++) {
        const id = `v-${h}-${i}`;
        iocs.set(id, makeIOC(id, 't1', new Date(now - h * 3600 * 1000)));
      }
    }

    const waves = svc.detectWaves('t1', iocs, 24);
    for (let i = 1; i < waves.length; i++) {
      expect(waves[i]!.zScore).toBeLessThanOrEqual(waves[i - 1]!.zScore);
    }
  });
});
