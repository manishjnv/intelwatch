/**
 * @module hooks/use-plan-limits
 * @description TanStack Query hooks for Plan Tier Limits management.
 * DECISION-029 Phase D.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────

export interface PlanTierConfig {
  id: string
  planName: string
  maxPrivateFeeds: number
  maxGlobalSubscriptions: number
  minFetchIntervalMinutes: number
  retentionDays: number
  aiEnabled: boolean
  dailyTokenBudget: number
}

// ─── Demo Data ──────────────────────────────────────────────

const DEFAULT_PLANS: PlanTierConfig[] = [
  {
    id: 'free', planName: 'Free',
    maxPrivateFeeds: 2, maxGlobalSubscriptions: 5,
    minFetchIntervalMinutes: 240, retentionDays: 30,
    aiEnabled: false, dailyTokenBudget: 0,
  },
  {
    id: 'starter', planName: 'Starter',
    maxPrivateFeeds: 10, maxGlobalSubscriptions: 20,
    minFetchIntervalMinutes: 60, retentionDays: 90,
    aiEnabled: true, dailyTokenBudget: 50000,
  },
  {
    id: 'teams', planName: 'Teams',
    maxPrivateFeeds: 50, maxGlobalSubscriptions: 100,
    minFetchIntervalMinutes: 30, retentionDays: 365,
    aiEnabled: true, dailyTokenBudget: 500000,
  },
  {
    id: 'enterprise', planName: 'Enterprise',
    maxPrivateFeeds: -1, maxGlobalSubscriptions: -1,
    minFetchIntervalMinutes: 15, retentionDays: -1,
    aiEnabled: true, dailyTokenBudget: -1,
  },
]

// ─── Backend shape mapper ────────────────────────────────────
// Backend (apps/customization/src/routes/plan-limits.ts) sends:
//   { planId, maxPrivateFeeds, maxGlobalSubs, minFetchInterval: '4h'|'2h'|'30m'|'15m', retentionDays, aiEnabled, dailyTokenBudget }
// Frontend needs: { id, planName, maxPrivateFeeds, maxGlobalSubscriptions, minFetchIntervalMinutes, retentionDays, aiEnabled, dailyTokenBudget }

const PLAN_NAMES: Record<string, string> = { free: 'Free', starter: 'Starter', teams: 'Teams', enterprise: 'Enterprise' }
const INTERVAL_TO_MINUTES: Record<string, number> = { '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240 }

interface BackendPlanTierConfig {
  planId: string
  maxPrivateFeeds: number
  maxGlobalSubs: number
  minFetchInterval: string
  retentionDays: number
  aiEnabled: boolean
  dailyTokenBudget: number
}

function mapPlan(p: BackendPlanTierConfig): PlanTierConfig {
  return {
    id: p.planId,
    planName: PLAN_NAMES[p.planId] ?? p.planId,
    maxPrivateFeeds: p.maxPrivateFeeds,
    maxGlobalSubscriptions: p.maxGlobalSubs,
    minFetchIntervalMinutes: INTERVAL_TO_MINUTES[p.minFetchInterval] ?? (Number(p.minFetchInterval) || 0),
    retentionDays: p.retentionDays,
    aiEnabled: p.aiEnabled,
    dailyTokenBudget: p.dailyTokenBudget,
  }
}

// ─── Hook ──────────────────────────────────────────────────

export function usePlanLimits() {
  const qc = useQueryClient()

  const result = useQuery({
    queryKey: ['plan-limits'],
    queryFn: () =>
      api<BackendPlanTierConfig[]>('/customization/plans')
        .then(r => (r ?? []).map(mapPlan))
        .catch(err => notifyApiError(err, 'plan limits', DEFAULT_PLANS)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (result.data?.length ?? 0) === 0
  const data = isDemo ? DEFAULT_PLANS : result.data

  const updatePlanMut = useMutation({
    mutationFn: ({ planId, changes }: { planId: string; changes: Partial<PlanTierConfig> }) =>
      api(`/customization/plans/${planId}`, { method: 'PUT', body: changes }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plan-limits'] }),
  })

  const resetPlanMut = useMutation({
    mutationFn: (planId: string) =>
      api(`/customization/plans/${planId}/reset`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plan-limits'] }),
  })

  return {
    plans: data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    isDemo,
    updatePlan: updatePlanMut.mutate,
    isUpdating: updatePlanMut.isPending,
    resetPlan: resetPlanMut.mutate,
    isResetting: resetPlanMut.isPending,
    defaults: DEFAULT_PLANS,
  }
}
