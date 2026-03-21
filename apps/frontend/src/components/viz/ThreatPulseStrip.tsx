/**
 * @module components/viz/ThreatPulseStrip
 * @description Live threat pulse strip — horizontal scrolling ticker of
 * recent IOCs. Polls every 30s. P0-1.
 */
import { useState } from 'react'
import { useIOCs } from '@/hooks/use-intel-data'
import { cn } from '@/lib/utils'
import { Activity } from 'lucide-react'

const SEV_DOT: Record<string, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
  info: 'bg-text-muted',
}

function timeAgoShort(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface ThreatPulseStripProps {
  className?: string
}

export function ThreatPulseStrip({ className }: ThreatPulseStripProps) {
  const [paused, setPaused] = useState(false)
  const { data } = useIOCs({
    page: 1,
    limit: 15,
    sortBy: 'lastSeen',
    sortOrder: 'desc',
  })

  const items = data?.data ?? []

  if (items.length === 0) return null

  return (
    <div
      className={cn(
        'h-7 bg-bg-primary/80 border-b border-border/50 flex items-center overflow-hidden relative',
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="threat-pulse-strip"
    >
      {/* Label */}
      <div className="flex items-center gap-1.5 px-3 shrink-0 border-r border-border/50">
        <Activity className="w-3 h-3 text-accent animate-pulse" />
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Live</span>
      </div>

      {/* Scrolling ticker */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className={cn(
            'flex items-center gap-4 px-3 whitespace-nowrap',
            !paused && 'animate-[ticker_30s_linear_infinite]',
          )}
          data-testid="ticker-content"
        >
          {/* Double the items for seamless loop */}
          {[...items, ...items].map((ioc, idx) => (
            <span
              key={`${ioc.id}-${idx}`}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary shrink-0"
            >
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', SEV_DOT[ioc.severity] ?? 'bg-text-muted')} />
              <span className="font-mono text-text-primary/80 max-w-[150px] truncate">{ioc.normalizedValue}</span>
              <span className="text-text-muted uppercase text-[9px]">{ioc.iocType}</span>
              <span className="text-text-muted/60 text-[9px]">{timeAgoShort(ioc.lastSeen)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Fade edges */}
      <div className="absolute left-16 top-0 bottom-0 w-8 bg-gradient-to-r from-bg-primary/80 to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg-primary/80 to-transparent pointer-events-none" />
    </div>
  )
}
