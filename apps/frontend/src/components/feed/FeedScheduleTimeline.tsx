/**
 * @module components/feed/FeedScheduleTimeline
 * @description 24-hour horizontal schedule strip showing when active/error feeds fire.
 * Disabled feeds are excluded. Dots are color-coded by feed status.
 */
import { cn } from '@/lib/utils'
import type { FeedRecord } from '@/hooks/use-intel-data'

/** Returns the 0-23 hours at which a cron expression fires within one 24h window. */
export function getNextCronHours(cron: string | null): number[] {
  if (!cron) return []
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return []

  const hourField = parts[1] ?? ''

  // Every hour: * * * * *
  if (hourField === '*') return Array.from({ length: 24 }, (_, i) => i)

  // Every N hours: */N * * * *
  const everyN = hourField.match(/^\*\/(\d+)$/)
  if (everyN) {
    const n = Math.max(1, parseInt(everyN[1]!, 10))
    const hours: number[] = []
    for (let h = 0; h < 24; h += n) hours.push(h)
    return hours
  }

  // Fixed hour: H * * * *
  const fixed = hourField.match(/^(\d+)$/)
  if (fixed) {
    const h = parseInt(fixed[1]!, 10)
    return h < 24 ? [h] : []
  }

  return []
}

interface FeedScheduleTimelineProps {
  feeds: FeedRecord[]
}

export function FeedScheduleTimeline({ feeds }: FeedScheduleTimelineProps) {
  type Dot = { hour: number; feedName: string; status: string }
  const dots: Dot[] = []

  for (const feed of feeds) {
    if (feed.status === 'disabled' || !feed.enabled) continue
    for (const h of getNextCronHours(feed.schedule)) {
      dots.push({ hour: h, feedName: feed.name, status: feed.status })
    }
  }

  if (dots.length === 0) return null

  const LABELS = [0, 6, 12, 18, 24] as const

  return (
    <div className="px-4 pt-2 pb-1" data-testid="schedule-timeline">
      <div className="text-[9px] text-text-muted mb-1 font-medium tracking-wide uppercase select-none">
        24h Schedule
      </div>
      <div className="relative h-8 bg-bg-elevated rounded-md overflow-hidden">
        {/* Hour labels */}
        {LABELS.map(h => (
          <span
            key={h}
            className="absolute top-1/2 -translate-y-1/2 text-[9px] text-text-muted pointer-events-none select-none"
            style={{
              left: `${(h / 24) * 100}%`,
              transform: `translateX(${
                h === 0 ? '4px' : h === 24 ? 'calc(-100% - 4px)' : '-50%'
              }) translateY(-50%)`,
            }}
          >
            {h}
          </span>
        ))}

        {/* Schedule dots */}
        {dots.map((dot, i) => (
          <div
            key={i}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full cursor-default z-10',
              dot.status === 'error' ? 'bg-sev-critical' : 'bg-sev-low',
            )}
            style={{ left: `${(dot.hour / 24) * 100}%` }}
            title={`${dot.feedName} at ${String(dot.hour).padStart(2, '0')}:00`}
            data-testid="schedule-dot"
          />
        ))}
      </div>
    </div>
  )
}
