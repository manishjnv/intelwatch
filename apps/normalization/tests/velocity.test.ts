import { describe, it, expect } from 'vitest';
import { calculateVelocity } from '../src/service.js';

describe('Improvement B5: IOC velocity scoring', () => {
  const baseTime = new Date('2026-03-21T12:00:00Z');

  it('returns 0 velocity for first sighting', () => {
    const { velocityScore, sightingTimestamps } = calculateVelocity(
      [],
      baseTime.toISOString(),
      'feed-1',
    );
    expect(velocityScore).toBe(0);
    expect(sightingTimestamps).toHaveLength(1);
  });

  it('returns low velocity for 2 feeds in 7 days', () => {
    const prev = [
      { feedId: 'feed-1', timestamp: new Date(baseTime.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-2');
    expect(velocityScore).toBe(10); // 2 feeds in 7d
  });

  it('returns medium velocity for 3 feeds in 24h', () => {
    const prev = [
      { feedId: 'feed-1', timestamp: new Date(baseTime.getTime() - 12 * 60 * 60 * 1000).toISOString() },
      { feedId: 'feed-2', timestamp: new Date(baseTime.getTime() - 6 * 60 * 60 * 1000).toISOString() },
    ];
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-3');
    expect(velocityScore).toBe(50); // 3 feeds in 24h
  });

  it('returns high velocity for 3 feeds in 1 hour', () => {
    const prev = [
      { feedId: 'feed-1', timestamp: new Date(baseTime.getTime() - 30 * 60 * 1000).toISOString() },
      { feedId: 'feed-2', timestamp: new Date(baseTime.getTime() - 15 * 60 * 1000).toISOString() },
    ];
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-3');
    expect(velocityScore).toBe(80); // 3 feeds in 1h
  });

  it('returns critical velocity for 5+ feeds in 1 hour', () => {
    const prev = [
      { feedId: 'feed-1', timestamp: new Date(baseTime.getTime() - 50 * 60 * 1000).toISOString() },
      { feedId: 'feed-2', timestamp: new Date(baseTime.getTime() - 40 * 60 * 1000).toISOString() },
      { feedId: 'feed-3', timestamp: new Date(baseTime.getTime() - 30 * 60 * 1000).toISOString() },
      { feedId: 'feed-4', timestamp: new Date(baseTime.getTime() - 10 * 60 * 1000).toISOString() },
    ];
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-5');
    expect(velocityScore).toBe(100); // 5 feeds in 1h
  });

  it('caps sighting timestamps at 50 entries', () => {
    const prev = Array.from({ length: 55 }, (_, i) => ({
      feedId: `feed-${i}`,
      timestamp: new Date(baseTime.getTime() - i * 60 * 60 * 1000).toISOString(),
    }));
    const { sightingTimestamps } = calculateVelocity(prev, baseTime.toISOString(), 'feed-new');
    expect(sightingTimestamps.length).toBeLessThanOrEqual(50);
  });

  it('returns 2-feed-in-1h as 60 velocity', () => {
    const prev = [
      { feedId: 'feed-1', timestamp: new Date(baseTime.getTime() - 20 * 60 * 1000).toISOString() },
    ];
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-2');
    expect(velocityScore).toBe(60); // 2 feeds in 1h
  });
});

describe('G2b: Weighted velocity scoring', () => {
  const baseTime = new Date('2026-03-21T12:00:00Z');
  const ago = (mins: number) => new Date(baseTime.getTime() - mins * 60 * 1000).toISOString();

  it('5 low-reliability feeds (30%) → score < 80 (not critical)', () => {
    // Weighted count: 5 × 0.30 = 1.50 < 1.6 → score 0 (below threshold)
    const prev = [
      { feedId: 'feed-1', timestamp: ago(50) },
      { feedId: 'feed-2', timestamp: ago(40) },
      { feedId: 'feed-3', timestamp: ago(30) },
      { feedId: 'feed-4', timestamp: ago(10) },
    ];
    const reliabilityMap = new Map([
      ['feed-1', 30], ['feed-2', 30], ['feed-3', 30], ['feed-4', 30], ['feed-5', 30],
    ]);
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-5', reliabilityMap);
    // w1h = 5 × 0.30 = 1.5 < 1.6 → 0
    expect(velocityScore).toBe(0);
  });

  it('3 high-reliability feeds (90%) → score 80 (high velocity)', () => {
    // Weighted count: 3 × 0.90 = 2.70 >= 2.4 → score 80
    const prev = [
      { feedId: 'feed-1', timestamp: ago(30) },
      { feedId: 'feed-2', timestamp: ago(15) },
    ];
    const reliabilityMap = new Map([
      ['feed-1', 90], ['feed-2', 90], ['feed-3', 90],
    ]);
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-3', reliabilityMap);
    expect(velocityScore).toBe(80);
  });

  it('5 high-reliability feeds (90%) → score 100 (critical velocity)', () => {
    // 5 × 0.90 = 4.5 >= 4.0 → 100
    const prev = [
      { feedId: 'feed-1', timestamp: ago(50) },
      { feedId: 'feed-2', timestamp: ago(40) },
      { feedId: 'feed-3', timestamp: ago(30) },
      { feedId: 'feed-4', timestamp: ago(10) },
    ];
    const reliabilityMap = new Map([
      ['feed-1', 90], ['feed-2', 90], ['feed-3', 90], ['feed-4', 90], ['feed-5', 90],
    ]);
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-5', reliabilityMap);
    expect(velocityScore).toBe(100);
  });

  it('falls back to weight=0.5 for unknown feedIds in map', () => {
    // 2 feeds not in map → each gets 50/100 = 0.5, total w1h = 1.0 < 1.6 → 0
    const prev = [{ feedId: 'unknown-feed', timestamp: ago(20) }];
    const reliabilityMap = new Map<string, number>(); // empty map
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'another-unknown', reliabilityMap);
    // 2 feeds × 0.5 = 1.0 < 1.6 → 0
    expect(velocityScore).toBe(0);
  });

  it('raw count mode (no map) behaves same as before', () => {
    // No map → weight=1 for all feeds. 3 feeds in 1h → w=3 >= 2.4 → 80
    const prev = [
      { feedId: 'feed-1', timestamp: ago(30) },
      { feedId: 'feed-2', timestamp: ago(15) },
    ];
    const { velocityScore } = calculateVelocity(prev, baseTime.toISOString(), 'feed-3');
    expect(velocityScore).toBe(80);
  });
});
