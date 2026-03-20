import { describe, it, expect, beforeEach } from 'vitest';
import { IOCReactivationDetector } from '../src/services/ioc-reactivation.js';

const TENANT = 'tenant-1';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('IOCReactivationDetector', () => {
  let detector: IOCReactivationDetector;

  beforeEach(() => {
    detector = new IOCReactivationDetector();
  });

  describe('recordSighting', () => {
    it('registers new IOC as "new" state', () => {
      const event = detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8);
      expect(event).toBeNull(); // No reactivation on first sight

      const record = detector.getRecord('1.2.3.4', 'ip', TENANT);
      expect(record?.state).toBe('new');
    });

    it('transitions new → active on second sighting', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(5));
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(3));

      const record = detector.getRecord('1.2.3.4', 'ip', TENANT);
      expect(record?.state).toBe('active');
    });

    it('detects reactivation after cooldown from aging state', () => {
      const now = new Date();
      // First seen 100 days ago, second sighting at 99 days to make it 'active'
      detector.recordSighting('evil.com', 'domain', TENANT, 0.7, daysAgo(100));
      detector.recordSighting('evil.com', 'domain', TENANT, 0.7, daysAgo(99));
      // Age it to "aging" (domain threshold = 90 days)
      detector.ageIOCs(TENANT, daysAgo(1));

      const record = detector.getRecord('evil.com', 'domain', TENANT);
      expect(record?.state).toBe('aging');

      // Reappears now (60 days cooldown) — should trigger reactivation
      const event = detector.recordSighting('evil.com', 'domain', TENANT, 0.75, now);
      expect(event).not.toBeNull();
      expect(event!.newState).toBe('reactivated');
      expect(event!.previousState).toBe('aging');
      expect(event!.cooldownDays).toBeGreaterThan(50);
    });

    it('detects reactivation from expired state', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(120));
      detector.ageIOCs(TENANT, daysAgo(1));

      const record = detector.getRecord('1.2.3.4', 'ip', TENANT);
      expect(record?.state).toBe('expired'); // 120 days > 60 (2x aging threshold for IP)

      const event = detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.9, new Date());
      expect(event).not.toBeNull();
      expect(event!.previousState).toBe('expired');
      expect(event!.newState).toBe('reactivated');
    });

    it('does NOT trigger reactivation for short cooldown (<7 days)', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(35));
      detector.ageIOCs(TENANT, daysAgo(3));

      // Only 3 days since aging — below REACTIVATION_MIN_COOLDOWN_DAYS (7)
      const event = detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, new Date());
      expect(event).toBeNull();
    });

    it('boosts confidence on reactivation by 20%', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(100));
      detector.ageIOCs(TENANT, daysAgo(1));

      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, new Date());
      const record = detector.getRecord('1.2.3.4', 'ip', TENANT);
      expect(record?.confidence).toBe(0.84); // 0.7 * 1.2
    });

    it('tracks reactivation count', () => {
      // First seen + make active
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(120));
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(119));
      // Age to expired (120 - 60 threshold * 2 = expired)
      detector.ageIOCs(TENANT, daysAgo(55));
      // First reactivation (55 days since last seen at day 119)
      let event = detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(50));
      expect(event!.reactivationCount).toBe(1);

      // Transition reactivated → active via another sighting
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(49));
      // Age again
      detector.ageIOCs(TENANT, daysAgo(10));
      // Second reactivation (39 days since last seen at day 49)
      event = detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, new Date());
      expect(event!.reactivationCount).toBe(2);
    });

    it('returns critical priority for multiple reactivations', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(300));
      detector.ageIOCs(TENANT, daysAgo(200));
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(190));

      detector.ageIOCs(TENANT, daysAgo(100));
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(90));

      detector.ageIOCs(TENANT, daysAgo(10));
      const event = detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, new Date());
      expect(event!.priorityBoost).toBe('critical');
      expect(event!.reactivationCount).toBe(3);
    });
  });

  describe('ageIOCs', () => {
    it('transitions active → aging after threshold', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(35));
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(34)); // Make active

      const result = detector.ageIOCs(TENANT, new Date());
      expect(result.aged).toBe(1);

      const record = detector.getRecord('1.2.3.4', 'ip', TENANT);
      expect(record?.state).toBe('aging');
    });

    it('transitions active → expired after 2x threshold', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(65));
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(64));

      const result = detector.ageIOCs(TENANT, new Date());
      expect(result.expired).toBe(1);
    });

    it('never ages hash IOCs', () => {
      detector.recordSighting('abc123', 'hash_sha256', TENANT, 0.9, daysAgo(365));
      detector.recordSighting('abc123', 'hash_sha256', TENANT, 0.9, daysAgo(364));

      const result = detector.ageIOCs(TENANT, new Date());
      expect(result.aged).toBe(0);
      expect(result.expired).toBe(0);
    });

    it('skips false_positive IOCs', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8, daysAgo(100));
      detector.markFalsePositive('1.2.3.4', 'ip', TENANT);

      const result = detector.ageIOCs(TENANT, new Date());
      expect(result.aged).toBe(0);
      expect(result.expired).toBe(0);
    });
  });

  describe('getReactivated', () => {
    it('returns all reactivated IOCs for a tenant', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, daysAgo(100));
      detector.recordSighting('evil.com', 'domain', TENANT, 0.6, daysAgo(200));
      detector.ageIOCs(TENANT, daysAgo(1));

      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.7, new Date());
      detector.recordSighting('evil.com', 'domain', TENANT, 0.6, new Date());

      const reactivated = detector.getReactivated(TENANT);
      expect(reactivated).toHaveLength(2);
    });
  });

  describe('markFalsePositive', () => {
    it('marks an IOC as false positive', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8);
      const result = detector.markFalsePositive('1.2.3.4', 'ip', TENANT);
      expect(result).toBe(true);

      const record = detector.getRecord('1.2.3.4', 'ip', TENANT);
      expect(record?.state).toBe('false_positive');
    });

    it('returns false for unknown IOC', () => {
      const result = detector.markFalsePositive('unknown', 'ip', TENANT);
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      detector.recordSighting('1.2.3.4', 'ip', TENANT, 0.8);
      detector.clear();
      expect(detector.getRecord('1.2.3.4', 'ip', TENANT)).toBeNull();
    });
  });
});
