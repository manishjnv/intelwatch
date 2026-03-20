import { describe, it, expect, beforeEach } from 'vitest';
import { SourceTriangulation } from '../src/services/source-triangulation.js';

describe('SourceTriangulation', () => {
  let tri: SourceTriangulation;

  beforeEach(() => {
    tri = new SourceTriangulation();
  });

  describe('recordSighting + getOverlap', () => {
    it('returns full independence for feeds with no overlap', () => {
      tri.recordSighting('feed-a', 'ioc-1');
      tri.recordSighting('feed-a', 'ioc-2');
      tri.recordSighting('feed-b', 'ioc-3');
      tri.recordSighting('feed-b', 'ioc-4');

      const overlap = tri.getOverlap('feed-a', 'feed-b');
      expect(overlap.overlapRatio).toBe(0);
      expect(overlap.independenceWeight).toBe(1.0);
    });

    it('returns low independence for highly overlapping feeds', () => {
      // Both feeds report the same IOCs
      for (const ioc of ['ioc-1', 'ioc-2', 'ioc-3', 'ioc-4', 'ioc-5']) {
        tri.recordSighting('feed-a', ioc);
        tri.recordSighting('feed-b', ioc);
        tri.recordCooccurrence('feed-a', 'feed-b', ioc);
      }

      const overlap = tri.getOverlap('feed-a', 'feed-b');
      expect(overlap.overlapRatio).toBe(1.0);
      expect(overlap.independenceWeight).toBe(0.2); // Minimum for fully correlated
    });

    it('returns partial independence for moderate overlap', () => {
      // Feed A has 10 IOCs, Feed B has 10, 5 shared (50% overlap)
      for (let i = 0; i < 10; i++) tri.recordSighting('feed-a', `ioc-${i}`);
      for (let i = 5; i < 15; i++) tri.recordSighting('feed-b', `ioc-${i}`);
      for (let i = 5; i < 10; i++) tri.recordCooccurrence('feed-a', 'feed-b', `ioc-${i}`);

      const overlap = tri.getOverlap('feed-a', 'feed-b');
      expect(overlap.sharedIOCs).toBe(5);
      expect(overlap.overlapRatio).toBe(0.5); // 5/min(10,10)
      expect(overlap.independenceWeight).toBeGreaterThan(0.2);
      expect(overlap.independenceWeight).toBeLessThan(1.0);
    });

    it('handles unknown feeds gracefully', () => {
      const overlap = tri.getOverlap('unknown-a', 'unknown-b');
      expect(overlap.independenceWeight).toBe(1.0);
      expect(overlap.sharedIOCs).toBe(0);
    });

    it('uses canonical pair key (order-independent)', () => {
      tri.recordSighting('feed-a', 'ioc-1');
      tri.recordSighting('feed-b', 'ioc-1');
      tri.recordCooccurrence('feed-b', 'feed-a', 'ioc-1'); // Reversed order

      const overlap = tri.getOverlap('feed-a', 'feed-b');
      expect(overlap.sharedIOCs).toBe(1);
    });
  });

  describe('triangulate', () => {
    it('returns raw confidence for single source', () => {
      const result = tri.triangulate('ioc-1', ['feed-a'], 0.7);
      expect(result.effectiveSources).toBe(1);
      expect(result.triangulatedConfidence).toBe(0.7);
      expect(result.isGenuineCorroboration).toBe(false);
    });

    it('boosts confidence for independent sources', () => {
      tri.recordSighting('feed-a', 'other-1');
      tri.recordSighting('feed-b', 'other-2');
      // No co-occurrence — fully independent

      const result = tri.triangulate('target-ioc', ['feed-a', 'feed-b'], 0.6);
      expect(result.effectiveSources).toBe(2);
      expect(result.rawSourceCount).toBe(2);
      expect(result.triangulatedConfidence).toBeGreaterThan(0.6);
      expect(result.isGenuineCorroboration).toBe(true);
    });

    it('discounts confidence for correlated sources', () => {
      // Make feeds highly correlated
      for (const ioc of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
        tri.recordSighting('feed-a', ioc);
        tri.recordSighting('feed-b', ioc);
        tri.recordCooccurrence('feed-a', 'feed-b', ioc);
      }

      const result = tri.triangulate('target-ioc', ['feed-a', 'feed-b'], 0.6);
      expect(result.effectiveSources).toBeLessThan(2); // Discounted
      expect(result.rawSourceCount).toBe(2);
      // Correlated sources should boost less than independent ones
    });

    it('handles mixed independent and correlated sources', () => {
      // feed-a and feed-b are correlated
      for (const ioc of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9', 'x10']) {
        tri.recordSighting('feed-a', ioc);
        tri.recordSighting('feed-b', ioc);
        tri.recordCooccurrence('feed-a', 'feed-b', ioc);
      }
      // feed-c is independent
      for (const ioc of ['y1', 'y2', 'y3', 'y4', 'y5']) {
        tri.recordSighting('feed-c', ioc);
      }

      const result = tri.triangulate('target', ['feed-a', 'feed-b', 'feed-c'], 0.5);
      expect(result.rawSourceCount).toBe(3);
      expect(result.effectiveSources).toBeLessThan(3); // feed-b discounted
      expect(result.effectiveSources).toBeGreaterThan(1.2); // feed-c fully independent + discounted b
      // Effective sources = 1 (first) + 0.2 (correlated b) + 0.2 (feed-c min-independence vs a or b)
      // This is NOT genuine corroboration because effective sources < 2.0
      // (a and b are too correlated to count as 2 sources)
    });

    it('clamps confidence to 0-1 range', () => {
      const result = tri.triangulate('ioc-1', ['a', 'b', 'c', 'd', 'e'], 0.95);
      expect(result.triangulatedConfidence).toBeLessThanOrEqual(1);
    });

    it('returns independence scores per feed', () => {
      tri.recordSighting('feed-a', 'x');
      tri.recordSighting('feed-b', 'y');

      const result = tri.triangulate('z', ['feed-a', 'feed-b'], 0.5);
      expect(result.independenceScores.size).toBe(2);
      expect(result.independenceScores.get('feed-a')).toBe(1.0);
      expect(result.independenceScores.get('feed-b')).toBe(1.0);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      tri.recordSighting('feed-a', 'ioc-1');
      tri.clear();
      const overlap = tri.getOverlap('feed-a', 'feed-b');
      expect(overlap.totalA).toBe(0);
    });
  });
});
