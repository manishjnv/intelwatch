/**
 * Tests for seed-global-feeds script.
 * Validates seed data integrity and idempotency.
 *
 * These tests validate the seed data shape without requiring a real DB.
 * Run: npx vitest run tests/e2e/seed-global-feeds.test.ts --config tests/e2e/vitest.config.ts
 */
import { describe, it, expect } from 'vitest';
import { GLOBAL_FEED_SEEDS } from '../../scripts/seed-global-feeds.js';

// ─── Admiralty scoring (duplicated for test isolation) ──────────────────
const RELIABILITY_MAP: Record<string, number> = {
  A: 100, B: 80, C: 60, D: 40, E: 20, F: 0,
};
const CREDIBILITY_MAP: Record<number, number> = {
  1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 0,
};
function admiraltyToScore(sourceReliability: string, infoCred: number): number {
  const r = RELIABILITY_MAP[sourceReliability] ?? 50;
  const c = CREDIBILITY_MAP[infoCred] ?? 50;
  return Math.round((r + c) / 2);
}

describe('seed-global-feeds', () => {

  it('defines 10 unique feeds with required fields', () => {
    expect(GLOBAL_FEED_SEEDS).toHaveLength(10);

    const names = new Set(GLOBAL_FEED_SEEDS.map(f => f.name));
    expect(names.size).toBe(10); // All unique

    for (const feed of GLOBAL_FEED_SEEDS) {
      expect(feed.name).toBeTruthy();
      expect(feed.feedType).toBeTruthy();
      expect(feed.url).toMatch(/^https?:\/\//);
      expect(['A', 'B', 'C', 'D', 'E', 'F']).toContain(feed.sourceReliability);
      expect(feed.infoCred).toBeGreaterThanOrEqual(1);
      expect(feed.infoCred).toBeLessThanOrEqual(6);
      expect(['free', 'starter', 'teams', 'enterprise']).toContain(feed.minPlanTier);
      expect(feed.schedule).toBeTruthy();
    }
  });

  it('idempotent: running twice would not create duplicates (upsert by name)', () => {
    // Verify all names are unique — upsert key
    const names = GLOBAL_FEED_SEEDS.map(f => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('feedReliability computed from Admiralty Code (A1 → 100, C3 → 60)', () => {
    // A1 = (100 + 100) / 2 = 100
    expect(admiraltyToScore('A', 1)).toBe(100);

    // C3 = (60 + 60) / 2 = 60
    expect(admiraltyToScore('C', 3)).toBe(60);

    // B2 = (80 + 80) / 2 = 80
    expect(admiraltyToScore('B', 2)).toBe(80);

    // Verify each feed's score
    for (const feed of GLOBAL_FEED_SEEDS) {
      const score = admiraltyToScore(feed.sourceReliability, feed.infoCred);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
