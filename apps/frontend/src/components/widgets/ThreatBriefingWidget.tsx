/**
 * @module widgets/ThreatBriefingWidget
 * @description "What changed in 24h" — full-width daily briefing panel.
 * Derives all data from useAnalyticsDashboard, no backend calls.
 */
import { useMemo } from 'react'
import { AlertTriangle, ShieldAlert, UserX, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'

/* ── Helpers ─────────────────────────────────────────────────────── */

function trendArrow(pctChange: number) {
  if (pctChange > 5) return { icon: <TrendingUp className="w-3 h-3" />, color: 'text-red-400', label: `↑${Math.round(pctChange)}%` }
  if (pctChange < -5) return { icon: <TrendingDown className="w-3 h-3" />, color: 'text-green-400', label: `↓${Math.abs(Math.round(pctChange))}%` }
  return { icon: <Minus className="w-3 h-3" />, color: 'text-text-muted', label: 'Stable' }
}

/* ── Component ──────────────────────────────────────────────────── */

interface Props { profile: { industry?: string } | null }

export function ThreatBriefingWidget({ profile }: Props) {
  const { iocBySeverity, topCves, topActors, iocTrend, isDemo } = useAnalyticsDashboard()

  const stats = useMemo(() => {
    // Critical IOC count
    const criticalCount = iocBySeverity.critical ?? 0

    // Top CVE EPSS
    const topCve = topCves[0]
    const cveCount = topCves.length
    const topEpss = topCve ? Math.round(topCve.epss * 100) : 0

    // Most active actor
    const activeActor = topActors[0]

    // Severity trend: compare last two iocTrend points
    const trend = iocTrend.slice(-2)
    const today = trend[1]?.count ?? trend[0]?.count ?? 0
    const yesterday = trend.length > 1 ? trend[0].count : today
    const pctChange = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0

    return { criticalCount, cveCount, topEpss, activeActor, pctChange }
  }, [iocBySeverity, topCves, topActors, iocTrend])

  const trend = trendArrow(stats.pctChange)

  return (
    <div data-testid="threat-briefing-widget" className="mb-6 p-3 bg-bg-secondary rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-text-primary">Today&apos;s Briefing</span>
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
      </div>

      {/* Stat pills grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* Critical IOCs */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-elevated border border-border">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted">Critical IOCs</p>
            <p className="text-sm font-bold text-text-primary tabular-nums">{stats.criticalCount}</p>
          </div>
        </div>

        {/* New CVEs */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-elevated border border-border">
          <ShieldAlert className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted">CVEs Tracked</p>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {stats.cveCount}
              {stats.topEpss > 0 && <span className="text-[9px] text-orange-400 ml-1">EPSS {stats.topEpss}%</span>}
            </p>
          </div>
        </div>

        {/* Most Active Actor */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-elevated border border-border">
          <UserX className="w-3.5 h-3.5 text-red-300 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted">Top Actor</p>
            <p className="text-xs font-medium text-text-primary truncate">
              {stats.activeActor?.name ?? 'None'}
            </p>
          </div>
        </div>

        {/* Severity Trend */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-elevated border border-border">
          <span className={trend.color}>{trend.icon}</span>
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted">IOC Trend</p>
            <p className={`text-sm font-bold tabular-nums ${trend.color}`}>{trend.label}</p>
          </div>
        </div>

        {/* Org Threat (conditional) */}
        {profile?.industry ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-accent/5 border border-accent/20">
            <Target className="w-3.5 h-3.5 text-accent shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-text-muted">Your Industry</p>
              <p className="text-[10px] font-medium text-accent truncate">
                {stats.criticalCount > 0 ? `${stats.criticalCount} threats` : 'Monitoring'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-elevated border border-border">
            <Target className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-text-muted">Org Profile</p>
              <p className="text-[10px] text-text-muted">Not set</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
