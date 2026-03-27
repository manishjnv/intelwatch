/**
 * @module components/StalenessIndicator
 * @description Reusable data freshness indicator — shows colored dot + relative time.
 * Green (<5min), amber (5-15min), red (>15min). Click red to trigger refresh.
 * Compact variant for widget cards (dot + time only, tooltip on hover).
 */
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'

export interface StalenessIndicatorProps {
  lastUpdated: Date | string | number | null | undefined
  thresholds?: { amber: number; red: number } // minutes
  onRefresh?: () => void
  isRefreshing?: boolean
  compact?: boolean
}

const DEFAULT_THRESHOLDS = { amber: 5, red: 15 }

function getAgeMinutes(lastUpdated: Date | string | number | null | undefined): number | null {
  if (lastUpdated == null) return null
  const ts = typeof lastUpdated === 'number' ? lastUpdated : new Date(lastUpdated).getTime()
  if (isNaN(ts)) return null
  return (Date.now() - ts) / 60_000
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${Math.floor(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Updated ${hours}h ago`
  return `Updated ${Math.floor(hours / 24)}d ago`
}

function formatTimestamp(lastUpdated: Date | string | number): string {
  const d = new Date(typeof lastUpdated === 'number' ? lastUpdated : lastUpdated)
  return d.toLocaleString()
}

type Freshness = 'fresh' | 'stale' | 'very-stale' | 'unknown'

function getFreshness(ageMin: number | null, thresholds: { amber: number; red: number }): Freshness {
  if (ageMin == null) return 'unknown'
  if (ageMin >= thresholds.red) return 'very-stale'
  if (ageMin >= thresholds.amber) return 'stale'
  return 'fresh'
}

const DOT_COLORS: Record<Freshness, string> = {
  fresh: 'bg-sev-low',
  stale: 'bg-sev-medium animate-pulse',
  'very-stale': 'bg-sev-critical',
  unknown: 'bg-text-muted',
}

const TEXT_COLORS: Record<Freshness, string> = {
  fresh: 'text-sev-low',
  stale: 'text-sev-medium',
  'very-stale': 'text-sev-critical',
  unknown: 'text-text-muted',
}

export function StalenessIndicator({
  lastUpdated,
  thresholds = DEFAULT_THRESHOLDS,
  onRefresh,
  isRefreshing = false,
  compact = false,
}: StalenessIndicatorProps) {
  // Re-render every 30s to keep relative time fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(timer)
  }, [])

  const ageMin = getAgeMinutes(lastUpdated)
  const freshness = getFreshness(ageMin, thresholds)

  const ageText = ageMin != null ? formatAge(ageMin) : 'Last update unknown'
  const fullTimestamp = lastUpdated != null ? formatTimestamp(lastUpdated) : 'Unknown'

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1"
        title={fullTimestamp}
        data-testid="staleness-compact"
      >
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_COLORS[freshness])} />
        <span className={cn('text-[10px] tabular-nums', TEXT_COLORS[freshness])}>
          {ageMin != null ? (ageMin < 1 ? 'now' : `${Math.floor(ageMin)}m`) : '?'}
        </span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-[10px]" data-testid="staleness-indicator">
      <span className={cn('w-2 h-2 rounded-full shrink-0', DOT_COLORS[freshness])} />
      <span className={cn(TEXT_COLORS[freshness])}>{ageText}</span>
      {freshness === 'very-stale' && onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-sev-critical hover:underline font-medium disabled:opacity-50"
          data-testid="staleness-refresh-cta"
        >
          — click to refresh
        </button>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-0.5 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-accent disabled:opacity-50"
          data-testid="staleness-refresh"
          aria-label="Refresh data"
        >
          <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
        </button>
      )}
    </div>
  )
}
