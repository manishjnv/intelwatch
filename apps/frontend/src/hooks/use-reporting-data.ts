/**
 * @module hooks/use-reporting-data
 * @description TanStack Query hooks for Reporting Service (port 3021).
 * All queries go through nginx → /api/v1/reports/*.
 * Demo fallback when backend is unreachable.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'
import {
  DEMO_REPORTS, DEMO_SCHEDULES, DEMO_TEMPLATES, DEMO_REPORT_STATS, DEMO_COMPARISON,
  type Report, type ReportSchedule, type ReportTemplate, type ReportStats,
  type ReportComparison, type ReportType, type ReportFormat,
} from './reporting-demo-data'

// Re-export types for page consumption
export type {
  Report, ReportSchedule, ReportTemplate, ReportStats,
  ReportComparison, ReportType, ReportFormat,
}
export type { ReportStatus } from './reporting-demo-data'

// ─── Generic helpers ────────────────────────────────────────────

interface ListResponse<T> {
  data: T[]; total: number; page: number; limit: number
}

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── Report Queries ─────────────────────────────────────────────

export function useReports(page = 1, type?: ReportType, status?: string) {
  const params = new URLSearchParams({ page: String(page), limit: '50' })
  if (type) params.set('type', type)
  if (status) params.set('status', status)

  const empty: ListResponse<Report> = { data: [], total: 0, page, limit: 50 }
  const result = useQuery({
    queryKey: ['reports', page, type, status],
    queryFn: () => api<ListResponse<Report>>(`/reports?${params}`).catch(err => notifyApiError(err, 'reports', empty)),
    staleTime: 30_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_REPORTS, total: DEMO_REPORTS.length, page, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useReportStats() {
  const result = useQuery({
    queryKey: ['report-stats'],
    queryFn: () => api<ReportStats>('/reports/stats').catch(err => notifyApiError(err, 'report stats', null as unknown as ReportStats)),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_REPORT_STATS,
    d => d != null && typeof (d as unknown as Record<string, unknown>)?.total === 'number')
}

export function useReportTemplates() {
  const result = useQuery({
    queryKey: ['report-templates'],
    queryFn: () => api<ReportTemplate[]>('/reports/templates').catch(() => [] as ReportTemplate[]),
    staleTime: 300_000,
  })
  return withDemoFallback(result, DEMO_TEMPLATES,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.type === 'string')
}

// ─── Schedule Queries ───────────────────────────────────────────

export function useReportSchedules() {
  const result = useQuery({
    queryKey: ['report-schedules'],
    queryFn: () => api<ReportSchedule[]>('/reports/schedule').catch(err => notifyApiError(err, 'report schedules', [] as ReportSchedule[])),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_SCHEDULES,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.cronExpression === 'string')
}

// ─── Comparison Query ───────────────────────────────────────────

export function useReportComparison(idA?: string, idB?: string) {
  const result = useQuery({
    queryKey: ['report-compare', idA, idB],
    queryFn: () => api<ReportComparison>(`/reports/${idA}/compare/${idB}`).catch(() => null as unknown as ReportComparison),
    enabled: !!idA && !!idB,
    staleTime: 120_000,
  })
  return withDemoFallback(result, DEMO_COMPARISON,
    d => d != null && Array.isArray((d as unknown as Record<string, unknown>)?.changes))
}

// ─── Mutations ──────────────────────────────────────────────────

export function useCreateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { type: ReportType; format: ReportFormat; title?: string; filters?: Record<string, unknown> }) =>
      api<Report>('/reports', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      qc.invalidateQueries({ queryKey: ['report-stats'] })
    },
  })
}

export function useCloneReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Report>(`/reports/${id}/clone`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports'] }) },
  })
}

export function useBulkDeleteReports() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ deleted: number }>('/reports/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      qc.invalidateQueries({ queryKey: ['report-stats'] })
    },
  })
}

export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; type: ReportType; format: ReportFormat; cronExpression: string; enabled: boolean }) =>
      api<ReportSchedule>('/reports/schedule', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      qc.invalidateQueries({ queryKey: ['report-stats'] })
    },
  })
}

export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; cronExpression?: string; enabled?: boolean; format?: ReportFormat }) =>
      api<ReportSchedule>(`/reports/schedule/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-schedules'] }) },
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/reports/schedule/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-schedules'] })
      qc.invalidateQueries({ queryKey: ['report-stats'] })
    },
  })
}

export function useBulkToggleSchedules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, enabled }: { ids: string[]; enabled: boolean }) =>
      api<{ updated: number }>('/reports/schedule/bulk-toggle', { method: 'PUT', body: JSON.stringify({ ids, enabled }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-schedules'] }) },
  })
}
