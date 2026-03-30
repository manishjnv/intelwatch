/**
 * @module hooks/use-compliance-reports
 * @description React Query hooks for compliance reports and DSAR exports.
 * Super admin: POST/GET /admin/compliance/reports, GET/DELETE /:id
 * Tenant admin: POST/GET /settings/compliance/dsar, GET /:id
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { notifyApiError } from './useApiError'

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

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_REPORTS: ComplianceReport[] = [
  {
    id: 'cr1', type: 'soc2_access_review', periodStart: '2026-01-01', periodEnd: '2026-03-31',
    scope: 'Platform-wide', status: 'completed', generatedBy: 'admin@etip.io',
    createdAt: '2026-03-28T10:00:00Z', sizeBytes: 145200,
    data: {
      summary: { totalUsers: 48, active: 42, inactive: 6, period: 'Q1 2026' },
      roleDistribution: { super_admin: 3, tenant_admin: 8, analyst: 25, viewer: 12 },
      mfaAdoption: { enabledPercent: 78, total: 48, enabled: 37 },
      authMethods: { sso: 15, local: 33 },
      accessChanges: [
        { user: 'alice@corp.com', changeType: 'added', date: '2026-01-15', details: 'Onboarded as analyst' },
        { user: 'bob@corp.com', changeType: 'disabled', date: '2026-02-20', details: 'Stale 90+ days' },
      ],
      staleAccounts: [
        { user: 'idle@corp.com', lastActivity: '2025-12-01', daysSinceActive: 120 },
      ],
      reviewActions: [
        { review: 'Quarterly Q1', action: 'confirmed', reviewedBy: 'admin@etip.io', date: '2026-03-20' },
      ],
    },
  },
  {
    id: 'cr2', type: 'privileged_access', periodStart: '2026-01-01', periodEnd: '2026-03-31',
    scope: 'Platform-wide', status: 'completed', generatedBy: 'admin@etip.io',
    createdAt: '2026-03-27T14:00:00Z', sizeBytes: 89100,
    data: {
      superAdmins: [
        { email: 'root@etip.io', lastLogin: '2026-03-30T09:00:00Z', sessions: 45, mfa: true, geoLocations: ['Mumbai, IN'] },
      ],
      tenantAdmins: [
        { email: 'admin@acme.com', org: 'ACME Corp', lastLogin: '2026-03-29T08:00:00Z', mfa: true },
      ],
      apiKeysSummary: { total: 12, byTenant: { 'ACME Corp': 5, 'Beta Inc': 4, 'Gamma LLC': 3 } },
      scimTokensSummary: { total: 3, byTenant: { 'ACME Corp': 2, 'Beta Inc': 1 } },
    },
  },
  {
    id: 'cr3', type: 'gdpr_dsar', periodStart: '2026-01-01', periodEnd: '2026-03-31',
    scope: 'user@example.com', status: 'generating', generatedBy: 'admin@acme.com',
    createdAt: '2026-03-30T12:00:00Z',
  },
]

const DEMO_DSARS: DsarExport[] = [
  { id: 'd1', userId: 'u10', userName: 'Employee A', status: 'completed', requestedAt: '2026-03-25T10:00:00Z', sizeBytes: 52300 },
  { id: 'd2', userId: 'u11', userName: 'Employee B', status: 'generating', requestedAt: '2026-03-30T14:00:00Z' },
]

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
    queryFn: () =>
      api<ListResponse<ComplianceReport>>(`/admin/compliance/reports${query}`)
        .catch(err => notifyApiError(err, 'compliance reports', empty)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (result.data?.data?.length ?? 0) === 0
  return {
    ...result,
    data: isDemo ? { data: DEMO_REPORTS, total: DEMO_REPORTS.length, page: 1, limit: 50 } : result.data ?? empty,
    isDemo,
  }
}

/** Generate a compliance report (super admin). */
export function useGenerateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GenerateReportInput) =>
      api<{ data: ComplianceReport }>('/admin/compliance/reports', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compliance-reports'] })
    },
  })
}

/** Fetch a single compliance report (super admin, for viewer). */
export function useComplianceReport(id: string | null) {
  const result = useQuery({
    queryKey: ['compliance-report', id],
    queryFn: () =>
      api<{ data: ComplianceReport }>(`/admin/compliance/reports/${id}`)
        .then(r => r?.data ?? null)
        .catch(err => notifyApiError(err, 'compliance report', null)),
    enabled: !!id,
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && !result.data && !!id
  const demoReport = DEMO_REPORTS.find(r => r.id === id) ?? DEMO_REPORTS[0]
  return { ...result, data: isDemo ? demoReport : result.data, isDemo }
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
    queryFn: () =>
      api<ListResponse<DsarExport>>('/settings/compliance/dsar')
        .catch(err => notifyApiError(err, 'DSAR exports', empty)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (result.data?.data?.length ?? 0) === 0
  return {
    ...result,
    data: isDemo ? { data: DEMO_DSARS, total: DEMO_DSARS.length, page: 1, limit: 50 } : result.data ?? empty,
    isDemo,
  }
}

/** Generate a DSAR export (tenant admin). */
export function useGenerateDsar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string }) =>
      api<{ data: DsarExport }>('/settings/compliance/dsar', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dsar-exports'] })
    },
  })
}

/** Fetch a single DSAR export (tenant admin). */
export function useDsarExport(id: string | null) {
  return useQuery({
    queryKey: ['dsar-export', id],
    queryFn: () =>
      api<{ data: DsarExport }>(`/settings/compliance/dsar/${id}`)
        .then(r => r?.data ?? null)
        .catch(err => notifyApiError(err, 'DSAR export', null)),
    enabled: !!id,
    staleTime: 60_000,
  })
}
