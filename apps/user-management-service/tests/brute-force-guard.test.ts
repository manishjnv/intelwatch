import { describe, it, expect, beforeEach } from 'vitest';
import { BruteForceGuard } from '../src/services/brute-force-guard.js';

describe('BruteForceGuard', () => {
  let guard: BruteForceGuard;

  beforeEach(() => {
    guard = new BruteForceGuard(3, 1, 5); // 3 attempts, 1 min lockout, 5 min window
  });

  describe('Failure tracking', () => {
    it('records first failure and returns remaining attempts', () => {
      const remaining = guard.recordFailure('user-1');
      expect(remaining).toBe(2);
    });

    it('increments failure count', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      expect(guard.getAttemptCount('user-1')).toBe(2);
    });

    it('locks account after max failures', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      expect(() => guard.recordFailure('user-1')).toThrow('Account locked');
    });

    it('locked account rejects further attempts', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      try { guard.recordFailure('user-1'); } catch { /* expected */ }
      expect(() => guard.checkLocked('user-1')).toThrow('Account locked');
    });

    it('different users tracked independently', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      expect(guard.getAttemptCount('user-2')).toBe(0);
    });
  });

  describe('Success reset', () => {
    it('resets counter on success', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      guard.recordSuccess('user-1');
      expect(guard.getAttemptCount('user-1')).toBe(0);
    });
  });

  describe('Admin unlock', () => {
    it('unlocks a locked account', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      try { guard.recordFailure('user-1'); } catch { /* expected */ }
      guard.unlock('user-1');
      expect(guard.isLocked('user-1')).toBe(false);
    });
  });

  describe('Status reporting', () => {
    it('returns clean status for unknown user', () => {
      const status = guard.getStatus('unknown');
      expect(status.count).toBe(0);
      expect(status.isLocked).toBe(false);
      expect(status.lockedUntil).toBeNull();
    });

    it('returns locked status with expiry', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      try { guard.recordFailure('user-1'); } catch { /* expected */ }
      const status = guard.getStatus('user-1');
      expect(status.isLocked).toBe(true);
      expect(status.lockedUntil).toBeDefined();
    });
  });

  describe('isLocked check', () => {
    it('returns false for unknown user', () => {
      expect(guard.isLocked('nobody')).toBe(false);
    });

    it('returns true for locked user', () => {
      guard.recordFailure('user-1');
      guard.recordFailure('user-1');
      try { guard.recordFailure('user-1'); } catch { /* expected */ }
      expect(guard.isLocked('user-1')).toBe(true);
    });
  });
});
