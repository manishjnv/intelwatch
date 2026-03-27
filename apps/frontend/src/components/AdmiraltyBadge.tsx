/**
 * @module components/AdmiraltyBadge
 * @description NATO Admiralty Code badge — displays source reliability + information credibility.
 * A1 (green) = highest, F6 (red) = lowest.
 */

const SOURCE_LABELS: Record<string, string> = {
  A: 'Completely reliable', B: 'Usually reliable', C: 'Fairly reliable',
  D: 'Not usually reliable', E: 'Unreliable', F: 'Reliability unknown',
}

const CRED_LABELS: Record<string, string> = {
  '1': 'Confirmed', '2': 'Probably true', '3': 'Possibly true',
  '4': 'Doubtfully true', '5': 'Improbable', '6': 'Truth cannot be judged',
}

function getBadgeColors(source: string): string {
  if (source <= 'A') return 'bg-sev-low/20 text-sev-low'
  if (source <= 'B') return 'bg-teal-400/20 text-teal-400'
  if (source <= 'C') return 'bg-amber-400/20 text-amber-400'
  if (source <= 'D') return 'bg-orange-400/20 text-orange-400'
  return 'bg-sev-critical/20 text-sev-critical'
}

interface AdmiraltyBadgeProps {
  source: string
  cred: number | string
  size?: 'sm' | 'md'
}

export function AdmiraltyBadge({ source, cred, size = 'sm' }: AdmiraltyBadgeProps) {
  const letter = (source || '?')[0].toUpperCase()
  const num = String(cred || '?')
  const code = `${letter}${num}`

  const validSource = letter >= 'A' && letter <= 'F'
  const validCred = num >= '1' && num <= '6'

  if (!validSource && !validCred) {
    return (
      <span
        data-testid="admiralty-badge"
        className="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-bg-elevated text-text-muted"
        title="Unknown reliability"
      >
        ??
      </span>
    )
  }

  const colors = getBadgeColors(letter)
  const sourceLabel = SOURCE_LABELS[letter] ?? 'Unknown'
  const credLabel = CRED_LABELS[num] ?? 'Unknown'
  const tooltip = `${sourceLabel} — ${credLabel}`
  const sizeClass = size === 'md' ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-xs'

  return (
    <span
      data-testid="admiralty-badge"
      className={`${sizeClass} rounded font-mono font-bold ${colors} inline-block`}
      title={tooltip}
    >
      {code}
    </span>
  )
}
