/**
 * @module components/widgets/IocTrendWidget
 * 7-day IOC ingestion trend sparkline with total count.
 */
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { MiniSparkline } from '@/components/command-center/charts'
import { TrendingUp, ArrowRight } from 'lucide-react'

export function IocTrendWidget() {
  const navigate = useNavigate()
  const { iocTrend, isDemo } = useAnalyticsDashboard()

  const values = iocTrend.map(p => p.count)
  const total = values.reduce((s, v) => s + v, 0)
  const latest = values[values.length - 1] ?? 0
  const prev = values[values.length - 2] ?? 0
  const delta = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0

  return (
    <div
      data-testid="ioc-trend-widget"
      onClick={() => navigate('/iocs')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs font-medium text-text-primary">IOC Trend (7d)</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-lg font-bold text-text-primary tabular-nums">{total.toLocaleString()}</span>
          <span className="text-[10px] text-text-muted ml-1">total</span>
          {delta !== 0 && (
            <span className={`text-[10px] ml-2 ${delta > 0 ? 'text-sev-low' : 'text-sev-high'}`}>
              {delta > 0 ? '+' : ''}{delta}%
            </span>
          )}
        </div>
        <MiniSparkline values={values} width={80} height={24} />
      </div>
    </div>
  )
}
