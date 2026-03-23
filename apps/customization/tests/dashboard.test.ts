import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardStore } from '../src/services/dashboard-store.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';
import { ConfigInheritance } from '../src/services/config-inheritance.js';

describe('DashboardStore', () => {
  let store: DashboardStore;

  beforeEach(() => {
    const inheritance = new ConfigInheritance();
    const auditTrail = new AuditTrail();
    const versioning = new ConfigVersioning();
    store = new DashboardStore(inheritance, auditTrail, versioning);
  });

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  describe('getLayout', () => {
    it('returns default layout for new user', () => {
      const layout = store.getLayout(TENANT, USER);
      expect(layout.widgets.length).toBeGreaterThan(0);
      expect(layout.userId).toBe(USER);
      expect(layout.tenantId).toBe(TENANT);
    });

    it('returns default widgets including ioc_summary and recent_alerts', () => {
      const layout = store.getLayout(TENANT, USER);
      const types = layout.widgets.map((w) => w.type);
      expect(types).toContain('ioc_summary');
      expect(types).toContain('recent_alerts');
    });
  });

  describe('setLayout', () => {
    it('saves a custom layout', () => {
      const layout = store.setLayout(TENANT, USER, {
        widgets: [
          { id: 'w1', type: 'geo_map', x: 0, y: 0, w: 12, h: 4, visible: true },
        ],
      });
      expect(layout.widgets).toHaveLength(1);
      expect(layout.widgets[0].type).toBe('geo_map');
    });

    it('persists across gets', () => {
      store.setLayout(TENANT, USER, {
        widgets: [
          { id: 'custom', type: 'cost_tracker', x: 0, y: 0, w: 6, h: 2, visible: true },
        ],
      });
      const layout = store.getLayout(TENANT, USER);
      expect(layout.widgets[0].id).toBe('custom');
    });

    it('isolates layouts between users', () => {
      store.setLayout(TENANT, USER, {
        widgets: [{ id: 'u1', type: 'geo_map', x: 0, y: 0, w: 12, h: 4, visible: true }],
      });
      const otherLayout = store.getLayout(TENANT, 'user-2');
      expect(otherLayout.widgets[0].id).not.toBe('u1');
    });
  });

  describe('filters', () => {
    it('returns empty filters for new user', () => {
      const filters = store.getFilters(TENANT, USER);
      expect(filters).toHaveLength(0);
    });

    it('saves a filter', () => {
      const filter = store.saveFilter(TENANT, USER, {
        name: 'High severity',
        severities: ['high', 'critical'],
        timeRange: '24h',
        isDefault: false,
      });
      expect(filter.id).toBeDefined();
      expect(filter.name).toBe('High severity');
    });

    it('lists saved filters', () => {
      store.saveFilter(TENANT, USER, { name: 'Filter 1', isDefault: false });
      store.saveFilter(TENANT, USER, { name: 'Filter 2', isDefault: false });
      const filters = store.getFilters(TENANT, USER);
      expect(filters).toHaveLength(2);
    });

    it('setting isDefault unsets other defaults', () => {
      store.saveFilter(TENANT, USER, { name: 'F1', isDefault: true });
      store.saveFilter(TENANT, USER, { name: 'F2', isDefault: true });
      const filters = store.getFilters(TENANT, USER);
      const defaults = filters.filter((f) => f.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].name).toBe('F2');
    });

    it('deletes a filter', () => {
      const filter = store.saveFilter(TENANT, USER, { name: 'ToDelete', isDefault: false });
      store.deleteFilter(TENANT, USER, filter.id);
      expect(store.getFilters(TENANT, USER)).toHaveLength(0);
    });

    it('throws when deleting nonexistent filter', () => {
      expect(() => store.deleteFilter(TENANT, USER, 'fake-id')).toThrow('Filter not found');
    });

    it('throws when deleting another user filter', () => {
      const filter = store.saveFilter(TENANT, USER, { name: 'Mine', isDefault: false });
      expect(() => store.deleteFilter(TENANT, 'other-user', filter.id)).toThrow('Filter not found');
    });
  });

  describe('preferences', () => {
    it('returns defaults for new user', () => {
      const prefs = store.getPreferences(TENANT, USER);
      expect(prefs.density).toBe('comfortable');
      expect(prefs.landingPage).toBe('dashboard');
      expect(prefs.autoRefreshSeconds).toBe(30);
    });

    it('updates preferences', () => {
      const prefs = store.setPreferences(TENANT, USER, {
        density: 'compact',
        landingPage: 'ioc',
        autoRefreshSeconds: 60,
      });
      expect(prefs.density).toBe('compact');
      expect(prefs.landingPage).toBe('ioc');
    });

    it('partially updates preferences', () => {
      store.setPreferences(TENANT, USER, { density: 'compact' });
      const prefs = store.getPreferences(TENANT, USER);
      expect(prefs.density).toBe('compact');
      expect(prefs.landingPage).toBe('dashboard'); // unchanged default
    });
  });
});
