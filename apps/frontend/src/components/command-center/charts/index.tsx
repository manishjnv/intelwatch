/**
 * @module components/command-center/charts
 * @description Reusable SVG chart components for Command Center.
 * Custom SVG + no external chart libs — matches existing TrendCharts pattern.
 * All support dark/light mode via CSS variables, responsive viewBox.
 */
import { useState, useId } from 'react'
import { cn } from '@/lib/utils'

// ─── AreaChart ─────────────────────────────────────────────────

export interface AreaChartPoint {
  label: string
  value: number
}

interface AreaChartProps {
  points: AreaChartPoint[]
  height?: number
  color?: string
  formatValue?: (v: number) => string
  className?: string
}

export function AreaChart({
  points, height = 160, color = 'var(--accent)',
  formatValue = v => String(v), className,
}: AreaChartProps) {
  const gradId = useId()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 2) {
    return <div className="text-[10px] text-text-muted text-center py-8">Insufficient data</div>
  }

  const w = 100; const h = height
  const vals = points.map(p => p.value)
  const max = Math.max(...vals) || 1
  const min = Math.min(...vals)
  const range = max - min || 1

  const coords = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * w,
    y: h - 20 - ((v - min) / range) * (h - 30),
  }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const areaPath = `${linePath} L${w},${h - 20} L0,${h - 20} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('w-full', className)}
      preserveAspectRatio="none" style={{ height }} data-testid="cc-area-chart">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" />
      {/* X-axis labels */}
      {points.filter((_, i) => i % Math.ceil(points.length / 5) === 0 || i === points.length - 1).map((p, idx) => {
        const ci = points.indexOf(p)
        return (
          <text key={idx} x={coords[ci].x} y={h - 4} textAnchor="middle"
            className="fill-text-muted" style={{ fontSize: '4px' }}>
            {p.label}
          </text>
        )
      })}
      {/* Hover targets */}
      {coords.map((c, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <rect x={c.x - 3} y={0} width={6} height={h} fill="transparent" />
          {hover === i && (
            <>
              <circle cx={c.x} cy={c.y} r={2} fill={color} />
              <text x={c.x} y={c.y - 5} textAnchor="middle" className="fill-text-primary"
                style={{ fontSize: '4px', fontWeight: 700 }}>
                {formatValue(vals[i])}
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

// ─── HorizontalBarChart ────────────────────────────────────────

export interface BarItem {
  label: string
  value: number
  color?: string
}

interface HorizontalBarChartProps {
  items: BarItem[]
  maxItems?: number
  formatValue?: (v: number) => string
  defaultColor?: string
  className?: string
}

export function HorizontalBarChart({
  items, maxItems = 10, formatValue = v => String(v),
  defaultColor = 'var(--accent)', className,
}: HorizontalBarChartProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems)
  const maxVal = Math.max(...sorted.map(i => i.value)) || 1

  if (sorted.length === 0) {
    return <div className="text-[10px] text-text-muted text-center py-8">No data</div>
  }

  return (
    <div className={cn('space-y-1.5', className)} data-testid="cc-horizontal-bars">
      {sorted.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[10px] text-text-primary truncate w-24 text-right" title={item.label}>
            {item.label}
          </span>
          <div className="flex-1 h-3 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / maxVal) * 100}%`,
                backgroundColor: item.color ?? defaultColor,
              }}
            />
          </div>
          <span className="text-[10px] text-text-muted tabular-nums w-14 text-right">
            {formatValue(item.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── DonutChart ────────────────────────────────────────────────

export interface DonutSegment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: DonutSegment[]
  centerLabel?: string
  centerValue?: string
  size?: number
  className?: string
}

export function DonutChart({
  segments, centerLabel, centerValue, size = 120, className,
}: DonutChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  const r = 40; const cx = 50; const cy = 50; const sw = 12

  if (segments.length === 0) {
    return <div className="text-[10px] text-text-muted text-center py-8">No data</div>
  }

  // Build arcs
  let angle = -90
  const arcs = segments.map((seg, i) => {
    const pct = seg.value / total
    const sweep = pct * 360
    const startAngle = angle
    angle += sweep
    const endAngle = angle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = sweep > 180 ? 1 : 0

    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
    return { d, color: seg.color, pct, idx: i }
  })

  return (
    <div className={cn('flex items-center gap-4', className)} data-testid="cc-donut-chart">
      <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0">
        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)"
          strokeWidth={sw} opacity={0.3} />
        {arcs.map(arc => (
          <path key={arc.idx} d={arc.d} fill="none" stroke={arc.color}
            strokeWidth={hover === arc.idx ? sw + 2 : sw} strokeLinecap="round"
            onMouseEnter={() => setHover(arc.idx)} onMouseLeave={() => setHover(null)}
            className="transition-all duration-200" />
        ))}
        {/* Center text */}
        {centerValue && (
          <>
            <text x={cx} y={cy - 2} textAnchor="middle" className="fill-text-primary"
              style={{ fontSize: '10px', fontWeight: 700 }}>{centerValue}</text>
            {centerLabel && (
              <text x={cx} y={cy + 8} textAnchor="middle" className="fill-text-muted"
                style={{ fontSize: '5px' }}>{centerLabel}</text>
            )}
          </>
        )}
      </svg>
      {/* Legend */}
      <div className="space-y-1 min-w-0">
        {segments.map((seg, i) => (
          <div key={seg.label} className={cn('flex items-center gap-1.5 text-[10px]',
            hover === i ? 'text-text-primary' : 'text-text-muted')}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="truncate">{seg.label}</span>
            <span className="tabular-nums ml-auto">{((seg.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── HeatmapGrid ───────────────────────────────────────────────

interface HeatmapCell {
  row: string
  col: string
  value: number
}

interface HeatmapGridProps {
  cells: HeatmapCell[]
  rows: string[]
  cols: string[]
  color?: string
  formatValue?: (v: number) => string
  className?: string
}

export function HeatmapGrid({
  cells, rows, cols, color = '#8b5cf6',
  formatValue = v => `$${v.toFixed(2)}`, className,
}: HeatmapGridProps) {
  const [hover, setHover] = useState<{ row: string; col: string } | null>(null)
  const maxVal = Math.max(...cells.map(c => c.value)) || 1

  const getValue = (row: string, col: string) =>
    cells.find(c => c.row === row && c.col === col)?.value ?? 0

  if (rows.length === 0 || cols.length === 0) {
    return <div className="text-[10px] text-text-muted text-center py-8">No data</div>
  }

  return (
    <div className={cn('overflow-x-auto', className)} data-testid="cc-heatmap">
      <div className="inline-block min-w-full">
        {/* Column headers */}
        <div className="flex gap-0.5 mb-0.5 ml-20">
          {cols.map(col => (
            <div key={col} className="w-8 text-[8px] text-text-muted text-center truncate" title={col}>
              {col}
            </div>
          ))}
        </div>
        {/* Rows */}
        {rows.map(row => (
          <div key={row} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-20 text-[9px] text-text-muted text-right truncate pr-1" title={row}>
              {row.replace(/_/g, ' ')}
            </span>
            {cols.map(col => {
              const val = getValue(row, col)
              const intensity = maxVal > 0 ? val / maxVal : 0
              const isHovered = hover?.row === row && hover?.col === col
              return (
                <div
                  key={col}
                  className={cn('w-8 h-6 rounded-sm cursor-default transition-all duration-200',
                    isHovered && 'ring-1 ring-text-primary')}
                  style={{ backgroundColor: color, opacity: Math.max(0.08, intensity * 0.9) }}
                  onMouseEnter={() => setHover({ row, col })}
                  onMouseLeave={() => setHover(null)}
                  title={`${row} / ${col}: ${formatValue(val)}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      {hover && (
        <div className="mt-1 text-[10px] text-text-muted">
          {hover.row.replace(/_/g, ' ')} / {hover.col}: {formatValue(getValue(hover.row, hover.col))}
        </div>
      )}
    </div>
  )
}

// ─── BudgetBar ─────────────────────────────────────────────────

interface BudgetBarProps {
  usedPercent: number
  label?: string
  className?: string
}

export function BudgetBar({ usedPercent, label, className }: BudgetBarProps) {
  const clamped = Math.max(0, Math.min(100, usedPercent))
  const barColor =
    clamped >= 90 ? 'var(--sev-critical)' :
    clamped >= 70 ? 'var(--sev-high)' :
    clamped >= 50 ? 'var(--sev-medium)' :
    'var(--sev-low)'

  return (
    <div className={cn('space-y-1', className)} data-testid="cc-budget-bar">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted">{label ?? 'Budget Used'}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: barColor }}>
          {clamped}%
        </span>
      </div>
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamped}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  )
}

// ─── MiniSparkline ─────────────────────────────────────────────

interface MiniSparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
  className?: string
}

export function MiniSparkline({
  values, width = 48, height = 16, color, className,
}: MiniSparklineProps) {
  if (values.length < 2) return <span className="text-[10px] text-text-muted">—</span>

  const max = Math.max(...values) || 1
  const min = Math.min(...values)
  const range = max - min || 1

  // Auto-detect trend color
  const trend = values[values.length - 1] - values[0]
  const autoColor = trend > 0 ? 'var(--sev-low)' : trend < 0 ? 'var(--sev-critical)' : 'var(--text-muted)'
  const strokeColor = color ?? autoColor

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - 2 - ((v - min) / range) * (height - 4)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className={className} data-testid="cc-mini-sparkline">
      <polyline
        points={pts}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      <circle
        cx={(values.length - 1) / (values.length - 1) * width}
        cy={height - 2 - ((values[values.length - 1] - min) / range) * (height - 4)}
        r={1.5}
        fill={strokeColor}
      />
    </svg>
  )
}
