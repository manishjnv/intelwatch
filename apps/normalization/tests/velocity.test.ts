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
