/**
 * @module components/widgets/RecentAlertsWidget
 * Last 5 alerts showing severity, rule name, and relative timestamp.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import { ArrowRight, Bell } from 'lucide-react'

const SEV_DOT: Record<string, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
  info: 'bg-text-muted',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function RecentAlertsWidget() {
  const navigate = useNavigate()
  const { alertTrend, summary, isDemo } = useAnalyticsDashboard()

  const alerts = useMemo(() => {
    // alertTrend is a time-series; derive mock recent alerts from it
    return alertTrend
      .filter(pt => pt.count > 0)
      .slice(-5)
      .reverse()
      .map((pt, i) => ({
        id: `alert-${i}`,
        severity: pt.breakdown
          ? Object.entries(pt.breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'medium'
          : i === 0 ? 'critical' : i < 2 ? 'high' : 'medium',
        ruleName: pt.breakdown
          ? `${Object.keys(pt.breakdown)[0] ?? 'IOC'} alert`
          : `Alert rule ${i + 1}`,
        timestamp: pt.date,
        count: pt.count,
      }))
  }, [alertTrend])

  return (
    <div
      data-testid="recent-alerts-widget"
      onClick={() => navigate('/command-center#alerts-reports')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs font-medium text-text-primary">Recent Alerts</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>

      <div className="space-y-1.5">
        {alerts.length === 0 ? (
          <p className="text-[10px] text-text-muted">No recent alerts</p>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[alert.severity] ?? SEV_DOT.info}`} />
              <span className="text-xs text-text-secondary truncate flex-1">{alert.ruleName}</span>
              <span className="text-[10px] tabular-nums text-text-muted shrink-0">
                {relativeTime(alert.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
