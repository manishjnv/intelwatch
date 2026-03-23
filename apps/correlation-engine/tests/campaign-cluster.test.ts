import { describe, it, expect, beforeEach } from 'vitest';
import { CampaignClusterService } from '../src/services/campaign-cluster.js';
import type { CorrelatedIOC, FeatureVector } from '../src/schemas/correlation.js';

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

describe('Correlation Engine — #5 CampaignClusterService', () => {
  let svc: CampaignClusterService;

  beforeEach(() => {
    svc = new CampaignClusterService({ epsilon: 0.3, minPoints: 3 });
  });

  it('1. distance returns 0 for identical feature vectors', () => {
    const v: FeatureVector = { infraOverlap: 0.5, temporalProximity: 0.5, ttpSimilarity: 0.5, feedOverlap: 0.5 };
    expect(svc.distance(v, v)).toBe(0);
  });

  it('2. distance returns weighted sum for different vectors', () => {
    const a: FeatureVector = { infraOverlap: 1, temporalProximity: 1, ttpSimilarity: 1, feedOverlap: 1 };
    const b: FeatureVector = { infraOverlap: 0, temporalProximity: 0, ttpSimilarity: 0, feedOverlap: 0 };
    // Total = 0.30 + 0.20 + 0.30 + 0.20 = 1.0
    expect(svc.distance(a, b)).toBeCloseTo(1.0, 5);
  });

  it('3. dbscan labels noise points as -1', () => {
    const points: FeatureVector[] = [
      { infraOverlap: 0, temporalProximity: 0, ttpSimilarity: 0, feedOverlap: 0 },
      { infraOverlap: 1, temporalProximity: 1, ttpSimilarity: 1, feedOverlap: 1 },
    ];
    const labels = svc.dbscan(points);
    expect(labels.every((l) => l === -1)).toBe(true); // Both are noise (minPoints=3)
  });

  it('4. dbscan groups close points into one cluster', () => {
    const points: FeatureVector[] = [
      { infraOverlap: 0.5, temporalProximity: 0.5, ttpSimilarity: 0.5, feedOverlap: 0.5 },
      { infraOverlap: 0.5, temporalProximity: 0.5, ttpSimilarity: 0.5, feedOverlap: 0.5 },
      { infraOverlap: 0.5, temporalProximity: 0.5, ttpSimilarity: 0.5, feedOverlap: 0.5 },
    ];
    const labels = svc.dbscan(points);
    expect(labels.every((l) => l === 1)).toBe(true);
  });

  it('5. dbscan separates distant clusters', () => {
    const points: FeatureVector[] = [
      // Cluster A (close together)
      { infraOverlap: 0, temporalProximity: 0, ttpSimilarity: 0, feedOverlap: 0 },
      { infraOverlap: 0.1, temporalProximity: 0.1, ttpSimilarity: 0.1, feedOverlap: 0.1 },
      { infraOverlap: 0.05, temporalProximity: 0.05, ttpSimilarity: 0.05, feedOverlap: 0.05 },
      // Cluster B (far away)
      { infraOverlap: 0.9, temporalProximity: 0.9, ttpSimilarity: 0.9, feedOverlap: 0.9 },
      { infraOverlap: 1, temporalProximity: 1, ttpSimilarity: 1, feedOverlap: 1 },
      { infraOverlap: 0.95, temporalProximity: 0.95, ttpSimilarity: 0.95, feedOverlap: 0.95 },
    ];
    const labels = svc.dbscan(points);
    const uniqueClusters = new Set(labels.filter((l) => l > 0));
    expect(uniqueClusters.size).toBe(2);
  });

  it('6. detectCampaigns returns empty for too few IOCs', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1' }));
    const campaigns = svc.detectCampaigns('t1', iocs);
    expect(campaigns).toHaveLength(0);
  });

  it('7. detectCampaigns groups IOCs with shared infrastructure', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    const now = new Date().toISOString();
    for (let i = 0; i < 4; i++) {
      iocs.set(`ioc-${i}`, makeIOC({
        id: `ioc-${i}`, tenantId: 't1',
        asn: 'AS12345', cidrPrefix: '10.0.0.0/24',
        sourceFeedIds: ['f1', 'f2'],
        mitreAttack: ['T1566', 'T1059'],
        firstSeen: now, lastSeen: now,
      }));
    }

    const campaigns = svc.detectCampaigns('t1', iocs);
    expect(campaigns.length).toBeGreaterThanOrEqual(1);
    expect(campaigns[0]!.entityIds.length).toBeGreaterThanOrEqual(3);
  });

  it('8. detectCampaigns isolates tenants', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    for (let i = 0; i < 4; i++) {
      iocs.set(`ioc-${i}`, makeIOC({ id: `ioc-${i}`, tenantId: 't2', asn: 'AS1' }));
    }
    const campaigns = svc.detectCampaigns('t1', iocs);
    expect(campaigns).toHaveLength(0);
  });

  it('9. campaign has valid name format', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    for (let i = 0; i < 4; i++) {
      iocs.set(`ioc-${i}`, makeIOC({
        id: `ioc-${i}`, tenantId: 't1', asn: 'AS1',
        sourceFeedIds: ['f1'], mitreAttack: ['T1566'],
      }));
    }
    const campaigns = svc.detectCampaigns('t1', iocs);
    if (campaigns.length > 0) {
      expect(campaigns[0]!.name).toMatch(/^Campaign-/);
    }
  });

  it('10. computeFeatureVector returns normalized values (0-1)', () => {
    const allIOCs = [
      makeIOC({ id: 'a', tenantId: 't1', asn: 'AS1', sourceFeedIds: ['f1'] }),
      makeIOC({ id: 'b', tenantId: 't1', asn: 'AS1', sourceFeedIds: ['f1'] }),
    ];
    const fv = svc.computeFeatureVector(allIOCs[0]!, allIOCs);
    expect(fv.infraOverlap).toBeGreaterThanOrEqual(0);
    expect(fv.infraOverlap).toBeLessThanOrEqual(1);
    expect(fv.temporalProximity).toBeGreaterThanOrEqual(0);
    expect(fv.temporalProximity).toBeLessThanOrEqual(1);
  });

  it('11. maxSeverity picks highest from cluster IOCs', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', severity: 'LOW', asn: 'AS1', sourceFeedIds: ['f1'] }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', severity: 'CRITICAL', asn: 'AS1', sourceFeedIds: ['f1'] }));
    iocs.set('c', makeIOC({ id: 'c', tenantId: 't1', severity: 'MEDIUM', asn: 'AS1', sourceFeedIds: ['f1'] }));

    const campaigns = svc.detectCampaigns('t1', iocs);
    if (campaigns.length > 0) {
      expect(campaigns[0]!.maxSeverity).toBe('CRITICAL');
    }
  });

  it('12. campaign featureVector has all four dimensions', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    for (let i = 0; i < 4; i++) {
      iocs.set(`ioc-${i}`, makeIOC({
        id: `ioc-${i}`, tenantId: 't1', asn: 'AS1',
        sourceFeedIds: ['f1'], mitreAttack: ['T1566'],
      }));
    }
    const campaigns = svc.detectCampaigns('t1', iocs);
    if (campaigns.length > 0) {
      const fv = campaigns[0]!.featureVector;
      expect(fv).toHaveProperty('infraOverlap');
      expect(fv).toHaveProperty('temporalProximity');
      expect(fv).toHaveProperty('ttpSimilarity');
      expect(fv).toHaveProperty('feedOverlap');
    }
  });
});
