/**
 * @module hooks/use-tenant-overrides
 * @description React Query hooks for tenant feature overrides (super_admin).
 * Endpoints: GET/POST/PUT/DELETE /api/v1/admin/tenants/:tenantId/overrides
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'
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

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_OVERRIDES: TenantFeatureOverride[] = [
  {
    id: 'ov-1', tenantId: 'demo', featureKey: 'ioc_management',
    limitDaily: 10000, limitWeekly: null, limitMonthly: 100000, limitTotal: null,
    reason: 'Sales deal — extended trial', grantedBy: 'admin@etip.io',
    grantedAt: '2026-03-15T00:00:00Z', expiresAt: '2026-06-15T00:00:00Z',
  },
  {
    id: 'ov-2', tenantId: 'demo', featureKey: 'ai_enrichment',
    limitDaily: 2000, limitWeekly: null, limitMonthly: 20000, limitTotal: null,
    reason: 'Beta access', grantedBy: 'admin@etip.io',
    grantedAt: '2026-03-20T00:00:00Z', expiresAt: null,
  },
]

// ─── Hook ───────────────────────────────────────────────────

export function useTenantOverrides(tenantId: string | null) {
  const qc = useQueryClient()
  const empty: TenantFeatureOverride[] = []

  const result = useQuery({
    queryKey: ['tenant-overrides', tenantId],
    queryFn: () =>
      api<{ data: TenantFeatureOverride[] }>(`/admin/tenants/${tenantId}/overrides`)
        .then(r => r?.data ?? empty)
        .catch(err => notifyApiError(err, 'tenant overrides', DEMO_OVERRIDES)),
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && !!tenantId && (result.data?.length ?? 0) === 0
  const overrides = isDemo ? DEMO_OVERRIDES : (result.data ?? [])

  const createMut = useMutation({
    mutationFn: (body: OverrideCreate) =>
      api<{ data: TenantFeatureOverride }>(`/admin/tenants/${tenantId}/overrides`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tenant-overrides', tenantId] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ featureKey, body }: { featureKey: FeatureKey; body: OverrideUpdate }) =>
      api<{ data: TenantFeatureOverride }>(`/admin/tenants/${tenantId}/overrides/${featureKey}`, { method: 'PUT', body }),
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
    error: result.error,
    isDemo,
    createOverride: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updateOverride: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    deleteOverride: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
  }
}
