/**
 * @module hooks/use-tenant-overrides
 * @description React Query hooks for tenant feature overrides (super_admin).
 * Endpoints: GET/POST/PUT/DELETE /api/v1/admin/tenants/:tenantId/overrides
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FeatureKey } from './use-feature-limits'

// ─── Types ──────────────────────────────────────────────────

export interface TenantFeatureOverride {
  id: string
  tenantId: string
  featureKey: FeatureKey
  limitDaily: number | null
  limitWeekly: number | null
  limitMonthly: number | null
  limitTotal: number | null
  reason: string | null
  grantedBy: string
  grantedAt: string
  expiresAt: string | null
}

export interface OverrideCreate {
  featureKey: FeatureKey
  limitDaily?: number | null
  limitWeekly?: number | null
  limitMonthly?: number | null
  limitTotal?: number | null
  reason?: string
  expiresAt?: string | null
}

export type OverrideUpdate = Omit<OverrideCreate, 'featureKey'>

// ─── Hook ───────────────────────────────────────────────────

export function useTenantOverrides(tenantId: string | null) {
  const qc = useQueryClient()

  const result = useQuery({
    queryKey: ['tenant-overrides', tenantId],
    queryFn: () => api<TenantFeatureOverride[]>(`/admin/tenants/${tenantId}/overrides`),
    enabled: !!tenantId,
    staleTime: 60_000,
    meta: { resource: 'tenant overrides' },
  })

  const overrides = result.data ?? []

  // Backend (api-gateway/routes/overrides.ts POST/PUT) sends { data: override } single-wrapped;
  // api() already unwraps it — no consumer reads the mutation result today (RCA #45).
  const createMut = useMutation({
    mutationFn: (body: OverrideCreate) =>
      api<TenantFeatureOverride>(`/admin/tenants/${tenantId}/overrides`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant-overrides', tenantId] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ featureKey, body }: { featureKey: FeatureKey; body: OverrideUpdate }) =>
      api<TenantFeatureOverride>(`/admin/tenants/${tenantId}/overrides/${featureKey}`, { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant-overrides', tenantId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (featureKey: FeatureKey) =>
      api(`/admin/tenants/${tenantId}/overrides/${featureKey}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant-overrides', tenantId] }),
  })

  return {
    overrides,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
    createOverride: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updateOverride: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    deleteOverride: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
  }
}
