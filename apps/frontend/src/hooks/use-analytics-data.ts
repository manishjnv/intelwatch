/**
 * @module hooks/use-analytics-data
 * @description TanStack Query hooks for Analytics Service (port 3024).
 * All queries go through nginx → /api/v1/analytics/*.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  DashboardData, TrendsResponse, TrendSeries,
  ExecutiveSummary, ServiceHealthEntry,
} from './analytics-demo-data'

// Re-export types for page consumption
export type { DashboardData, TrendsResponse, TrendSeries, ExecutiveSummary, ServiceHealthEntry }
export type { WidgetData, TrendPoint } from './analytics-demo-data'

// ─── Executive Summary ──────────────────────────────────────────

export function useExecutiveSummary() {
  return useQuery({
    queryKey: ['analytics-executive'],
    queryFn: () => api<ExecutiveSummary>('/analytics/executive'),
    meta: { resource: 'executive summary' },
    staleTime: 5 * 60_000,
  })
}

// ─── Service Health ─────────────────────────────────────────────

export function useServiceHealth() {
  return useQuery({
    queryKey: ['analytics-service-health'],
    queryFn: () => api<ServiceHealthEntry[]>('/analytics/service-health'),
    meta: { resource: 'service health' },
    staleTime: 30_000,
  })
}
