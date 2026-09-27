/**
 * @module hooks/use-plan-builder
 * @description React Query hooks for plan CRUD (super_admin).
 * Endpoints: GET/POST/PUT/DELETE /api/v1/admin/plans
 * S161a: honest UI — no demo plans on failure or empty response.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FeatureKey } from './use-feature-limits'

// ─── Types ──────────────────────────────────────────────────

export interface PlanFeatureLimit {
  featureKey: FeatureKey
  enabled: boolean
  limitDaily: number
  limitWeekly: number
  limitMonthly: number
  limitTotal: number
}

export interface PlanDefinition {
  id: string
  planId: string
  name: string
  description: string | null
  priceMonthlyInr: number
  priceAnnualInr: number
  isPublic: boolean
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  features: PlanFeatureLimit[]
  _count?: { tenants: number }
}

export interface PlanDefinitionCreate {
  planId: string
  name: string
  description?: string
  priceMonthlyInr: number
  priceAnnualInr: number
  isPublic?: boolean
  isDefault?: boolean
  sortOrder?: number
  features: PlanFeatureLimit[]
}

export type PlanDefinitionUpdate = Partial<PlanDefinitionCreate>

// ─── Hook ───────────────────────────────────────────────────

export function usePlanBuilder() {
  const qc = useQueryClient()

  const result = useQuery<PlanDefinition[]>({
    queryKey: ['admin-plans'],
    // api() already unwraps the gateway's { data, total } envelope — the old `r?.data` was always
    // undefined, so the builder always looked empty (same bug S147 fixed in use-feature-limits).
    queryFn: () =>
      api<PlanDefinition[]>('/admin/plans').then(r => {
        if (!Array.isArray(r)) throw new Error('Unexpected response from /admin/plans')
        return r
      }),
    meta: { resource: 'plans' },
    staleTime: 60_000,
  })

  const plans = result.data ?? []

  // Backend (api-gateway/routes/plans.ts POST/PUT) sends { data: plan } single-wrapped;
  // api() already unwraps it — no consumer reads the mutation result today (RCA #45).
  const createMut = useMutation({
    mutationFn: (body: PlanDefinitionCreate) =>
      api<PlanDefinition>('/admin/plans', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: PlanDefinitionUpdate }) =>
      api<PlanDefinition>(`/admin/plans/${planId}`, { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (planId: string) =>
      api(`/admin/plans/${planId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  })

  return {
    plans: [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
    createPlan: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updatePlan: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    deletePlan: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
    deleteError: deleteMut.error,
  }
}
