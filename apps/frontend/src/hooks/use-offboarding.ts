/**
 * @module hooks/use-offboarding
 * @description React Query hooks for tenant offboarding pipeline (super_admin only).
 * GET /admin/offboarding, POST /admin/tenants/:id/offboard,
 * POST /admin/tenants/:id/cancel-offboard, GET /admin/tenants/:id/offboard-status
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────

export type OffboardStatus = 'offboarding' | 'archived' | 'purged'

export interface OffboardingEntry {
  tenantId: string
  orgName: string
  status: OffboardStatus
  offboardedBy: string
  offboardedAt: string
  purgeScheduledAt: string | null
  purgedAt: string | null
}

export interface OffboardStatusDetail {
  tenantId: string
  orgName: string
  status: OffboardStatus
  steps: OffboardStep[]
  archivePath: string | null
}

export interface OffboardStep {
  label: string
  completed: boolean
  count?: number
  detail?: string
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_PIPELINE: OffboardingEntry[] = [
  {
    tenantId: 't-demo-1', orgName: 'Sunset Corp', status: 'offboarding',
    offboardedBy: 'admin@system.local', offboardedAt: '2026-03-28T14:00:00Z',
    purgeScheduledAt: '2026-05-27T14:00:00Z', purgedAt: null,
  },
  {
    tenantId: 't-demo-2', orgName: 'Legacy Inc', status: 'archived',
    offboardedBy: 'admin@system.local', offboardedAt: '2026-03-10T09:00:00Z',
    purgeScheduledAt: '2026-05-09T09:00:00Z', purgedAt: null,
  },
  {
    tenantId: 't-demo-3', orgName: 'Old Systems Ltd', status: 'purged',
    offboardedBy: 'admin@system.local', offboardedAt: '2026-01-15T12:00:00Z',
    purgeScheduledAt: '2026-03-16T12:00:00Z', purgedAt: '2026-03-16T12:05:00Z',
  },
]

const DEMO_STATUS_DETAIL: OffboardStatusDetail = {
  tenantId: 't-demo-1', orgName: 'Sunset Corp', status: 'offboarding',
  steps: [
    { label: 'Users disabled', completed: true, count: 12 },
    { label: 'Sessions terminated', completed: true, count: 8 },
    { label: 'API keys revoked', completed: true, count: 3 },
    { label: 'SSO disabled', completed: true },
    { label: 'Archive to S3', completed: false },
    { label: 'Data purge', completed: false },
  ],
  archivePath: null,
}

// ─── Hooks ──────────────────────────────────────────────────

/** Fetch all tenants in the offboarding pipeline. */
export function useOffboardingPipeline() {
  const result = useQuery({
    queryKey: ['offboarding-pipeline'],
    queryFn: () =>
      api<OffboardingEntry[]>('/admin/offboarding')
        .catch(err => notifyApiError(err, 'offboarding pipeline', [] as OffboardingEntry[])),
    staleTime: 30_000,
  })

  const data = result.data
  const isDemo = !result.isLoading && (!data || data.length === 0)
  return { ...result, data: isDemo ? DEMO_PIPELINE : data ?? [], isDemo }
}

/** Trigger offboarding for a tenant. */
export function useOffboardTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) =>
      api<{ purgeScheduledAt: string }>(`/admin/tenants/${tenantId}/offboard`, { method: 'POST' }),
    onSuccess: (_data) => {
      const purgeDate = _data?.purgeScheduledAt
        ? new Date(_data.purgeScheduledAt).toLocaleDateString()
        : 'in 60 days'
      toast(`Organization offboarded. Data will be purged on ${purgeDate}.`, 'success')
      void qc.invalidateQueries({ queryKey: ['offboarding-pipeline'] })
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 403) {
        toast('Cannot offboard system tenant.', 'error')
      } else {
        toast(`Offboarding failed: ${err.message}`, 'error')
      }
    },
  })
}

/** Cancel offboarding for a tenant. */
export function useCancelOffboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) =>
      api(`/admin/tenants/${tenantId}/cancel-offboard`, { method: 'POST' }),
    onSuccess: () => {
      toast('Offboarding cancelled.', 'success')
      void qc.invalidateQueries({ queryKey: ['offboarding-pipeline'] })
    },
    onError: (err: Error) => {
      toast(`Cancel failed: ${err.message}`, 'error')
    },
  })
}

/** Fetch offboard status detail for a specific tenant. */
export function useOffboardStatus(tenantId: string | null) {
  const result = useQuery({
    queryKey: ['offboard-status', tenantId],
    queryFn: () =>
      api<OffboardStatusDetail>(`/admin/tenants/${tenantId}/offboard-status`)
        .catch(err => notifyApiError(err, 'offboard status', null)),
    enabled: !!tenantId,
    staleTime: 15_000,
  })

  const isDemo = !result.isLoading && !result.data && !!tenantId
  return { ...result, data: isDemo ? DEMO_STATUS_DETAIL : result.data ?? null, isDemo }
}
