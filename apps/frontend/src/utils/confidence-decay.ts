/**
 * @module utils/confidence-decay
 * @description Pure math for IOC confidence decay curves.
 * DECISION-015: Type-specific decay rates (exponential: C × e^(-λt)).
 */

/** Per-type decay rates (λ) — DECISION-015 */
export const DECAY_RATES: Record<string, number> = {
  ip: 0.05,       // 14-day half-life
  domain: 0.02,   // 35-day half-life
  hash: 0.001,    // 693-day half-life (near-permanent)
  url: 0.04,      // 17-day half-life
  cve: 0.005,     // 139-day half-life
  email: 0.02,    // same as domain
}

export interface CurvePoint {
  day: number
  confidence: number
}

export interface EventMarker {
  day: number
  confidence: number
  label: string
  type: string
}

/** Normalize iocType → decay rate key (hash_sha256 → hash, etc.) */
function decayKey(iocType: string): string {
  if (iocType.startsWith('hash') || iocType.startsWith('file_hash')) return 'hash'
  return iocType
}

/** Get the decay rate for an IOC type */
export function getDecayRate(iocType: string): number {
  return DECAY_RATES[decayKey(iocType)] ?? 0.02
}

/** Half-life in days: ln(2) / λ */
export function halfLifeDays(iocType: string): number {
  const rate = getDecayRate(iocType)
  return Math.round(Math.LN2 / rate)
}

/** Human-readable half-life label */
export function halfLifeLabel(iocType: string): string {
  const days = halfLifeDays(iocType)
  const typeName = decayKey(iocType).toUpperCase()
  return days > 365 ? `${typeName}: ~${Math.round(days / 365)}yr half-life` : `${typeName}: ${days}-day half-life`
}

/**
 * Compute projected decay curve from initial confidence.
 * @param initialConfidence Starting confidence (0-100)
 * @param iocType IOC type for decay rate lookup
 * @param totalDays Number of days to project
 * @param stepDays Granularity (default 1 day)
 */
export function computeDecayCurve(
  initialConfidence: number,
  iocType: string,
  totalDays: number,
  stepDays = 1,
): CurvePoint[] {
  const rate = getDecayRate(iocType)
  const points: CurvePoint[] = []
  for (let day = 0; day <= totalDays; day += stepDays) {
    points.push({ day, confidence: initialConfidence * Math.exp(-rate * day) })
  }
  return points
}

/**
 * Build event markers from timeline events, positioned on the decay curve.
 * @param events IOC timeline events with timestamp + summary + eventType
 * @param firstSeenDate IOC firstSeen date string
 * @param curve The pre-computed decay curve
 */
export function buildEventMarkers(
  events: Array<{ timestamp: string; summary: string; eventType: string }>,
  firstSeenDate: string,
  curve: CurvePoint[],
): EventMarker[] {
  const firstSeen = new Date(firstSeenDate).getTime()
  return events
    .map(e => {
      const day = Math.max(0, Math.round((new Date(e.timestamp).getTime() - firstSeen) / 86400000))
      const closest = curve.reduce((best, pt) => Math.abs(pt.day - day) < Math.abs(best.day - day) ? pt : best, curve[0]!)
      return { day, confidence: closest.confidence, label: e.summary, type: e.eventType }
    })
    .filter(m => m.day >= 0)
    .sort((a, b) => a.day - b.day)
}
