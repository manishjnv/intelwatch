import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimitTracker } from '../src/services/rate-limit-tracker.js';
import { IntegrationRateLimiter } from '../src/services/rate-limiter.js';

describe('RateLimitTracker', () => {
  let limiter: IntegrationRateLimiter;
  let tracker: RateLimitTracker;

  beforeEach(() => {
    limiter = new IntegrationRateLimiter(60);
    tracker = new RateLimitTracker(limiter);
  });

  it('records a non-throttled request', () => {
    tracker.recordRequest('int-1', false);
    const dashboard = tracker.getDashboard('int-1');
    expect(dashboard.currentRate).toBe(1);
    expect(dashboard.throttleCount).toBe(0);
    expect(dashboard.timeSeries).toHaveLength(1);
    expect(dashboard.timeSeries[0]!.throttled).toBe(false);
  });

  it('records a throttled request', () => {
    tracker.recordRequest('int-1', true);
    const dashboard = tracker.getDashboard('int-1');
    expect(dashboard.throttleCount).toBe(1);
    expect(dashboard.timeSeries[0]!.throttled).toBe(true);
  });

  it('increments requestsPerMinute within same minute', () => {
    tracker.recordRequest('int-1', false);
    tracker.recordRequest('int-1', false);
    tracker.recordRequest('int-1', false);
    const dashboard = tracker.getDashboard('int-1');
    expect(dashboard.timeSeries).toHaveLength(1);
    expect(dashboard.timeSeries[0]!.requestsPerMinute).toBe(3);
  });

  it('accumulates throttle count across requests', () => {
    tracker.recordRequest('int-1', true);
    tracker.recordRequest('int-1', true);
    tracker.recordRequest('int-1', false);
    expect(tracker.getThrottleCount('int-1')).toBe(2);
  });

  it('returns empty dashboard for unknown integration', () => {
    const dashboard = tracker.getDashboard('unknown');
    expect(dashboard.currentRate).toBe(0);
    expect(dashboard.throttleCount).toBe(0);
    expect(dashboard.timeSeries).toEqual([]);
  });

  it('reports maxRate from rate limiter', () => {
    const dashboard = tracker.getDashboard('int-1');
    expect(dashboard.maxRate).toBe(60);
  });

  it('reports quotaRemaining from rate limiter', () => {
    limiter.tryConsume('int-1');
    limiter.tryConsume('int-1');
    const dashboard = tracker.getDashboard('int-1');
    expect(dashboard.quotaRemaining).toBe(58);
  });

  it('getTimeSeries returns data points', () => {
    tracker.recordRequest('int-1', false);
    const series = tracker.getTimeSeries('int-1');
    expect(series).toHaveLength(1);
    expect(series[0]!.timestamp).toBeDefined();
  });

  it('returns empty time series for unknown integration', () => {
    expect(tracker.getTimeSeries('unknown')).toEqual([]);
  });

  it('reset clears all tracking data', () => {
    tracker.recordRequest('int-1', true);
    tracker.reset('int-1');
    expect(tracker.getDashboard('int-1').currentRate).toBe(0);
    expect(tracker.getThrottleCount('int-1')).toBe(0);
  });

  it('resetAll clears everything', () => {
    tracker.recordRequest('int-1', false);
    tracker.recordRequest('int-2', true);
    tracker.resetAll();
    expect(tracker.getDashboard('int-1').timeSeries).toEqual([]);
    expect(tracker.getDashboard('int-2').timeSeries).toEqual([]);
  });

  it('tracks integrations independently', () => {
    tracker.recordRequest('int-1', false);
    tracker.recordRequest('int-2', true);
    expect(tracker.getDashboard('int-1').throttleCount).toBe(0);
    expect(tracker.getDashboard('int-2').throttleCount).toBe(1);
  });
});
