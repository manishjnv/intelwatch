import { describe, it, expect } from 'vitest';
import { mapIocRecord, uuidv5 } from '../src/services/ioc-graph-mapper.js';
import { RELATIONSHIP_RULES, type NodeType } from '../src/schemas/graph.js';
import type { IocRecord } from '../src/clients/ioc-client.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

function baseRecord(overrides: Partial<IocRecord> = {}): IocRecord {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    tenantId: TENANT,
    iocType: 'domain',
    value: 'evil.example.com',
    severity: 'high',
    tlp: 'amber',
    confidence: 80,
    lifecycle: 'active',
    tags: [],
    threatActors: [],
    malwareFamilies: [],
    mitreAttack: [],
    feedSourceId: null,
    enrichmentData: null,
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('uuidv5 — known RFC 4122 test vector', () => {
  it('matches the standard DNS-namespace vector', () => {
    const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect(uuidv5('python.org', DNS_NAMESPACE)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('is deterministic across calls', () => {
    const a = uuidv5('foo', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    const b = uuidv5('foo', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(a).toBe(b);
  });
});

describe('mapIocRecord', () => {
  it('maps an IOC with actors, malware, and mitre into correct labels + valid edges', () => {
    const rec = baseRecord({
      threatActors: ['APT99'],
      malwareFamilies: ['Cobalt Strike'],
      mitreAttack: ['t1059.001', 'not-a-mitre-id'],
    });
    const plan = mapIocRecord(rec);
    expect(plan).not.toBeNull();
    if (plan?.action !== 'upsert') throw new Error('expected upsert');

    expect(plan.primary.label).toBe('IOC');
    expect(plan.primary.id).toBe(rec.id);
    expect(plan.entities).toHaveLength(3);
    expect(plan.entities.find((e) => e.label === 'AttackPattern')?.props['mitreId']).toBe('T1059.001');
    // every sync-created entity is tagged so the orphan sweep can find it (and never touches analyst nodes)
    expect(plan.entities.every((e) => e.props['origin'] === 'ioc-sync')).toBe(true);

    for (const edge of plan.edges) {
      const rule = RELATIONSHIP_RULES[edge.type];
      expect(rule.from).toContain(edge.fromLabel as NodeType);
      expect(rule.to).toContain(edge.toLabel as NodeType);
    }

    // IOC -INDICATES-> each entity
    const indicates = plan.edges.filter((e) => e.type === 'INDICATES');
    expect(indicates).toHaveLength(3);
    expect(indicates.every((e) => e.fromId === plan.primary.id)).toBe(true);

    // co-listed: actor USES malware, actor USES pattern, malware USES pattern
    expect(plan.edges.filter((e) => e.type === 'USES')).toHaveLength(3);
  });

  it('UUIDv5 entity ids are stable across calls and differ per tenant', () => {
    const recA = baseRecord({ threatActors: ['APT1'] });
    const recB = baseRecord({ threatActors: ['APT1'], tenantId: '33333333-3333-3333-3333-333333333333' });

    const planA1 = mapIocRecord(recA);
    const planA2 = mapIocRecord(recA);
    const planB = mapIocRecord(recB);
    if (planA1?.action !== 'upsert' || planA2?.action !== 'upsert' || planB?.action !== 'upsert') throw new Error('expected upserts');

    expect(planA1.entities[0]!.id).toBe(planA2.entities[0]!.id);
    expect(planA1.entities[0]!.id).not.toBe(planB.entities[0]!.id);
  });

  it('maps a CVE IOC to Vulnerability with an uppercased cveId', () => {
    const rec = baseRecord({ iocType: 'cve', value: 'cve-2026-12345', threatActors: ['APT1'], malwareFamilies: ['X'] });
    const plan = mapIocRecord(rec);
    if (plan?.action !== 'upsert') throw new Error('expected upsert');

    expect(plan.primary.label).toBe('Vulnerability');
    expect(plan.primary.props['cveId']).toBe('CVE-2026-12345');
    // EXPLOITS points at the vulnerability, from the co-listed actor/malware
    expect(plan.edges.filter((e) => e.type === 'EXPLOITS')).toHaveLength(2);
    expect(plan.edges.every((e) => e.type !== 'EXPLOITS' || e.toId === plan.primary.id)).toBe(true);
    expect(plan.ownedEdges.types).toEqual(['EXPLOITS']);
  });

  it('skips a CVE IOC with an invalid cveId', () => {
    const rec = baseRecord({ iocType: 'cve', value: 'not-a-cve' });
    expect(mapIocRecord(rec)).toBeNull();
  });

  it('maps false_positive/revoked lifecycle to a delete plan', () => {
    expect(mapIocRecord(baseRecord({ lifecycle: 'false_positive' }))).toEqual({ action: 'delete', id: expect.any(String) });
    expect(mapIocRecord(baseRecord({ lifecycle: 'revoked' }))).toEqual({ action: 'delete', id: expect.any(String) });
  });

  it('caps entities at 25 per kind and dedupes blanks/duplicates', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Actor${i}`);
    const rec = baseRecord({ threatActors: [...many, '  ', '', 'Actor0', 'ACTOR0'] });
    const plan = mapIocRecord(rec);
    if (plan?.action !== 'upsert') throw new Error('expected upsert');
    expect(plan.entities).toHaveLength(25);
  });

  it('computes baseRiskScore from severity + confidence, taking enrichment externalRiskScore when higher', () => {
    const rec = baseRecord({ severity: 'high', confidence: 80, enrichmentData: null });
    const plan = mapIocRecord(rec);
    if (plan?.action !== 'upsert') throw new Error('expected upsert');
    // 75 * (0.6 + 0.4*0.8) = 75 * 0.92 = 69
    expect(plan.primary.props['baseRiskScore']).toBe(69);

    const recHighExternal = baseRecord({ severity: 'low', confidence: 10, enrichmentData: { externalRiskScore: 99 } });
    const planExt = mapIocRecord(recHighExternal);
    if (planExt?.action !== 'upsert') throw new Error('expected upsert');
    expect(planExt.primary.props['baseRiskScore']).toBe(99);
  });

  it('ignores an out-of-range or non-numeric externalRiskScore', () => {
    const rec = baseRecord({ severity: 'info', confidence: 0, enrichmentData: { externalRiskScore: 500 } });
    const plan = mapIocRecord(rec);
    if (plan?.action !== 'upsert') throw new Error('expected upsert');
    // 10 * 0.6 = 6, externalRisk ignored (out of range) -> max(6, 0) = 6
    expect(plan.primary.props['baseRiskScore']).toBe(6);
  });
});
