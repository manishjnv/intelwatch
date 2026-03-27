/**
 * @module VelocityScore
 * @description IOC velocity scoring — measures how rapidly an IOC is being
 * sighted across feeds. High velocity = likely active campaign.
 * DECISION-029 Phase F.
 */

export interface VelocityInput {
  timestamps: Date[];
  feedSources: string[];
  windowHours?: number;
}

export interface VelocityResult {
  velocityScore: number;
  sightingsInWindow: number;
  uniqueSourcesInWindow: number;
  trend: 'accelerating' | 'stable' | 'decelerating';
  peakHour: string;
}

/**
 * Calculate velocity score for an IOC based on sighting frequency and source diversity.
 *
 * Formula:
 *   baseSightingScore = min(sightingsInWindow * 10, 50)
 *   sourceMultiplier  = min(uniqueSourcesInWindow * 15, 50)
 *   velocityScore     = clamp(base + multiplier, 0, 100)
 *
 * Trend: compare first-half vs second-half sightings within window.
 */
export function calculateVelocityScore(input: VelocityInput): VelocityResult {
  const windowHours = input.windowHours ?? 24;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowHours * 3600_000);
  const windowMid = new Date(now.getTime() - (windowHours / 2) * 3600_000);

  // Filter to window
  const inWindow = input.timestamps.filter((t) => t >= windowStart);
  const sightingsInWindow = inWindow.length;

  // Unique sources in window — zip timestamps with sources
  const sourcesInWindow = new Set<string>();
  for (let i = 0; i < input.timestamps.length; i++) {
    if (input.timestamps[i]! >= windowStart && input.feedSources[i]) {
      sourcesInWindow.add(input.feedSources[i]!);
    }
  }
  const uniqueSourcesInWindow = sourcesInWindow.size;

  // Score
  const baseSightingScore = Math.min(sightingsInWindow * 10, 50);
  const sourceMultiplier = Math.min(uniqueSourcesInWindow * 15, 50);
  const velocityScore = Math.min(Math.max(baseSightingScore + sourceMultiplier, 0), 100);

  // Trend detection
  const firstHalf = inWindow.filter((t) => t < windowMid).length;
  const secondHalf = inWindow.filter((t) => t >= windowMid).length;

  let trend: VelocityResult['trend'] = 'stable';
  if (secondHalf > firstHalf * 1.5 && secondHalf > 0) {
    trend = 'accelerating';
  } else if (firstHalf > secondHalf * 1.5 && firstHalf > 0) {
    trend = 'decelerating';
  }

  // Peak hour
  const hourBuckets = new Map<string, number>();
  for (const t of inWindow) {
    const hourKey = t.toISOString().substring(0, 13); // YYYY-MM-DDTHH
    hourBuckets.set(hourKey, (hourBuckets.get(hourKey) ?? 0) + 1);
  }

  let peakHour = now.toISOString().substring(0, 13);
  let peakCount = 0;
  for (const [hour, count] of hourBuckets) {
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  }

  return {
    velocityScore,
    sightingsInWindow,
    uniqueSourcesInWindow,
    trend,
    peakHour,
  };
}

/**
 * Detect a velocity spike: current score >= threshold * previous score.
 * Default threshold: 2.0 (current must be 2x previous).
 */
export function isVelocitySpike(current: number, previous: number, threshold = 2.0): boolean {
  if (previous <= 0) return current > 0;
  return current >= previous * threshold;
}

/**
 * Decay a velocity score based on time since last sighting.
 * Half-life: 6 hours. IOCs that stop appearing lose velocity fast.
 */
export function decayVelocityScore(score: number, hoursSinceLastSighting: number): number {
  if (hoursSinceLastSighting <= 0) return score;
  return score * Math.pow(0.5, hoursSinceLastSighting / 6);
}
