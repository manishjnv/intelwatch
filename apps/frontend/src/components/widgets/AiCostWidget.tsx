/**
 * @module components/widgets/AiCostWidget
 * @description AI cost summary widget for the Dashboard.
 * Shows 30-day spend, delta, budget gauge, model breakdown, and per-unit costs.
 */
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAiCostSummary } from '@/hooks/use-enrichment-data'
import { ArrowRight, DollarSign, TrendingDown, TrendingUp } from 'lucide-react'

export function AiCostWidget() {
  const navigate = useNavigate()
  const { data, isDemo } = useAiCostSummary()

  if (!data || data.totalCost30d == null) return null

  const budgetColor = (data.budgetUtilization ?? 0) >= 90
    ? 'bg-sev-critical'
    : (data.budgetUtilization ?? 0) >= 70
      ? 'bg-sev-medium'
      : 'bg-sev-low'

  const deltaPositive = data.deltaPercent > 0
  const models = Object.entries(data.byModel)
  const totalModelCost = models.reduce((s, [, v]) => s + v, 0) || 1

  return (
    <div
      data-testid="ai-cost-widget"
      onClick={() => navigate('/global-ai-config')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-text-primary">AI Cost (30d)</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {/* Total cost + delta */}
      <div className="flex items-baseline gap-2 mb-2">
        <span data-testid="total-cost" className="text-lg font-bold text-text-primary tabular-nums">
          ${data.totalCost30d.toFixed(2)}
        </span>
        <span
          data-testid="delta-badge"
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-0.5',
            deltaPositive ? 'bg-sev-high/10 text-sev-high' : 'bg-sev-low/10 text-sev-low',
          )}
        >
          {deltaPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {deltaPositive ? '+' : ''}{data.deltaPercent}%
        </span>
      </div>

      {/* Budget gauge */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-text-muted">Budget</span>
          <span data-testid="budget-pct" className="text-[10px] tabular-nums text-text-secondary">
            {data.budgetUtilization}% of ${data.budgetMonthly.toFixed(0)}
          </span>
        </div>
        <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
          <div
            data-testid="budget-gauge"
            className={cn('h-full rounded-full transition-all', budgetColor)}
            style={{ width: `${Math.min(data.budgetUtilization, 100)}%` }}
          />
        </div>
      </div>

      {/* Model breakdown */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {models.map(([model, cost]) => (
          <div key={model} className="text-[10px]">
            <span className="text-text-muted">{model}: </span>
            <span className="text-text-primary font-medium tabular-nums">
              ${cost.toFixed(2)}
            </span>
            <span className="text-text-muted"> ({Math.round((cost / totalModelCost) * 100)}%)</span>
          </div>
        ))}
      </div>

      {/* Per-unit costs */}
      <div className="flex gap-4 pt-1.5 border-t border-border">
        <div className="text-[10px]">
          <span className="text-text-muted">Per article: </span>
          <span className="text-text-primary tabular-nums">${data.costPerArticle.toFixed(2)}</span>
        </div>
        <div className="text-[10px]">
          <span className="text-text-muted">Per IOC: </span>
          <span className="text-text-primary tabular-nums">${data.costPerIoc.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
