/**
 * @module pages/CustomizationPage
 * @description Platform Customization dashboard — module toggles, AI model config,
 * risk weight tuning, dashboard preferences, notification channel routing.
 * 5 tabs with interactive config panels.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useModuleToggles, useAIConfigs, useRiskWeights,
  useNotificationChannels, useCustomizationStats,
  useToggleModule, useUpdateRiskWeight,
  useResetRiskWeights, useUpdateNotificationChannel, useTestNotification,
  usePlanTiers, useSubtaskMappings, useRecommendedModels, useCostEstimate, useApplyPlan, useSetSubtaskModel,
  useAnthropicKeyStatus, useSaveAnthropicKey, useDeleteAnthropicKey,
  type ModuleToggle, type AIModelConfig, type RiskWeight, type NotificationChannel,
  type PlanTierMeta, type SubtaskMapping,
} from '@/hooks/use-phase5-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import {
  Puzzle, Brain, Scale, LayoutDashboard, Bell,
  ToggleLeft, ToggleRight, AlertTriangle, Send,
  RotateCcw, Sliders, Star, Key, Trash2,
} from 'lucide-react'

// ─── Tab type ───────────────────────────────────────────────────

type CustomTab = 'modules' | 'ai' | 'risk' | 'dashboard' | 'notifications'

const TABS: { key: CustomTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'modules', label: 'Modules', icon: Puzzle },
  { key: 'ai', label: 'AI Config', icon: Brain },
  { key: 'risk', label: 'Risk Weights', icon: Scale },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'notifications', label: 'Notifications', icon: Bell },
]

// ─── Main Component ─────────────────────────────────────────────

export function CustomizationPage() {
  const [activeTab, setActiveTab] = useState<CustomTab>('modules')

  const { data: stats, isDemo } = useCustomizationStats()
  const { data: moduleData } = useModuleToggles()
  const { data: aiData } = useAIConfigs()
  const { data: riskData } = useRiskWeights()
  const { data: notifData } = useNotificationChannels()

  return (
    <div className="flex flex-col h-full">
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-400/10 text-rose-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Customization service for live config</span>
        </div>
      )}

      <PageStatsBar>
        <CompactStat label="Modules Enabled" value={stats?.modulesEnabled?.toString() ?? '—'} />
        <CompactStat label="Custom Rules" value={stats?.customRules?.toString() ?? '0'} />
        <CompactStat label="AI Budget Used" value={`${stats?.aiBudgetUsed ?? 0}%`} color={
          (stats?.aiBudgetUsed ?? 0) >= 80 ? 'text-sev-critical' : (stats?.aiBudgetUsed ?? 0) >= 50 ? 'text-sev-medium' : 'text-sev-low'
        } />
        <CompactStat label="Theme" value={stats?.theme ?? 'dark'} />
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === key ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary')}>
              <Icon className="w-3 h-3" />{label}
            </button>
          ))}
        </div>

        {activeTab === 'modules' && <ModulesTab modules={moduleData?.data ?? []} isDemo={isDemo} />}
        {activeTab === 'ai' && <AIConfigTab configs={aiData?.data ?? []} isDemo={isDemo ?? false} />}
        {activeTab === 'risk' && <RiskWeightsTab weights={riskData?.data ?? []} isDemo={isDemo} />}
        {activeTab === 'dashboard' && <DashboardConfigTab />}
        {activeTab === 'notifications' && <NotificationsTab channels={notifData?.data ?? []} isDemo={isDemo} />}
      </div>
    </div>
  )
}

// ─── Modules Tab ────────────────────────────────────────────────

function ModulesTab({ modules, isDemo }: { modules: ModuleToggle[]; isDemo: boolean }) {
  const toggleMutation = useToggleModule()

  const categories = useMemo(() => {
    const map = new Map<string, ModuleToggle[]>()
    modules.forEach(m => {
      const list = map.get(m.category) ?? []
      list.push(m)
      map.set(m.category, list)
    })
    return Array.from(map.entries())
  }, [modules])

  return (
    <div className="space-y-4">
      {categories.map(([category, mods]) => (
        <div key={category}>
          <h3 className="text-[10px] text-text-muted uppercase font-medium mb-2">{category}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mods.map(mod => (
              <div key={mod.id} className="p-3 bg-bg-secondary rounded-lg border border-border flex items-start gap-3">
                <button
                  onClick={() => { if (!isDemo) toggleMutation.mutate({ id: mod.id, enabled: !mod.enabled }) }}
                  disabled={isDemo || toggleMutation.isPending}
                  className="mt-0.5 shrink-0">
                  {mod.enabled
                    ? <ToggleRight className="w-5 h-5 text-sev-low" />
                    : <ToggleLeft className="w-5 h-5 text-text-muted" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', mod.enabled ? 'text-text-primary' : 'text-text-muted')}>{mod.name}</span>
                  </div>
                  <p className="text-[10px] text-text-muted mt-0.5">{mod.description}</p>
                  {mod.dependencies.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-sev-medium shrink-0" />
                      <span className="text-[10px] text-sev-medium">Requires: {mod.dependencies.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── AI Config Tab ──────────────────────────────────────────────

const MODEL_COLOR: Record<string, string> = {
  haiku:  'text-sev-low',
  sonnet: 'text-accent',
  opus:   'text-sev-critical',
}

const STAGE_LABEL: Record<number, string> = { 1: 'S1', 2: 'S2', 3: 'S3' }

const AI_MODELS = ['haiku', 'sonnet', 'opus'] as const

function AIConfigTab({ isDemo }: { configs: AIModelConfig[]; isDemo: boolean }) {
  const { data: planData } = usePlanTiers()
  const { data: subtaskData } = useSubtaskMappings()
  const { data: recData } = useRecommendedModels()
  const applyPlanMutation = useApplyPlan()
  const setSubtaskModelMutation = useSetSubtaskModel()

  const plans = planData?.data ?? []
  const subtasks = subtaskData?.data ?? []
  const recommended = recData?.data ?? []
  const recMap = useMemo(() =>
    Object.fromEntries(recommended.map(r => [r.subtask, r.recommendedModel])),
  [recommended])

  const [selectedPlan, setSelectedPlan] = useState<string>('professional')
  const [articleCount, setArticleCount] = useState(1000)
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null)

  const { data: costData } = useCostEstimate(selectedPlan, articleCount)
  const cost = costData?.data

  const handleApplyPlan = () => {
    if (isDemo || selectedPlan === 'custom') return
    setConfirmPlan(selectedPlan)
  }

  const confirmAndApply = () => {
    if (!confirmPlan) return
    applyPlanMutation.mutate(confirmPlan)
    setConfirmPlan(null)
  }

  return (
    <div className="space-y-4">
      {/* Plan selector */}
      <div>
        <h3 className="text-[10px] text-text-muted uppercase font-medium mb-2">AI Plan Tier</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {plans.map((plan: PlanTierMeta) => (
            <button key={plan.plan}
              onClick={() => setSelectedPlan(plan.plan)}
              className={cn(
                'relative p-3 rounded-lg border text-left transition-all',
                selectedPlan === plan.plan
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-secondary hover:border-accent/50',
              )}>
              {plan.isRecommended && (
                <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] text-amber-400 font-medium">
                  <Star className="w-2.5 h-2.5 fill-current" />REC
                </span>
              )}
              <p className="text-xs font-semibold text-text-primary">{plan.displayName}</p>
              <p className="text-[10px] text-text-muted mt-0.5">{plan.costPer1KArticlesUsd}/1K</p>
              <p className="text-[10px] text-sev-low mt-0.5">{plan.accuracyPct}</p>
            </button>
          ))}
        </div>
        {selectedPlan !== 'custom' && (
          <button
            onClick={handleApplyPlan}
            disabled={isDemo || applyPlanMutation.isPending}
            className="mt-2 text-[10px] px-3 py-1.5 rounded bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {applyPlanMutation.isPending ? 'Applying…' : `Apply ${plans.find(p => p.plan === selectedPlan)?.displayName ?? ''} Plan`}
          </button>
        )}
      </div>

      {/* Subtask table + cost sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* 12-subtask table */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[10px] text-text-muted uppercase font-medium mb-2">12 Pipeline Subtasks</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-bg-elevated border-b border-border">
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Subtask</th>
                  <th className="px-2 py-2 text-center text-text-muted font-medium">Stg</th>
                  <th className="px-2 py-2 text-left text-text-muted font-medium">Model</th>
                  <th className="px-2 py-2 text-left text-text-muted font-medium">Fallback</th>
                </tr>
              </thead>
              <tbody>
                {subtasks.map((m: SubtaskMapping, i: number) => {
                  const rec = recMap[m.subtask]
                  const isRec = m.model === rec
                  return (
                    <tr key={m.id}
                      className={cn('border-b border-border/50 last:border-0',
                        i % 2 === 0 ? 'bg-bg-secondary' : 'bg-bg-primary')}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-text-primary font-mono">{m.subtask.replace(/_/g, ' ')}</span>
                          {isRec && <Star className="w-2.5 h-2.5 text-amber-400 fill-current shrink-0" />}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={cn('text-[9px] px-1 py-0.5 rounded font-medium',
                          m.stage === 1 ? 'bg-accent/10 text-accent'
                          : m.stage === 2 ? 'bg-sev-medium/10 text-sev-medium'
                          : 'bg-sev-low/10 text-sev-low')}>
                          {STAGE_LABEL[m.stage]}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {selectedPlan === 'custom' ? (
                          <select
                            value={m.model}
                            disabled={isDemo || setSubtaskModelMutation.isPending}
                            onChange={e => setSubtaskModelMutation.mutate({ subtask: m.subtask, model: e.target.value })}
                            className="text-[10px] font-mono bg-bg-primary border border-border rounded px-1 py-0.5 text-text-primary disabled:opacity-50 capitalize">
                            {AI_MODELS.map(model => (
                              <option key={model} value={model} className="capitalize">{model}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={cn('font-mono font-medium capitalize', MODEL_COLOR[m.model])}>{m.model}</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className={cn('font-mono text-text-muted capitalize')}>{m.fallbackModel}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost sidebar */}
        <div className="lg:w-56 shrink-0 space-y-3">
          <h3 className="text-[10px] text-text-muted uppercase font-medium">Cost Estimator</h3>

          {/* Article slider */}
          <div className="p-3 bg-bg-secondary rounded-lg border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Articles/month</span>
              <span className="text-xs font-bold tabular-nums text-text-primary">{articleCount.toLocaleString()}</span>
            </div>
            <input type="range" min={100} max={50000} step={100} value={articleCount}
              onChange={e => setArticleCount(Number(e.target.value))}
              className="w-full h-1 accent-[var(--accent)]" />
            <div className="flex justify-between text-[9px] text-text-muted">
              <span>100</span><span>50K</span>
            </div>
          </div>

          {/* Per-stage breakdown */}
          {cost && (
            <div className="p-3 bg-bg-secondary rounded-lg border border-border space-y-2">
              {cost.perStage.map(s => (
                <div key={s.stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-[9px] px-1 py-0.5 rounded font-medium',
                      s.stage === 1 ? 'bg-accent/10 text-accent'
                      : s.stage === 2 ? 'bg-sev-medium/10 text-sev-medium'
                      : 'bg-sev-low/10 text-sev-low')}>
                      S{s.stage}
                    </span>
                    <span className={cn('text-[10px] font-mono capitalize', MODEL_COLOR[s.model])}>{s.model}</span>
                  </div>
                  <span className="text-[10px] tabular-nums text-text-primary">${s.costUsd.toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-border flex items-center justify-between">
                <span className="text-[10px] font-semibold text-text-primary">Total</span>
                <span className="text-sm font-bold tabular-nums text-accent">${cost.totalMonthlyUsd.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Compare to plans */}
          {cost && (
            <div className="p-3 bg-bg-secondary rounded-lg border border-border space-y-1.5">
              <p className="text-[9px] text-text-muted uppercase font-medium mb-1">vs other plans</p>
              {[
                { label: 'Starter', val: cost.comparedTo.starter, color: 'text-sev-low' },
                { label: 'Professional', val: cost.comparedTo.professional, color: 'text-accent' },
                { label: 'Enterprise', val: cost.comparedTo.enterprise, color: 'text-sev-critical' },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] text-text-muted">{label}</span>
                  <span className={cn('text-[10px] tabular-nums font-medium', color)}>${val.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Plan change confirmation modal */}
      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-primary border border-border rounded-xl shadow-xl p-5 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Apply {plans.find(p => p.plan === confirmPlan)?.displayName ?? confirmPlan} Plan?</h3>
            <p className="text-[11px] text-text-muted">
              This will overwrite all 12 subtask model assignments. Your current custom settings will be replaced.
            </p>
            {cost && (
              <div className="flex items-center justify-between p-2 bg-bg-secondary rounded border border-border">
                <span className="text-[10px] text-text-muted">Estimated monthly cost</span>
                <span className="text-sm font-bold text-accent tabular-nums">${cost.totalMonthlyUsd.toFixed(2)}</span>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmPlan(null)}
                className="flex-1 text-[11px] px-3 py-1.5 rounded border border-border text-text-muted hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button onClick={confirmAndApply} disabled={applyPlanMutation.isPending}
                className="flex-1 text-[11px] px-3 py-1.5 rounded bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {applyPlanMutation.isPending ? 'Applying…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProviderApiKeysCard />
    </div>
  )
}

// ─── Provider API Keys Card ──────────────────────────────────────

function ProviderApiKeysCard() {
  const { data: keyData, isDemo } = useAnthropicKeyStatus()
  const saveMutation = useSaveAnthropicKey()
  const deleteMutation = useDeleteAnthropicKey()
  const [keyInput, setKeyInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const status = keyData?.data
  const hasKey = status?.hasKey ?? false
  const maskedKey = status?.maskedKey ?? null

  const handleSave = () => {
    const trimmed = keyInput.trim()
    if (!trimmed || isDemo) return
    saveMutation.mutate(trimmed, { onSuccess: () => setKeyInput('') })
  }

  const handleDelete = () => {
    if (isDemo) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteMutation.mutate(undefined, { onSuccess: () => setConfirmDelete(false) })
  }

  return (
    <div className="p-4 bg-bg-secondary rounded-lg border border-border space-y-3">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-accent shrink-0" />
        <h3 className="text-xs font-semibold text-text-primary">Provider API Keys</h3>
      </div>

      {/* Anthropic key row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-secondary">Anthropic API Key</span>
          {hasKey
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-sev-low/10 text-sev-low font-medium">Configured</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-sev-medium/10 text-sev-medium font-medium">Using platform key</span>
          }
        </div>

        {hasKey ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-text-muted bg-bg-primary px-2 py-1 rounded border border-border font-mono truncate">
              {maskedKey}
            </code>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending || isDemo}
              aria-label="Remove Anthropic API key"
              className={cn(
                'flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-50',
                confirmDelete
                  ? 'border-sev-high text-sev-high hover:bg-sev-high/10'
                  : 'border-border text-text-muted hover:text-sev-high hover:border-sev-high',
              )}>
              <Trash2 className="w-3 h-3" />
              {confirmDelete ? 'Confirm remove' : 'Remove'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              disabled={isDemo}
              className="flex-1 text-[11px] bg-bg-primary border border-border rounded px-2 py-1 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={handleSave}
              disabled={!keyInput.trim() || saveMutation.isPending || isDemo}
              className="text-[10px] px-3 py-1 rounded bg-accent text-bg-primary font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {saveMutation.isPending ? 'Saving…' : 'Save Key'}
            </button>
          </div>
        )}

        {saveMutation.isError && (
          <p className="text-[10px] text-sev-high">
            Failed to save key — ensure it starts with &quot;sk-ant-&quot;
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Risk Weights Tab ───────────────────────────────────────────

function RiskWeightsTab({ weights, isDemo }: { weights: RiskWeight[]; isDemo: boolean }) {
  const updateMutation = useUpdateRiskWeight()
  const resetMutation = useResetRiskWeights()
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({})

  const getWeight = (w: RiskWeight) => localWeights[w.id] ?? w.weight
  const totalWeight = weights.reduce((sum, w) => sum + getWeight(w), 0)

  const handleChange = (w: RiskWeight, val: number) => {
    setLocalWeights(prev => ({ ...prev, [w.id]: val }))
  }

  const handleSave = (w: RiskWeight) => {
    const val = localWeights[w.id]
    if (val != null && val !== w.weight && !isDemo) {
      updateMutation.mutate({ id: w.id, weight: val })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-text-primary">Risk Score Weights</h3>
          <p className="text-[10px] text-text-muted mt-0.5">Adjust how each factor contributes to composite risk scores. Weights should sum to 1.0.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs tabular-nums font-medium',
            Math.abs(totalWeight - 1) < 0.01 ? 'text-sev-low' : 'text-sev-critical')}>
            Total: {totalWeight.toFixed(2)}
          </span>
          <button onClick={() => { setLocalWeights({}); if (!isDemo) resetMutation.mutate() }}
            disabled={isDemo || resetMutation.isPending}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-bg-elevated text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {weights.map(w => {
          const val = getWeight(w)
          return (
            <div key={w.id} className="p-3 bg-bg-secondary rounded-lg border border-border">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs font-medium text-text-primary">{w.factor}</span>
                  <p className="text-[10px] text-text-muted">{w.description}</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-accent">{val.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-text-muted tabular-nums w-6">{w.min}</span>
                <input type="range" min={w.min} max={w.max} step={0.01} value={val}
                  onChange={e => handleChange(w, parseFloat(e.target.value))}
                  onMouseUp={() => handleSave(w)} onTouchEnd={() => handleSave(w)}
                  className="flex-1 h-1 accent-[var(--accent)]" disabled={isDemo} />
                <span className="text-[10px] text-text-muted tabular-nums w-6">{w.max}</span>
              </div>
              {val !== w.default && (
                <div className="text-[10px] text-sev-medium mt-1">
                  Default: {w.default.toFixed(2)} (changed by {((val - w.default) * 100).toFixed(0)}%)
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Preview Panel */}
      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <h3 className="text-[10px] text-text-muted uppercase font-medium mb-2">Score Preview</h3>
        <p className="text-[10px] text-text-muted mb-2">Sample IOC with all factors at 0.8:</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tabular-nums text-text-primary">
            {(weights.reduce((sum, w) => sum + getWeight(w) * 0.8, 0) * 100).toFixed(0)}
          </span>
          <span className="text-[10px] text-text-muted">/ 100 composite score</span>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard Config Tab ───────────────────────────────────────

function DashboardConfigTab() {
  const [refreshInterval, setRefreshInterval] = useState('300')
  const [defaultDashboard, setDefaultDashboard] = useState('overview')

  return (
    <div className="space-y-4">
      <div className="p-4 bg-bg-secondary rounded-lg border border-border space-y-3">
        <h3 className="text-xs font-semibold text-text-primary">Dashboard Preferences</h3>

        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">Default Dashboard</label>
          <select className="w-full px-3 py-2 text-xs bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            value={defaultDashboard} onChange={e => setDefaultDashboard(e.target.value)}>
            <option value="overview">Overview Dashboard</option>
            <option value="soc">SOC Operations</option>
            <option value="threat-intel">Threat Intelligence</option>
            <option value="executive">Executive Summary</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-text-muted uppercase font-medium">Refresh Interval</label>
          <select className="w-full px-3 py-2 text-xs bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            value={refreshInterval} onChange={e => setRefreshInterval(e.target.value)}>
            <option value="60">Every minute</option>
            <option value="300">Every 5 minutes</option>
            <option value="900">Every 15 minutes</option>
            <option value="3600">Every hour</option>
            <option value="0">Manual only</option>
          </select>
        </div>
      </div>

      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <h3 className="text-xs font-semibold text-text-primary mb-2">Widget Layout</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {['IOC Summary', 'Alert Feed', 'Risk Score', 'Feed Status', 'AI Cost', 'Recent Activity'].map(widget => (
            <div key={widget} className="p-3 bg-bg-primary rounded border border-border border-dashed text-center">
              <Sliders className="w-4 h-4 mx-auto text-text-muted mb-1" />
              <span className="text-[10px] text-text-muted">{widget}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-2">Drag-and-drop layout editor coming in Phase 6.</p>
      </div>
    </div>
  )
}

// ─── Notifications Tab ──────────────────────────────────────────

function NotificationsTab({ channels, isDemo }: { channels: NotificationChannel[]; isDemo: boolean }) {
  const updateMutation = useUpdateNotificationChannel()
  const testMutation = useTestNotification()

  const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low']

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-text-primary">Alert Channels</h3>
        <p className="text-[10px] text-text-muted mt-0.5">Configure where and when notifications are delivered.</p>
      </div>

      {channels.map(ch => (
        <div key={ch.id} className="p-3 bg-bg-secondary rounded-lg border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-accent bg-accent/10 uppercase">{ch.type}</span>
              <span className="text-xs font-medium text-text-primary">{ch.name}</span>
            </div>
            <button
              onClick={() => { if (!isDemo) updateMutation.mutate({ id: ch.id, enabled: !ch.enabled }) }}
              disabled={isDemo || updateMutation.isPending}>
              {ch.enabled
                ? <ToggleRight className="w-5 h-5 text-sev-low" />
                : <ToggleLeft className="w-5 h-5 text-text-muted" />}
            </button>
          </div>

          {/* Severity routing */}
          <div className="space-y-1">
            <span className="text-[10px] text-text-muted">Severity Routing</span>
            <div className="flex items-center gap-1.5">
              {SEVERITY_OPTIONS.map(sev => (
                <button key={sev} type="button"
                  onClick={() => {
                    if (isDemo) return
                    const newSevs = ch.severities.includes(sev)
                      ? ch.severities.filter(s => s !== sev)
                      : [...ch.severities, sev]
                    updateMutation.mutate({ id: ch.id, severities: newSevs })
                  }}
                  disabled={isDemo || updateMutation.isPending}
                  className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                    ch.severities.includes(sev)
                      ? sev === 'critical' ? 'bg-sev-critical/10 text-sev-critical border-sev-critical/30'
                        : sev === 'high' ? 'bg-sev-high/10 text-sev-high border-sev-high/30'
                        : sev === 'medium' ? 'bg-sev-medium/10 text-sev-medium border-sev-medium/30'
                        : 'bg-sev-low/10 text-sev-low border-sev-low/30'
                      : 'bg-bg-elevated text-text-muted border-border')}>
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Quiet hours */}
          {(ch.quietHoursStart || ch.quietHoursEnd) && (
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <span>Quiet hours: {ch.quietHoursStart} — {ch.quietHoursEnd}</span>
            </div>
          )}

          {/* Test button */}
          <button
            onClick={() => { if (!isDemo) testMutation.mutate(ch.id) }}
            disabled={isDemo || testMutation.isPending || !ch.enabled}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
            <Send className="w-3 h-3" />
            {testMutation.isPending ? 'Sending…' : 'Test Notification'}
          </button>
        </div>
      ))}
    </div>
  )
}
