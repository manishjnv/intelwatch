import { describe, it, expect, beforeEach } from 'vitest';
import { TrendCalculator } from '../src/services/trend-calculator.js';

describe('TrendCalculator', () => {
  let calc: TrendCalculator;

  beforeEach(() => { calc = new TrendCalculator(90); });

  describe('record and getTrend', () => {
    it('returns null for unknown metric', () => {
      expect(calc.getTrend('unknown', 7)).toBeNull();
    });

    it('records and retrieves a single-point trend', () => {
      calc.record('ioc.total', 100);
      const trend = calc.getTrend('ioc.total', 7);
      expect(trend).not.toBeNull();
      expect(trend!.currentValue).toBe(100);
      expect(trend!.delta).toBe(0);
      expect(trend!.direction).toBe('flat');
    });

    it('calculates upward trend correctly', () => {
      const now = Date.now();
      calc.record('ioc.total', 100, now - 86_400_000);
      calc.record('ioc.total', 150, now);
      const trend = calc.getTrend('ioc.total', 7);
      expect(trend!.currentValue).toBe(150);
      expect(trend!.previousValue).toBe(100);
      expect(trend!.delta).toBe(50);
      expect(trend!.deltaPercent).toBe(50);
      expect(trend!.direction).toBe('up');
    });

    it('calculates downward trend correctly', () => {
      const now = Date.now();
      calc.record('alert.open', 50, now - 86_400_000);
      calc.record('alert.open', 30, now);
      const trend = calc.getTrend('alert.open', 7);
      expect(trend!.direction).toBe('down');
      expect(trend!.delta).toBe(-20);
      expect(trend!.deltaPercent).toBe(-40);
    });

    it('filters by time window', () => {
      const now = Date.now();
      calc.record('ioc.total', 50, now - 30 * 86_400_000); // 30 days ago
      calc.record('ioc.total', 100, now - 5 * 86_400_000);  // 5 days ago
      calc.record('ioc.total', 150, now);
      const trend7d = calc.getTrend('ioc.total', 7);
      expect(trend7d!.points.length).toBe(2); // only last 7 days
      expect(trend7d!.previousValue).toBe(100);
    });
  });

  describe('getMetrics', () => {
    it('returns empty array initially', () => {
      expect(calc.getMetrics()).toEqual([]);
    });

    it('returns recorded metric names', () => {
      calc.record('ioc.total', 100);
      calc.record('alert.open', 20);
      expect(calc.getMetrics()).toContain('ioc.total');
      expect(calc.getMetrics()).toContain('alert.open');
    });
  });

  describe('getAllTrends', () => {
    it('returns trends for all metrics', () => {
      calc.record('ioc.total', 100);
      calc.record('alert.open', 20);
      const trends = calc.getAllTrends(7);
      expect(trends.length).toBe(2);
    });
  });

  describe('seedDemo', () => {
    it('seeds N+1 data points', () => {
      calc.seedDemo('ioc.total', 1000, 100, 30);
      const trend = calc.getTrend('ioc.total', 30);
      expect(trend).not.toBeNull();
      expect(trend!.points.length).toBe(31);
    });

    it('values are within expected range', () => {
      calc.seedDemo('test.metric', 100, 10, 7);
      const trend = calc.getTrend('test.metric', 7);
      for (const point of trend!.points) {
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('totalSnapshots', () => {
    it('counts all snapshots across metrics', () => {
      calc.record('a', 1);
      calc.record('a', 2);
      calc.record('b', 3);
      expect(calc.totalSnapshots()).toBe(3);
    });
  });

  describe('purgeOld', () => {
    it('removes data older than retention period', () => {
      const calc30 = new TrendCalculator(30);
      const old = Date.now() - 31 * 86_400_000;
      calc30.record('old.metric', 100, old);
      calc30.record('new.metric', 200);
      const purged = calc30.purgeOld();
      expect(purged).toBe(1);
      expect(calc30.getTrend('old.metric', 90)).toBeNull();
      expect(calc30.getTrend('new.metric', 7)).not.toBeNull();
    });
  });
});
