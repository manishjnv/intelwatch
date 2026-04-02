/**
 * @module components/dashboard/QuickActionsBar
 * Compact action bar: Export Report, Share Snapshot, Refresh All, Date Range.
 */
import { useState, useCallback } from 'react'
import { Download, Share2, RefreshCw, Calendar } from 'lucide-react'
import { useAnalyticsDashboard, type DateRangePreset } from '@/hooks/use-analytics-dashboard'
import { cn } from '@/lib/utils'

const DATE_PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
]

interface Props {
  summary: { totalIocs: number; totalAlerts: number; totalFeeds: number; avgConfidence: number }
}

export function QuickActionsBar({ summary }: Props) {
  const { dateRange, setPreset, refetch, isFetching } = useAnalyticsDashboard()
  const [copied, setCopied] = useState<string | null>(null)

  const showCopied = useCallback((label: string) => {
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const exportReport = useCallback(() => {
    const now = new Date().toLocaleDateString()
    const report = [
      `ETIP Dashboard Report — ${now}`,
      `Date range: ${dateRange.preset}`,
      ``,
      `Total IOCs: ${summary.totalIocs}`,
      `Active Alerts: ${summary.totalAlerts}`,
      `Active Feeds: ${summary.totalFeeds}`,
      `Avg Confidence: ${summary.avgConfidence}%`,
    ].join('\n')

    navigator.clipboard.writeText(report).then(
      () => showCopied('Report'),
      () => {},
    )
  }, [dateRange, summary, showCopied])

  const shareSnapshot = useCallback(() => {
    const url = `${window.location.origin}/dashboard?range=${dateRange.preset}`
    navigator.clipboard.writeText(url).then(
      () => showCopied('URL'),
      () => {},
    )
  }, [dateRange, showCopied])

  const refreshAll = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <div
      data-testid="quick-actions-bar"
      className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1"
    >
      {/* Export Report */}
      <button
        data-testid="action-export"
        onClick={exportReport}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
          bg-bg-secondary/60 border border-border/50 text-text-secondary
          hover:text-text-primary hover:border-border hover:bg-bg-secondary
          transition-all duration-150 shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        {copied === 'Report' ? 'Copied!' : 'Export'}
      </button>

      {/* Share Snapshot */}
      <button
        data-testid="action-share"
        onClick={shareSnapshot}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
          bg-bg-secondary/60 border border-border/50 text-text-secondary
          hover:text-text-primary hover:border-border hover:bg-bg-secondary
          transition-all duration-150 shrink-0"
      >
        <Share2 className="w-3.5 h-3.5" />
        {copied === 'URL' ? 'Copied!' : 'Share'}
      </button>

      {/* Refresh All */}
      <button
        data-testid="action-refresh"
        onClick={refreshAll}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
          bg-bg-secondary/60 border border-border/50 text-text-secondary
          hover:text-text-primary hover:border-border hover:bg-bg-secondary
          transition-all duration-150 shrink-0"
      >
        <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
        Refresh
      </button>

      {/* Spacer */}
      <div className="flex-1 min-w-2" />

      {/* Date Range Selector */}
      <div className="inline-flex items-center gap-0.5 bg-bg-secondary/60 border border-border/50 rounded-md p-0.5 shrink-0">
        <Calendar className="w-3.5 h-3.5 text-text-muted ml-1.5 mr-0.5" />
        {DATE_PRESETS.map(p => (
          <button
            key={p.value}
            data-testid={`range-${p.value}`}
            onClick={(e) => {
              e.stopPropagation()
              setPreset(p.value)
            }}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors',
              dateRange.preset === p.value
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
