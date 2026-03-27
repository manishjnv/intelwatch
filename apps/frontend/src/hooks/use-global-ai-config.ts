/**
 * @module hooks/use-global-ai-config
 * @description TanStack Query hooks for Global AI Configuration management.
 * DECISION-029 Phase D.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { notifyApiError } from './useApiError'

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

function buildDemoSubtasks(): AiSubtaskConfig[] {
  return Object.entries(RECOMMENDED_MODELS).map(([key, rec]) => {
    const [category, subtask] = key.split('.')
    return {
      category,
      subtask,
      model: rec,
      recommended: rec,
      accuracyPct: MODEL_ACCURACY[rec],
      monthlyCostEstimate: MODEL_COSTS[rec] * 30,
    }
  })
}

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

const DEMO_CONFIG: GlobalAiConfigData = {
  subtasks: buildDemoSubtasks(),
  confidenceModel: 'bayesian',
  costEstimate: computeCost(buildDemoSubtasks()),
  activePlan: 'teams',
}

// ─── Plan Presets ──────────────────────────────────────────

export interface PlanPreset {
  id: string
  name: string
  description: string
  tier: string
  monthlyCost: number
}

export const PLAN_PRESETS: PlanPreset[] = [
  { id: 'starter', name: 'Starter (Budget)', description: 'All Haiku — lowest cost, good accuracy', tier: 'starter', monthlyCost: Object.keys(RECOMMENDED_MODELS).length * MODEL_COSTS.haiku * 30 },
  { id: 'teams', name: 'Teams (Balanced)', description: 'Recommended mix — best accuracy/cost ratio', tier: 'teams', monthlyCost: computeCost(buildDemoSubtasks()).totalMonthly },
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
        }))
        .catch(err => notifyApiError(err, 'global AI config', DEMO_CONFIG)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && (!result.data?.subtasks || result.data.subtasks.length === 0)
  const data = isDemo ? DEMO_CONFIG : result.data

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
    error: result.error,
    isDemo,
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
