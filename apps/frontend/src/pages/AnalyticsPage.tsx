/**
 * @module pages/AnalyticsPage
 * @description Platform-wide analytics dashboard — 4 tabs:
 * Overview (widget grid), IOC Trends (line charts), Threat Landscape, Pipeline Health.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useAnalyticsWidgets, useAnalyticsTrends, useExecutiveSummary, useServiceHealth,
  type TrendSeries, type ServiceHealthEntry,
} from '@/hooks/use-analytics-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Shield, Activity,
  Server, AlertTriangle, CheckCircle, XCircle, HelpCircle,
  Clock, RefreshCw,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  critical: 'text-sev-critical bg-sev-critical/10',
  high: 'text-sev-high bg-sev-high/10',
  medium: 'text-sev-medium bg-sev-medium/10',
  low: 'text-sev-low bg-sev-low/10',
}

function TrendArrow({ direction, delta }: { direction: string; delta: number }) {
  if (direction === 'up') return <span className="flex items-center gap-0.5 text-sev-critical text-[10px]"><TrendingUp className="w-3 h-3" />+{Math.abs(delta).toFixed(1)}%</span>
  if (direction === 'down') return <span className="flex items-center gap-0.5 text-sev-low text-[10px]"><TrendingDown className="w-3 h-3" />-{Math.abs(delta).toFixed(1)}%</span>
  return <span className="flex items-center gap-0.5 text-text-muted text-[10px]"><Minus className="w-3 h-3" />0%</span>
}

function MiniSparkline({ points }: { points: { value: number }[] }) {
  if (points.length < 2) return null
  const vals = points.map(p => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const w = 80
  const h = 24
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Types ──────────────────────────────────────────────────────

type AnalyticsTab = 'overview' | 'trends' | 'landscape' | 'health'
const TABS: { key: AnalyticsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'trends', label: 'IOC Trends', icon: TrendingUp },
  { key: 'landscape', label: 'Threat Landscape', icon: Shield },
  { key: 'health', label: 'Pipeline Health', icon: Activity },
]

// ─── Tab: Overview ──────────────────────────────────────────────

function OverviewTab({ isDemo }: { isDemo: boolean }) {
  const { data: dashboard } = useAnalyticsWidgets()
  const widgets = useMemo(() => Object.values(dashboard?.widgets ?? {}), [dashboard])

  return (
    <div className="space-y-6">
      {isDemo && (
        <div className="p-2 bg-accent/5 border border-accent/20 rounded-md text-[10px] text-accent">
          Demo data — connect Analytics Service for live metrics
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="widget-grid">
        {widgets.map(w => (
          <div key={w.id} className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-accent/30 transition-colors">
            <div className="text-[10px] text-text-muted uppercase mb-1">{w.label}</div>
            <div className="text-lg font-bold text-text-primary tabular-nums">{w.value}</div>
            {w.trend && <TrendArrow direction={w.trend.direction} delta={w.trend.deltaPercent} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: IOC Trends ────────────────────────────────────────────

function TrendsTab() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d')
  const { data: trends } = useAnalyticsTrends(period)
  const series = trends?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-text-primary">Metric Trends</h3>
        <TooltipHelp message="Trend data captured by the analytics service at regular intervals. Toggle time range below." />
        <div className="ml-auto flex items-center gap-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('px-2 py-1 text-[10px] rounded-md font-medium transition-colors',
                period === p ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="trend-cards">
        {series.map((s: TrendSeries) => (
          <div key={s.metric} className="p-3 bg-bg-secondary rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
              <TrendArrow direction={s.direction} delta={s.deltaPercent} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-lg font-bold text-text-primary tabular-nums">{s.currentValue}</div>
                <div className="text-[10px] text-text-muted">prev: {s.previousValue}</div>
              </div>
              <MiniSparkline points={s.points} />
            </div>
          </div>
        ))}
      </div>
      {series.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No trend data available</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Threat Landscape ──────────────────────────────────────

function LandscapeTab() {
  const { data: exec } = useExecutiveSummary()
  if (!exec) return null

  const postureColor = SEV_COLORS[exec.riskPosture] ?? 'text-text-muted bg-bg-elevated'

  return (
    <div className="space-y-6" data-testid="landscape-tab">
      {/* Risk posture banner */}
      <div className="p-4 bg-bg-secondary rounded-lg border border-border flex items-center gap-4">
        <div className={cn('px-3 py-1.5 rounded-lg text-sm font-bold uppercase', postureColor)}>
          {exec.riskPosture}
        </div>
        <div>
          <div className="text-xs text-text-muted">Overall Risk Score</div>
          <div className="text-2xl font-bold text-text-primary tabular-nums">{exec.riskScore}<span className="text-sm text-text-muted">/100</span></div>
        </div>
        <div className="ml-auto text-[10px] text-text-muted">Generated {new Date(exec.generatedAt).toLocaleString()}</div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {exec.keyMetrics.map(m => (
          <div key={m.label} className="p-3 bg-bg-secondary rounded-lg border border-border">
            <div className="text-[10px] text-text-muted uppercase mb-1">{m.label}</div>
            <div className="text-lg font-bold text-text-primary tabular-nums">{m.value}</div>
            <div className="text-[10px] text-text-muted capitalize">{m.trend}</div>
          </div>
        ))}
      </div>

      {/* Top threats + recommendations side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-bg-secondary rounded-lg border border-border">
          <h4 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-sev-critical" />Top Threats
          </h4>
          <div className="space-y-2">
            {exec.topThreats.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-text-primary">{t.name}</span>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', SEV_COLORS[t.severity] ?? '')}>{t.severity}</span>
                  <span className="tabular-nums text-text-muted">{t.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 bg-bg-secondary rounded-lg border border-border">
          <h4 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-accent" />Recommendations
          </h4>
          <ul className="space-y-2">
            {exec.recommendations.map((r, i) => (
              <li key={i} className="text-[11px] text-text-secondary flex items-start gap-2">
                <span className="text-accent mt-0.5 shrink-0">→</span>{r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Pipeline Health ───────────────────────────────────────

function HealthTab() {
  const { data: services } = useServiceHealth()
  const items = (services ?? []) as ServiceHealthEntry[]
  const healthy = items.filter(s => s.status === 'healthy').length
  const total = items.length

  return (
    <div className="space-y-4" data-testid="health-tab">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold text-text-primary">Service Health Matrix</h3>
        <TooltipHelp message="Real-time health status of all ETIP microservices. Checks run every 60 seconds." />
        <span className="ml-auto text-[10px] text-text-muted">{healthy}/{total} healthy</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2" data-testid="health-grid">
        {items.map(s => {
          const isHealthy = s.status === 'healthy'
          const StatusIcon = isHealthy ? CheckCircle : s.status === 'unhealthy' ? XCircle : HelpCircle
          return (
            <div key={s.service} className={cn(
              'p-2.5 rounded-lg border transition-colors',
              isHealthy ? 'bg-bg-secondary border-border' : 'bg-sev-critical/5 border-sev-critical/20',
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                <StatusIcon className={cn('w-3 h-3', isHealthy ? 'text-sev-low' : 'text-sev-critical')} />
                <span className="text-[10px] font-medium text-text-primary truncate">{s.service}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-text-muted">
                <span>:{s.port}</span>
                {isHealthy
                  ? <span className="tabular-nums">{s.responseMs}ms</span>
                  : <span className="text-sev-critical">Down</span>
                }
              </div>
            </div>
          )
        })}
      </div>
      {items.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No service health data</p>
        </div>
      )}
    </div>
  )
}

// ─── Staleness Indicator ────────────────────────────────────────

function StalenessIndicator({ generatedAt, dataUpdatedAt, onRefresh, isRefreshing }: {
  generatedAt?: string; dataUpdatedAt?: number; onRefresh: () => void; isRefreshing: boolean
}) {
  const timestamp = generatedAt && generatedAt.length > 0
    ? new Date(generatedAt).getTime()
    : dataUpdatedAt ?? Date.now()
  const ageMs = Date.now() - timestamp
  const ageHours = ageMs / 3_600_000

  const label = new Date(timestamp).toLocaleString()
  const isAmber = ageHours >= 1 && ageHours < 24
  const isRed = ageHours >= 24

  const colorClass = isRed ? 'text-red-400' : isAmber ? 'text-amber-400' : 'text-text-muted'

  return (
    <div className="px-4 py-1 flex items-center gap-2 text-[10px]" data-testid="staleness-indicator">
      {isRed && <span className="text-red-400 font-medium">⚠ Stale data</span>}
      {(isAmber || isRed) && <Clock className={cn('w-3 h-3', colorClass)} />}
      <span className={colorClass}>Data as of {label}</span>
      <button onClick={onRefresh} disabled={isRefreshing}
        className="ml-1 p-0.5 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-accent disabled:opacity-50"
        data-testid="staleness-refresh" aria-label="Refresh analytics data">
        <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
      </button>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const { data: dashboard, isDemo, refetch, dataUpdatedAt, isFetching } = useAnalyticsWidgets()
  const { data: exec } = useExecutiveSummary()
  const { data: services } = useServiceHealth()

  const healthyCount = ((services ?? []) as ServiceHealthEntry[]).filter(s => s.status === 'healthy').length
  const totalServices = ((services ?? []) as ServiceHealthEntry[]).length
  const widgetCount = Object.keys(dashboard?.widgets ?? {}).length

  return (
    <div className="flex flex-col h-full">
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Analytics Service for live metrics</span>
        </div>
      )}

      <PageStatsBar title="Analytics">
        <CompactStat label="Risk Score" value={exec?.riskScore?.toString() ?? '—'} color={exec?.riskPosture === 'critical' ? 'text-sev-critical' : exec?.riskPosture === 'high' ? 'text-sev-high' : 'text-sev-medium'} />
        <CompactStat label="Widgets" value={widgetCount.toString()} />
        <CompactStat label="Services" value={totalServices > 0 ? `${healthyCount}/${totalServices}` : '—'} color={healthyCount === totalServices ? 'text-sev-low' : 'text-sev-medium'} />
        <CompactStat label="Posture" value={exec?.riskPosture?.toUpperCase() ?? '—'} />
      </PageStatsBar>

      <StalenessIndicator
        generatedAt={dashboard?.generatedAt}
        dataUpdatedAt={dataUpdatedAt}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      {/* Tab bar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              activeTab === key ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover')}>
            <Icon className="w-3 h-3" /><span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {activeTab === 'overview' && <OverviewTab isDemo={isDemo} />}
        {activeTab === 'trends' && <TrendsTab />}
        {activeTab === 'landscape' && <LandscapeTab />}
        {activeTab === 'health' && <HealthTab />}
      </div>
    </div>
  )
}
