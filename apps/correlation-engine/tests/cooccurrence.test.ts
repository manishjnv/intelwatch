import { describe, it, expect, beforeEach } from 'vitest';
import { CooccurrenceService } from '../src/services/cooccurrence.js';
import type { CorrelatedIOC } from '../src/schemas/correlation.js';

function makeIOC(overrides: Partial<CorrelatedIOC> & { id: string; tenantId: string }): CorrelatedIOC {
  return {
    iocType: 'ip', value: '1.2.3.4', normalizedValue: '1.2.3.4',
    confidence: 80, severity: 'HIGH', tags: [], mitreAttack: [],
    malwareFamilies: [], threatActors: [], sourceFeedIds: [],
    firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
    enrichmentQuality: 0.5,
    ...overrides,
  };
}

describe('Correlation Engine — #1 CooccurrenceService', () => {
  let svc: CooccurrenceService;

  beforeEach(() => {
    svc = new CooccurrenceService({ windowHours: 24, minSources: 2 });
  });

  it('1. jaccard returns 1.0 for identical sets', () => {
    expect(svc.jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('2. jaccard returns 0 for disjoint sets', () => {
    expect(svc.jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('3. jaccard returns 0 for two empty sets', () => {
    expect(svc.jaccard([], [])).toBe(0);
  });

  it('4. jaccard computes correct partial overlap', () => {
    // |{a,b} ∩ {b,c}| = 1, |{a,b} ∪ {b,c}| = 3
    expect(svc.jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('5. detects co-occurring IOCs sharing feeds', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('ioc-1', makeIOC({ id: 'ioc-1', tenantId: 't1', sourceFeedIds: ['f1', 'f2', 'f3'] }));
    iocs.set('ioc-2', makeIOC({ id: 'ioc-2', tenantId: 't1', sourceFeedIds: ['f1', 'f2', 'f4'] }));
    iocs.set('ioc-3', makeIOC({ id: 'ioc-3', tenantId: 't1', sourceFeedIds: ['f5'] })); // < minSources

    const pairs = svc.detectCooccurrences('t1', iocs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.sharedFeeds).toEqual(['f1', 'f2']);
  });

  it('6. isolates tenants — no cross-tenant matches', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', sourceFeedIds: ['f1', 'f2'] }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't2', sourceFeedIds: ['f1', 'f2'] }));

    const pairs = svc.detectCooccurrences('t1', iocs);
    expect(pairs).toHaveLength(0);
  });

  it('7. filters IOCs outside the time window', () => {
    const oldDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString(); // 48h ago
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('old', makeIOC({ id: 'old', tenantId: 't1', sourceFeedIds: ['f1', 'f2'], lastSeen: oldDate }));
    iocs.set('new', makeIOC({ id: 'new', tenantId: 't1', sourceFeedIds: ['f1', 'f2'] }));

    const pairs = svc.detectCooccurrences('t1', iocs);
    expect(pairs).toHaveLength(0); // 'old' is outside window
  });

  it('8. sorts pairs by Jaccard score descending', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', sourceFeedIds: ['f1', 'f2'] }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', sourceFeedIds: ['f1', 'f2'] }));
    iocs.set('c', makeIOC({ id: 'c', tenantId: 't1', sourceFeedIds: ['f1', 'f3'] }));

    const pairs = svc.detectCooccurrences('t1', iocs);
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i]!.jaccardScore).toBeLessThanOrEqual(pairs[i - 1]!.jaccardScore);
    }
  });

  it('9. toCorrelationResults produces valid results with severity', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', sourceFeedIds: ['f1', 'f2'] }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', sourceFeedIds: ['f1', 'f2'] }));

    const pairs = svc.detectCooccurrences('t1', iocs);
    const results = svc.toCorrelationResults('t1', pairs, iocs);

    expect(results).toHaveLength(pairs.length);
    expect(results[0]!.correlationType).toBe('cooccurrence');
    expect(results[0]!.ruleId).toBe('cooccurrence-jaccard');
    expect(results[0]!.entities).toHaveLength(2);
  });

  it('10. high Jaccard (≥0.8) maps to HIGH severity', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', sourceFeedIds: ['f1', 'f2', 'f3'] }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', sourceFeedIds: ['f1', 'f2', 'f3'] }));

    const pairs = svc.detectCooccurrences('t1', iocs);
    const results = svc.toCorrelationResults('t1', pairs, iocs);
    expect(results[0]!.severity).toBe('HIGH');
  });
});
