import { AppError } from '@etip/shared-utils';

/** Failed attempt tracking record. */
interface AttemptRecord {
  count: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

/**
 * In-memory brute-force protection guard.
 * Tracks failed auth attempts per user/IP and enforces lockout.
 */
export class BruteForceGuard {
  private attempts = new Map<string, AttemptRecord>();
  private maxAttempts: number;
  private lockoutDurationMs: number;
  private windowMs: number;

  /**
   * @param maxAttempts Max failed attempts before lockout (default 5).
   * @param lockoutMinutes Lockout duration in minutes (default 15).
   * @param windowMinutes Time window for counting attempts (default 15).
   */
  constructor(maxAttempts: number = 5, lockoutMinutes: number = 15, windowMinutes: number = 15) {
    this.maxAttempts = maxAttempts;
    this.lockoutDurationMs = lockoutMinutes * 60 * 1000;
    this.windowMs = windowMinutes * 60 * 1000;
  }

  /**
   * Record a failed attempt. Throws if account is locked.
   * @param identifier User ID or IP address to track.
   * @returns Number of remaining attempts before lockout.
   */
  recordFailure(identifier: string): number {
    this.checkLocked(identifier);

    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || (now - record.lastAttempt > this.windowMs)) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now, lockedUntil: null });
      return this.maxAttempts - 1;
    }

    const newCount = record.count + 1;
    if (newCount >= this.maxAttempts) {
      this.attempts.set(identifier, {
        count: newCount,
        lastAttempt: now,
        lockedUntil: now + this.lockoutDurationMs,
      });
      throw new AppError(429, 'Account locked due to too many failed attempts', 'ACCOUNT_LOCKED', {
        lockoutMinutes: this.lockoutDurationMs / 60000,
        retryAfter: new Date(now + this.lockoutDurationMs).toISOString(),
      });
    }

    this.attempts.set(identifier, { count: newCount, lastAttempt: now, lockedUntil: null });
    return this.maxAttempts - newCount;
  }

  /** Record a successful attempt — resets the failure counter. */
  recordSuccess(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /** Check if an identifier is currently locked. Throws if locked. */
  checkLocked(identifier: string): void {
    const record = this.attempts.get(identifier);
    if (!record?.lockedUntil) return;

    const now = Date.now();
    if (now < record.lockedUntil) {
      throw new AppError(429, 'Account locked due to too many failed attempts', 'ACCOUNT_LOCKED', {
        lockoutMinutes: this.lockoutDurationMs / 60000,
        retryAfter: new Date(record.lockedUntil).toISOString(),
      });
    }

    // Lockout expired — reset
    this.attempts.delete(identifier);
  }

  /** Admin unlock — immediately clears lockout. */
  unlock(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /** Check if locked without throwing. */
  isLocked(identifier: string): boolean {
    const record = this.attempts.get(identifier);
    if (!record?.lockedUntil) return false;
    if (Date.now() >= record.lockedUntil) {
      this.attempts.delete(identifier);
      return false;
    }
    return true;
  }

  /** Get current attempt count for an identifier. */
  getAttemptCount(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record) return 0;
    if (Date.now() - record.lastAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return 0;
    }
    return record.count;
  }

  /** Get status for admin view. */
  getStatus(identifier: string): { count: number; isLocked: boolean; lockedUntil: string | null } {
    const record = this.attempts.get(identifier);
    if (!record) return { count: 0, isLocked: false, lockedUntil: null };

    const locked = this.isLocked(identifier);
    return {
      count: record.count,
      isLocked: locked,
      lockedUntil: locked && record.lockedUntil ? new Date(record.lockedUntil).toISOString() : null,
    };
  }
}
