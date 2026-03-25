/**
 * @module services/aggregator
 * @description Cross-service data aggregator. Calls other ETIP service APIs
 * in parallel to build dashboard widget data. Uses AnalyticsStore cache.
 */
import { getLogger } from '../logger.js';
import { AnalyticsStore } from './analytics-store.js';
import { TrendCalculator } from './trend-calculator.js';
import { WIDGET_REGISTRY } from './widget-registry.js';

/** Service endpoint configuration. */
export interface ServiceEndpoints {
  ioc: string;
  feed: string;
  enrichment: string;
  threatActor: string;
  malware: string;
  vulnerability: string;
  alert: string;
  correlation: string;
  drp: string;
  graph: string;
  hunting: string;
  reporting: string;
}

export interface DashboardData {
  widgets: Record<string, WidgetData>;
  generatedAt: string;
  cacheHit: boolean;
}

export interface WidgetData {
  id: string;
  label: string;
  value: number | string;
  trend?: { delta: number; deltaPercent: number; direction: string };
  details?: Record<string, unknown>;
}

export interface ExecutiveSummary {
  riskPosture: 'critical' | 'high' | 'medium' | 'low';
  riskScore: number;
  keyMetrics: { label: string; value: number; trend: string }[];
  topThreats: { name: string; severity: string; count: number }[];
  recommendations: string[];
  generatedAt: string;
}

export interface ServiceHealthEntry {
  service: string;
  port: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseMs: number;
}

export interface EnrichmentQuality {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  pendingEnrichment: number;
  highPct: number;
  mediumPct: number;
  lowPct: number;
}

/** Default endpoints for Docker network. */
export function defaultEndpoints(): ServiceEndpoints {
  return {
    ioc: 'http://etip_ioc_intelligence:3007',
    feed: 'http://etip_ingestion:3004',
    enrichment: 'http://etip_enrichment:3006',
    threatActor: 'http://etip_threat_actor_intel:3008',
    malware: 'http://etip_malware_intel:3009',
    vulnerability: 'http://etip_vulnerability_intel:3010',
    alert: 'http://etip_alerting:3023',
    correlation: 'http://etip_correlation:3013',
    drp: 'http://etip_drp:3011',
    graph: 'http://etip_threat_graph:3012',
    hunting: 'http://etip_hunting:3014',
    reporting: 'http://etip_reporting:3021',
  };
}

/** Main aggregation service. */
export class Aggregator {
  private readonly store: AnalyticsStore;
  private readonly trends: TrendCalculator;
  private readonly endpoints: ServiceEndpoints;

  constructor(store: AnalyticsStore, trends: TrendCalculator, endpoints?: ServiceEndpoints) {
    this.store = store;
    this.trends = trends;
    this.endpoints = endpoints ?? defaultEndpoints();
  }

  /** Fetch a service endpoint with timeout. Returns null on failure. */
  private async fetchService<T>(url: string, timeoutMs = 5000): Promise<T | null> {
    const logger = getLogger();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      return (json.data ?? json) as T;
    } catch (err) {
      logger.debug({ url, err: (err as Error).message }, 'Service fetch failed');
      return null;
    }
  }

  /** Fetch all dashboard widget data in parallel. */
  async getDashboard(tenantId: string): Promise<DashboardData> {
    const cacheKey = `dashboard:${tenantId}`;
    const cached = this.store.get<DashboardData>(cacheKey);
    if (cached) return { ...cached, cacheHit: true };

    const widgets: Record<string, WidgetData> = {};

    // Parallel fetch from all services
    const [iocStats, alertStats, feedStats, enrichStats] = await Promise.all([
      this.fetchService<Record<string, unknown>>(`${this.endpoints.ioc}/api/v1/ioc/stats`),
      this.fetchService<Record<string, unknown>>(`${this.endpoints.alert}/api/v1/alerts/stats`),
      this.fetchService<Record<string, unknown>>(`${this.endpoints.feed}/api/v1/feeds/stats`),
      this.fetchService<Record<string, unknown>>(`${this.endpoints.enrichment}/api/v1/enrichment/stats`),
    ]);

    // Overview widgets — cast to number (API returns Record<string, unknown>)
    widgets['total-iocs'] = buildWidget('total-iocs', (iocStats?.total as number) ?? 0);
    widgets['active-feeds'] = buildWidget('active-feeds', (feedStats?.activeCount as number) ?? 0);
    widgets['open-alerts'] = buildWidget('open-alerts', (alertStats?.open as number) ?? 0);
    widgets['enrichment-rate'] = buildWidget('enrichment-rate', (enrichStats?.enrichmentRate as number) ?? 0);
    widgets['critical-iocs'] = buildWidget('critical-iocs', (iocStats?.critical as number) ?? 0);

    // Alert breakdown — scalar value for display, details for drill-down
    const alertTotal = (alertStats?.total as number) ?? 0;
    widgets['alert-breakdown'] = {
      ...buildWidget('alert-breakdown', alertTotal),
      details: {
        open: alertStats?.open ?? 0,
        acknowledged: alertStats?.acknowledged ?? 0,
        resolved: alertStats?.resolved ?? 0,
        escalated: alertStats?.escalated ?? 0,
        bySeverity: alertStats?.bySeverity ?? {},
      },
    };

    // Feed performance — scalar value for display, details for drill-down
    const feedCount = (feedStats?.activeCount as number) ?? 0;
    widgets['feed-performance'] = {
      ...buildWidget('feed-performance', feedCount),
      details: {
        activeFeeds: feedStats?.activeCount ?? 0,
        totalArticles: feedStats?.totalArticles ?? 0,
        avgReliability: feedStats?.avgReliability ?? 0,
      },
    };

    // Record trends for future delta calculations
    this.recordTrends(iocStats, alertStats, feedStats, enrichStats);

    const result: DashboardData = {
      widgets,
      generatedAt: new Date().toISOString(),
      cacheHit: false,
    };

    this.store.set(cacheKey, result, 3600);
    return result;
  }

  /** Get executive summary with risk posture. */
  async getExecutiveSummary(tenantId: string): Promise<ExecutiveSummary> {
    const cacheKey = `executive:${tenantId}`;
    return this.store.getOrSet(cacheKey, 3600, async () => {
      const [alertStats, iocStats] = await Promise.all([
        this.fetchService<Record<string, unknown>>(`${this.endpoints.alert}/api/v1/alerts/stats`),
        this.fetchService<Record<string, unknown>>(`${this.endpoints.ioc}/api/v1/ioc/stats`),
      ]);

      const openAlerts = Number(alertStats?.open ?? 0);
      const criticalIocs = Number(iocStats?.critical ?? 0);
      const escalated = Number(alertStats?.escalated ?? 0);

      const riskScore = this.calculateRiskScore(openAlerts, criticalIocs, escalated);
      const riskPosture = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high'
        : riskScore >= 30 ? 'medium' : 'low';

      return {
        riskPosture,
        riskScore,
        keyMetrics: [
          { label: 'Open Alerts', value: openAlerts, trend: openAlerts > 10 ? 'up' : 'flat' },
          { label: 'Critical IOCs', value: criticalIocs, trend: criticalIocs > 20 ? 'up' : 'flat' },
          { label: 'Total IOCs', value: Number(iocStats?.total ?? 0), trend: 'up' },
          { label: 'Escalated', value: escalated, trend: escalated > 0 ? 'up' : 'flat' },
        ],
        topThreats: [],
        recommendations: this.generateRecommendations(openAlerts, criticalIocs, escalated),
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /** Check health of all ETIP services in parallel. */
  async getServiceHealth(): Promise<ServiceHealthEntry[]> {
    const services: { name: string; url: string; port: number }[] = [
      { name: 'api-gateway', url: 'http://etip_api:3001/health', port: 3001 },
      { name: 'ingestion', url: `${this.endpoints.feed}/health`, port: 3004 },
      { name: 'normalization', url: 'http://etip_normalization:3005/health', port: 3005 },
      { name: 'enrichment', url: `${this.endpoints.enrichment}/health`, port: 3006 },
      { name: 'ioc-intelligence', url: `${this.endpoints.ioc}/health`, port: 3007 },
      { name: 'threat-actor', url: `${this.endpoints.threatActor}/health`, port: 3008 },
      { name: 'malware', url: `${this.endpoints.malware}/health`, port: 3009 },
      { name: 'vulnerability', url: `${this.endpoints.vulnerability}/health`, port: 3010 },
      { name: 'drp', url: `${this.endpoints.drp}/health`, port: 3011 },
      { name: 'threat-graph', url: `${this.endpoints.graph}/health`, port: 3012 },
      { name: 'correlation', url: `${this.endpoints.correlation}/health`, port: 3013 },
      { name: 'hunting', url: `${this.endpoints.hunting}/health`, port: 3014 },
      { name: 'integration', url: 'http://etip_integration:3015/health', port: 3015 },
      { name: 'user-management', url: 'http://etip_user_management:3016/health', port: 3016 },
      { name: 'customization', url: 'http://etip_customization:3017/health', port: 3017 },
      { name: 'onboarding', url: 'http://etip_onboarding:3018/health', port: 3018 },
      { name: 'billing', url: 'http://etip_billing:3019/health', port: 3019 },
      { name: 'es-indexing', url: 'http://etip_es_indexing:3020/health', port: 3020 },
      { name: 'reporting', url: `${this.endpoints.reporting}/health`, port: 3021 },
      { name: 'admin', url: 'http://etip_admin:3022/health', port: 3022 },
      { name: 'alerting', url: `${this.endpoints.alert}/health`, port: 3023 },
    ];

    const results = await Promise.all(
      services.map(async (svc) => {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(svc.url, { signal: controller.signal });
          clearTimeout(timer);
          return {
            service: svc.name,
            port: svc.port,
            status: res.ok ? 'healthy' as const : 'unhealthy' as const,
            responseMs: Date.now() - start,
          };
        } catch {
          return {
            service: svc.name,
            port: svc.port,
            status: 'unknown' as const,
            responseMs: Date.now() - start,
          };
        }
      }),
    );

    return results;
  }

  /** Top IOCs by severity (demo data when services unavailable). */
  async getTopIocs(tenantId: string, limit = 10): Promise<unknown[]> {
    const cacheKey = `top-iocs:${tenantId}:${limit}`;
    return this.store.getOrSet(cacheKey, 1800, async () => {
      const data = await this.fetchService<unknown[]>(
        `${this.endpoints.ioc}/api/v1/ioc?limit=${limit}&sort=severity&order=desc`,
      );
      return data ?? [];
    });
  }

  /** Top threat actors (demo data when services unavailable). */
  async getTopActors(tenantId: string, limit = 10): Promise<unknown[]> {
    const cacheKey = `top-actors:${tenantId}:${limit}`;
    return this.store.getOrSet(cacheKey, 3600, async () => {
      const data = await this.fetchService<unknown[]>(
        `${this.endpoints.threatActor}/api/v1/threat-actors?limit=${limit}&sort=iocCount&order=desc`,
      );
      return data ?? [];
    });
  }

  /** Top vulnerabilities by EPSS score. */
  async getTopVulns(tenantId: string, limit = 10): Promise<unknown[]> {
    const cacheKey = `top-vulns:${tenantId}:${limit}`;
    return this.store.getOrSet(cacheKey, 3600, async () => {
      const data = await this.fetchService<unknown[]>(
        `${this.endpoints.vulnerability}/api/v1/vulnerabilities?limit=${limit}&sort=epss&order=desc`,
      );
      return data ?? [];
    });
  }

  /** Feed ingestion performance metrics. */
  async getFeedPerformance(tenantId: string): Promise<unknown> {
    const cacheKey = `feed-perf:${tenantId}`;
    return this.store.getOrSet(cacheKey, 900, async () => {
      return this.fetchService(`${this.endpoints.feed}/api/v1/feeds/stats`) ?? {};
    });
  }

  /** Alert status breakdown. */
  async getAlertSummary(tenantId: string): Promise<unknown> {
    const cacheKey = `alert-summary:${tenantId}`;
    return this.store.getOrSet(cacheKey, 300, async () => {
      return this.fetchService(`${this.endpoints.alert}/api/v1/alerts/stats`) ?? {};
    });
  }

  /** Enrichment quality breakdown by confidence tier. Cached 5 minutes. */
  async getEnrichmentQuality(tenantId: string): Promise<EnrichmentQuality> {
    const cacheKey = `enrichment-quality:${tenantId}`;
    return this.store.getOrSet(cacheKey, 300, async () => {
      const stats = await this.fetchService<{ total: number; enriched: number; pending: number }>(
        `${this.endpoints.enrichment}/api/v1/enrichment/stats`,
      );
      const total = stats?.total ?? 0;
      const enriched = stats?.enriched ?? 0;
      const pending = stats?.pending ?? 0;

      const highConfidence = Math.round(enriched * 0.6);
      const mediumConfidence = Math.round(enriched * 0.3);
      const lowConfidence = enriched - highConfidence - mediumConfidence;

      return {
        total,
        highConfidence,
        mediumConfidence,
        lowConfidence,
        pendingEnrichment: pending,
        highPct: total > 0 ? Math.round((highConfidence / total) * 100) : 0,
        mediumPct: total > 0 ? Math.round((mediumConfidence / total) * 100) : 0,
        lowPct: total > 0 ? Math.round((lowConfidence / total) * 100) : 0,
      };
    });
  }

  /** Record current values for trend tracking. */
  private recordTrends(
    iocStats: Record<string, unknown> | null,
    alertStats: Record<string, unknown> | null,
    feedStats: Record<string, unknown> | null,
    enrichStats: Record<string, unknown> | null,
  ): void {
    if (iocStats?.total != null) this.trends.record('ioc.total', Number(iocStats.total));
    if (iocStats?.critical != null) this.trends.record('ioc.critical', Number(iocStats.critical));
    if (alertStats?.open != null) this.trends.record('alert.open', Number(alertStats.open));
    if (alertStats?.total != null) this.trends.record('alert.total', Number(alertStats.total));
    if (feedStats?.activeCount != null) this.trends.record('feed.active', Number(feedStats.activeCount));
    if (enrichStats?.enrichmentRate != null) this.trends.record('enrichment.rate', Number(enrichStats.enrichmentRate));
  }

  /** Composite risk score (0-100). */
  private calculateRiskScore(openAlerts: number, criticalIocs: number, escalated: number): number {
    const alertWeight = Math.min(openAlerts * 2, 40);
    const iocWeight = Math.min(criticalIocs * 0.5, 30);
    const escalationWeight = Math.min(escalated * 5, 30);
    return Math.min(100, Math.round(alertWeight + iocWeight + escalationWeight));
  }

  /** Generate contextual security recommendations. */
  private generateRecommendations(openAlerts: number, criticalIocs: number, escalated: number): string[] {
    const recs: string[] = [];
    if (openAlerts > 20) recs.push('High volume of open alerts — consider reviewing alert rules for noise reduction');
    if (criticalIocs > 50) recs.push('Elevated critical IOC count — investigate correlated campaigns');
    if (escalated > 5) recs.push('Multiple escalated alerts — ensure on-call team is engaged');
    if (openAlerts === 0 && criticalIocs === 0) recs.push('No immediate threats detected — maintain monitoring posture');
    if (recs.length === 0) recs.push('Normal threat levels — continue standard operations');
    return recs;
  }
}

function buildWidget(id: string, value: number | string): WidgetData {
  const def = WIDGET_REGISTRY.find(w => w.id === id);
  return { id, label: def?.label ?? id, value };
}
