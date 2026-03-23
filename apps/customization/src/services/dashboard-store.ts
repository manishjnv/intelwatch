import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type {
  SetLayoutInput,
  SaveFilterInput,
  SetPreferencesInput,
  WidgetInput,
} from '../schemas/customization.js';
import type { AuditTrail } from './audit-trail.js';
import type { ConfigVersioning } from './config-versioning.js';
import type { ConfigInheritance } from './config-inheritance.js';

export interface WidgetLayout {
  userId: string;
  tenantId: string;
  widgets: WidgetInput[];
  updatedAt: string;
}

export interface SavedFilter {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  timeRange?: string;
  severities?: string[];
  iocTypes?: string[];
  modules?: string[];
  isDefault: boolean;
  createdAt: string;
}

export interface DashboardPreferences {
  userId: string;
  tenantId: string;
  density: string;
  landingPage: string;
  autoRefreshSeconds: number;
  updatedAt: string;
}

export class DashboardStore {
  private layouts = new Map<string, WidgetLayout>();
  private filters = new Map<string, SavedFilter>();
  private preferences = new Map<string, DashboardPreferences>();

  constructor(
    private inheritance: ConfigInheritance,
    private auditTrail: AuditTrail,
    private versioning: ConfigVersioning,
  ) {}

  private userKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  getLayout(tenantId: string, userId: string): WidgetLayout {
    const k = this.userKey(tenantId, userId);
    const layout = this.layouts.get(k);
    if (layout) return { ...layout, widgets: layout.widgets.map((w) => ({ ...w })) };

    // Return default layout
    return {
      userId,
      tenantId,
      widgets: [
        { id: 'w1', type: 'ioc_summary', x: 0, y: 0, w: 6, h: 2, visible: true },
        { id: 'w2', type: 'recent_alerts', x: 6, y: 0, w: 6, h: 2, visible: true },
        { id: 'w3', type: 'threat_feed', x: 0, y: 2, w: 4, h: 2, visible: true },
        { id: 'w4', type: 'risk_score', x: 4, y: 2, w: 4, h: 2, visible: true },
        { id: 'w5', type: 'enrichment_stats', x: 8, y: 2, w: 4, h: 2, visible: true },
      ],
      updatedAt: new Date().toISOString(),
    };
  }

  setLayout(tenantId: string, userId: string, input: SetLayoutInput): WidgetLayout {
    const k = this.userKey(tenantId, userId);
    const before = this.layouts.get(k) ?? null;
    const layout: WidgetLayout = {
      userId,
      tenantId,
      widgets: input.widgets,
      updatedAt: new Date().toISOString(),
    };
    this.layouts.set(k, layout);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'dashboard',
      action: 'layout.updated',
      before: before as unknown as Record<string, unknown>,
      after: layout as unknown as Record<string, unknown>,
    });

    return { ...layout, widgets: layout.widgets.map((w) => ({ ...w })) };
  }

  getFilters(tenantId: string, userId: string): SavedFilter[] {
    return Array.from(this.filters.values())
      .filter((f) => f.tenantId === tenantId && f.userId === userId)
      .map((f) => ({ ...f }));
  }

  saveFilter(tenantId: string, userId: string, input: SaveFilterInput): SavedFilter {
    // If setting as default, unset other defaults
    if (input.isDefault) {
      for (const f of this.filters.values()) {
        if (f.tenantId === tenantId && f.userId === userId) {
          f.isDefault = false;
        }
      }
    }

    const filter: SavedFilter = {
      id: randomUUID(),
      userId,
      tenantId,
      name: input.name,
      timeRange: input.timeRange,
      severities: input.severities,
      iocTypes: input.iocTypes,
      modules: input.modules,
      isDefault: input.isDefault,
      createdAt: new Date().toISOString(),
    };

    this.filters.set(filter.id, filter);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'dashboard',
      action: 'filter.saved',
      before: null,
      after: filter as unknown as Record<string, unknown>,
    });

    return { ...filter };
  }

  deleteFilter(tenantId: string, userId: string, filterId: string): void {
    const filter = this.filters.get(filterId);
    if (!filter || filter.tenantId !== tenantId || filter.userId !== userId) {
      throw new AppError(404, 'Filter not found', 'FILTER_NOT_FOUND');
    }
    this.filters.delete(filterId);
  }

  getPreferences(tenantId: string, userId: string): DashboardPreferences {
    const k = this.userKey(tenantId, userId);
    const prefs = this.preferences.get(k);
    if (prefs) return { ...prefs };

    // Resolve from inheritance (tenant defaults + user overrides)
    const resolved = this.inheritance.resolveConfig(tenantId, userId, 'dashboard');

    return {
      userId,
      tenantId,
      density: (resolved.density as string) ?? 'comfortable',
      landingPage: (resolved.landingPage as string) ?? 'dashboard',
      autoRefreshSeconds: (resolved.autoRefreshSeconds as number) ?? 30,
      updatedAt: new Date().toISOString(),
    };
  }

  setPreferences(tenantId: string, userId: string, input: SetPreferencesInput): DashboardPreferences {
    const k = this.userKey(tenantId, userId);
    const existing = this.getPreferences(tenantId, userId);

    const updated: DashboardPreferences = {
      userId,
      tenantId,
      density: input.density ?? existing.density,
      landingPage: input.landingPage ?? existing.landingPage,
      autoRefreshSeconds: input.autoRefreshSeconds ?? existing.autoRefreshSeconds,
      updatedAt: new Date().toISOString(),
    };

    this.preferences.set(k, updated);

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'dashboard',
      action: 'preferences.updated',
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });

    return { ...updated };
  }

  getExportData(tenantId: string): Record<string, unknown> {
    const layouts: Record<string, unknown> = {};
    const filters: Record<string, unknown[]> = {};
    const prefs: Record<string, unknown> = {};

    for (const [key, layout] of this.layouts) {
      if (key.startsWith(`${tenantId}:`)) {
        layouts[key] = layout;
      }
    }
    for (const filter of this.filters.values()) {
      if (filter.tenantId === tenantId) {
        const uk = filter.userId;
        if (!filters[uk]) filters[uk] = [];
        filters[uk].push(filter);
      }
    }
    for (const [key, pref] of this.preferences) {
      if (key.startsWith(`${tenantId}:`)) {
        prefs[key] = pref;
      }
    }

    return { layouts, filters, preferences: prefs };
  }

  importData(tenantId: string, _data: Record<string, unknown>, _userId: string): void {
    // Import is a no-op for user-scoped dashboard data —
    // individual user preferences don't transfer across tenants
    void tenantId;
  }
}
