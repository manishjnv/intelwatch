/**
 * @module hooks/use-reporting-data
 * @description TanStack Query hooks for Reporting Service (port 3021).
 * All queries go through nginx → /api/v1/reports/*.
 * DECISION-048: real data or an honest empty/error state — no demo fallback.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import type {
  Report, ReportSchedule, ReportTemplate, ReportStats,
  ReportComparison, ReportType, ReportFormat,
} from './reporting-demo-data'

// Re-export types for page consumption
export type {
  Report, ReportSchedule, ReportTemplate, ReportStats,
  ReportComparison, ReportType, ReportFormat,
}
export type { ReportStatus } from './reporting-demo-data'

// ─── Report Queries ─────────────────────────────────────────────

export function useReports(page = 1, type?: ReportType, status?: string) {
  const params = new URLSearchParams({ page: String(page), limit: '50' })
  if (type) params.set('type', type)
  if (status) params.set('status', status)

  return useQuery({
    queryKey: ['reports', page, type, status],
    queryFn: () => apiList<Report>(`/reports?${params}`),
    meta: { resource: 'reports' },
    staleTime: 30_000,
  })
}

// Real backend shape: GET /reports/stats -> { reports: {total,byStatus,byType,avgGenerationTimeMs}, schedules: {activeSchedules} }.
// ponytail: flatten here to the flat ReportStats shape the page reads, rather than reshaping the page.
export function useReportStats() {
  return useQuery({
    queryKey: ['report-stats'],
    queryFn: async () => {
      const raw = await api<{
        reports: { total: number; byStatus: Record<string, number>; byType: Record<string, number>; avgGenerationTimeMs: number }
        schedules: { activeSchedules: number }
      }>('/reports/stats')
      return {
        total: raw.reports.total,
        byStatus: raw.reports.byStatus,
        byType: raw.reports.byType,
        avgGenerationTimeMs: raw.reports.avgGenerationTimeMs,
        activeSchedules: raw.schedules.activeSchedules,
      } as ReportStats
    },
    meta: { resource: 'report stats' },
    staleTime: 60_000,
  })
}

// Real backend template shape: { id, name, reportType, description, sections: TemplateSection[] }
// (no defaultFormat). ponytail: adapt to the page's {type, sections: string[], defaultFormat} shape here.
export function useReportTemplates() {
  return useQuery({
    queryKey: ['report-templates'],
    queryFn: async () => {
      const raw = await api<Array<{
        id: string; name: string; reportType: ReportType; description: string
        sections: { id: string; title: string }[]
      }>>('/reports/templates')
      return raw.map(t => ({
        id: t.id,
        type: t.reportType,
        name: t.name,
        description: t.description,
        sections: t.sections.map(s => s.title),
        defaultFormat: 'html' as ReportFormat,
      })) satisfies ReportTemplate[]
    },
    staleTime: 300_000,
  })
}

// ─── Schedule Queries ───────────────────────────────────────────

// Real backend schedule field is `reportType`, not `type`. ponytail: rename here.
export function useReportSchedules() {
  return useQuery({
    queryKey: ['report-schedules'],
    queryFn: async () => {
      const raw = await api<Array<Omit<ReportSchedule, 'type'> & { reportType: ReportType }>>('/reports/schedule')
      return raw.map(({ reportType, ...rest }) => ({ ...rest, type: reportType })) satisfies ReportSchedule[]
    },
    meta: { resource: 'report schedules' },
    staleTime: 60_000,
  })
}

// ─── Comparison Query ───────────────────────────────────────────

interface BackendComparisonResult {
  reportA: { id: string; title: string; dateRange: { from: string; to: string } }
  reportB: { id: string; title: string; dateRange: { from: string; to: string } }
  sectionDeltas: {
    title: string
    changes: { metric: string; a: number; b: number; delta: number; percentChange: number }[]
  }[]
}

// Real backend returns riskScore + sectionDeltas (per-section metric deltas), not a flat
// changes list. ponytail: flatten sectionDeltas into the page's flat {valueA,valueB,deltaPercent} rows.
export function useReportComparison(idA?: string, idB?: string) {
  return useQuery({
    queryKey: ['report-compare', idA, idB],
    queryFn: async () => {
      const raw = await api<BackendComparisonResult>(`/reports/${idA}/compare/${idB}`)
      return {
        reportA: { id: raw.reportA.id, title: raw.reportA.title, generatedAt: raw.reportA.dateRange.to },
        reportB: { id: raw.reportB.id, title: raw.reportB.title, generatedAt: raw.reportB.dateRange.to },
        changes: raw.sectionDeltas.flatMap(sd =>
          sd.changes.map(c => ({
            metric: `${sd.title}: ${c.metric}`,
            valueA: c.a,
            valueB: c.b,
            delta: c.delta,
            deltaPercent: c.percentChange,
          })),
        ),
      } satisfies ReportComparison
    },
    enabled: !!idA && !!idB,
    meta: { resource: 'report comparison' },
    staleTime: 120_000,
  })
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
      api<ReportSchedule>('/reports/schedule', {
        method: 'POST',
        body: JSON.stringify({ ...body, reportType: body.type, type: undefined }),
      }),
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
