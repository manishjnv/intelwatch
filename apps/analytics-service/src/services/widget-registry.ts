/**
 * @module services/widget-registry
 * @description Widget definitions for the dashboard. Each widget has an ID,
 * label, data source function, and TTL. The aggregator fills widget data.
 */

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl';
export type WidgetCategory = 'overview' | 'threats' | 'operations' | 'performance';

export interface WidgetDefinition {
  id: string;
  label: string;
  description: string;
  category: WidgetCategory;
  size: WidgetSize;
  ttlSeconds: number;
  dataKey: string;
}

/** All dashboard widgets registered in the system. */
export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // Overview widgets
  { id: 'total-iocs', label: 'Total IOCs', description: 'Total indicator count across all types', category: 'overview', size: 'sm', ttlSeconds: 3600, dataKey: 'iocTotal' },
  { id: 'active-feeds', label: 'Active Feeds', description: 'Currently enabled threat intel feeds', category: 'overview', size: 'sm', ttlSeconds: 1800, dataKey: 'activeFeeds' },
  { id: 'open-alerts', label: 'Open Alerts', description: 'Unresolved alerts requiring attention', category: 'overview', size: 'sm', ttlSeconds: 300, dataKey: 'openAlerts' },
  { id: 'enrichment-rate', label: 'Enrichment Rate', description: 'Percentage of IOCs enriched by AI', category: 'overview', size: 'sm', ttlSeconds: 3600, dataKey: 'enrichmentRate' },

  // Threat widgets
  { id: 'critical-iocs', label: 'Critical IOCs', description: 'Critical severity indicators', category: 'threats', size: 'sm', ttlSeconds: 1800, dataKey: 'criticalIocs' },
  { id: 'top-actors', label: 'Top Threat Actors', description: 'Most active threat actor groups', category: 'threats', size: 'lg', ttlSeconds: 3600, dataKey: 'topActors' },
  { id: 'top-malware', label: 'Top Malware', description: 'Most prevalent malware families', category: 'threats', size: 'lg', ttlSeconds: 3600, dataKey: 'topMalware' },
  { id: 'top-vulns', label: 'Top Vulnerabilities', description: 'Highest-risk CVEs by EPSS score', category: 'threats', size: 'lg', ttlSeconds: 3600, dataKey: 'topVulns' },

  // Operations widgets
  { id: 'alert-breakdown', label: 'Alert Breakdown', description: 'Alerts by severity and status', category: 'operations', size: 'md', ttlSeconds: 300, dataKey: 'alertBreakdown' },
  { id: 'feed-performance', label: 'Feed Performance', description: 'Ingestion rate and reliability', category: 'operations', size: 'md', ttlSeconds: 900, dataKey: 'feedPerformance' },
  { id: 'correlation-hits', label: 'Correlation Hits', description: 'Cross-entity correlation matches', category: 'operations', size: 'sm', ttlSeconds: 1800, dataKey: 'correlationHits' },

  // Performance widgets
  { id: 'service-health', label: 'Service Health', description: 'Health status of all ETIP services', category: 'performance', size: 'xl', ttlSeconds: 60, dataKey: 'serviceHealth' },
  { id: 'processing-rate', label: 'Processing Rate', description: 'IOCs processed per hour', category: 'performance', size: 'sm', ttlSeconds: 900, dataKey: 'processingRate' },
  { id: 'avg-enrichment-time', label: 'Avg Enrichment Time', description: 'Mean time to enrich an IOC', category: 'performance', size: 'sm', ttlSeconds: 900, dataKey: 'avgEnrichmentTime' },
];

/** Get widget definition by ID. */
export function getWidget(widgetId: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find(w => w.id === widgetId);
}

/** Get widgets filtered by category. */
export function getWidgetsByCategory(category: WidgetCategory): WidgetDefinition[] {
  return WIDGET_REGISTRY.filter(w => w.category === category);
}
