/**
 * @module hooks/use-break-glass
 * @description React Query hooks for break-glass emergency access management (super_admin only).
 * GET /admin/break-glass/status, GET /admin/break-glass/audit,
 * POST /admin/break-glass/rotate-password, DELETE /admin/break-glass/sessions
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { notifyApiError } from './useApiError'

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

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_STATUS: BreakGlassStatus = {
  activeSession: false,
  lastUsed: '2026-03-25T03:15:00Z',
  useCount: 2,
}

const DEMO_STATUS_ACTIVE: BreakGlassStatus = {
  activeSession: true,
  lastUsed: '2026-03-30T01:00:00Z',
  useCount: 3,
  session: {
    ip: '203.0.113.42',
    geo: 'Mumbai, IN',
    startedAt: '2026-03-30T01:00:00Z',
    expiresAt: '2026-03-30T01:15:00Z',
  },
}

const DEMO_AUDIT: BreakGlassAuditEntry[] = [
  { id: 'a1', event: 'login.success', ip: '203.0.113.42', location: 'Mumbai, IN', timestamp: '2026-03-25T03:15:00Z', details: null, riskLevel: 'critical' },
  { id: 'a2', event: 'action.GET /admin/tenants', ip: '203.0.113.42', location: 'Mumbai, IN', timestamp: '2026-03-25T03:15:30Z', details: 'Listed all tenants', riskLevel: 'critical' },
  { id: 'a3', event: 'session_expired', ip: '203.0.113.42', location: 'Mumbai, IN', timestamp: '2026-03-25T03:30:00Z', details: 'Session TTL exceeded', riskLevel: 'critical' },
  { id: 'a4', event: 'login.failed', ip: '198.51.100.10', location: 'Unknown', timestamp: '2026-03-20T22:10:00Z', details: 'Invalid password', riskLevel: 'critical' },
  { id: 'a5', event: 'login.locked', ip: '198.51.100.10', location: 'Unknown', timestamp: '2026-03-20T22:12:00Z', details: 'Locked after 5 failed attempts', riskLevel: 'critical' },
]

// ─── Hooks ──────────────────────────────────────────────────

/** Fetch break-glass system status. */
export function useBreakGlassStatus() {
  const result = useQuery({
    queryKey: ['break-glass-status'],
    queryFn: () =>
      api<BreakGlassStatus>('/admin/break-glass/status')
        .catch(err => notifyApiError(err, 'break-glass status', null)),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  const isDemo = !result.isLoading && !result.data
  return { ...result, data: result.data ?? DEMO_STATUS, isDemo, DEMO_STATUS_ACTIVE }
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
    queryFn: () =>
      api<{ data: BreakGlassAuditEntry[]; total: number }>(`/admin/break-glass/audit${qs ? `?${qs}` : ''}`)
        .catch(err => notifyApiError(err, 'break-glass audit', null)),
    staleTime: 30_000,
  })

  const isDemo = !result.isLoading && !result.data
  return {
    ...result,
    data: isDemo ? { data: DEMO_AUDIT, total: DEMO_AUDIT.length } : result.data ?? { data: [], total: 0 },
    isDemo,
  }
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
