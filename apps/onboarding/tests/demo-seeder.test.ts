import { describe, it, expect, beforeEach } from 'vitest';
import { DemoSeeder } from '../src/services/demo-seeder.js';

describe('DemoSeeder', () => {
  let seeder: DemoSeeder;

  beforeEach(() => {
    seeder = new DemoSeeder();
  });

  describe('seed', () => {
    it('seeds all categories by default', () => {
      const result = seeder.seed('t1');
      expect(result.seeded).toBe(true);
      expect(result.tag).toBe('DEMO');
      expect(result.counts.iocs).toBe(150);
      expect(result.counts.actors).toBe(10);
      expect(result.counts.malware).toBe(20);
      expect(result.counts.vulnerabilities).toBe(50);
      expect(result.counts.alerts).toBe(5);
    });

    it('is idempotent — returns same result on second call', () => {
      const first = seeder.seed('t1');
      const second = seeder.seed('t1');
      expect(first).toEqual(second);
    });

    it('seeds only requested categories', () => {
      const result = seeder.seed('t1', ['iocs', 'actors']);
      expect(result.counts.iocs).toBe(150);
      expect(result.counts.actors).toBe(10);
      expect(result.counts.malware).toBe(0);
      expect(result.counts.vulnerabilities).toBe(0);
      expect(result.counts.alerts).toBe(0);
    });

    it('seeds separate data per tenant', () => {
      seeder.seed('t1');
      seeder.seed('t2');
      expect(seeder.isSeeded('t1')).toBe(true);
      expect(seeder.isSeeded('t2')).toBe(true);
    });
  });

  describe('isSeeded', () => {
    it('returns false for unseeded tenant', () => {
      expect(seeder.isSeeded('t1')).toBe(false);
    });

    it('returns true after seeding', () => {
      seeder.seed('t1');
      expect(seeder.isSeeded('t1')).toBe(true);
    });
  });

  describe('getSeedResult', () => {
    it('returns null for unseeded tenant', () => {
      expect(seeder.getSeedResult('t1')).toBeNull();
    });

    it('returns result after seeding', () => {
      seeder.seed('t1');
      const result = seeder.getSeedResult('t1');
      expect(result).not.toBeNull();
      expect(result?.seeded).toBe(true);
    });
  });

  describe('getAvailableDemoData', () => {
    it('returns expected counts', () => {
      const counts = seeder.getAvailableDemoData();
      expect(counts.iocs).toBe(150);
      expect(counts.actors).toBe(10);
      expect(counts.malware).toBe(20);
      expect(counts.vulnerabilities).toBe(50);
      expect(counts.alerts).toBe(3);
    });
  });

  describe('clearDemoData', () => {
    it('clears seeded flag', () => {
      seeder.seed('t1');
      expect(seeder.isSeeded('t1')).toBe(true);
      seeder.clearDemoData('t1');
      expect(seeder.isSeeded('t1')).toBe(false);
    });

    it('clears result', () => {
      seeder.seed('t1');
      seeder.clearDemoData('t1');
      expect(seeder.getSeedResult('t1')).toBeNull();
    });

    it('allows re-seeding after clear', () => {
      seeder.seed('t1');
      seeder.clearDemoData('t1');
      const result = seeder.seed('t1');
      expect(result.seeded).toBe(true);
    });
  });
});
