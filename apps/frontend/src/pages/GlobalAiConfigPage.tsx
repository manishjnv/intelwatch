/**
 * @module pages/GlobalAiConfigPage
 * @description Super admin page for managing global AI model assignments,
 * plan presets, confidence model toggle, and cost dashboard.
 * DECISION-029 Phase D.
 */
import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import {
  useGlobalAiConfig, PLAN_PRESETS,
  type AiModel, type AiSubtaskConfig, type ConfidenceModel,
} from '@/hooks/use-global-ai-config'
import { cn } from '@/lib/utils'
import { Brain, DollarSign, Zap, Shield, RotateCcw, Save, Check } from 'lucide-react'

const MODEL_OPTIONS: AiModel[] = ['haiku', 'sonnet', 'opus']

const CATEGORY_LABELS: Record<string, string> = {
  news_feed: 'News Feed Processing',
  ioc_enrichment: 'IOC Enrichment',
  reporting: 'Reporting',
}

function formatSubtask(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function CostDelta({ current, recommended, costs }: { current: AiModel; recommended: AiModel; costs: Record<AiModel, number> }) {
  if (current === recommended) return null
  const delta = (costs[current] - costs[recommended]) * 30
  const positive = delta > 0
  return (
    <span className={cn('text-xs font-medium ml-2', positive ? 'text-sev-high' : 'text-sev-low')}>
      {positive ? '↑' : '↓'} {positive ? '+' : ''}{delta < 0 ? '-' : ''}${Math.abs(delta).toFixed(2)}/mo
    </span>
  )
}

export function GlobalAiConfigPage() {
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'super_admin'

  const {
    config, isLoading, isDemo, setModel, isSavingModel,
    applyPlan, isApplyingPlan, confidenceModel, setConfidenceModel,
    isSavingConfidence, modelCosts, presets,
  } = useGlobalAiConfig()

  const [pendingChanges, setPendingChanges] = useState<Record<string, AiModel>>({})
  const [showConfirmPlan, setShowConfirmPlan] = useState<string | null>(null)
  const [selectedConfidence, setSelectedConfidence] = useState<ConfidenceModel | null>(null)

  const subtasks = config?.subtasks ?? []
  const costEstimate = config?.costEstimate

  const groupedSubtasks = useMemo(() => {
    const groups: Record<string, AiSubtaskConfig[]> = {}
    for (const s of subtasks) {
      ;(groups[s.category] ??= []).push(s)
    }
    return groups
  }, [subtasks])

  const handleModelChange = (category: string, subtask: string, model: AiModel) => {
    setPendingChanges(prev => ({ ...prev, [`${category}.${subtask}`]: model }))
  }

  const handleSaveAll = () => {
    for (const [key, model] of Object.entries(pendingChanges)) {
      const [category, subtask] = key.split('.')
      setModel({ category, subtask, model })
    }
    setPendingChanges({})
  }

  const handleApplyPlan = (tier: string) => {
    applyPlan(tier)
    setShowConfirmPlan(null)
  }

  const handleApplyConfidence = () => {
    if (selectedConfidence) {
      setConfidenceModel(selectedConfidence)
      setSelectedConfidence(null)
    }
  }

  if (!isAdmin) {
    return (
      <div data-testid="global-ai-config-page" className="flex items-center justify-center h-64">
        <p className="text-text-muted">Access restricted to super administrators.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div data-testid="global-ai-config-page" className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-bg-elevated rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  const hasPending = Object.keys(pendingChanges).length > 0

  return (
    <div data-testid="global-ai-config-page" className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-400" /> Global AI Configuration
        </h1>
        <p className="text-text-muted mt-1">
          Control which AI models power each pipeline subtask. Changes affect all tenants using the global processing pipeline.
        </p>
        {isDemo && (
          <span data-testid="demo-badge" className="inline-block mt-2 px-2 py-0.5 bg-amber-400/20 text-amber-400 rounded text-xs font-medium">
            DEMO MODE
          </span>
        )}
      </div>

      {/* Section 1: Model Assignment Table */}
      <section data-testid="model-table-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Model Assignments</h2>
          <button
            data-testid="save-changes-btn"
            onClick={handleSaveAll}
            disabled={!hasPending || isSavingModel}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              hasPending
                ? 'bg-brand text-white hover:bg-brand/90'
                : 'bg-bg-elevated text-text-muted cursor-not-allowed',
            )}
          >
            <Save className="w-4 h-4" /> Save Changes {hasPending && `(${Object.keys(pendingChanges).length})`}
          </button>
        </div>

        <div className="overflow-x-auto" data-testid="model-table-scroll">
          <table className="w-full text-sm" data-testid="model-table">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3">Subtask</th>
                <th className="py-2 px-3">Current Model</th>
                <th className="py-2 px-3">Recommended</th>
                <th className="py-2 px-3">Accuracy %</th>
                <th className="py-2 px-3">Est. Cost/mo</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedSubtasks).map(([category, items]) =>
                items.map((s, idx) => {
                  const key = `${s.category}.${s.subtask}`
                  const currentModel = pendingChanges[key] ?? s.model
                  const isRecommended = currentModel === s.recommended
                  const rowCost = modelCosts[currentModel] * 30
                  return (
                    <tr key={key} className="border-b border-border/50 hover:bg-bg-elevated/50" data-testid={`subtask-row-${key}`}>
                      <td className="py-2 px-3 text-text-muted">
                        {idx === 0 ? (CATEGORY_LABELS[category] ?? category) : ''}
                      </td>
                      <td className="py-2 px-3 text-text-primary">{formatSubtask(s.subtask)}</td>
                      <td className="py-2 px-3">
                        <select
                          data-testid={`model-select-${key}`}
                          value={currentModel}
                          onChange={e => handleModelChange(s.category, s.subtask, e.target.value as AiModel)}
                          className="bg-bg-elevated border border-border rounded px-2 py-1 text-text-primary text-sm"
                        >
                          {MODEL_OPTIONS.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <CostDelta current={currentModel} recommended={s.recommended} costs={modelCosts} />
                      </td>
                      <td className="py-2 px-3 text-text-muted capitalize">{s.recommended}</td>
                      <td className="py-2 px-3">{s.accuracyPct}%</td>
                      <td className="py-2 px-3">${rowCost.toFixed(2)}</td>
                      <td className="py-2 px-3">
                        {isRecommended ? (
                          <span className="text-xs bg-sev-low/20 text-sev-low px-2 py-0.5 rounded" data-testid="recommended-badge">Recommended</span>
                        ) : (
                          <span className="text-xs bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded">Custom</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {!isRecommended && (
                          <button
                            data-testid={`reset-${key}`}
                            onClick={() => handleModelChange(s.category, s.subtask, s.recommended)}
                            className="text-text-muted hover:text-text-primary"
                            title="Reset to Recommended"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Quick Apply Presets */}
      <section data-testid="presets-section">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Apply Presets</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {presets.map(p => {
            const isActive = config?.activePlan === p.tier
            return (
              <button
                key={p.id}
                data-testid={`preset-${p.id}`}
                onClick={() => setShowConfirmPlan(p.tier)}
                className={cn(
                  'p-4 rounded-lg border text-left transition-all hover:border-brand/50',
                  isActive ? 'border-brand bg-brand/10' : 'border-border bg-bg-elevated',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap className={cn('w-4 h-4', isActive ? 'text-brand' : 'text-text-muted')} />
                  <span className="font-semibold text-text-primary">{p.name}</span>
                  {isActive && <Check className="w-4 h-4 text-brand ml-auto" data-testid="active-plan-check" />}
                </div>
                <p className="text-text-muted text-sm mb-2">{p.description}</p>
                <p className="text-lg font-bold text-text-primary">
                  ${p.monthlyCost.toFixed(2)}<span className="text-xs text-text-muted font-normal">/mo</span>
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Confirmation Modal */}
      {showConfirmPlan && (
        <div data-testid="confirm-modal" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-primary border border-border rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Apply Preset?</h3>
            <p className="text-text-muted text-sm mb-4">
              This will update all AI model assignments to the {showConfirmPlan} preset.
              Changes affect all tenants using the global pipeline.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConfirmPlan(null)} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary">
                Cancel
              </button>
              <button
                data-testid="confirm-apply-btn"
                onClick={() => handleApplyPlan(showConfirmPlan)}
                disabled={isApplyingPlan}
                className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90"
              >
                {isApplyingPlan ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Confidence Model Toggle */}
      <section data-testid="confidence-section">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Confidence Model</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['linear', 'bayesian'] as ConfidenceModel[]).map(m => {
            const active = (selectedConfidence ?? confidenceModel) === m
            return (
              <button
                key={m}
                data-testid={`confidence-${m}`}
                onClick={() => setSelectedConfidence(m)}
                className={cn(
                  'p-4 rounded-lg border text-left transition-all',
                  active ? 'border-brand bg-brand/10' : 'border-border bg-bg-elevated hover:border-brand/30',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield className={cn('w-4 h-4', active ? 'text-brand' : 'text-text-muted')} />
                  <span className="font-semibold text-text-primary capitalize">{m}</span>
                  {confidenceModel === m && !selectedConfidence && (
                    <span className="text-xs bg-sev-low/20 text-sev-low px-2 py-0.5 rounded ml-auto" data-testid={`active-confidence-${m}`}>Active</span>
                  )}
                </div>
                <p className="text-text-muted text-sm">
                  {m === 'linear'
                    ? 'Simple weighted average. 0.35×feed + 0.35×corroboration + 0.30×AI'
                    : 'Log-odds model. High-reliability sources have multiplicative impact. 2 reliable sources > 4 unreliable sources.'}
                </p>
              </button>
            )
          })}
        </div>
        {selectedConfidence && selectedConfidence !== confidenceModel && (
          <button
            data-testid="apply-confidence-btn"
            onClick={handleApplyConfidence}
            disabled={isSavingConfidence}
            className="mt-4 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90"
          >
            {isSavingConfidence ? 'Applying...' : `Switch to ${selectedConfidence}`}
          </button>
        )}
      </section>

      {/* Section 4: Cost Dashboard */}
      <section data-testid="cost-dashboard">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Cost Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="col-span-1 p-4 bg-bg-elevated rounded-lg border border-border">
            <p className="text-text-muted text-sm">Total Monthly Estimate</p>
            <p className="text-3xl font-bold text-text-primary mt-1" data-testid="total-monthly-cost">
              ${costEstimate?.totalMonthly.toFixed(2) ?? '0.00'}
            </p>
          </div>
          {costEstimate?.byCategory && Object.entries(costEstimate.byCategory).map(([cat, cost]) => (
            <div key={cat} className="p-4 bg-bg-elevated rounded-lg border border-border" data-testid={`cost-category-${cat}`}>
              <p className="text-text-muted text-sm">{CATEGORY_LABELS[cat] ?? cat}</p>
              <p className="text-xl font-bold text-text-primary mt-1">${cost.toFixed(2)}</p>
              <div className="mt-2 h-2 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full"
                  style={{ width: `${costEstimate.totalMonthly > 0 ? (cost / costEstimate.totalMonthly) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
