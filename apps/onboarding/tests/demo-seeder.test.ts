import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DemoSeeder } from '../src/services/demo-seeder.js';

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('DemoSeeder', () => {
  let seeder: DemoSeeder;

  beforeEach(() => {
    seeder = new DemoSeeder();
    // No clients set — uses fallback counts
  });

  describe('seed', () => {
    it('seeds all categories by default (fallback counts without clients)', async () => {
      const result = await seeder.seed('t1');
      expect(result.seeded).toBe(true);
      expect(result.tag).toBe('DEMO');
      expect(result.counts.iocs).toBe(10);
      expect(result.counts.actors).toBe(5);
      expect(result.counts.malware).toBe(5);
      expect(result.counts.vulnerabilities).toBe(5);
      expect(result.counts.feeds).toBe(10);
    });

    it('is idempotent — returns same result on second call', async () => {
      const first = await seeder.seed('t1');
      const second = await seeder.seed('t1');
      expect(first).toEqual(second);
    });

    it('seeds only requested categories', async () => {
      const result = await seeder.seed('t1', ['iocs', 'actors']);
      expect(result.counts.iocs).toBe(10);
      expect(result.counts.actors).toBe(5);
      expect(result.counts.malware).toBe(0);
      expect(result.counts.vulnerabilities).toBe(0);
    });

    it('seeds separate data per tenant', async () => {
      await seeder.seed('t1');
      await seeder.seed('t2');
      expect(seeder.isSeeded('t1')).toBe(true);
      expect(seeder.isSeeded('t2')).toBe(true);
    });
  });

  describe('isSeeded', () => {
    it('returns false for unseeded tenant', () => {
      expect(seeder.isSeeded('t1')).toBe(false);
    });

    it('returns true after seeding', async () => {
      await seeder.seed('t1');
      expect(seeder.isSeeded('t1')).toBe(true);
    });
  });

  describe('getSeedResult', () => {
    it('returns null for unseeded tenant', () => {
      expect(seeder.getSeedResult('t1')).toBeNull();
    });

    it('returns result after seeding', async () => {
      await seeder.seed('t1');
      const result = seeder.getSeedResult('t1');
      expect(result).not.toBeNull();
      expect(result?.seeded).toBe(true);
    });
  });

  describe('getAvailableDemoData', () => {
    it('returns expected counts', () => {
      const counts = seeder.getAvailableDemoData();
      expect(counts.iocs).toBe(10);
      expect(counts.actors).toBe(5);
      expect(counts.malware).toBe(5);
      expect(counts.vulnerabilities).toBe(5);
      expect(counts.alerts).toBe(0);
    });
  });

  describe('clearDemoData', () => {
    it('clears seeded flag', async () => {
      await seeder.seed('t1');
      expect(seeder.isSeeded('t1')).toBe(true);
      seeder.clearDemoData('t1');
      expect(seeder.isSeeded('t1')).toBe(false);
    });

    it('clears result', async () => {
      await seeder.seed('t1');
      seeder.clearDemoData('t1');
      expect(seeder.getSeedResult('t1')).toBeNull();
    });

    it('allows re-seeding after clear', async () => {
      await seeder.seed('t1');
      seeder.clearDemoData('t1');
      const result = await seeder.seed('t1');
      expect(result.seeded).toBe(true);
    });
  });
});
