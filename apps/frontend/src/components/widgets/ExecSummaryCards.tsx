/**
 * @module widgets/ExecSummaryCards
 * @description 3 large executive summary cards — Risk Posture, Top Threats, Feed Coverage.
 * Shown in executive dashboard view. All data from useAnalyticsDashboard.
 */
import { useMemo } from 'react'
import { Shield, AlertTriangle, Radio, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'

/* ── Risk Posture ───────────────────────────────────────────────── */

interface RiskLevel { label: string; color: string; bg: string; border: string }

const RISK_LEVELS: Record<string, RiskLevel> = {
  critical: { label: 'Critical', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  high:     { label: 'High',     color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  medium:   { label: 'Medium',   color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  low:      { label: 'Low',      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
}

function deriveRiskLevel(severity: Record<string, number>): string {
  const critical = severity.critical ?? 0
  const high = severity.high ?? 0
  if (critical > 20) return 'critical'
  if (critical > 5 || high > 50) return 'high'
  if (critical > 0 || high > 10) return 'medium'
  return 'low'
}

/* ── Component ──────────────────────────────────────────────────── */

export function ExecSummaryCards() {
  const {
    iocBySeverity, iocTrend, topActors, topCves, summary, feedHealth, isDemo,
  } = useAnalyticsDashboard()

  const data = useMemo(() => {
    // Risk posture
    const riskKey = deriveRiskLevel(iocBySeverity)
    const risk = RISK_LEVELS[riskKey]

    // Trend
    const pts = iocTrend.slice(-2)
    const today = pts[1]?.count ?? pts[0]?.count ?? 0
    const yesterday = pts.length > 1 ? pts[0].count : today
    const pctChange = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0

    // Top threats (plain English)
    const threats = [
      ...topActors.slice(0, 2).map(a => `${a.name} — ${a.iocCount} indicators linked`),
      ...topCves.slice(0, 1).map(c => `${c.id} — EPSS ${Math.round(c.epss * 100)}% exploitation probability`),
    ]

    // Feed coverage
    const activeFeedCount = summary.totalFeeds
    const avgReliability = feedHealth.length > 0
      ? Math.round(feedHealth.reduce((s, f) => s + f.reliability, 0) / feedHealth.length)
      : 0

    const criticalTotal = (iocBySeverity.critical ?? 0) + (iocBySeverity.high ?? 0)
    const riskSummary = criticalTotal > 0
      ? `${criticalTotal} critical/high severity indicators require attention.`
      : 'No critical indicators detected. Posture is stable.'

    return { risk, riskKey, pctChange, threats, activeFeedCount, avgReliability, riskSummary }
  }, [iocBySeverity, iocTrend, topActors, topCves, summary, feedHealth])

  const trendIcon = data.pctChange > 5
    ? <TrendingUp className="w-4 h-4 text-red-400" />
    : data.pctChange < -5
    ? <TrendingDown className="w-4 h-4 text-green-400" />
    : <Minus className="w-4 h-4 text-text-muted" />

  return (
    <div data-testid="exec-summary-cards" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* Card 1: Risk Posture */}
      <div className={`p-5 rounded-xl border ${data.risk.bg} ${data.risk.border}`}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Risk Posture</span>
          {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent ml-auto">Demo</span>}
        </div>
        <div className="flex items-center gap-3 mb-2">
          <span className={`text-2xl font-bold ${data.risk.color}`}>{data.risk.label}</span>
          {trendIcon}
        </div>
        <p className="text-xs text-text-secondary">{data.riskSummary}</p>
      </div>

      {/* Card 2: Top 3 Threats */}
      <div className="p-5 rounded-xl border border-border bg-bg-secondary">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-orange-400" />
          <span className="text-sm font-medium text-text-primary">Top Threats</span>
        </div>
        {data.threats.length === 0 ? (
          <p className="text-xs text-text-muted">No active threats detected</p>
        ) : (
          <ol className="space-y-2">
            {data.threats.map((t, i) => (
              <li key={i} className="flex gap-2 text-xs text-text-secondary">
                <span className="text-text-muted shrink-0">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Card 3: Feed Coverage */}
      <div className="p-5 rounded-xl border border-border bg-bg-secondary">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-5 h-5 text-green-400" />
          <span className="text-sm font-medium text-text-primary">Feed Coverage</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-text-primary tabular-nums">{data.activeFeedCount}</span>
            <span className="text-xs text-text-muted">active feeds</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-bg-elevated rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${data.avgReliability}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary tabular-nums">{data.avgReliability}%</span>
          </div>
          <p className="text-[10px] text-text-muted">Average feed reliability</p>
        </div>
      </div>
    </div>
  )
}
