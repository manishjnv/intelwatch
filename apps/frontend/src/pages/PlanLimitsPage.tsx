/**
 * @module pages/PlanLimitsPage
 * @description Super admin page for managing plan tier resource limits.
 * DECISION-029 Phase D.
 */
import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { usePlanLimits, type PlanTierConfig } from '@/hooks/use-plan-limits'
import { cn } from '@/lib/utils'
import { Settings, Save, RotateCcw } from 'lucide-react'

const PLAN_COLORS: Record<string, string> = {
  Free: 'border-text-muted', Starter: 'border-sev-low',
  Teams: 'border-brand', Enterprise: 'border-purple-400',
}

const PLAN_BADGE_COLORS: Record<string, string> = {
  Free: 'bg-text-muted/20 text-text-muted', Starter: 'bg-sev-low/20 text-sev-low',
  Teams: 'bg-brand/20 text-brand', Enterprise: 'bg-purple-400/20 text-purple-400',
}

const INTERVAL_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
]

function displayValue(val: number): string {
  return val === -1 ? 'Unlimited' : String(val)
}

export function PlanLimitsPage() {
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'super_admin'
  const { plans, isLoading, isDemo, updatePlan, isUpdating, resetPlan, defaults } = usePlanLimits()

  const [edits, setEdits] = useState<Record<string, Partial<PlanTierConfig>>>({})

  const editField = (planId: string, field: keyof PlanTierConfig, value: number | boolean) => {
    setEdits(prev => ({
      ...prev,
      [planId]: { ...prev[planId], [field]: value },
    }))
  }

  const hasEdits = (planId: string) => {
    const e = edits[planId]
    return e && Object.keys(e).length > 0
  }

  const getCurrentValue = (plan: PlanTierConfig, field: keyof PlanTierConfig) => {
    const edit = edits[plan.id]
    return edit?.[field] !== undefined ? edit[field] : plan[field]
  }

  const handleSave = (planId: string) => {
    const changes = edits[planId]
    if (!changes) return
    updatePlan({ planId, changes })
    setEdits(prev => { const n = { ...prev }; delete n[planId]; return n })
  }

  const handleReset = (planId: string) => {
    resetPlan(planId)
    setEdits(prev => { const n = { ...prev }; delete n[planId]; return n })
  }

  const comparisonFeatures = useMemo(() => [
    { key: 'maxPrivateFeeds', label: 'Max Private Feeds' },
    { key: 'maxGlobalSubscriptions', label: 'Max Global Subscriptions' },
    { key: 'minFetchIntervalMinutes', label: 'Min Fetch Interval' },
    { key: 'retentionDays', label: 'Retention Days' },
    { key: 'aiEnabled', label: 'AI Enabled' },
    { key: 'dailyTokenBudget', label: 'Daily Token Budget' },
  ] as const, [])

  if (!isAdmin) {
    return (
      <div data-testid="plan-limits-page" className="flex items-center justify-center h-64">
        <p className="text-text-muted">Access restricted to super administrators.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div data-testid="plan-limits-page" className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 bg-bg-elevated rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div data-testid="plan-limits-page" className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings className="w-6 h-6 text-amber-400" /> Plan Tier Limits
        </h1>
        <p className="text-text-muted mt-1">
          Configure resource limits for each subscription tier. Changes apply immediately to all tenants on that plan.
        </p>
        {isDemo && (
          <span data-testid="demo-badge" className="inline-block mt-2 px-2 py-0.5 bg-amber-400/20 text-amber-400 rounded text-xs font-medium">
            DEMO MODE
          </span>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="plan-cards">
        {plans.map(plan => {
          const dirty = hasEdits(plan.id)
          return (
            <div
              key={plan.id}
              data-testid={`plan-card-${plan.id}`}
              className={cn(
                'p-4 rounded-lg border-2 bg-bg-elevated space-y-4 relative',
                PLAN_COLORS[plan.planName] ?? 'border-border',
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className={cn('px-2 py-0.5 rounded text-xs font-bold', PLAN_BADGE_COLORS[plan.planName] ?? '')}>
                  {plan.planName}
                </span>
                {dirty && <span data-testid={`unsaved-${plan.id}`} className="w-2.5 h-2.5 rounded-full bg-amber-400" title="Unsaved changes" />}
              </div>

              {/* Max Private Feeds */}
              <label className="block">
                <span className="text-xs text-text-muted">Max Private Feeds</span>
                <input
                  type="number"
                  data-testid={`field-${plan.id}-maxPrivateFeeds`}
                  value={getCurrentValue(plan, 'maxPrivateFeeds') as number}
                  onChange={e => editField(plan.id, 'maxPrivateFeeds', Number(e.target.value))}
                  className="mt-1 w-full bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary"
                />
                {(getCurrentValue(plan, 'maxPrivateFeeds') as number) === -1 && (
                  <span className="text-xs text-sev-low">Unlimited</span>
                )}
              </label>

              {/* Max Global Subscriptions */}
              <label className="block">
                <span className="text-xs text-text-muted">Max Global Subscriptions</span>
                <input
                  type="number"
                  data-testid={`field-${plan.id}-maxGlobalSubscriptions`}
                  value={getCurrentValue(plan, 'maxGlobalSubscriptions') as number}
                  onChange={e => editField(plan.id, 'maxGlobalSubscriptions', Number(e.target.value))}
                  className="mt-1 w-full bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary"
                />
              </label>

              {/* Min Fetch Interval */}
              <label className="block">
                <span className="text-xs text-text-muted">Min Fetch Interval</span>
                <select
                  data-testid={`field-${plan.id}-minFetchIntervalMinutes`}
                  value={getCurrentValue(plan, 'minFetchIntervalMinutes') as number}
                  onChange={e => editField(plan.id, 'minFetchIntervalMinutes', Number(e.target.value))}
                  className="mt-1 w-full bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary"
                >
                  {INTERVAL_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              {/* Retention Days */}
              <label className="block">
                <span className="text-xs text-text-muted">Retention Days</span>
                <input
                  type="number"
                  data-testid={`field-${plan.id}-retentionDays`}
                  value={getCurrentValue(plan, 'retentionDays') as number}
                  onChange={e => editField(plan.id, 'retentionDays', Number(e.target.value))}
                  className="mt-1 w-full bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary"
                />
                {(getCurrentValue(plan, 'retentionDays') as number) === -1 && (
                  <span className="text-xs text-sev-low">Unlimited</span>
                )}
              </label>

              {/* AI Enabled */}
              <label className="flex items-center gap-2">
                <span className="text-xs text-text-muted">AI Enabled</span>
                <button
                  data-testid={`field-${plan.id}-aiEnabled`}
                  onClick={() => editField(plan.id, 'aiEnabled', !(getCurrentValue(plan, 'aiEnabled') as boolean))}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    (getCurrentValue(plan, 'aiEnabled') as boolean) ? 'bg-brand' : 'bg-bg-primary border border-border',
                  )}
                >
                  <span className={cn(
                    'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                    (getCurrentValue(plan, 'aiEnabled') as boolean) ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </button>
              </label>

              {/* Daily Token Budget */}
              <label className="block">
                <span className="text-xs text-text-muted">Daily Token Budget</span>
                <input
                  type="number"
                  data-testid={`field-${plan.id}-dailyTokenBudget`}
                  value={getCurrentValue(plan, 'dailyTokenBudget') as number}
                  onChange={e => editField(plan.id, 'dailyTokenBudget', Number(e.target.value))}
                  className="mt-1 w-full bg-bg-primary border border-border rounded px-2 py-1 text-sm text-text-primary"
                />
                {(getCurrentValue(plan, 'dailyTokenBudget') as number) === -1 && (
                  <span className="text-xs text-sev-low">Unlimited</span>
                )}
              </label>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  data-testid={`save-${plan.id}`}
                  onClick={() => handleSave(plan.id)}
                  disabled={!dirty || isUpdating}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                    dirty ? 'bg-brand text-white hover:bg-brand/90' : 'bg-bg-primary text-text-muted cursor-not-allowed',
                  )}
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
                <button
                  data-testid={`reset-${plan.id}`}
                  onClick={() => handleReset(plan.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-text-muted hover:text-text-primary bg-bg-primary"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Comparison Table */}
      <section data-testid="comparison-table">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Plan Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 px-3">Feature</th>
                {plans.map(p => (
                  <th key={p.id} className="py-2 px-3">{p.planName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonFeatures.map(f => (
                <tr key={f.key} className="border-b border-border/50">
                  <td className="py-2 px-3 text-text-muted">{f.label}</td>
                  {plans.map(p => {
                    const val = p[f.key]
                    return (
                      <td key={p.id} className="py-2 px-3 text-text-primary">
                        {typeof val === 'boolean' ? (val ? '✓' : '✗') : displayValue(val as number)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
