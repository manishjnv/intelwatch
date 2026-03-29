/**
 * @module hooks/use-plan-builder
 * @description React Query hooks for plan CRUD (super_admin).
 * Endpoints: GET/POST/PUT/DELETE /api/v1/admin/plans
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'
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

// ─── Demo Data ──────────────────────────────────────────────

function demoFeatures(preset: 'free' | 'starter' | 'teams' | 'enterprise'): PlanFeatureLimit[] {
  const keys: FeatureKey[] = [
    'ioc_management', 'threat_actors', 'malware_intel', 'vulnerability_intel',
    'threat_hunting', 'graph_exploration', 'digital_risk_protection', 'correlation_engine',
    'reports', 'ai_enrichment', 'feed_subscriptions', 'users',
    'data_retention', 'api_access', 'ioc_storage', 'alerts',
  ]
  const configs: Record<string, { enabled: number; daily: number; monthly: number }> = {
    free:       { enabled: 6,  daily: 100,   monthly: 1000 },
    starter:    { enabled: 10, daily: 5000,  monthly: 50000 },
    teams:      { enabled: 14, daily: 50000, monthly: 500000 },
    enterprise: { enabled: 16, daily: -1,    monthly: -1 },
  }
  const cfg = configs[preset]
  return keys.map((key, i) => ({
    featureKey: key,
    enabled: i < cfg.enabled,
    limitDaily: i < cfg.enabled ? cfg.daily : 0,
    limitWeekly: -1,
    limitMonthly: i < cfg.enabled ? cfg.monthly : 0,
    limitTotal: -1,
  }))
}

const DEMO_PLANS: PlanDefinition[] = [
  { id: '1', planId: 'free', name: 'Free', description: 'Get started with basic threat intel', priceMonthlyInr: 0, priceAnnualInr: 0, isPublic: true, isDefault: true, sortOrder: 0, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', features: demoFeatures('free'), _count: { tenants: 12 } },
  { id: '2', planId: 'starter', name: 'Starter', description: 'For small security teams', priceMonthlyInr: 9999, priceAnnualInr: 99999, isPublic: true, isDefault: false, sortOrder: 1, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', features: demoFeatures('starter'), _count: { tenants: 5 } },
  { id: '3', planId: 'teams', name: 'Teams', description: 'For growing security operations', priceMonthlyInr: 18999, priceAnnualInr: 189999, isPublic: true, isDefault: false, sortOrder: 2, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', features: demoFeatures('teams'), _count: { tenants: 3 } },
  { id: '4', planId: 'enterprise', name: 'Enterprise', description: 'Unlimited access for large orgs', priceMonthlyInr: 49999, priceAnnualInr: 499999, isPublic: true, isDefault: false, sortOrder: 3, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z', features: demoFeatures('enterprise'), _count: { tenants: 1 } },
]

// ─── Hook ───────────────────────────────────────────────────

export function usePlanBuilder() {
  const qc = useQueryClient()
  const empty: PlanDefinition[] = []

  const result = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () =>
      api<{ data: PlanDefinition[]; total: number }>('/admin/plans')
        .then(r => r?.data ?? empty)
        .catch(err => notifyApiError(err, 'plan builder', DEMO_PLANS)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (result.data?.length ?? 0) === 0
  const plans = isDemo ? DEMO_PLANS : (result.data ?? [])

  const createMut = useMutation({
    mutationFn: (body: PlanDefinitionCreate) =>
      api<{ data: PlanDefinition }>('/admin/plans', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: PlanDefinitionUpdate }) =>
      api<{ data: PlanDefinition }>(`/admin/plans/${planId}`, { method: 'PUT', body }),
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
    error: result.error,
    isDemo,
    createPlan: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updatePlan: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    deletePlan: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
    deleteError: deleteMut.error,
  }
}
