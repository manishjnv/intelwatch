import { describe, it, expect } from 'vitest';
import {
  calculateVelocityScore,
  isVelocitySpike,
  decayVelocityScore,
} from '../src/index.js';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}

describe('calculateVelocityScore', () => {
  it('single sighting → low score', () => {
    const result = calculateVelocityScore({
      timestamps: [hoursAgo(1)],
      feedSources: ['feed-1'],
      windowHours: 24,
    });
    expect(result.velocityScore).toBeLessThanOrEqual(25);
    expect(result.sightingsInWindow).toBe(1);
    expect(result.uniqueSourcesInWindow).toBe(1);
  });

  it('10 sightings from 3 sources → high score', () => {
    const timestamps = Array.from({ length: 10 }, (_, i) => hoursAgo(i + 1));
    const sources = ['feed-1', 'feed-2', 'feed-3', 'feed-1', 'feed-2', 'feed-3', 'feed-1', 'feed-2', 'feed-3', 'feed-1'];
    const result = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });
    expect(result.velocityScore).toBeGreaterThanOrEqual(70);
    expect(result.uniqueSourcesInWindow).toBe(3);
  });

  it('capped at 100', () => {
    const timestamps = Array.from({ length: 20 }, (_, i) => hoursAgo(i * 0.5));
    const sources = Array.from({ length: 20 }, (_, i) => `feed-${i}`);
    const result = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });
    expect(result.velocityScore).toBe(100);
  });

  it('trend accelerating when second-half > first-half', () => {
    // All sightings in the last 6h (second half of 24h window)
    const timestamps = Array.from({ length: 5 }, (_, i) => hoursAgo(i + 1));
    const sources = timestamps.map((_, i) => `feed-${i}`);
    const result = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });
    expect(result.trend).toBe('accelerating');
  });

  it('trend decelerating when first-half > second-half', () => {
    // All sightings in the first half (18-24h ago)
    const timestamps = Array.from({ length: 5 }, (_, i) => hoursAgo(18 + i));
    const sources = timestamps.map((_, i) => `feed-${i}`);
    const result = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });
    expect(result.trend).toBe('decelerating');
  });

  it('trend stable when roughly equal', () => {
    // Evenly spread across the 24h window
    const timestamps = [hoursAgo(2), hoursAgo(6), hoursAgo(14), hoursAgo(18)];
    const sources = ['feed-1', 'feed-2', 'feed-3', 'feed-4'];
    const result = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });
    expect(result.trend).toBe('stable');
  });

  it('peakHour identified correctly', () => {
    const peakTime = hoursAgo(3);
    // 5 sightings all at same hour
    const timestamps = Array.from({ length: 5 }, () => new Date(peakTime.getTime()));
    const sources = timestamps.map((_, i) => `feed-${i}`);
    const result = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });
    expect(result.peakHour).toBe(peakTime.toISOString().substring(0, 13));
  });
});

describe('isVelocitySpike', () => {
  it('2x → true, 1.5x → false', () => {
    expect(isVelocitySpike(80, 40)).toBe(true);  // 2x
    expect(isVelocitySpike(60, 40)).toBe(false);  // 1.5x
  });

  it('previous=0, current>0 → true', () => {
    expect(isVelocitySpike(10, 0)).toBe(true);
  });
});

describe('decayVelocityScore', () => {
  it('6h → half score', () => {
    const decayed = decayVelocityScore(100, 6);
    expect(decayed).toBeCloseTo(50, 0);
  });

  it('0h → same score', () => {
    expect(decayVelocityScore(80, 0)).toBe(80);
  });

  it('24h → ~6% of original', () => {
    const decayed = decayVelocityScore(100, 24);
    expect(decayed).toBeCloseTo(6.25, 0);
  });
});
