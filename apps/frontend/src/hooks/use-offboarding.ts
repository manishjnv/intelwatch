/**
 * @module hooks/use-offboarding
 * @description React Query hooks for the tenant offboarding pipeline (super_admin only).
 * GET /admin/offboarding, POST /admin/tenants/:id/offboard,
 * POST /admin/tenants/:id/cancel-offboard, GET /admin/tenants/:id/offboard-status
 * Owner decision 2026-09-30: offboarding = deactivate the tenant, keep all data forever.
 * There is no purge, ever. No demo fallback (DECISION-048) — honest empty/error states
 * are handled by the caller via QueryStateView.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/Toast'

// ─── Types ──────────────────────────────────────────────────

export type OffboardStatus = 'offboarding'

export interface OffboardingEntry {
  tenantId: string
  orgName: string
  status: OffboardStatus
  offboardedBy: string
  offboardedAt: string
}

export interface OffboardStatusDetail {
  tenantId: string
  orgName: string
  status: OffboardStatus
  steps: OffboardStep[]
}

export interface OffboardStep {
  label: string
  completed: boolean
  count?: number
  detail?: string
}

// ─── Hooks ──────────────────────────────────────────────────

/** Fetch all tenants in the offboarding pipeline (deactivated, data retained). */
export function useOffboardingPipeline() {
  return useQuery({
    queryKey: ['offboarding-pipeline'],
    queryFn: () => api<OffboardingEntry[]>('/admin/offboarding'),
    staleTime: 30_000,
  })
}

/** Trigger offboarding (deactivation) for a tenant. Data is retained, never purged. */
export function useOffboardTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) =>
      api(`/admin/tenants/${tenantId}/offboard`, { method: 'POST' }),
    onSuccess: () => {
      toast('Tenant deactivated. All data is retained; cancel offboarding to reactivate.', 'success')
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

/** Reactivate a deactivated tenant (cancel offboarding). */
export function useCancelOffboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) =>
      api(`/admin/tenants/${tenantId}/cancel-offboard`, { method: 'POST' }),
    onSuccess: () => {
      toast('Tenant reactivated.', 'success')
      void qc.invalidateQueries({ queryKey: ['offboarding-pipeline'] })
    },
    onError: (err: Error) => {
      toast(`Reactivate failed: ${err.message}`, 'error')
    },
  })
}

/** Fetch offboard status detail for a specific tenant. */
export function useOffboardStatus(tenantId: string | null) {
  return useQuery({
    queryKey: ['offboard-status', tenantId],
    queryFn: () => api<OffboardStatusDetail>(`/admin/tenants/${tenantId}/offboard-status`),
    enabled: !!tenantId,
    staleTime: 15_000,
  })
}
