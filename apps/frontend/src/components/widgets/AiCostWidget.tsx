/**
 * @module components/widgets/AiCostWidget
 * @description AI cost summary widget for the Dashboard.
 * Shows 30-day spend, delta, budget gauge, model breakdown, and per-unit costs.
 */
import { useNavigate } from 'react-router-dom'
import { useAiCostSummary } from '@/hooks/use-enrichment-data'
import { ArrowRight, DollarSign } from 'lucide-react'

export function AiCostWidget() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useAiCostSummary()

  const showScalars = !isLoading && !isError && data != null
  const models = showScalars ? Object.entries(data.byModel) : []
  const totalModelCost = models.reduce((s, [, v]) => s + v, 0) || 1

  return (
    <div
      data-testid="ai-cost-widget"
      onClick={() => navigate('/global-ai-config')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-text-primary">AI Cost</span>
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      {/* Total cost */}
      <div className="flex items-baseline gap-2 mb-2">
        <span data-testid="total-cost" className="text-lg font-bold text-text-primary tabular-nums">
          {showScalars ? `$${data.totalCostUsd.toFixed(2)}` : '—'}
        </span>
      </div>

      {!showScalars && (
        <div className="text-[10px] text-text-muted mb-2">
          {isError ? 'Failed to load' : isLoading ? 'Loading…' : 'No cost data yet'}
        </div>
      )}

      {/* Model breakdown */}
      {models.length > 0 && (
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
      )}

      {/* Per-unit costs */}
      {showScalars && (
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
      )}
    </div>
  )
}
