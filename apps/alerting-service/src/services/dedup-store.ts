import { createHash } from 'node:crypto';

export interface DedupEntry {
  fingerprint: string;
  alertId: string;
  ruleId: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Alert deduplication store.
 * Prevents alert storms by fingerprinting (ruleId + severity + source hash)
 * and suppressing duplicates within a configurable time window.
 */
export class DedupStore {
  private entries = new Map<string, DedupEntry>();
  private readonly windowMs: number;

  constructor(dedupWindowMinutes: number = 5) {
    this.windowMs = dedupWindowMinutes * 60_000;
  }

  /** Generate a dedup fingerprint from rule + severity + source fields. */
  fingerprint(ruleId: string, severity: string, source?: Record<string, unknown>): string {
    const sourceKey = source ? JSON.stringify(this.sortKeys(source)) : '';
    const raw = `${ruleId}|${severity}|${sourceKey}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Check if an alert with this fingerprint already exists within the dedup window.
   * Returns the existing entry if duplicate, or null if new.
   */
  check(fingerprint: string): DedupEntry | null {
    const entry = this.entries.get(fingerprint);
    if (!entry) return null;

    const age = Date.now() - new Date(entry.lastSeenAt).getTime();
    if (age > this.windowMs) {
      // Window expired — remove entry, treat as new
      this.entries.delete(fingerprint);
      return null;
    }

    return entry;
  }

  /**
   * Record an alert under a fingerprint.
   * If the fingerprint already exists within the window, increments count.
   * Returns { isDuplicate, entry }.
   */
  record(
    fingerprint: string,
    alertId: string,
    ruleId: string,
  ): { isDuplicate: boolean; entry: DedupEntry } {
    const existing = this.check(fingerprint);
    const now = new Date().toISOString();

    if (existing) {
      existing.count++;
      existing.lastSeenAt = now;
      return { isDuplicate: true, entry: existing };
    }

    const entry: DedupEntry = {
      fingerprint,
      alertId,
      ruleId,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    };
    this.entries.set(fingerprint, entry);
    return { isDuplicate: false, entry };
  }

  /** Get dedup stats for monitoring. */
  stats(): { activeFingerprints: number; totalDeduplicated: number } {
    let totalDeduplicated = 0;
    for (const entry of this.entries.values()) {
      if (entry.count > 1) totalDeduplicated += entry.count - 1;
    }
    return { activeFingerprints: this.entries.size, totalDeduplicated };
  }

  /** Purge expired entries (call periodically). */
  purgeExpired(): number {
    let purged = 0;
    const now = Date.now();
    for (const [fp, entry] of this.entries) {
      if (now - new Date(entry.lastSeenAt).getTime() > this.windowMs) {
        this.entries.delete(fp);
        purged++;
      }
    }
    return purged;
  }

  /** Sort object keys for consistent hashing. */
  private sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = obj[key];
    }
    return sorted;
  }

  /** Clear all entries (for testing). */
  clear(): void {
    this.entries.clear();
  }
}
