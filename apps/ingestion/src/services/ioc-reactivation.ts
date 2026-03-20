/**
 * IOC Reactivation Detection — Lifecycle state machine with cooldown reactivation.
 *
 * Standard TIPs age IOCs linearly: NEW → ACTIVE → AGING → EXPIRED → ARCHIVED.
 * APT groups routinely re-use infrastructure after cooldown periods.
 *
 * This module detects when an expired/aging IOC reappears in fresh reports
 * and transitions it to REACTIVATED with boosted priority, enabling:
 * - Alert generation for previously-dismissed indicators
 * - Threat actor behavior pattern tracking (infrastructure recycling)
 * - Reduced false-negative rate on re-emerging threats
 */

export type IOCLifecycleState =
  | 'new'
  | 'active'
  | 'aging'
  | 'expired'
  | 'archived'
  | 'reactivated'
  | 'false_positive';

export interface IOCRecord {
  iocValue: string;
  iocType: string;
  state: IOCLifecycleState;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastStateChange: Date;
  reactivationCount: number;
  cooldownDays: number; // Days since last seen before reappearing
  confidence: number;
  tenantId: string;
}

export interface ReactivationEvent {
  iocValue: string;
  iocType: string;
  previousState: IOCLifecycleState;
  newState: IOCLifecycleState;
  cooldownDays: number;
  reactivationCount: number;
  priorityBoost: 'critical' | 'high' | 'normal';
  reason: string;
}

// IOC aging thresholds (days since last seen)
const AGING_THRESHOLDS: Record<string, number> = {
  ip: 30,
  domain: 90,
  url: 60,
  hash_md5: Infinity,
  hash_sha1: Infinity,
  hash_sha256: Infinity,
  email: 120,
  cve: Infinity,
};

const DEFAULT_AGING_DAYS = 60;
const REACTIVATION_MIN_COOLDOWN_DAYS = 7; // Must be "cold" for at least 7 days

export class IOCReactivationDetector {
  private readonly iocs = new Map<string, IOCRecord>();

  /**
   * Record an IOC sighting. Returns a ReactivationEvent if the IOC was reactivated.
   */
  recordSighting(
    iocValue: string,
    iocType: string,
    tenantId: string,
    confidence: number,
    now = new Date(),
  ): ReactivationEvent | null {
    const key = `${tenantId}:${iocType}:${iocValue}`;
    const existing = this.iocs.get(key);

    if (!existing) {
      // First time seen — register as NEW
      this.iocs.set(key, {
        iocValue, iocType, tenantId, confidence,
        state: 'new',
        firstSeenAt: now,
        lastSeenAt: now,
        lastStateChange: now,
        reactivationCount: 0,
        cooldownDays: 0,
      });
      return null;
    }

    // Check if this is a reactivation
    const daysSinceLastSeen = daysBetween(existing.lastSeenAt, now);
    const isExpiredOrAging = existing.state === 'expired' || existing.state === 'aging' || existing.state === 'archived';
    const wasInCooldown = daysSinceLastSeen >= REACTIVATION_MIN_COOLDOWN_DAYS;

    if (isExpiredOrAging && wasInCooldown) {
      // REACTIVATION DETECTED
      const previousState = existing.state;
      existing.reactivationCount++;
      existing.cooldownDays = Math.round(daysSinceLastSeen);
      existing.state = 'reactivated';
      existing.lastSeenAt = now;
      existing.lastStateChange = now;
      existing.confidence = Math.min(1, confidence * 1.2); // Boost confidence on reactivation

      const priorityBoost = getPriorityBoost(existing.reactivationCount, daysSinceLastSeen);

      return {
        iocValue,
        iocType,
        previousState,
        newState: 'reactivated',
        cooldownDays: existing.cooldownDays,
        reactivationCount: existing.reactivationCount,
        priorityBoost,
        reason: buildReactivationReason(iocValue, iocType, previousState, existing.cooldownDays, existing.reactivationCount),
      };
    }

    // Normal sighting update (not reactivation)
    existing.lastSeenAt = now;
    if (existing.state === 'new') existing.state = 'active';
    if (existing.state === 'reactivated') existing.state = 'active'; // Back to active after confirmation

    return null;
  }

  /**
   * Age all IOCs for a tenant. Call periodically (e.g., daily).
   * Transitions ACTIVE → AGING → EXPIRED based on type-specific thresholds.
   */
  ageIOCs(tenantId: string, now = new Date()): { aged: number; expired: number } {
    let aged = 0;
    let expired = 0;

    for (const [, record] of this.iocs) {
      if (record.tenantId !== tenantId) continue;
      if (record.state === 'false_positive' || record.state === 'archived') continue;

      const daysSinceLastSeen = daysBetween(record.lastSeenAt, now);
      const agingThreshold = AGING_THRESHOLDS[record.iocType] ?? DEFAULT_AGING_DAYS;

      if (agingThreshold === Infinity) continue; // Hashes, CVEs never age

      if (daysSinceLastSeen >= agingThreshold * 2 && record.state !== 'expired') {
        record.state = 'expired';
        record.lastStateChange = now;
        expired++;
      } else if (daysSinceLastSeen >= agingThreshold && record.state === 'active') {
        record.state = 'aging';
        record.lastStateChange = now;
        aged++;
      }
    }

    return { aged, expired };
  }

  /**
   * Get an IOC's current lifecycle record.
   */
  getRecord(iocValue: string, iocType: string, tenantId: string): IOCRecord | null {
    return this.iocs.get(`${tenantId}:${iocType}:${iocValue}`) ?? null;
  }

  /**
   * Get all reactivated IOCs for a tenant (for alerting).
   */
  getReactivated(tenantId: string): IOCRecord[] {
    const results: IOCRecord[] = [];
    for (const record of this.iocs.values()) {
      if (record.tenantId === tenantId && record.state === 'reactivated') {
        results.push(record);
      }
    }
    return results;
  }

  /**
   * Mark an IOC as false positive.
   */
  markFalsePositive(iocValue: string, iocType: string, tenantId: string): boolean {
    const record = this.iocs.get(`${tenantId}:${iocType}:${iocValue}`);
    if (!record) return false;
    record.state = 'false_positive';
    record.lastStateChange = new Date();
    return true;
  }

  clear(): void {
    this.iocs.clear();
  }
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function getPriorityBoost(reactivationCount: number, cooldownDays: number): 'critical' | 'high' | 'normal' {
  // Multiple reactivations = APT infrastructure recycling pattern → critical
  if (reactivationCount >= 3) return 'critical';
  // Long cooldown (>90 days) then reappearing → high suspicion
  if (cooldownDays >= 90) return 'critical';
  if (reactivationCount >= 2 || cooldownDays >= 30) return 'high';
  return 'normal';
}

function buildReactivationReason(
  iocValue: string, iocType: string,
  previousState: IOCLifecycleState,
  cooldownDays: number, reactivationCount: number,
): string {
  const suffix = reactivationCount > 1 ? ` (reactivation #${reactivationCount})` : '';
  return `${iocType} ${iocValue} reappeared after ${cooldownDays}d cooldown from ${previousState} state${suffix}`;
}
