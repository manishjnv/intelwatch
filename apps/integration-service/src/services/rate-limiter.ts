import { AppError } from '@etip/shared-utils';
import { getLogger } from '../logger.js';

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

/**
 * Per-integration sliding-window rate limiter.
 * Prevents flooding external SIEM/webhook/ticketing systems.
 * Uses a token bucket algorithm — each integration gets a configurable
 * number of requests per minute.
 */
export class IntegrationRateLimiter {
  private readonly buckets = new Map<string, RateLimitEntry>();
  private readonly defaultMaxPerMinute: number;
  private readonly customLimits = new Map<string, number>();

  constructor(defaultMaxPerMinute: number = 60) {
    this.defaultMaxPerMinute = defaultMaxPerMinute;
  }

  /**
   * Set a custom rate limit for a specific integration.
   * @param integrationId The integration to configure
   * @param maxPerMinute Max requests per minute (0 = unlimited)
   */
  setLimit(integrationId: string, maxPerMinute: number): void {
    this.customLimits.set(integrationId, maxPerMinute);
  }

  /**
   * Try to consume a token for the given integration.
   * @returns true if allowed, false if rate limited
   */
  tryConsume(integrationId: string): boolean {
    const maxPerMinute = this.customLimits.get(integrationId) ?? this.defaultMaxPerMinute;
    if (maxPerMinute === 0) return true; // unlimited

    const now = Date.now();
    let entry = this.buckets.get(integrationId);

    if (!entry) {
      entry = { tokens: maxPerMinute, lastRefill: now };
      this.buckets.set(integrationId, entry);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - entry.lastRefill;
    const tokensToAdd = Math.floor((elapsed / 60000) * maxPerMinute);
    if (tokensToAdd > 0) {
      entry.tokens = Math.min(maxPerMinute, entry.tokens + tokensToAdd);
      entry.lastRefill = now;
    }

    if (entry.tokens <= 0) {
      return false;
    }

    entry.tokens--;
    return true;
  }

  /**
   * Check rate limit and throw if exceeded.
   * Use this as a guard before sending to external systems.
   */
  checkOrThrow(integrationId: string): void {
    if (!this.tryConsume(integrationId)) {
      const logger = getLogger();
      logger.warn({ integrationId }, 'Rate limit exceeded');
      throw new AppError(
        429,
        'Integration rate limit exceeded — retry later',
        'INTEGRATION_RATE_LIMITED',
      );
    }
  }

  /** Get current rate limit status for an integration. */
  getStatus(integrationId: string): {
    maxPerMinute: number;
    remainingTokens: number;
    resetInMs: number;
  } {
    const maxPerMinute = this.customLimits.get(integrationId) ?? this.defaultMaxPerMinute;
    const entry = this.buckets.get(integrationId);

    if (!entry) {
      return { maxPerMinute, remainingTokens: maxPerMinute, resetInMs: 0 };
    }

    const elapsed = Date.now() - entry.lastRefill;
    const resetInMs = Math.max(0, 60000 - elapsed);

    return {
      maxPerMinute,
      remainingTokens: Math.max(0, entry.tokens),
      resetInMs,
    };
  }

  /** Reset rate limit state for an integration (e.g., after config change). */
  reset(integrationId: string): void {
    this.buckets.delete(integrationId);
  }

  /** Reset all buckets. */
  resetAll(): void {
    this.buckets.clear();
  }
}
