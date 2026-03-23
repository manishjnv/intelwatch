import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationRateLimiter } from '../src/services/rate-limiter.js';

describe('IntegrationRateLimiter', () => {
  let limiter: IntegrationRateLimiter;

  beforeEach(() => {
    limiter = new IntegrationRateLimiter(5); // 5 per minute for tests
  });

  it('allows requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume('int-1')).toBe(true);
    }
  });

  it('blocks requests beyond limit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.tryConsume('int-1');
    }
    expect(limiter.tryConsume('int-1')).toBe(false);
  });

  it('tracks limits independently per integration', () => {
    for (let i = 0; i < 5; i++) {
      limiter.tryConsume('int-1');
    }
    // int-1 is exhausted
    expect(limiter.tryConsume('int-1')).toBe(false);
    // int-2 still has tokens
    expect(limiter.tryConsume('int-2')).toBe(true);
  });

  it('supports custom limits per integration', () => {
    limiter.setLimit('int-1', 2);
    expect(limiter.tryConsume('int-1')).toBe(true);
    expect(limiter.tryConsume('int-1')).toBe(true);
    expect(limiter.tryConsume('int-1')).toBe(false);
  });

  it('unlimited when maxPerMinute = 0', () => {
    limiter.setLimit('int-1', 0);
    for (let i = 0; i < 100; i++) {
      expect(limiter.tryConsume('int-1')).toBe(true);
    }
  });

  it('checkOrThrow throws AppError on limit exceeded', () => {
    limiter.setLimit('int-1', 1);
    limiter.tryConsume('int-1');
    expect(() => limiter.checkOrThrow('int-1')).toThrow('rate limit exceeded');
  });

  it('getStatus returns correct remaining tokens', () => {
    limiter.tryConsume('int-1');
    limiter.tryConsume('int-1');
    const status = limiter.getStatus('int-1');
    expect(status.maxPerMinute).toBe(5);
    expect(status.remainingTokens).toBe(3);
  });

  it('getStatus returns full tokens for unknown integration', () => {
    const status = limiter.getStatus('unknown');
    expect(status.remainingTokens).toBe(5);
    expect(status.resetInMs).toBe(0);
  });

  it('reset clears tokens for an integration', () => {
    for (let i = 0; i < 5; i++) {
      limiter.tryConsume('int-1');
    }
    expect(limiter.tryConsume('int-1')).toBe(false);
    limiter.reset('int-1');
    expect(limiter.tryConsume('int-1')).toBe(true);
  });

  it('resetAll clears all buckets', () => {
    limiter.tryConsume('int-1');
    limiter.tryConsume('int-2');
    limiter.resetAll();
    const s1 = limiter.getStatus('int-1');
    const s2 = limiter.getStatus('int-2');
    expect(s1.remainingTokens).toBe(5);
    expect(s2.remainingTokens).toBe(5);
  });
});
