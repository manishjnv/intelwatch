import { describe, it, expect, beforeEach } from 'vitest';
import { InfrastructureClusterService } from '../src/services/infrastructure-cluster.js';
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

describe('Correlation Engine — #2 InfrastructureClusterService', () => {
  let svc: InfrastructureClusterService;

  beforeEach(() => {
    svc = new InfrastructureClusterService();
  });

  it('1. detects IOCs sharing the same ASN', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', asn: 'AS12345' }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', asn: 'AS12345' }));
    iocs.set('c', makeIOC({ id: 'c', tenantId: 't1', asn: 'AS99999' }));

    const clusters = svc.detectClusters('t1', iocs);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.attribute).toBe('AS12345');
    expect(clusters[0]!.iocIds).toEqual(['a', 'b']);
  });

  it('2. detects IOCs sharing the same CIDR prefix', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', cidrPrefix: '10.0.0.0/24' }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', cidrPrefix: '10.0.0.0/24' }));

    const clusters = svc.detectClusters('t1', iocs);
    expect(clusters.some((c) => c.attributeType === 'cidrPrefix')).toBe(true);
  });

  it('3. detects IOCs sharing the same registrar', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', registrar: 'NameCheap' }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', registrar: 'NameCheap' }));
    iocs.set('c', makeIOC({ id: 'c', tenantId: 't1', registrar: 'GoDaddy' }));

    const clusters = svc.detectClusters('t1', iocs);
    const nameChecapCluster = clusters.find((c) => c.attribute === 'NameCheap');
    expect(nameChecapCluster).toBeDefined();
    expect(nameChecapCluster!.iocIds).toHaveLength(2);
  });

  it('4. returns empty for no shared infrastructure', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', asn: 'AS1' }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', asn: 'AS2' }));

    const clusters = svc.detectClusters('t1', iocs);
    expect(clusters).toHaveLength(0);
  });

  it('5. computeOverlapScore returns 0 for 0 total IOCs', () => {
    expect(svc.computeOverlapScore(5, 0)).toBe(0);
  });

  it('6. isolates tenants', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', asn: 'AS1' }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't2', asn: 'AS1' }));

    const clusters = svc.detectClusters('t1', iocs);
    expect(clusters).toHaveLength(0);
  });

  it('7. toCorrelationResults maps severity by cluster size', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    for (let i = 0; i < 5; i++) {
      iocs.set(`ioc-${i}`, makeIOC({ id: `ioc-${i}`, tenantId: 't1', asn: 'AS1' }));
    }

    const clusters = svc.detectClusters('t1', iocs);
    const results = svc.toCorrelationResults('t1', clusters, iocs);
    expect(results[0]!.severity).toBe('HIGH'); // 5 IOCs = HIGH
  });

  it('8. sorts clusters by overlap score descending', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('a', makeIOC({ id: 'a', tenantId: 't1', asn: 'AS1', cidrPrefix: '10.0.0.0/24' }));
    iocs.set('b', makeIOC({ id: 'b', tenantId: 't1', asn: 'AS1', cidrPrefix: '10.0.0.0/24' }));
    iocs.set('c', makeIOC({ id: 'c', tenantId: 't1', asn: 'AS1' }));

    const clusters = svc.detectClusters('t1', iocs);
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i]!.overlapScore).toBeLessThanOrEqual(clusters[i - 1]!.overlapScore);
    }
  });
});
