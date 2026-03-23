import type {
  RateLimitDataPoint,
  RateLimitDashboard,
} from '../schemas/integration.js';
import type { IntegrationRateLimiter } from './rate-limiter.js';

/**
 * P2 #13: Per-integration rate limit tracking with time-series data.
 * Records requests/min, quota remaining, and throttle events
 * for dashboard visualization.
 */
export class RateLimitTracker {
  private timeSeries = new Map<string, RateLimitDataPoint[]>();
  private throttleCounts = new Map<string, number>();
  private readonly maxDataPoints = 60; // Last 60 data points (1 per minute = 1 hour)

  constructor(private readonly rateLimiter: IntegrationRateLimiter) {}

  /** Record a request for an integration (called on each API call). */
  recordRequest(integrationId: string, throttled: boolean): void {
    if (!this.timeSeries.has(integrationId)) {
      this.timeSeries.set(integrationId, []);
    }

    const series = this.timeSeries.get(integrationId)!;
    const now = new Date();
    const minuteKey = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM

    // Find or create the current minute's data point
    const lastPoint = series[series.length - 1];
    if (lastPoint && lastPoint.timestamp.slice(0, 16) === minuteKey) {
      lastPoint.requestsPerMinute++;
      if (throttled) lastPoint.throttled = true;
    } else {
      const status = this.rateLimiter.getStatus(integrationId);
      series.push({
        timestamp: now.toISOString(),
        requestsPerMinute: 1,
        quotaRemaining: status.remainingTokens,
        throttled,
      });

      // Trim to max data points
      if (series.length > this.maxDataPoints) {
        series.shift();
      }
    }

    if (throttled) {
      this.throttleCounts.set(
        integrationId,
        (this.throttleCounts.get(integrationId) ?? 0) + 1,
      );
    }
  }

  /** Get rate limit dashboard data for an integration. */
  getDashboard(integrationId: string): RateLimitDashboard {
    const status = this.rateLimiter.getStatus(integrationId);
    const series = this.timeSeries.get(integrationId) ?? [];
    const throttleCount = this.throttleCounts.get(integrationId) ?? 0;

    // Calculate current rate from last data point
    const lastPoint = series[series.length - 1];
    const currentRate = lastPoint?.requestsPerMinute ?? 0;

    return {
      integrationId,
      currentRate,
      maxRate: status.maxPerMinute,
      quotaRemaining: status.remainingTokens,
      throttleCount,
      timeSeries: series,
    };
  }

  /** Get time-series data for an integration. */
  getTimeSeries(integrationId: string): RateLimitDataPoint[] {
    return this.timeSeries.get(integrationId) ?? [];
  }

  /** Get total throttle count for an integration. */
  getThrottleCount(integrationId: string): number {
    return this.throttleCounts.get(integrationId) ?? 0;
  }

  /** Reset tracking data for an integration. */
  reset(integrationId: string): void {
    this.timeSeries.delete(integrationId);
    this.throttleCounts.delete(integrationId);
  }

  /** Reset all tracking data. */
  resetAll(): void {
    this.timeSeries.clear();
    this.throttleCounts.clear();
  }
}
