/**
 * @module components/ioc/ConfidenceGauge
 * @description P0-5: Radial SVG gauge showing IOC confidence score.
 * Green ≥70, Yellow ≥40, Red <40.
 */

export function ConfidenceGauge({ value }: { value: number }) {
  const r = 14, cx = 18, cy = 18, stroke = 3
  const circumference = 2 * Math.PI * r
  const offset = circumference - (value / 100) * circumference
  const color = value >= 70 ? 'var(--sev-low)' : value >= 40 ? 'var(--sev-medium)' : 'var(--sev-critical)'

  return (
    <div className="inline-flex items-center gap-1.5 group/gauge" title={`Confidence: ${value}%`}>
      <svg width="36" height="36" viewBox="0 0 36 36" className="transition-transform group-hover/gauge:scale-125">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-700"
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--text-primary)" fontSize="9" fontWeight="600">
          {value}
        </text>
      </svg>
    </div>
  )
}
