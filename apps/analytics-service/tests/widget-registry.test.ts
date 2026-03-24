import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY, getWidget, getWidgetsByCategory } from '../src/services/widget-registry.js';

describe('WidgetRegistry', () => {
  it('contains at least 14 widgets', () => {
    expect(WIDGET_REGISTRY.length).toBeGreaterThanOrEqual(14);
  });

  it('every widget has required fields', () => {
    for (const w of WIDGET_REGISTRY) {
      expect(w.id).toBeTruthy();
      expect(w.label).toBeTruthy();
      expect(w.description).toBeTruthy();
      expect(['overview', 'threats', 'operations', 'performance']).toContain(w.category);
      expect(['sm', 'md', 'lg', 'xl']).toContain(w.size);
      expect(w.ttlSeconds).toBeGreaterThan(0);
      expect(w.dataKey).toBeTruthy();
    }
  });

  it('widget IDs are unique', () => {
    const ids = WIDGET_REGISTRY.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('getWidget', () => {
    it('returns widget by ID', () => {
      const w = getWidget('total-iocs');
      expect(w).toBeDefined();
      expect(w!.label).toBe('Total IOCs');
    });

    it('returns undefined for unknown ID', () => {
      expect(getWidget('nonexistent')).toBeUndefined();
    });
  });

  describe('getWidgetsByCategory', () => {
    it('filters overview widgets', () => {
      const overview = getWidgetsByCategory('overview');
      expect(overview.length).toBeGreaterThanOrEqual(4);
      expect(overview.every(w => w.category === 'overview')).toBe(true);
    });

    it('filters threats widgets', () => {
      const threats = getWidgetsByCategory('threats');
      expect(threats.length).toBeGreaterThanOrEqual(3);
    });

    it('filters operations widgets', () => {
      const ops = getWidgetsByCategory('operations');
      expect(ops.length).toBeGreaterThanOrEqual(2);
    });

    it('filters performance widgets', () => {
      const perf = getWidgetsByCategory('performance');
      expect(perf.length).toBeGreaterThanOrEqual(2);
    });
  });
});
