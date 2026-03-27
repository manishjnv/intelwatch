/**
 * @module components/analytics/ExecutiveSummary
 * @description Top KPI cards row for the analytics dashboard.
 * Shows 8 stat cards with deltas, sparklines, and status indicators.
 */
import { cn } from '@/lib/utils'
import {
  Shield, Activity, Zap, Target, Brain, DollarSign, Bell, HeartPulse,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import type { AnalyticsDashboardData } from '@/hooks/use-analytics-dashboard'

// ─── Mini Sparkline ─────────────────────────────────────────────

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 56; const h = 20
  const d = points.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${(i / (points.length - 1)) * w},${h - ((v - min) / range) * h}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0 opacity-60">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Delta Badge ────────────────────────────────────────────────

function DeltaBadge({ value, invert }: { value: number; invert?: boolean }) {
  const isUp = value > 0
  const isDown = value < 0
  const color = invert
    ? (isUp ? 'text-sev-critical' : isDown ? 'text-sev-low' : 'text-text-muted')
    : (isUp ? 'text-sev-low' : isDown ? 'text-sev-critical' : 'text-text-muted')
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
  return (
    <span className={cn('flex items-center gap-0.5 text-[10px]', color)}>
      <Icon className="w-3 h-3" />
      {value !== 0 && <>{isUp ? '+' : ''}{value}</>}
    </span>
  )
}

// ─── Progress Ring ──────────────────────────────────────────────

function ProgressRing({ pct, size = 28, color }: { pct: number; size?: number; color: string }) {
  const r = (size - 4) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={3} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  )
}

// ─── KPI Card ───────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.FC<{ className?: string }>
  delta?: number
  invertDelta?: boolean
  sparkline?: number[]
  badge?: React.ReactNode
  color?: string
  testId?: string
  onClick?: () => void
}

function KpiCard({ label, value, icon: Icon, delta, invertDelta, sparkline, badge, color, testId, onClick }: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'p-3 bg-bg-secondary rounded-lg border border-border',
        'hover:border-accent/30 transition-colors cursor-pointer',
        'flex flex-col justify-between min-h-[90px]',
      )}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span>
        <Icon className={cn('w-3.5 h-3.5', color ?? 'text-accent')} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-text-primary tabular-nums">{value}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {delta !== undefined && <DeltaBadge value={delta} invert={invertDelta} />}
            {badge}
          </div>
        </div>
        {sparkline && <MiniSparkline points={sparkline} />}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

interface ExecutiveSummaryProps {
  data: AnalyticsDashboardData
  isDemo?: boolean
  onNavigate?: (section: string) => void
}

export function ExecutiveSummary({ data, isDemo, onNavigate }: ExecutiveSummaryProps) {
  const { summary, iocTrend, feedHealth, costStats } = data

  const activeFeedCount = feedHealth.filter(f => f.status === 'active').length
  const totalFeedCount = feedHealth.length || summary.totalFeeds
  const feedPct = totalFeedCount > 0 ? Math.round((activeFeedCount / totalFeedCount) * 100) : 100
  const feedHasFailure = feedHealth.some(f => f.status !== 'active')
  const enrichPct = summary.totalIocs > 0
    ? Math.round((data.enrichmentStats.enriched / (data.enrichmentStats.enriched + data.enrichmentStats.unenriched)) * 100)
    : summary.avgEnrichmentQuality

  const activeThreats = (data.iocBySeverity.critical ?? 0) + (data.iocBySeverity.high ?? 0)
  const iocSparkline = iocTrend.map(p => p.count)
  const costTrend = costStats.trend.map(t => t.cost)

  const confTier = summary.avgConfidence >= 80 ? 'High'
    : summary.avgConfidence >= 50 ? 'Medium' : 'Low'
  const confColor = confTier === 'High' ? 'text-sev-low' : confTier === 'Medium' ? 'text-sev-medium' : 'text-sev-critical'

  const budgetLimit = 50 // $50/mo default
  const costColor = costStats.totalCostUsd > budgetLimit ? 'text-sev-critical'
    : costStats.totalCostUsd > budgetLimit * 0.8 ? 'text-sev-medium' : 'text-sev-low'

  const nav = (s: string) => () => onNavigate?.(s)

  return (
    <section data-testid="executive-summary" className="space-y-2">
      {isDemo && (
        <div className="p-1.5 bg-accent/5 border border-accent/20 rounded text-[10px] text-accent">
          Demo data — connect services for live metrics
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <KpiCard testId="kpi-total-iocs" label="Total IOCs" value={summary.totalIocs.toLocaleString()}
          icon={Shield} sparkline={iocSparkline} delta={iocTrend.length > 1 ? iocTrend[iocTrend.length - 1].count - iocTrend[0].count : 0}
          onClick={nav('ioc-distribution')} />

        <KpiCard testId="kpi-active-threats" label="Active Threats" value={activeThreats.toLocaleString()}
          icon={Target} color="text-sev-critical" delta={0} invertDelta
          onClick={nav('top-iocs')} />

        <KpiCard testId="kpi-feed-health" label="Feed Health"
          value={`${activeFeedCount}/${totalFeedCount}`}
          icon={HeartPulse} color={feedHasFailure ? 'text-sev-critical' : 'text-sev-low'}
          badge={<ProgressRing pct={feedPct} color={feedHasFailure ? 'var(--sev-critical)' : 'var(--sev-low)'} />}
          onClick={nav('feed-health')} />

        <KpiCard testId="kpi-throughput" label="Throughput" value={`${summary.pipelineThroughput}/hr`}
          icon={Zap} color="text-accent" onClick={nav('trends')} />

        <KpiCard testId="kpi-confidence" label="Avg Confidence" value={`${summary.avgConfidence}%`}
          icon={Brain}
          badge={<span className={cn('text-[9px] px-1 py-0.5 rounded-full font-medium', confColor, `bg-current/10`)}>{confTier}</span>}
          onClick={nav('confidence')} />

        <KpiCard testId="kpi-enrichment" label="Enrichment" value={`${enrichPct}%`}
          icon={Activity} color="text-sev-low"
          badge={<div className="w-12 h-1.5 rounded-full bg-bg-elevated overflow-hidden"><div className="h-full bg-sev-low rounded-full" style={{ width: `${enrichPct}%` }} /></div>}
          onClick={nav('enrichment')} />

        <KpiCard testId="kpi-ai-cost" label="AI Cost (30d)" value={`$${costStats.totalCostUsd.toFixed(2)}`}
          icon={DollarSign} color={costColor} sparkline={costTrend}
          onClick={nav('cost')} />

        <KpiCard testId="kpi-alerts" label="Alerts (24h)" value={summary.totalAlerts.toString()}
          icon={Bell} color="text-sev-medium"
          badge={
            <div className="flex gap-0.5">
              {Object.entries(data.iocBySeverity).slice(0, 4).map(([sev, count]) => (
                <div key={sev} className={cn('h-2 rounded-sm min-w-[3px]', `bg-sev-${sev}`)}
                  style={{ width: `${Math.max(3, Math.min(16, count / 50))}px` }}
                  title={`${sev}: ${count}`} />
              ))}
            </div>
          }
          onClick={nav('alerts')} />
      </div>
    </section>
  )
}
