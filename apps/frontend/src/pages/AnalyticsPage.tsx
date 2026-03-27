/**
 * @module pages/AnalyticsPage
 * @description Executive-ready analytics dashboard — 3 vertical sections:
 * KPI cards, trend charts, intelligence breakdown.
 * Date range picker, CSV export, auto-refresh, section-level error boundaries.
 */
import { useState, useCallback, type ErrorInfo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useAnalyticsDashboard } from '@/hooks/use-analytics-dashboard'
import {
  useExecutiveSummary, useServiceHealth,
  type ServiceHealthEntry,
} from '@/hooks/use-analytics-data'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { ExecutiveSummary } from '@/components/analytics/ExecutiveSummary'
import { TrendCharts } from '@/components/analytics/TrendCharts'
import { IntelligenceBreakdown } from '@/components/analytics/IntelligenceBreakdown'
import {
  Download, AlertTriangle,
} from 'lucide-react'
import React from 'react'

// ─── Error Boundary ─────────────────────────────────────────────

class SectionErrorBoundary extends React.Component<
  { name: string; children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AnalyticsPage] ${this.props.name} error:`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-sev-critical/5 border border-sev-critical/20 rounded-lg" data-testid={`error-${this.props.name}`}>
          <div className="flex items-center gap-2 text-sev-critical text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Failed to load {this.props.name}</span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">{this.state.error?.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}

// StalenessIndicator imported from reusable component
import { StalenessIndicator } from '@/components/StalenessIndicator'

// ─── CSV Export ──────────────────────────────────────────────────

function exportCsv(data: ReturnType<typeof useAnalyticsDashboard>) {
  const lines: string[] = []

  // Summary
  lines.push('Section,Metric,Value')
  lines.push(`Summary,Total IOCs,${data.summary.totalIocs}`)
  lines.push(`Summary,Total Articles,${data.summary.totalArticles}`)
  lines.push(`Summary,Total Feeds,${data.summary.totalFeeds}`)
  lines.push(`Summary,Total Alerts,${data.summary.totalAlerts}`)
  lines.push(`Summary,Avg Confidence,${data.summary.avgConfidence}`)
  lines.push(`Summary,Pipeline Throughput,${data.summary.pipelineThroughput}`)
  lines.push('')

  // IOC by type
  lines.push('IOC Type,Count')
  Object.entries(data.iocByType).forEach(([t, c]) => lines.push(`${t},${c}`))
  lines.push('')

  // Feed health
  lines.push('Feed,Type,Reliability,Articles/Day,IOCs/Day,Status')
  data.feedHealth.forEach(f => lines.push(`${f.name},${f.feedType},${f.reliability},${f.articlesPerDay},${f.iocsPerDay},${f.status}`))
  lines.push('')

  // Cost
  lines.push('Cost Metric,Value')
  lines.push(`Total Cost USD,${data.costStats.totalCostUsd}`)
  lines.push(`Cost Per Article,${data.costStats.costPerArticle}`)
  lines.push(`Cost Per IOC,${data.costStats.costPerIoc}`)

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `etip-analytics-${data.dateRange.preset}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Auto-Refresh ───────────────────────────────────────────────

type RefreshInterval = 'off' | '5m' | '15m'

// ─── Main Component ─────────────────────────────────────────────

export function AnalyticsPage() {
  const dashboard = useAnalyticsDashboard('7d')
  const { data: exec } = useExecutiveSummary()
  const { data: services } = useServiceHealth()
  const [autoRefresh, setAutoRefresh] = useState<RefreshInterval>('off')

  // Auto-refresh effect
  React.useEffect(() => {
    if (autoRefresh === 'off') return
    const ms = autoRefresh === '5m' ? 300_000 : 900_000
    const timer = setInterval(() => dashboard.refetch(), ms)
    return () => clearInterval(timer)
  }, [autoRefresh, dashboard.refetch])

  const healthyCount = ((services ?? []) as ServiceHealthEntry[]).filter(s => s.status === 'healthy').length
  const totalServices = ((services ?? []) as ServiceHealthEntry[]).length

  const handleNavigate = useCallback((section: string) => {
    const el = document.querySelector(`[data-testid="panel-${section}"], [data-testid="chart-${section}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {dashboard.isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect Analytics Service for live metrics</span>
        </div>
      )}

      <PageStatsBar title="Threat Intelligence Analytics">
        <CompactStat label="Risk Score" value={exec?.riskScore?.toString() ?? '—'}
          color={exec?.riskPosture === 'critical' ? 'text-sev-critical' : exec?.riskPosture === 'high' ? 'text-sev-high' : 'text-sev-medium'} />
        <CompactStat label="IOCs" value={dashboard.summary.totalIocs.toLocaleString()} />
        <CompactStat label="Services" value={totalServices > 0 ? `${healthyCount}/${totalServices}` : '—'}
          color={healthyCount === totalServices ? 'text-sev-low' : 'text-sev-medium'} />
        <CompactStat label="Posture" value={exec?.riskPosture?.toUpperCase() ?? '—'} />
      </PageStatsBar>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
        <StalenessIndicator
          lastUpdated={dashboard.dataUpdatedAt}
          thresholds={{ amber: 60, red: 1440 }}
          onRefresh={() => dashboard.refetch()}
          isRefreshing={dashboard.isFetching}
        />
        <div className="ml-auto flex items-center gap-2">
          {/* Auto-refresh */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-muted">Auto:</span>
            {(['off', '5m', '15m'] as const).map(v => (
              <button key={v} onClick={() => setAutoRefresh(v)}
                className={cn('px-1.5 py-0.5 text-[10px] rounded transition-colors',
                  autoRefresh === v ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text-secondary')}
                data-testid={`auto-refresh-${v}`}>
                {v}
              </button>
            ))}
          </div>
          {/* Export */}
          <button onClick={() => exportCsv(dashboard)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted hover:text-accent border border-border rounded-md hover:border-accent/30 transition-colors"
            data-testid="export-csv">
            <Download className="w-3 h-3" />CSV
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted hover:text-accent border border-border rounded-md hover:border-accent/30 transition-colors"
            data-testid="export-pdf">
            <Download className="w-3 h-3" />PDF
          </button>
        </div>
      </div>

      {/* Content — 3 vertical sections */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <SectionErrorBoundary name="executive-summary">
          <ExecutiveSummary data={dashboard} isDemo={dashboard.isDemo} onNavigate={handleNavigate} />
        </SectionErrorBoundary>

        <SectionErrorBoundary name="trend-charts">
          <TrendCharts data={dashboard} isLoading={dashboard.isLoading}
            period={dashboard.dateRange.preset} onPeriodChange={dashboard.setPreset} />
        </SectionErrorBoundary>

        <SectionErrorBoundary name="intelligence-breakdown">
          <IntelligenceBreakdown data={dashboard} />
        </SectionErrorBoundary>
      </div>
    </div>
  )
}
