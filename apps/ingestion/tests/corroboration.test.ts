import { describe, it, expect, beforeEach } from 'vitest';
import { CorroborationEngine } from '../src/services/corroboration.js';

let engine: CorroborationEngine;
const TENANT = 'tenant-1';

beforeEach(() => { engine = new CorroborationEngine(); });

describe('CorroborationEngine.recordSighting', () => {
  it('records first sighting for an IOC', () => {
    const record = engine.recordSighting('1.2.3.4', 'ip', 'feed-a', TENANT);
    expect(record.sightings.size).toBe(1);
    expect(record.iocValue).toBe('1.2.3.4');
  });

  it('records multiple feeds for same IOC', () => {
    engine.recordSighting('1.2.3.4', 'ip', 'feed-a', TENANT);
    const record = engine.recordSighting('1.2.3.4', 'ip', 'feed-b', TENANT);
    expect(record.sightings.size).toBe(2);
  });

  it('deduplicates same feed sighting (updates lastSeen)', () => {
    engine.recordSighting('1.2.3.4', 'ip', 'feed-a', TENANT);
    const record = engine.recordSighting('1.2.3.4', 'ip', 'feed-a', TENANT);
    expect(record.sightings.size).toBe(1);
  });

  it('normalizes IOC values (defanged)', () => {
    engine.recordSighting('1[.]2[.]3[.]4', 'ip', 'feed-a', TENANT);
    const count = engine.getSightingCount('1.2.3.4', 'ip', TENANT);
    expect(count).toBe(1);
  });
});

describe('CorroborationEngine.calculateCorroboratedConfidence', () => {
  it('returns base confidence for single sighting', () => {
    expect(engine.calculateCorroboratedConfidence(50, 1)).toBe(50);
  });

  it('boosts confidence for 2 sightings', () => {
    const boosted = engine.calculateCorroboratedConfidence(50, 2);
    expect(boosted).toBeGreaterThan(50);
    expect(boosted).toBeLessThanOrEqual(100);
  });

  it('boosts more for 5 sightings than 2', () => {
    const boost2 = engine.calculateCorroboratedConfidence(50, 2);
    const boost5 = engine.calculateCorroboratedConfidence(50, 5);
    expect(boost5).toBeGreaterThan(boost2);
  });

  it('caps at 100', () => {
    expect(engine.calculateCorroboratedConfidence(95, 100)).toBeLessThanOrEqual(100);
  });
});

describe('CorroborationEngine.sightingCountToSignal', () => {
  it('returns 0 for no sightings', () => {
    expect(engine.sightingCountToSignal(0)).toBe(0);
  });

  it('returns 20 for single source', () => {
    expect(engine.sightingCountToSignal(1)).toBe(20);
  });

  it('scales logarithmically', () => {
    const s2 = engine.sightingCountToSignal(2);
    const s5 = engine.sightingCountToSignal(5);
    const s10 = engine.sightingCountToSignal(10);
    expect(s2).toBeGreaterThan(20);
    expect(s5).toBeGreaterThan(s2);
    expect(s10).toBeGreaterThan(s5);
    expect(s10).toBeLessThanOrEqual(100);
  });
});

describe('CorroborationEngine.getCorroboration', () => {
  it('returns full corroboration result', () => {
    engine.recordSighting('evil.com', 'domain', 'feed-a', TENANT);
    engine.recordSighting('evil.com', 'domain', 'feed-b', TENANT);
    engine.recordSighting('evil.com', 'domain', 'feed-c', TENANT);

    const result = engine.getCorroboration('evil.com', 'domain', TENANT, 50);
    expect(result.sightingCount).toBe(3);
    expect(result.feedIds).toHaveLength(3);
    expect(result.boostedConfidence).toBeGreaterThan(50);
    expect(result.corroborationSignal).toBeGreaterThan(20);
  });
});

describe('CorroborationEngine.calculateFullConfidence', () => {
  it('integrates with shared-normalization composite confidence', () => {
    const result = engine.calculateFullConfidence(80, 60, 70, 50, 5);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.decayFactor).toBeGreaterThan(0);
    expect(result.decayFactor).toBeLessThanOrEqual(1);
  });
});
