import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnrichmentCostTracker } from '../src/cost-tracker.js';

describe('EnrichmentCostTracker', () => {
  let tracker: EnrichmentCostTracker;

  beforeEach(() => {
    tracker = new EnrichmentCostTracker();
  });

  // --- calculateCost ---

  describe('calculateCost', () => {
    it('calculates Haiku cost correctly', () => {
      // 500 input @ $0.25/MTok + 100 output @ $1.25/MTok
      // = 0.000125 + 0.000125 = 0.00025
      const cost = tracker.calculateCost(500, 100, 'haiku');
      expect(cost).toBe(0.00025);
    });

    it('calculates Sonnet cost correctly', () => {
      // 2000 input @ $3.00/MTok + 500 output @ $15.00/MTok
      // = 0.006 + 0.0075 = 0.0135
      const cost = tracker.calculateCost(2000, 500, 'sonnet');
      expect(cost).toBe(0.0135);
    });

    it('calculates Opus cost correctly', () => {
      // 1000 input @ $15.00/MTok + 200 output @ $75.00/MTok
      // = 0.015 + 0.015 = 0.03
      const cost = tracker.calculateCost(1000, 200, 'opus');
      expect(cost).toBe(0.03);
    });

    it('returns 0 for zero tokens', () => {
      expect(tracker.calculateCost(0, 0, 'haiku')).toBe(0);
    });

    it('maintains 6-decimal precision for tiny amounts', () => {
      // 1 input @ $0.25/MTok + 1 output @ $1.25/MTok
      // = 0.00000025 + 0.00000125 = 0.0000015 → rounds to 0.000002
      const cost = tracker.calculateCost(1, 1, 'haiku');
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.001);
    });
  });

  // --- trackProvider ---

  describe('trackProvider', () => {
    it('records VT provider with 0 cost and 0 tokens', () => {
      const record = tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 1200);
      expect(record.provider).toBe('virustotal');
      expect(record.model).toBeNull();
      expect(record.costUsd).toBe(0);
      expect(record.inputTokens).toBe(0);
      expect(record.durationMs).toBe(1200);
    });

    it('records AbuseIPDB provider with 0 cost', () => {
      const record = tracker.trackProvider('ioc-1', 'ip', 'abuseipdb', 0, 0, null, 800);
      expect(record.provider).toBe('abuseipdb');
      expect(record.costUsd).toBe(0);
      expect(record.durationMs).toBe(800);
    });

    it('records Haiku provider with token-based cost', () => {
      const record = tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 120, 80, 'haiku', 450);
      expect(record.provider).toBe('haiku_triage');
      expect(record.model).toBe('haiku');
      expect(record.inputTokens).toBe(120);
      expect(record.outputTokens).toBe(80);
      expect(record.costUsd).toBeGreaterThan(0);
      expect(record.durationMs).toBe(450);
    });

    it('records timestamp on each entry', () => {
      const before = new Date();
      const record = tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 100);
      const after = new Date();
      expect(new Date(record.timestamp).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(new Date(record.timestamp).getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('stores multiple providers for same IOC', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 1200);
      tracker.trackProvider('ioc-1', 'ip', 'abuseipdb', 0, 0, null, 800);
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 120, 80, 'haiku', 450);
      const cost = tracker.getIOCCost('ioc-1');
      expect(cost.providerCount).toBe(3);
    });
  });

  // --- getIOCCost ---

  describe('getIOCCost', () => {
    it('returns full breakdown for IOC with 3 providers', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 1200);
      tracker.trackProvider('ioc-1', 'ip', 'abuseipdb', 0, 0, null, 800);
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 120, 80, 'haiku', 450);

      const cost = tracker.getIOCCost('ioc-1');
      expect(cost.iocId).toBe('ioc-1');
      expect(cost.providers).toHaveLength(3);
      expect(cost.providerCount).toBe(3);
    });

    it('sums totalTokens correctly across providers', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 100);
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 120, 80, 'haiku', 450);

      const cost = tracker.getIOCCost('ioc-1');
      expect(cost.totalTokens).toBe(200); // 0 + 0 + 120 + 80
    });

    it('sums totalCostUsd correctly (VT $0 + Abuse $0 + Haiku > $0)', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 100);
      tracker.trackProvider('ioc-1', 'ip', 'abuseipdb', 0, 0, null, 100);
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 120, 80, 'haiku', 450);

      const cost = tracker.getIOCCost('ioc-1');
      expect(cost.totalCostUsd).toBeGreaterThan(0);
      // Only haiku contributes cost
      const haikuOnly = cost.providers.find(p => p.provider === 'haiku_triage');
      expect(cost.totalCostUsd).toBe(haikuOnly!.costUsd);
    });

    it('returns zero totals for unknown IOC ID', () => {
      const cost = tracker.getIOCCost('unknown-id');
      expect(cost.providers).toHaveLength(0);
      expect(cost.totalTokens).toBe(0);
      expect(cost.totalCostUsd).toBe(0);
      expect(cost.providerCount).toBe(0);
    });

    it('handles re-enrichment (multiple calls to same IOC)', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 100);
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 200);

      const cost = tracker.getIOCCost('ioc-1');
      expect(cost.providers).toHaveLength(2);
    });
  });

  // --- getAggregateStats ---

  describe('getAggregateStats', () => {
    it('returns zeros when no IOCs tracked', () => {
      const stats = tracker.getAggregateStats();
      expect(stats.totalIOCsEnriched).toBe(0);
      expect(stats.totalCostUsd).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.headline).toContain('0 IOCs');
    });

    it('counts totalIOCsEnriched correctly after multiple IOCs', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 100);
      tracker.trackProvider('ioc-2', 'domain', 'virustotal', 0, 0, null, 100);
      tracker.trackProvider('ioc-3', 'hash_sha256', 'virustotal', 0, 0, null, 100);

      const stats = tracker.getAggregateStats();
      expect(stats.totalIOCsEnriched).toBe(3);
    });

    it('breaks down by provider correctly', () => {
      tracker.trackProvider('ioc-1', 'ip', 'virustotal', 0, 0, null, 100);
      tracker.trackProvider('ioc-1', 'ip', 'abuseipdb', 0, 0, null, 100);
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 120, 80, 'haiku', 450);
      tracker.trackProvider('ioc-2', 'ip', 'virustotal', 0, 0, null, 100);

      const stats = tracker.getAggregateStats();
      expect(stats.byProvider.virustotal.count).toBe(2);
      expect(stats.byProvider.abuseipdb.count).toBe(1);
      expect(stats.byProvider.haiku_triage.count).toBe(1);
      expect(stats.byProvider.virustotal.costUsd).toBe(0);
      expect(stats.byProvider.haiku_triage.costUsd).toBeGreaterThan(0);
    });

    it('breaks down by IOC type correctly', () => {
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 100, 50, 'haiku', 400);
      tracker.trackProvider('ioc-2', 'domain', 'haiku_triage', 100, 50, 'haiku', 400);
      tracker.trackProvider('ioc-3', 'ip', 'haiku_triage', 100, 50, 'haiku', 400);

      const stats = tracker.getAggregateStats();
      expect(stats.byIOCType.ip.count).toBe(2);
      expect(stats.byIOCType.domain.count).toBe(1);
    });

    it('includes since timestamp', () => {
      const before = new Date().toISOString();
      const stats = tracker.getAggregateStats();
      expect(stats.since).toBeDefined();
      expect(new Date(stats.since).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 100);
    });

    it('generates headline string in correct format', () => {
      tracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 500, 100, 'haiku', 400);
      const stats = tracker.getAggregateStats();
      expect(stats.headline).toMatch(/1 IOCs? enriched for \$/);
    });
  });

  // --- tenant budget ---

  describe('tenant budget', () => {
    it('tracks tenant spend across multiple IOCs', () => {
      tracker.addTenantSpend('tenant-1', 0.001);
      tracker.addTenantSpend('tenant-1', 0.002);
      expect(tracker.getTenantSpend('tenant-1')).toBeCloseTo(0.003);
    });

    it('returns 0 for unknown tenant', () => {
      expect(tracker.getTenantSpend('unknown')).toBe(0);
    });

    it('detects over-budget correctly', () => {
      tracker.addTenantSpend('tenant-1', 6.00);
      const alert = tracker.checkBudgetAlert('tenant-1', 5.00);
      expect(alert.isOverBudget).toBe(true);
      expect(alert.percentUsed).toBeGreaterThan(100);
    });

    it('detects under-budget correctly', () => {
      tracker.addTenantSpend('tenant-1', 1.00);
      const alert = tracker.checkBudgetAlert('tenant-1', 5.00);
      expect(alert.isOverBudget).toBe(false);
      expect(alert.percentUsed).toBe(20);
    });

    it('resets window after 24 hours', () => {
      tracker.addTenantSpend('tenant-1', 5.00);
      expect(tracker.getTenantSpend('tenant-1')).toBe(5.00);

      // Simulate 25 hours passing
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000));

      expect(tracker.getTenantSpend('tenant-1')).toBe(0);
      vi.useRealTimers();
    });
  });

  // --- getPricing ---

  describe('getPricing', () => {
    it('returns haiku pricing matching ingestion constants', () => {
      const pricing = EnrichmentCostTracker.getPricing();
      expect(pricing.haiku.input).toBe(0.25);
      expect(pricing.haiku.output).toBe(1.25);
    });

    it('returns sonnet pricing matching ingestion constants', () => {
      const pricing = EnrichmentCostTracker.getPricing();
      expect(pricing.sonnet.input).toBe(3.00);
      expect(pricing.sonnet.output).toBe(15.00);
    });

    it('returns a copy (not the original object reference)', () => {
      const p1 = EnrichmentCostTracker.getPricing();
      const p2 = EnrichmentCostTracker.getPricing();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });
});
