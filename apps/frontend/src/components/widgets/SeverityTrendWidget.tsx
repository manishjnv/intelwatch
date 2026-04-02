/**
 * @module components/widgets/SeverityTrendWidget
 * 7-day severity distribution trend — multi-line sparklines for critical/high/medium/low.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { MiniSparkline } from '@/components/command-center/charts'
import { ArrowRight, TrendingUp } from 'lucide-react'

const SEVERITY_CONFIG = [
  { key: 'critical', label: 'Crit', color: 'var(--sev-critical)', dot: 'bg-sev-critical' },
  { key: 'high', label: 'High', color: 'var(--sev-high)', dot: 'bg-sev-high' },
  { key: 'medium', label: 'Med', color: 'var(--sev-medium)', dot: 'bg-sev-medium' },
  { key: 'low', label: 'Low', color: 'var(--sev-low)', dot: 'bg-sev-low' },
] as const

export function SeverityTrendWidget() {
  const navigate = useNavigate()
  const { iocTrend, iocBySeverity, isDemo } = useAnalyticsDashboard()

  const series = useMemo(() => {
    // If iocTrend has breakdown per severity, use that directly
    const hasBreakdown = iocTrend.some(pt => pt.breakdown && Object.keys(pt.breakdown).length > 0)

    if (hasBreakdown) {
      return SEVERITY_CONFIG.map(sev => ({
        ...sev,
        values: iocTrend.map(pt => pt.breakdown?.[sev.key] ?? 0),
        total: iocTrend.reduce((sum, pt) => sum + (pt.breakdown?.[sev.key] ?? 0), 0),
      }))
    }

    // Fallback: distribute the total trend proportionally by severity ratio
    const totalBySev = Object.values(iocBySeverity).reduce((a, b) => a + b, 0) || 1
    return SEVERITY_CONFIG.map(sev => {
      const ratio = (iocBySeverity[sev.key] ?? 0) / totalBySev
      return {
        ...sev,
        values: iocTrend.map(pt => Math.round(pt.count * ratio)),
        total: iocBySeverity[sev.key] ?? 0,
      }
    })
  }, [iocTrend, iocBySeverity])

  if (iocTrend.length < 2) return null

  return (
    <div
      data-testid="severity-trend-widget"
      onClick={() => navigate('/iocs')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-xs font-medium text-text-primary">Severity Trend</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <div className="space-y-1.5">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
            <span className="text-[10px] text-text-muted w-7 shrink-0">{s.label}</span>
            <MiniSparkline values={s.values} width={60} height={14} color={s.color} />
            <span className="text-[10px] tabular-nums text-text-muted ml-auto shrink-0">
              {s.total.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
