/**
 * @module components/ioc/ConfidenceDecayChart
 * @description Animated SVG line chart showing IOC confidence decay over time.
 * Plots projected exponential decay (DECISION-015) with event markers.
 * No external charting libs — extends SparklineCell SVG pattern.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { computeDecayCurve, buildEventMarkers, halfLifeLabel } from '@/utils/confidence-decay'
import type { IOCTimelineEvent } from '@/hooks/use-intel-data'

interface ConfidenceDecayChartProps {
  confidence: number
  iocType: string
  firstSeen: string
  timelineEvents: IOCTimelineEvent[]
  className?: string
}

const W = 320, H = 120, PAD = 24, R_PAD = 8, T_PAD = 16, B_PAD = 20

/** Color for timeline event type */
const EVENT_COLORS: Record<string, string> = {
  enrichment: 'var(--sev-low)',
  sighting: 'var(--accent)',
  correlation: 'var(--sev-medium)',
  severity_change: 'var(--sev-high)',
  triage: 'var(--sev-critical)',
  first_seen: 'var(--text-muted)',
}

export function ConfidenceDecayChart({ confidence, iocType, firstSeen, timelineEvents, className }: ConfidenceDecayChartProps) {
  const now = Date.now()
  const ageDays = Math.max(1, Math.round((now - new Date(firstSeen).getTime()) / 86400000))
  const totalDays = Math.max(90, ageDays * 2)

  const { curve, markers, nowDay, label } = useMemo(() => {
    const c = computeDecayCurve(confidence, iocType, totalDays)
    const m = buildEventMarkers(timelineEvents, firstSeen, c)
    return { curve: c, markers: m, nowDay: ageDays, label: halfLifeLabel(iocType) }
  }, [confidence, iocType, firstSeen, timelineEvents, totalDays, ageDays])

  // SVG coordinate helpers
  const xScale = (day: number) => PAD + (day / totalDays) * (W - PAD - R_PAD)
  const yScale = (conf: number) => T_PAD + ((100 - conf) / 100) * (H - T_PAD - B_PAD)

  const pathD = curve.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xScale(pt.day).toFixed(1)},${yScale(pt.confidence).toFixed(1)}`).join(' ')
  const nowX = xScale(nowDay)

  return (
    <div className={cn('rounded-lg border border-border bg-bg-primary/50 p-3', className)} data-testid="confidence-decay-chart">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Confidence Decay</span>
        <span className="text-[10px] text-text-secondary font-mono" data-testid="half-life-label">{label}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="decay-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--sev-low)" />
            <stop offset="60%" stopColor="var(--sev-medium)" />
            <stop offset="100%" stopColor="var(--sev-critical)" />
          </linearGradient>
        </defs>

        {/* Y-axis labels */}
        <text x={PAD - 4} y={yScale(100)} textAnchor="end" fill="var(--text-muted)" fontSize="8">100</text>
        <text x={PAD - 4} y={yScale(50)} textAnchor="end" fill="var(--text-muted)" fontSize="8">50</text>
        <text x={PAD - 4} y={yScale(0)} textAnchor="end" fill="var(--text-muted)" fontSize="8">0</text>

        {/* Horizontal grid */}
        {[100, 75, 50, 25, 0].map(v => (
          <line key={v} x1={PAD} y1={yScale(v)} x2={W - R_PAD} y2={yScale(v)} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={v === 0 || v === 100 ? undefined : '2,3'} />
        ))}

        {/* "Now" vertical marker */}
        <line x1={nowX} y1={T_PAD} x2={nowX} y2={H - B_PAD} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
        <text x={nowX} y={H - 4} textAnchor="middle" fill="var(--accent)" fontSize="7" fontWeight="600">Now</text>

        {/* Decay curve — animated stroke */}
        <motion.path
          d={pathD}
          fill="none"
          stroke="url(#decay-grad)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          data-testid="decay-curve"
        />

        {/* Event markers */}
        {markers.map((m, i) => (
          <g key={i} data-testid="event-marker">
            <line x1={xScale(m.day)} y1={T_PAD} x2={xScale(m.day)} y2={H - B_PAD} stroke={EVENT_COLORS[m.type] ?? 'var(--text-muted)'} strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4} />
            <circle cx={xScale(m.day)} cy={yScale(m.confidence)} r={3.5} fill={EVENT_COLORS[m.type] ?? 'var(--text-muted)'} stroke="var(--bg-primary)" strokeWidth={1}>
              <title>{m.label}</title>
            </circle>
          </g>
        ))}

        {/* X-axis labels */}
        <text x={PAD} y={H - 4} textAnchor="start" fill="var(--text-muted)" fontSize="7">Day 0</text>
        <text x={W - R_PAD} y={H - 4} textAnchor="end" fill="var(--text-muted)" fontSize="7">{totalDays}d</text>
      </svg>
    </div>
  )
}

function cn(...classes: (string | undefined)[]) { return classes.filter(Boolean).join(' ') }
