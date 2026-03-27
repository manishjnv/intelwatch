/**
 * @module components/analytics/TrendCharts
 * @description Time series charts section — IOC trend, severity bars,
 * alert activity, feed contribution, AI cost trend.
 * Uses SVG-based charts (no external chart library).
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import type { AnalyticsDashboardData, TrendPoint, DateRangePreset } from '@/hooks/use-analytics-dashboard'

// ─── Shared Chart Utils ─────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', info: '#6b7280',
}
const FEED_COLORS: Record<string, string> = {
  RSS: '#3b82f6', NVD: '#10b981', STIX: '#8b5cf6', REST: '#f97316', MISP: '#ef4444',
}

function ChartSkeleton() {
  return (
    <div className="h-[180px] bg-bg-elevated rounded-lg animate-pulse flex items-center justify-center" data-testid="chart-skeleton">
      <span className="text-text-muted text-[10px]">Loading chart...</span>
    </div>
  )
}

function ChartCard({ title, help, children, testId }: {
  title: string; help?: string; children: React.ReactNode; testId: string
}) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border" data-testid={testId}>
      <div className="flex items-center gap-1.5 mb-3">
        <h4 className="text-xs font-semibold text-text-primary">{title}</h4>
        {help && <TooltipHelp message={help} />}
      </div>
      {children}
    </div>
  )
}

// ─── Area Chart (IOC Trend) ─────────────────────────────────────

function AreaChart({ points, height = 160 }: { points: TrendPoint[]; height?: number }) {
  if (points.length < 2) return <div className="text-[10px] text-text-muted text-center py-8">Insufficient data</div>
  const w = 100; const h = height
  const vals = points.map(p => p.count)
  const max = Math.max(...vals) || 1; const min = Math.min(...vals)
  const range = max - min || 1
  const [hover, setHover] = useState<number | null>(null)

  const coords = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * w,
    y: h - 20 - ((v - min) / range) * (h - 30),
  }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const areaPath = `${linePath} L${w},${h - 20} L0,${h - 20} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height }}
      data-testid="area-chart">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaFill)" />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
      {/* X-axis labels */}
      {points.filter((_, i) => i % Math.ceil(points.length / 5) === 0 || i === points.length - 1).map((p, idx) => {
        const ci = points.indexOf(p)
        return (
          <text key={idx} x={coords[ci].x} y={h - 4} textAnchor="middle"
            className="fill-text-muted" style={{ fontSize: '4px' }}>
            {p.date.slice(5)}
          </text>
        )
      })}
      {/* Hover targets */}
      {coords.map((c, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <rect x={c.x - 3} y={0} width={6} height={h} fill="transparent" />
          {hover === i && (
            <>
              <circle cx={c.x} cy={c.y} r={2} fill="var(--accent)" />
              <text x={c.x} y={c.y - 5} textAnchor="middle" className="fill-text-primary" style={{ fontSize: '4px', fontWeight: 700 }}>
                {vals[i]}
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

// ─── Stacked Bar Chart (Severity Over Time) ─────────────────────

function SeverityBars({ data }: { data: AnalyticsDashboardData }) {
  const { iocBySeverity } = data
  const total = Object.values(iocBySeverity).reduce((a, b) => a + b, 0) || 1
  const entries = Object.entries(iocBySeverity)

  return (
    <div className="space-y-1.5" data-testid="severity-bars">
      {entries.map(([sev, count]) => {
        const pct = (count / total) * 100
        return (
          <div key={sev} className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-14 text-right capitalize">{sev}</span>
            <div className="flex-1 h-3 bg-bg-elevated rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: SEV_COLORS[sev] ?? '#6b7280' }}
                data-testid={`sev-bar-${sev}`} />
            </div>
            <span className="text-[10px] text-text-muted tabular-nums w-10">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Alert Line Chart ───────────────────────────────────────────

function AlertChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return <div className="text-[10px] text-text-muted text-center py-8">No alert data</div>
  const w = 100; const h = 80
  const vals = points.map(p => p.count)
  const max = Math.max(...vals) || 1
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length

  const coords = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * w,
    y: h - 12 - (v / max) * (h - 20),
  }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const avgY = h - 12 - (avg / max) * (h - 20)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}
      data-testid="alert-chart">
      <line x1={0} y1={avgY} x2={w} y2={avgY} stroke="var(--sev-medium)" strokeWidth="0.5" strokeDasharray="2,2" />
      <text x={w - 1} y={avgY - 2} textAnchor="end" className="fill-text-muted" style={{ fontSize: '3px' }}>avg</text>
      <path d={linePath} fill="none" stroke="var(--sev-high)" strokeWidth="1" strokeLinecap="round" />
      {/* Highlight spikes */}
      {coords.map((c, i) => vals[i] > avg * 2 && (
        <circle key={i} cx={c.x} cy={c.y} r={1.5} fill="var(--sev-critical)" />
      ))}
      {points.map((p, i) => (i % Math.ceil(points.length / 5) === 0 || i === points.length - 1) && (
        <text key={i} x={coords[i].x} y={h - 2} textAnchor="middle"
          className="fill-text-muted" style={{ fontSize: '3.5px' }}>
          {p.date.slice(5)}
        </text>
      ))}
    </svg>
  )
}

// ─── Feed Contribution (Horizontal Bars) ────────────────────────

function FeedBars({ feeds }: { feeds: AnalyticsDashboardData['feedHealth'] }) {
  const sorted = [...feeds].sort((a, b) => b.articlesPerDay - a.articlesPerDay).slice(0, 10)
  const maxVal = Math.max(...sorted.map(f => f.articlesPerDay)) || 1

  if (sorted.length === 0) return <div className="text-[10px] text-text-muted text-center py-8">No feed data</div>

  return (
    <div className="space-y-1" data-testid="feed-bars">
      {sorted.map(f => (
        <div key={f.name} className="flex items-center gap-2">
          <span className="text-[10px] text-text-primary truncate w-28" title={f.name}>{f.name}</span>
          <div className="flex-1 h-2.5 bg-bg-elevated rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(f.articlesPerDay / maxVal) * 100}%`, backgroundColor: FEED_COLORS[f.feedType] ?? '#6b7280' }} />
          </div>
          <span className="text-[10px] text-text-muted tabular-nums w-8 text-right">{f.articlesPerDay}</span>
          <span className="text-[9px] text-text-muted w-8">{f.feedType}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Cost Chart ─────────────────────────────────────────────────

function CostChart({ trend, budget = 50 }: { trend: { date: string; cost: number }[]; budget?: number }) {
  if (trend.length < 2) return <div className="text-[10px] text-text-muted text-center py-8">No cost data</div>
  const w = 100; const h = 80
  const vals = trend.map(t => t.cost)
  const max = Math.max(...vals, budget) * 1.1

  const coords = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * w,
    y: h - 12 - (v / max) * (h - 20),
  }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const areaPath = `${linePath} L${w},${h - 12} L0,${h - 12} Z`
  const budgetY = h - 12 - (budget / max) * (h - 20)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}
      data-testid="cost-chart">
      <defs>
        <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#costFill)" />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" />
      <line x1={0} y1={budgetY} x2={w} y2={budgetY} stroke="var(--sev-critical)" strokeWidth="0.5" strokeDasharray="2,2" data-testid="budget-line" />
      <text x={2} y={budgetY - 2} className="fill-text-muted" style={{ fontSize: '3px' }}>Budget ${budget}</text>
      {trend.map((t, i) => (i % Math.ceil(trend.length / 5) === 0 || i === trend.length - 1) && (
        <text key={i} x={coords[i].x} y={h - 2} textAnchor="middle"
          className="fill-text-muted" style={{ fontSize: '3.5px' }}>
          {t.date.slice(5)}
        </text>
      ))}
    </svg>
  )
}

// ─── Main Component ─────────────────────────────────────────────

interface TrendChartsProps {
  data: AnalyticsDashboardData
  isLoading?: boolean
  period: DateRangePreset
  onPeriodChange: (p: DateRangePreset) => void
}

export function TrendCharts({ data, isLoading, period, onPeriodChange }: TrendChartsProps) {
  return (
    <section data-testid="trend-charts" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">Trend Analysis</h3>
        <div className="flex gap-1">
          {(['24h', '7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => onPeriodChange(p)}
              className={cn('px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                period === p ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')}
              data-testid={`period-${p}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <ChartCard title="IOC Trend" help="IOC ingestion over time" testId="chart-ioc-trend">
          {isLoading ? <ChartSkeleton /> : <AreaChart points={data.iocTrend} />}
        </ChartCard>

        <ChartCard title="Severity Distribution" help="IOC count by severity level" testId="chart-severity">
          {isLoading ? <ChartSkeleton /> : <SeverityBars data={data} />}
        </ChartCard>

        <ChartCard title="Alert Activity" help="Alerts fired over time. Spikes highlighted." testId="chart-alerts">
          {isLoading ? <ChartSkeleton /> : <AlertChart points={data.alertTrend} />}
        </ChartCard>

        <ChartCard title="Feed Contribution" help="Top feeds by daily article count" testId="chart-feeds">
          {isLoading ? <ChartSkeleton /> : <FeedBars feeds={data.feedHealth} />}
        </ChartCard>

        <ChartCard title="AI Cost Trend" help="Daily AI enrichment cost with budget line" testId="chart-cost">
          {isLoading ? <ChartSkeleton /> : <CostChart trend={data.costStats.trend} />}
        </ChartCard>
      </div>
    </section>
  )
}
