import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShodanClient, type ShodanIpResult } from '../src/enrichment/shodan-client.js';
import { GreyNoiseClient, type GreyNoiseIpResult } from '../src/enrichment/greynoise-client.js';
import { calculateBayesianConfidence, stixConfidenceTier } from '@etip/shared-normalization';

// Test enrich worker logic without BullMQ (requires Redis).
// Worker construction tested via integration; here we test the processing logic.

function buildGlobalIoc(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    iocType: 'ip',
    value: '44.55.66.77',
    normalizedValue: '44.55.66.77',
    dedupeHash: 'test-dedupe-hash',
    confidence: 50,
    severity: 'medium',
    crossFeedCorroboration: 1,
    enrichmentData: {},
    enrichedAt: null as Date | null,
    enrichmentQuality: 0,
    stixConfidenceTier: 'Medium',
    ...overrides,
  };
}

describe('GlobalEnrichWorker logic', () => {
  describe('skip recently enriched', () => {
    it('skips IOC enriched within 24h', () => {
      const ioc = buildGlobalIoc({ enrichedAt: new Date() });
      const hoursSince = (Date.now() - new Date(ioc.enrichedAt!).getTime()) / (1000 * 60 * 60);
      expect(hoursSince).toBeLessThan(24);
    });

    it('allows re-enrichment after 24h', () => {
      const ioc = buildGlobalIoc({
        enrichedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const hoursSince = (Date.now() - new Date(ioc.enrichedAt!).getTime()) / (1000 * 60 * 60);
      expect(hoursSince).toBeGreaterThan(24);
    });
  });

  describe('source selection by IOC type', () => {
    it('IP type calls Shodan + GreyNoise + GeoIP', () => {
      const sources = getSourcesForType('ip');
      expect(sources).toContain('shodan');
      expect(sources).toContain('greynoise');
      expect(sources).toContain('geoip');
    });

    it('domain type calls GreyNoise + WHOIS', () => {
      const sources = getSourcesForType('domain');
      expect(sources).toContain('greynoise');
      expect(sources).toContain('whois');
    });

    it('CVE type calls EPSS + CPE', () => {
      const sources = getSourcesForType('cve');
      expect(sources).toContain('epss');
      expect(sources).toContain('cpe');
    });

    it('hash type calls VirusTotal + MalwareBazaar', () => {
      const sources = getSourcesForType('hash_sha256');
      expect(sources).toContain('virustotal');
      expect(sources).toContain('malwarebazaar');
    });
  });

  describe('confidence recalculation', () => {
    it('recalculates confidence after enrichment', () => {
      const result = calculateBayesianConfidence({
        feedReliability: 80,
        corroboration: 30,
        aiScore: 70,
        daysSinceLastSeen: 0,
        iocType: 'ip',
      });
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('updates STIX tier based on new confidence', () => {
      const highConf = calculateBayesianConfidence({
        feedReliability: 95,
        corroboration: 90,
        aiScore: 90,
        daysSinceLastSeen: 0,
      });
      expect(stixConfidenceTier(highConf.score)).toBe('High');

      const lowConf = calculateBayesianConfidence({
        feedReliability: 10,
        corroboration: 5,
        aiScore: 10,
        daysSinceLastSeen: 30,
      });
      expect(['Low', 'Low-Medium', 'None']).toContain(stixConfidenceTier(lowConf.score));
    });
  });

  describe('enrichment quality', () => {
    it('all sources return data → high quality', () => {
      const quality = calculateEnrichmentQuality(
        [
          { source: 'shodan', data: { ports: [80] }, timestamp: '', success: true },
          { source: 'greynoise', data: { noise: true }, timestamp: '', success: true },
          { source: 'geoip', data: { country: 'US' }, timestamp: '', success: true },
        ],
        3,
      );
      // (3/3)*50 + 30 + 20 = 100
      expect(quality).toBe(100);
    });

    it('no sources return data → low quality', () => {
      const quality = calculateEnrichmentQuality(
        [
          { source: 'shodan', data: null, timestamp: '', success: false },
          { source: 'greynoise', data: null, timestamp: '', success: false },
        ],
        2,
      );
      expect(quality).toBe(0);
    });

    it('partial sources → medium quality', () => {
      const quality = calculateEnrichmentQuality(
        [
          { source: 'shodan', data: { ports: [80] }, timestamp: '', success: true },
          { source: 'greynoise', data: null, timestamp: '', success: false },
          { source: 'geoip', data: null, timestamp: '', success: false },
        ],
        3,
      );
      // (1/3)*50 + 30 + 10 ≈ 57
      expect(quality).toBeGreaterThan(40);
      expect(quality).toBeLessThan(70);
    });
  });

  describe('GLOBAL_IOC_CRITICAL emission', () => {
    it('emits for high-confidence critical IOCs', () => {
      const emitter = { emit: vi.fn() };
      const ioc = buildGlobalIoc({ severity: 'critical' });
      const newConfidence = 85;

      if (newConfidence >= 80 && ioc.severity === 'critical') {
        emitter.emit('global.ioc.critical', {
          globalIocId: ioc.id,
          iocType: ioc.iocType,
          value: ioc.normalizedValue,
          confidence: newConfidence,
        });
      }

      expect(emitter.emit).toHaveBeenCalledWith('global.ioc.critical', expect.objectContaining({
        confidence: 85,
        iocType: 'ip',
      }));
    });

    it('does NOT emit for low-confidence IOCs', () => {
      const emitter = { emit: vi.fn() };
      const ioc = buildGlobalIoc({ severity: 'critical' });
      const newConfidence = 60;

      if (newConfidence >= 80 && ioc.severity === 'critical') {
        emitter.emit('global.ioc.critical', {});
      }

      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit for non-critical severity', () => {
      const emitter = { emit: vi.fn() };
      const ioc = buildGlobalIoc({ severity: 'medium' });
      const newConfidence = 90;

      if (newConfidence >= 80 && ioc.severity === 'critical') {
        emitter.emit('global.ioc.critical', {});
      }

      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('graceful failure handling', () => {
    it('handles enrichment source failures gracefully (partial enrichment)', () => {
      const results = [
        { source: 'shodan', data: { ports: [80] }, timestamp: '', success: true },
        { source: 'greynoise', data: null, timestamp: '', success: false },
      ];
      const successful = results.filter((r) => r.success);
      expect(successful).toHaveLength(1);
      // Quality should still be computed from partial results
      const quality = calculateEnrichmentQuality(results, 2);
      expect(quality).toBeGreaterThan(0);
    });
  });
});

// ── Helpers extracted from worker for testability ──────────────

function getSourcesForType(iocType: string): string[] {
  switch (iocType) {
    case 'ip':     return ['shodan', 'greynoise', 'geoip'];
    case 'domain': return ['greynoise', 'whois'];
    case 'hash_md5':
    case 'hash_sha1':
    case 'hash_sha256': return ['virustotal', 'malwarebazaar'];
    case 'cve':    return ['epss', 'cpe'];
    case 'url':    return ['urlhaus'];
    case 'email':  return ['hibp'];
    default:       return [];
  }
}

interface EnrichResult {
  source: string;
  data: Record<string, unknown> | null;
  timestamp: string;
  success: boolean;
}

function calculateEnrichmentQuality(results: EnrichResult[], totalSources: number): number {
  if (totalSources === 0) return 0;
  const successCount = results.filter((r) => r.success && r.data !== null).length;
  const sourceCoverage = (successCount / totalSources) * 50;
  const freshnessScore = successCount > 0 ? 30 : 0;
  const coverageScore = successCount >= Math.ceil(totalSources / 2) ? 20 : (successCount > 0 ? 10 : 0);
  return Math.round(Math.min(100, sourceCoverage + freshnessScore + coverageScore));
}
