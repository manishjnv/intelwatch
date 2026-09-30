/**
 * @module hooks/use-global-ai-config
 * @description TanStack Query hooks for Global AI Configuration management.
 * DECISION-029 Phase D.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types ──────────────────────────────────────────────────

export type AiModel = 'haiku' | 'sonnet' | 'opus'
export type ConfidenceModel = 'linear' | 'bayesian'

export interface AiSubtaskConfig {
  category: string
  subtask: string
  model: AiModel
  recommended: AiModel
  accuracyPct: number
  monthlyCostEstimate: number
}

export interface CostEstimate {
  totalMonthly: number
  byCategory: Record<string, number>
}

export interface GlobalAiConfigData {
  subtasks: AiSubtaskConfig[]
  confidenceModel: ConfidenceModel
  costEstimate: CostEstimate
  activePlan: string | null
}

// ─── Recommended Models (fallback) ─────────────────────────

const RECOMMENDED_MODELS: Record<string, AiModel> = {
  'news_feed.triage': 'haiku',
  'news_feed.extraction': 'sonnet',
  'news_feed.classification': 'haiku',
  'news_feed.summarization': 'sonnet',
  'news_feed.translation': 'haiku',
  'ioc_enrichment.risk_scoring': 'sonnet',
  'ioc_enrichment.context_generation': 'sonnet',
  'ioc_enrichment.attribution': 'sonnet',
  'ioc_enrichment.campaign_linking': 'sonnet',
  'ioc_enrichment.false_positive': 'haiku',
  'reporting.executive_summary': 'sonnet',
  'reporting.technical_detail': 'sonnet',
  'reporting.trend_analysis': 'sonnet',
  'reporting.recommendation': 'haiku',
  'reporting.formatting': 'haiku',
}

const MODEL_COSTS: Record<AiModel, number> = { haiku: 0.80, sonnet: 3.00, opus: 15.00 }
const MODEL_ACCURACY: Record<AiModel, number> = { haiku: 78, sonnet: 92, opus: 97 }

function computeCost(subtasks: AiSubtaskConfig[]): CostEstimate {
  const byCategory: Record<string, number> = {}
  let totalMonthly = 0
  for (const s of subtasks) {
    const cost = MODEL_COSTS[s.model] * 30
    byCategory[s.category] = (byCategory[s.category] ?? 0) + cost
    totalMonthly += cost
  }
  return { totalMonthly, byCategory }
}

// ─── Plan Presets ──────────────────────────────────────────
// Not demo data — these are the three real subscription-tier presets the
// "Quick Apply" buttons always offer, independent of what's currently configured.

export interface PlanPreset {
  id: string
  name: string
  description: string
  tier: string
  monthlyCost: number
}

const RECOMMENDED_MONTHLY_COST = Object.values(RECOMMENDED_MODELS).reduce((sum, m) => sum + MODEL_COSTS[m] * 30, 0)

export const PLAN_PRESETS: PlanPreset[] = [
  { id: 'starter', name: 'Starter (Budget)', description: 'All Haiku — lowest cost, good accuracy', tier: 'starter', monthlyCost: Object.keys(RECOMMENDED_MODELS).length * MODEL_COSTS.haiku * 30 },
  { id: 'teams', name: 'Teams (Balanced)', description: 'Recommended mix — best accuracy/cost ratio', tier: 'teams', monthlyCost: RECOMMENDED_MONTHLY_COST },
  { id: 'enterprise', name: 'Enterprise (Max Accuracy)', description: 'All Sonnet — highest accuracy', tier: 'enterprise', monthlyCost: Object.keys(RECOMMENDED_MODELS).length * MODEL_COSTS.sonnet * 30 },
]

// ─── Hook ──────────────────────────────────────────────────

export function useGlobalAiConfig() {
  const qc = useQueryClient()

  const result = useQuery({
    queryKey: ['global-ai-config'],
    queryFn: () =>
      api<{ subtasks: AiSubtaskConfig[]; confidenceModel: ConfidenceModel; activePlan: string | null }>(
        '/customization/ai/global',
      )
        .then(r => ({
          subtasks: r?.subtasks ?? [],
          confidenceModel: r?.confidenceModel ?? 'bayesian',
          costEstimate: computeCost(r?.subtasks ?? []),
          activePlan: r?.activePlan ?? null,
        })),
    staleTime: 60_000,
    meta: { resource: 'global AI config' },
  })

  const data = result.data

  const setModelMut = useMutation({
    mutationFn: ({ category, subtask, model }: { category: string; subtask: string; model: AiModel }) =>
      api(`/customization/ai/global/${category}/${subtask}`, { method: 'PUT', body: { model } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['global-ai-config'] }),
  })

  const applyPlanMut = useMutation({
    mutationFn: (tier: string) =>
      api('/customization/ai/global/apply-plan', { method: 'POST', body: { tier } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['global-ai-config'] }),
  })

  const setConfidenceModelMut = useMutation({
    mutationFn: (model: ConfidenceModel) =>
      api('/customization/ai/global/confidence-model', { method: 'PUT', body: { model } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['global-ai-config'] }),
  })

  return {
    config: data,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
    setModel: setModelMut.mutate,
    isSavingModel: setModelMut.isPending,
    applyPlan: applyPlanMut.mutate,
    isApplyingPlan: applyPlanMut.isPending,
    confidenceModel: data?.confidenceModel ?? 'bayesian',
    setConfidenceModel: setConfidenceModelMut.mutate,
    isSavingConfidence: setConfidenceModelMut.isPending,
    recommendations: RECOMMENDED_MODELS,
    modelCosts: MODEL_COSTS,
    modelAccuracy: MODEL_ACCURACY,
    presets: PLAN_PRESETS,
  }
}
