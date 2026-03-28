/**
 * @module components/command-center/ConfigurationTab
 * @description Tab 2: Configuration — read-only view for tenant-admins.
 * Shows ManagedBanner, PlanBadge, ModelAssignmentsTable (read-only),
 * CostEstimator (slider → per-subtask breakdown), and free-tier variant.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import type { useGlobalAiConfig } from '@/hooks/use-global-ai-config'
import { Shield, Lock, Zap, Calculator, Info, TrendingUp } from 'lucide-react'

// ─── Provider color dots ───────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#8b5cf6',
  openai: '#10b981',
  google: '#f59e0b',
}

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: 'bg-text-muted/20 text-text-muted',
  starter: 'bg-sev-low/20 text-sev-low',
  teams: 'bg-accent/20 text-accent',
  enterprise: 'bg-purple-400/20 text-purple-400',
}

function formatSubtask(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getModelProvider(model: string): string {
  if (model === 'haiku' || model === 'sonnet' || model === 'opus') return 'anthropic'
  return 'anthropic' // fallback for legacy model names
}

function getModelDisplayName(model: string): string {
  const names: Record<string, string> = {
    haiku: 'Claude Haiku 4.5',
    sonnet: 'Claude Sonnet 4.6',
    opus: 'Claude Opus 4.6',
  }
  return names[model] ?? model
}

// Per-item cost estimate (simplified)
const MODEL_COSTS_PER_1K: Record<string, number> = {
  haiku: 0.0048,   // ~$0.80/M input + $4/M output, 1K+300 tokens
  sonnet: 0.0075,  // ~$3/M input + $15/M output
  opus: 0.0375,    // ~$15/M input + $75/M output
}

// ─── Types ─────────────────────────────────────────────────────

interface ConfigurationTabProps {
  data: ReturnType<typeof useCommandCenter>
  aiConfig: ReturnType<typeof useGlobalAiConfig>
}

const CATEGORY_LABELS: Record<string, string> = {
  news_feed: 'News Feed Processing',
  ioc_enrichment: 'IOC Enrichment',
  reporting: 'Reporting',
}

// ─── Free Tier View ────────────────────────────────────────────

function FreeTierView() {
  return (
    <div data-testid="configuration-tab" className="space-y-6 max-w-4xl">
      {/* AI Not Included Banner */}
      <div className="p-4 bg-sev-medium/10 border border-sev-medium/30 rounded-lg flex items-start gap-3">
        <Zap className="w-5 h-5 text-sev-medium shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-text-primary">AI Not Included</p>
          <p className="text-xs text-text-muted mt-1">
            AI-powered enrichment is not available on the Free tier.
            Upgrade to Starter or higher to unlock automated processing.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-brand/10 text-brand rounded-lg text-xs font-medium">
            <TrendingUp className="w-3 h-3" /> Upgrade Plan
          </div>
        </div>
      </div>

      {/* Placeholder table showing all Haiku (basic) */}
      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-text-muted" /> Model Assignments
        </h3>
        <p className="text-xs text-text-muted mb-3">All subtasks default to basic processing.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted text-xs">
              <th className="py-2 px-3">Subtask</th>
              <th className="py-2 px-3">Model</th>
            </tr>
          </thead>
          <tbody>
            {['Triage', 'Extraction', 'Classification', 'Summarization', 'Risk Scoring'].map(s => (
              <tr key={s} className="border-b border-border/50">
                <td className="py-2 px-3 text-xs text-text-primary">{s}</td>
                <td className="py-2 px-3 text-xs text-text-muted">Haiku (basic)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Configuration Tab ────────────────────────────────────

export function ConfigurationTab({ data, aiConfig }: ConfigurationTabProps) {
  const [articlesPerMonth, setArticlesPerMonth] = useState(5000)
  const plan = data.tenantPlan
  const isFree = plan === 'free'

  if (isFree) return <FreeTierView />

  const config = aiConfig.config
  const subtasks = config?.subtasks ?? []

  // Group by category
  const groupedSubtasks = useMemo(() => {
    const groups: Record<string, typeof subtasks> = {}
    for (const s of subtasks) {
      ;(groups[s.category] ??= []).push(s)
    }
    return groups
  }, [subtasks])

  // Cost estimator: per-subtask cost for N articles/month
  const costBreakdown = useMemo(() => {
    return subtasks.map(s => {
      const perItem = MODEL_COSTS_PER_1K[s.model] ?? MODEL_COSTS_PER_1K.haiku
      const monthlyCost = perItem * articlesPerMonth
      return { subtask: s.subtask, category: s.category, model: s.model, monthlyCost }
    })
  }, [subtasks, articlesPerMonth])

  const totalEstimate = costBreakdown.reduce((sum, c) => sum + c.monthlyCost, 0)

  return (
    <div data-testid="configuration-tab" className="space-y-6 max-w-5xl">
      {/* Managed Banner */}
      <div className="p-3 bg-bg-elevated border border-border rounded-lg flex items-center gap-3">
        <Lock className="w-4 h-4 text-text-muted shrink-0" />
        <div>
          <p className="text-sm text-text-primary font-medium">Managed by platform administrator</p>
          <p className="text-[10px] text-text-muted">
            Model assignments and AI configuration are managed globally. Contact your admin to request changes.
          </p>
        </div>
      </div>

      {/* Plan Badge */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted">Current Plan</span>
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize',
          PLAN_BADGE_COLORS[plan] ?? PLAN_BADGE_COLORS.starter)}>
          {plan}
        </span>
        <span className="text-[10px] text-text-muted ml-2 flex items-center gap-1">
          <Info className="w-3 h-3" /> Confidence model: {aiConfig.confidenceModel}
        </span>
      </div>

      {/* Model Assignments Table (read-only) */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" /> Model Assignments
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="model-assignments-readonly">
            <thead>
              <tr className="border-b border-border text-left text-text-muted text-xs">
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3">Subtask</th>
                <th className="py-2 px-3">Provider</th>
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedSubtasks).map(([category, items]) =>
                items.map((s, idx) => {
                  const provider = getModelProvider(s.model)
                  const accColor = s.accuracyPct >= 90 ? 'text-sev-low' : s.accuracyPct >= 80 ? 'text-sev-medium' : 'text-sev-high'
                  return (
                    <tr key={`${s.category}.${s.subtask}`} className="border-b border-border/50">
                      <td className="py-2 px-3 text-text-muted text-xs">
                        {idx === 0 ? (CATEGORY_LABELS[category] ?? category) : ''}
                      </td>
                      <td className="py-2 px-3 text-text-primary text-xs">{formatSubtask(s.subtask)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: PROVIDER_COLORS[provider] ?? '#6b7280' }} />
                          <span className="text-xs text-text-muted capitalize">{provider}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-text-primary">{getModelDisplayName(s.model)}</td>
                      <td className={cn('py-2 px-3 text-xs tabular-nums text-right', accColor)}>{s.accuracyPct}%</td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cost Estimator */}
      <section data-testid="cost-estimator">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-purple-400" /> Cost Estimator
        </h3>

        <div className="p-4 bg-bg-secondary rounded-lg border border-border space-y-4">
          {/* Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-muted">Articles per month</label>
              <span className="text-sm font-semibold text-text-primary tabular-nums">
                {articlesPerMonth.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              data-testid="articles-slider"
              min={100}
              max={50000}
              step={100}
              value={articlesPerMonth}
              onChange={e => setArticlesPerMonth(Number(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-brand bg-bg-elevated"
            />
            <div className="flex justify-between text-[9px] text-text-muted mt-1">
              <span>100</span>
              <span>50,000</span>
            </div>
          </div>

          {/* Per-subtask breakdown */}
          <div className="space-y-1">
            {costBreakdown.map(c => (
              <div key={`${c.category}.${c.subtask}`} className="flex items-center justify-between text-xs">
                <span className="text-text-muted">{formatSubtask(c.subtask)}</span>
                <span className="text-text-primary tabular-nums">${c.monthlyCost.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">Estimated Monthly Total</span>
            <span className="text-lg font-bold text-purple-400 tabular-nums">
              ${totalEstimate.toFixed(2)}
            </span>
          </div>

          <p className="text-[10px] text-text-muted">
            Estimate based on current model assignments. Actual costs may vary based on
            article complexity and token usage.
          </p>
        </div>
      </section>
    </div>
  )
}
