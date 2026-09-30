/**
 * @module hooks/use-compliance-reports
 * @description React Query hooks for compliance reports and DSAR exports.
 * Super admin: POST/GET /admin/compliance/reports, GET/DELETE /:id
 * Tenant admin: POST/GET /settings/compliance/dsar, GET /:id
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'

// ─── Types ──────────────────────────────────────────────────

export type ComplianceReportType = 'soc2_access_review' | 'privileged_access' | 'gdpr_dsar'
export type ReportStatus = 'generating' | 'completed' | 'failed'

export interface ComplianceReport {
  id: string
  type: ComplianceReportType
  periodStart: string
  periodEnd: string
  scope: string
  status: ReportStatus
  generatedBy: string
  createdAt: string
  sizeBytes?: number
  data?: ComplianceReportData
}

export interface ComplianceReportData {
  // SOC 2 Access Review
  summary?: { totalUsers: number; active: number; inactive: number; period: string }
  roleDistribution?: Record<string, number>
  mfaAdoption?: { enabledPercent: number; total: number; enabled: number }
  authMethods?: { sso: number; local: number }
  accessChanges?: Array<{ user: string; changeType: string; date: string; details: string }>
  staleAccounts?: Array<{ user: string; lastActivity: string; daysSinceActive: number }>
  reviewActions?: Array<{ review: string; action: string; reviewedBy: string; date: string }>
  // Privileged Access
  superAdmins?: Array<{ email: string; lastLogin: string; sessions: number; mfa: boolean; geoLocations: string[] }>
  tenantAdmins?: Array<{ email: string; org: string; lastLogin: string; mfa: boolean }>
  apiKeysSummary?: { total: number; byTenant: Record<string, number> }
  scimTokensSummary?: { total: number; byTenant: Record<string, number> }
  // GDPR DSAR
  dataSubject?: { name: string; email: string; role: string; createdAt: string }
  profileDetails?: { designation: string; mfaStatus: boolean; ssoLinked: boolean }
  sessionsHistory?: Array<{ ip: string; geo: string; startedAt: string; endedAt: string }>
  auditEntries?: Array<{ action: string; timestamp: string }>
  contentSummary?: { iocs: number; reports: number; investigations: number }
  exportTimestamp?: string
}

export interface GenerateReportInput {
  type: ComplianceReportType
  periodStart: string
  periodEnd: string
  tenantId?: string
  userId?: string
}

export interface DsarExport {
  id: string
  userId: string
  userName: string
  status: ReportStatus
  requestedAt: string
  sizeBytes?: number
}

interface ListResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface ReportFilters {
  page?: number
  limit?: number
  type?: ComplianceReportType | 'all'
  status?: ReportStatus | 'all'
}

// ─── Helper ─────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'all') parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ─── Super Admin Compliance Hooks ───────────────────────────

/** Fetch compliance reports list (super admin). */
export function useComplianceReports(filters: ReportFilters = {}) {
  const query = buildQuery({ page: filters.page ?? 1, limit: filters.limit ?? 50, type: filters.type, status: filters.status })
  const empty: ListResponse<ComplianceReport> = { data: [], total: 0, page: 1, limit: 50 }

  const result = useQuery({
    queryKey: ['compliance-reports', filters],
    queryFn: () => apiList<ComplianceReport>(`/admin/compliance/reports${query}`),
    staleTime: 60_000,
    meta: { resource: 'compliance reports' },
  })

  return { ...result, data: result.data ?? empty }
}

/** Generate a compliance report (super admin). */
export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    // Backend (compliance.ts POST /admin/compliance/reports) sends { status, data: completed }
    // single-wrapped; api() already unwraps it — no consumer reads the mutation result today.
    mutationFn: (input: GenerateReportInput) =>
      api<ComplianceReport>('/admin/compliance/reports', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compliance-reports'] })
    },
  })
}

/** Fetch a single compliance report (super admin, for viewer). */
export function useComplianceReport(id: string | null) {
  const result = useQuery({
    queryKey: ['compliance-report', id],
    queryFn: () => api<ComplianceReport>(`/admin/compliance/reports/${id}`),
    enabled: !!id,
    staleTime: 60_000,
    meta: { resource: 'compliance report' },
  })

  return { ...result, data: result.data ?? null }
}

/** Delete a compliance report (super admin). */
export function useDeleteReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/admin/compliance/reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compliance-reports'] })
    },
  })
}

// ─── Tenant Admin DSAR Hooks ────────────────────────────────

/** Fetch DSAR exports list (tenant admin). */
export function useDsarExports() {
  const empty: ListResponse<DsarExport> = { data: [], total: 0, page: 1, limit: 50 }

  const result = useQuery({
    queryKey: ['dsar-exports'],
    queryFn: () => apiList<DsarExport>('/settings/compliance/dsar'),
    staleTime: 60_000,
    meta: { resource: 'DSAR exports' },
  })

  return { ...result, data: result.data ?? empty }
}

/** Generate a DSAR export (tenant admin). */
export function useGenerateDsar() {
  const qc = useQueryClient()
  return useMutation({
    // Backend (compliance.ts POST /settings/compliance/dsar) sends
    // { status, data: { reportId, dsar } } single-wrapped; api() unwraps to { reportId, dsar }
    // — not a DsarExport (the old `{ data: DsarExport }` type was wrong on both the envelope
    // and the shape). No consumer reads the mutation result today (onSuccess just invalidates).
    mutationFn: (input: { userId: string }) =>
      api<{ reportId: string; dsar: unknown }>('/settings/compliance/dsar', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dsar-exports'] })
    },
  })
}

/**
 * Fetch a single DSAR export (tenant admin).
 * NOTE (RCA #45 audit): unused by any component today. The backend route
 * (apps/api-gateway/src/routes/compliance.ts GET /settings/compliance/dsar/:reportId)
 * actually returns a ComplianceReport record (svc.getReport), not the DsarExport shape
 * declared above — typed against the real payload here so a future caller doesn't inherit
 * a silent mismatch.
 */
export function useDsarExport(id: string | null) {
  return useQuery({
    queryKey: ['dsar-export', id],
    queryFn: () => api<ComplianceReport>(`/settings/compliance/dsar/${id}`),
    enabled: !!id,
    staleTime: 60_000,
    meta: { resource: 'DSAR export' },
  })
}
