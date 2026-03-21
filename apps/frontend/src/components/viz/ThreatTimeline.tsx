/**
 * @module components/viz/ThreatTimeline
 * @description Horizontal scrollable threat timeline — shows events
 * chronologically with severity coloring. P2-14.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Clock } from 'lucide-react'

export interface TimelineEvent {
  id: string
  timestamp: string
  label: string
  type: string
  severity: string
}

interface ThreatTimelineProps {
  events?: TimelineEvent[]
  maxEvents?: number
  className?: string
}

const SEV_NODE: Record<string, string> = {
  critical: 'bg-sev-critical border-red-500/40',
  high: 'bg-sev-high border-orange-500/40',
  medium: 'bg-sev-medium border-yellow-500/40',
  low: 'bg-sev-low border-green-500/40',
  info: 'bg-text-muted border-slate-500/40',
}

const TYPE_LABEL: Record<string, string> = {
  ip: 'IP', domain: 'Domain', url: 'URL', hash_sha256: 'Hash',
  cve: 'CVE', email: 'Email', actor: 'Actor', malware: 'Malware',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** Generate stub timeline events for demo */
export function generateStubEvents(count = 15): TimelineEvent[] {
  const types = ['ip', 'domain', 'url', 'cve', 'hash_sha256', 'actor', 'malware']
  const sevs = ['critical', 'high', 'medium', 'low', 'info']
  const now = Date.now()

  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 2654435761) >>> 0
    const type = types[seed % types.length]!
    const sev = sevs[(seed >> 4) % sevs.length]!
    const ts = now - (count - i) * 3600000 * (1 + (seed % 3))

    return {
      id: `stub-${i}`,
      timestamp: new Date(ts).toISOString(),
      label: `${TYPE_LABEL[type] ?? type}-${(seed % 900 + 100).toString()}`,
      type,
      severity: sev,
    }
  }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export function ThreatTimeline({ events, maxEvents = 20, className }: ThreatTimelineProps) {
  const data = useMemo(() => {
    const source = events ?? generateStubEvents()
    return source.slice(0, maxEvents)
  }, [events, maxEvents])

  if (data.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-bg-secondary/30 p-4', className)}>
        <p className="text-xs text-text-muted text-center">No recent events</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border bg-bg-secondary/30 p-4', className)} data-testid="threat-timeline">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-3.5 h-3.5 text-text-muted" />
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Threat Activity Timeline
        </h3>
      </div>

      {/* Scrollable timeline */}
      <div className="overflow-x-auto scrollbar-hide pb-2">
        <div className="relative flex items-center min-w-max" style={{ height: 72 }}>
          {/* Connector line */}
          <div className="absolute left-4 right-4 top-1/2 h-px bg-border" />

          {/* Event nodes */}
          {data.map((evt, idx) => (
            <div
              key={evt.id}
              className="relative flex flex-col items-center shrink-0"
              style={{ width: 64, marginLeft: idx === 0 ? 0 : 8 }}
              data-testid="timeline-event"
            >
              {/* Label (above) */}
              <span className="text-[9px] text-text-secondary truncate max-w-[56px] mb-1" title={evt.label}>
                {evt.label}
              </span>

              {/* Node dot */}
              <div
                className={cn(
                  'w-3 h-3 rounded-full border-2 z-10 cursor-default',
                  SEV_NODE[evt.severity] ?? SEV_NODE.info,
                )}
                title={`${evt.label} — ${evt.severity} — ${formatDate(evt.timestamp)}`}
              />

              {/* Date (below) */}
              <span className="text-[8px] text-text-muted tabular-nums mt-1">
                {formatDate(evt.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
