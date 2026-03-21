import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('RateLimiter', () => {
  it('allows requests under limit', () => {
    const limiter = new RateLimiter('test', { maxRequests: 3, windowMs: 60_000 }, logger);
    expect(limiter.canRequest()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canRequest()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canRequest()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canRequest()).toBe(false);
  });

  it('returns correct stats', () => {
    const limiter = new RateLimiter('test', { maxRequests: 5, windowMs: 60_000 }, logger);
    limiter.recordRequest();
    limiter.recordRequest();
    const stats = limiter.stats();
    expect(stats.used).toBe(2);
    expect(stats.max).toBe(5);
    expect(stats.windowMs).toBe(60_000);
  });

  it('msUntilReady returns 0 when under limit', () => {
    const limiter = new RateLimiter('test', { maxRequests: 2, windowMs: 60_000 }, logger);
    expect(limiter.msUntilReady()).toBe(0);
  });

  it('msUntilReady returns positive when at limit', () => {
    const limiter = new RateLimiter('test', { maxRequests: 1, windowMs: 60_000 }, logger);
    limiter.recordRequest();
    const wait = limiter.msUntilReady();
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60_000);
  });
});
