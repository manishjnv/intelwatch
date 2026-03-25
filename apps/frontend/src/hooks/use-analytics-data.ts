/**
 * @module hooks/use-analytics-data
 * @description TanStack Query hooks for Analytics Service (port 3024).
 * All queries go through nginx → /api/v1/analytics/*.
 * Demo fallback when backend is unreachable.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  DEMO_DASHBOARD, DEMO_TRENDS, DEMO_EXECUTIVE, DEMO_SERVICE_HEALTH,
  type DashboardData, type TrendsResponse, type TrendSeries,
  type ExecutiveSummary, type ServiceHealthEntry,
} from './analytics-demo-data'

// Re-export types for page consumption
export type { DashboardData, TrendsResponse, TrendSeries, ExecutiveSummary, ServiceHealthEntry }
export type { WidgetData, TrendPoint } from './analytics-demo-data'

// ─── Generic helpers ────────────────────────────────────────────

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── Dashboard Widgets ──────────────────────────────────────────

export function useAnalyticsWidgets() {
  const empty: DashboardData = { widgets: {}, generatedAt: '', cacheHit: false }
  const result = useQuery({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api<DashboardData>('/analytics').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_DASHBOARD,
    d => typeof (d as Record<string, unknown>)?.widgets === 'object' && Object.keys((d as DashboardData)?.widgets ?? {}).length > 0)
}

// ─── Trends ─────────────────────────────────────────────────────

export function useAnalyticsTrends(period: '7d' | '30d' | '90d' = '7d') {
  const empty: TrendsResponse = { data: [], period, metrics: [] }
  const result = useQuery({
    queryKey: ['analytics-trends', period],
    queryFn: () => api<TrendSeries[] | TrendsResponse>(`/analytics/trends?period=${period}`)
      .then(raw => Array.isArray(raw) ? { data: raw, period, metrics: raw.map(s => s.metric) } : raw)
      .catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, { ...DEMO_TRENDS, period },
    d => Array.isArray((d as TrendsResponse)?.data) && (d as TrendsResponse).data.length > 0 && typeof (d as TrendsResponse).data[0]?.metric === 'string')
}

// ─── Executive Summary ──────────────────────────────────────────

export function useExecutiveSummary() {
  const result = useQuery({
    queryKey: ['analytics-executive'],
    queryFn: () => api<ExecutiveSummary>('/analytics/executive').catch(() => null as unknown as ExecutiveSummary),
    staleTime: 5 * 60_000,
  })
  return withDemoFallback(result, DEMO_EXECUTIVE,
    d => typeof (d as Record<string, unknown>)?.riskScore === 'number' && typeof (d as Record<string, unknown>)?.riskPosture === 'string')
}

// ─── Service Health ─────────────────────────────────────────────

export function useServiceHealth() {
  const result = useQuery({
    queryKey: ['analytics-service-health'],
    queryFn: () => api<ServiceHealthEntry[]>('/analytics/service-health').catch(() => [] as ServiceHealthEntry[]),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_SERVICE_HEALTH,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.service === 'string')
}
