/**
 * @module components/StixConfidenceBadge
 * @description STIX 2.1 confidence tier badge — maps 0-100 score to semantic tiers.
 * High (≥70, green), Medium (30-69, amber), Low (1-29, red), None (0, gray).
 */

function getTier(score: number): { label: string; color: string; bg: string } {
  if (score >= 70) return { label: 'High', color: 'text-sev-low', bg: 'bg-sev-low/20' }
  if (score >= 30) return { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-400/20' }
  if (score >= 1) return { label: 'Low', color: 'text-sev-critical', bg: 'bg-sev-critical/20' }
  return { label: 'None', color: 'text-text-muted', bg: 'bg-bg-elevated' }
}

interface StixConfidenceBadgeProps {
  score: number
  showTier?: boolean
  showColor?: boolean
  variant?: 'default' | 'compact'
}

export function StixConfidenceBadge({
  score,
  showTier = true,
  showColor = true,
  variant = 'default',
}: StixConfidenceBadgeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const { label, color, bg } = getTier(clamped)

  if (variant === 'compact') {
    return (
      <span
        data-testid="stix-confidence-badge"
        className="inline-flex items-center gap-1"
        title={`STIX Confidence: ${clamped} (${label})`}
      >
        <span className={`w-2 h-2 rounded-full ${showColor ? bg.replace('/20', '') : 'bg-text-muted'}`} />
        <span className="text-xs tabular-nums font-medium text-text-primary">{clamped}</span>
      </span>
    )
  }

  return (
    <span
      data-testid="stix-confidence-badge"
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${showColor ? bg : 'bg-bg-elevated'}`}
      title={`STIX Confidence: ${clamped} (${label})`}
    >
      <span className={`text-base font-bold tabular-nums ${showColor ? color : 'text-text-primary'}`}>
        {clamped}
      </span>
      {showTier && (
        <span className={`text-[10px] font-medium ${showColor ? color : 'text-text-muted'} opacity-80`}>
          {label}
        </span>
      )}
      {/* Progress bar */}
      <span className="w-10 h-1 rounded-full bg-bg-elevated overflow-hidden ml-0.5">
        <span
          className={`block h-full rounded-full ${showColor ? bg.replace('/20', '') : 'bg-text-muted'}`}
          style={{ width: `${clamped}%` }}
        />
      </span>
    </span>
  )
}
