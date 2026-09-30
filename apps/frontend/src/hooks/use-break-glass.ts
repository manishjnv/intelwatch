/**
 * @module hooks/use-break-glass
 * @description React Query hooks for break-glass emergency access management (super_admin only).
 * GET /admin/break-glass/status, GET /admin/break-glass/audit,
 * POST /admin/break-glass/rotate-password, DELETE /admin/break-glass/sessions
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import { toast } from '@/components/ui/Toast'

// ─── Types ──────────────────────────────────────────────────

export interface BreakGlassStatus {
  activeSession: boolean
  lastUsed: string | null
  useCount: number
  session?: {
    ip: string
    geo: string
    startedAt: string
    expiresAt: string
  }
}

export type AuditEventType =
  | 'login.success' | 'login.failed' | 'login.locked'
  | 'session_expired' | 'session_replaced'
  | string // action.* events

export interface BreakGlassAuditEntry {
  id: string
  event: AuditEventType
  ip: string
  location: string
  timestamp: string
  details: string | null
  riskLevel: 'critical'
}

export interface AuditFilters {
  page?: number
  limit?: number
  startDate?: string
  endDate?: string
}

// ─── Hooks ──────────────────────────────────────────────────

/** Fetch break-glass system status. */
export function useBreakGlassStatus() {
  const result = useQuery({
    queryKey: ['break-glass-status'],
    queryFn: () => api<BreakGlassStatus>('/admin/break-glass/status'),
    staleTime: 10_000,
    refetchInterval: 30_000,
    meta: { resource: 'break-glass status' },
  })

  return { ...result, data: result.data ?? null }
}

// user-service returns raw Prisma AuditLog rows ({ action: 'break_glass.login.success', ipAddress, createdAt,
// changes }), not the panel's shape — map them here so BreakGlassPanel never dereferences a missing field.
type AuditLogRow = Partial<BreakGlassAuditEntry> & {
  id: string; action?: string; ipAddress?: string | null; createdAt?: string; changes?: unknown
}

export function toBreakGlassAuditEntry(r: AuditLogRow): BreakGlassAuditEntry {
  const changes = r.changes == null ? null : typeof r.changes === 'string' ? r.changes : JSON.stringify(r.changes)
  return {
    id: r.id,
    event: r.event ?? (r.action ?? 'unknown').replace(/^break_glass\./, ''),
    ip: r.ip ?? r.ipAddress ?? '—',
    location: r.location ?? '—',
    timestamp: r.timestamp ?? r.createdAt ?? '',
    details: r.details ?? changes,
    riskLevel: 'critical',
  }
}

/** Fetch break-glass audit log. */
export function useBreakGlassAudit(filters: AuditFilters = {}) {
  const params = new URLSearchParams()
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)
  const qs = params.toString()

  const result = useQuery({
    queryKey: ['break-glass-audit', filters],
    // apiList, not api<{data,total}>: api() already unwraps the gateway's { data: entries, total }, so the
    // old shape made auditData.data undefined and crashed the panel on any successful response (RCA #45 class).
    queryFn: () =>
      apiList<AuditLogRow>(`/admin/break-glass/audit${qs ? `?${qs}` : ''}`)
        .then(env => ({ ...env, data: env.data.map(toBreakGlassAuditEntry) })),
    staleTime: 30_000,
    meta: { resource: 'break-glass audit' },
  })

  return { ...result, data: result.data ?? { data: [], total: 0 } }
}

/** Rotate break-glass password. */
export function useRotateBreakGlassPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (newPassword: string) =>
      api('/admin/break-glass/rotate-password', { method: 'POST', body: { password: newPassword } }),
    onSuccess: () => {
      toast('Break-glass password rotated.', 'success')
      void qc.invalidateQueries({ queryKey: ['break-glass-status'] })
    },
    onError: (err: Error) => {
      toast(`Password rotation failed: ${err.message}`, 'error')
    },
  })
}

/** Force terminate active break-glass session. */
export function useForceTerminateBreakGlass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api('/admin/break-glass/sessions', { method: 'DELETE' }),
    onSuccess: () => {
      toast('Break-glass session terminated.', 'success')
      void qc.invalidateQueries({ queryKey: ['break-glass-status'] })
      void qc.invalidateQueries({ queryKey: ['break-glass-audit'] })
    },
    onError: (err: Error) => {
      toast(`Termination failed: ${err.message}`, 'error')
    },
  })
}
