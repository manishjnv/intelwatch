import { AppError } from '@etip/shared-utils';

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export interface TenantAnalytics {
  tenantId: string;
  period: AnalyticsPeriod;
  iocIngested: number;
  apiCalls: number;
  storageBytes: number;
  enrichmentCostUSD: number;
  feedsActive: number;
  uniqueUsers: number;
  topActions: Array<{ action: string; count: number }>;
  dailyTrend: Array<{ date: string; iocIngested: number; apiCalls: number }>;
}

/** In-memory tenant analytics provider (DECISION-013, P0 #9).
 *  Returns simulated metrics since this is a Phase 6 in-memory store.
 *  In production, this would query the billing/usage service.
 */
export class TenantAnalyticsStore {
  private _knownTenants: Set<string> = new Set();

  /** Register a tenant id so analytics can be returned. */
  registerTenant(id: string): void {
    this._knownTenants.add(id);
  }

  /** Get analytics for a tenant. Throws 404 if tenant not known. */
  getAnalytics(tenantId: string, period: AnalyticsPeriod = '30d'): TenantAnalytics {
    if (!this._knownTenants.has(tenantId)) {
      throw new AppError(404, `Tenant not found: ${tenantId}`, 'NOT_FOUND');
    }

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const iocIngested = Math.floor(Math.random() * 500 * days);
    const apiCalls = Math.floor(Math.random() * 1000 * days);
    const storageBytes = Math.floor(Math.random() * 1024 * 1024 * 100);
    const enrichmentCostUSD = Math.round((Math.random() * days * 0.5) * 100) / 100;

    const topActions = [
      { action: 'ioc.created', count: Math.floor(iocIngested * 0.6) },
      { action: 'ioc.searched', count: Math.floor(apiCalls * 0.3) },
      { action: 'feed.fetched', count: Math.floor(apiCalls * 0.2) },
      { action: 'hunt.created', count: Math.floor(apiCalls * 0.05) },
    ];

    const dailyTrend = this._buildDailyTrend(days, iocIngested, apiCalls);

    return {
      tenantId,
      period,
      iocIngested,
      apiCalls,
      storageBytes,
      enrichmentCostUSD,
      feedsActive: Math.floor(Math.random() * 10) + 1,
      uniqueUsers: Math.floor(Math.random() * 20) + 1,
      topActions,
      dailyTrend,
    };
  }

  private _buildDailyTrend(days: number, totalIoc: number, totalApi: number): TenantAnalytics['dailyTrend'] {
    const trend = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      trend.push({
        date: d.toISOString().slice(0, 10),
        iocIngested: Math.floor(totalIoc / days * (0.5 + Math.random())),
        apiCalls: Math.floor(totalApi / days * (0.5 + Math.random())),
      });
    }
    return trend;
  }
}
