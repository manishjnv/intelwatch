/**
 * @module lib/freshness
 * IOC freshness indicators based on age from a timestamp.
 */

export interface FreshnessInfo {
  /** Tailwind dot color class */
  dot: string
  /** Whether to add pulse animation */
  pulse: boolean
  /** Human-readable label */
  label: string
  /** Category for styling decisions */
  tier: 'just-now' | 'hours' | 'days' | 'weeks' | 'stale'
}

export function getFreshness(dateStr: string | undefined | null): FreshnessInfo {
  if (!dateStr) return { dot: 'bg-slate-500', pulse: false, label: 'unknown', tier: 'stale' }

  const ageMs = Date.now() - new Date(dateStr).getTime()
  if (ageMs < 0) return { dot: 'bg-green-400', pulse: true, label: 'Just now', tier: 'just-now' }

  const mins = Math.floor(ageMs / 60_000)
  const hours = Math.floor(ageMs / 3_600_000)
  const days = Math.floor(ageMs / 86_400_000)

  if (mins < 60) {
    return {
      dot: 'bg-green-400',
      pulse: true,
      label: mins < 1 ? 'Just now' : `${mins}m ago`,
      tier: 'just-now',
    }
  }
  if (hours < 24) {
    return { dot: 'bg-green-400', pulse: false, label: `${hours}h ago`, tier: 'hours' }
  }
  if (days < 7) {
    return { dot: 'bg-yellow-400', pulse: false, label: `${days}d ago`, tier: 'days' }
  }
  if (days < 30) {
    return { dot: 'bg-orange-400', pulse: false, label: `${days}d ago`, tier: 'weeks' }
  }
  return { dot: 'bg-red-400/50', pulse: false, label: 'stale', tier: 'stale' }
}
