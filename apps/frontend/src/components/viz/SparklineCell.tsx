/**
 * @module components/viz/SparklineCell
 * @description Tiny SVG sparkline for table cells — shows 7-day trend.
 * Pure component, no external deps. P1-8.
 */

interface SparklineCellProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export function SparklineCell({
  data,
  width = 48,
  height = 16,
  color,
}: SparklineCellProps) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="bg-bg-elevated/30 rounded" />
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padding = 1

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2)
      const y = height - padding - ((v - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')

  // Determine trend color
  const trendColor =
    color ??
    (data[data.length - 1]! > data[0]!
      ? 'var(--sev-low)'
      : data[data.length - 1]! < data[0]!
        ? 'var(--sev-critical)'
        : 'var(--text-muted)')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block"
      data-testid="sparkline"
    >
      <polyline
        points={points}
        fill="none"
        stroke={trendColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      <circle
        cx={parseFloat(points.split(' ').pop()!.split(',')[0]!)}
        cy={parseFloat(points.split(' ').pop()!.split(',')[1]!)}
        r={2}
        fill={trendColor}
      />
    </svg>
  )
}

/** Generate deterministic stub 7-day trend from a seed string */
export function generateStubTrend(seed: string): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  const base = Math.abs(hash % 50) + 10
  return Array.from({ length: 7 }, (_, i) => {
    const noise = ((hash * (i + 1) * 2654435761) >>> 0) % 20 - 10
    return Math.max(0, base + noise)
  })
}
