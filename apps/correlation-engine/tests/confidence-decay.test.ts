import { describe, it, expect } from 'vitest';
import { ConfidenceDecayService } from '../src/services/confidence-decay.js';
import type { CorrelationResult, CorrelatedIOC } from '../src/schemas/correlation.js';

function makeIOC(overrides: Partial<CorrelatedIOC> = {}): CorrelatedIOC {
  return {
    id: 'ioc-1', tenantId: 't1', iocType: 'ip', value: '1.2.3.4',
    normalizedValue: '1.2.3.4', confidence: 80, severity: 'HIGH',
    tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
    sourceFeedIds: ['f1'], firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(), enrichmentQuality: 0.7,
    ...overrides,
  };
}

function makeResult(overrides: Partial<CorrelationResult> = {}): CorrelationResult {
  return {
    id: 'cr-1', tenantId: 't1', correlationType: 'cooccurrence',
    severity: 'MEDIUM', confidence: 0.85, entities: [
      { entityId: 'ioc-1', entityType: 'ioc', label: '1.2.3.4', role: 'primary', confidence: 0.8 },
      { entityId: 'ioc-2', entityType: 'ioc', label: '5.6.7.8', role: 'related', confidence: 0.7 },
    ],
    metadata: {}, suppressed: false, ruleId: 'rule-cooc',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ConfidenceDecayService', () => {
  const service = new ConfidenceDecayService();

  describe('getIOCDecayRate', () => {
    it('returns correct rate for IP (0.05)', () => {
      expect(service.getIOCDecayRate('ip')).toBe(0.05);
    });

    it('returns correct rate for hash_sha256 (0.001)', () => {
      expect(service.getIOCDecayRate('hash_sha256')).toBe(0.001);
    });

    it('returns correct rate for domain (0.02)', () => {
      expect(service.getIOCDecayRate('domain')).toBe(0.02);
    });

    it('returns default 0.01 for unknown IOC type', () => {
      expect(service.getIOCDecayRate('unknown_type')).toBe(0.01);
    });
  });

  describe('decayIOCConfidence', () => {
    it('returns original confidence at day 0', () => {
      expect(service.decayIOCConfidence(80, 'ip', 0)).toBe(80);
    });

    it('reduces IP confidence significantly at 30 days', () => {
      const decayed = service.decayIOCConfidence(80, 'ip', 30);
      // exp(-0.05 * 30) ≈ 0.2231 → 80 * 0.2231 ≈ 17.8
      expect(decayed).toBeLessThan(25);
      expect(decayed).toBeGreaterThan(10);
    });

    it('barely reduces hash confidence at 30 days', () => {
      const decayed = service.decayIOCConfidence(80, 'hash_sha256', 30);
      // exp(-0.001 * 30) ≈ 0.9704 → 80 * 0.9704 ≈ 77.6
      expect(decayed).toBeGreaterThan(75);
    });

    it('handles 0 confidence gracefully', () => {
      expect(service.decayIOCConfidence(0, 'ip', 30)).toBe(0);
    });
  });

  describe('decayCorrelationConfidence', () => {
    it('returns original at day 0', () => {
      expect(service.decayCorrelationConfidence(0.85, 0)).toBe(0.85);
    });

    it('applies slow decay (0.01 rate) at 30 days', () => {
      const decayed = service.decayCorrelationConfidence(0.85, 30);
      // exp(-0.01 * 30) ≈ 0.7408 → 0.85 * 0.7408 ≈ 0.630
      expect(decayed).toBeGreaterThan(0.6);
      expect(decayed).toBeLessThan(0.7);
    });

    it('decays substantially at 90 days', () => {
      const decayed = service.decayCorrelationConfidence(0.85, 90);
      // exp(-0.01 * 90) ≈ 0.4066 → 0.85 * 0.4066 ≈ 0.346
      expect(decayed).toBeLessThan(0.4);
      expect(decayed).toBeGreaterThan(0.2);
    });
  });

  describe('applyRevalidationBoost', () => {
    it('restores confidence when IOC re-seen', () => {
      const boosted = service.applyRevalidationBoost(40, 80);
      // max(40, 80 * 0.8) = max(40, 64) = 64
      expect(boosted).toBe(64);
    });

    it('keeps current if already higher than boost', () => {
      const boosted = service.applyRevalidationBoost(70, 80);
      // max(70, 64) = 70
      expect(boosted).toBe(70);
    });
  });

  describe('applyDecay', () => {
    it('returns DecayedResult array for all results', () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const results = new Map([
        ['cr-1', makeResult({
          id: 'cr-1', createdAt: thirtyDaysAgo.toISOString(),
        })],
      ]);

      const iocs = new Map([
        ['ioc-1', makeIOC({ id: 'ioc-1', iocType: 'ip', lastSeen: thirtyDaysAgo.toISOString() })],
        ['ioc-2', makeIOC({ id: 'ioc-2', iocType: 'domain', lastSeen: thirtyDaysAgo.toISOString() })],
      ]);

      const decayed = service.applyDecay(results, iocs);
      expect(decayed).toHaveLength(1);
      expect(decayed[0]!.correlationId).toBe('cr-1');
      expect(decayed[0]!.decayedConfidence).toBeLessThan(decayed[0]!.originalConfidence);
      expect(decayed[0]!.daysSinceCreated).toBeGreaterThanOrEqual(29);
    });

    it('handles empty results', () => {
      const decayed = service.applyDecay(new Map(), new Map());
      expect(decayed).toHaveLength(0);
    });

    it('marks revalidated IOCs when lastSeen is recent', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const now = new Date();

      const results = new Map([
        ['cr-1', makeResult({ id: 'cr-1', createdAt: thirtyDaysAgo.toISOString() })],
      ]);

      const iocs = new Map([
        ['ioc-1', makeIOC({ id: 'ioc-1', iocType: 'ip', lastSeen: now.toISOString() })],
        ['ioc-2', makeIOC({ id: 'ioc-2', iocType: 'domain', lastSeen: now.toISOString() })],
      ]);

      const decayed = service.applyDecay(results, iocs);
      const iocDecays = decayed[0]!.iocDecays;
      // IOCs seen today should have minimal decay
      for (const d of iocDecays) {
        expect(d.daysSinceLastSeen).toBeLessThanOrEqual(1);
      }
    });
  });
});
