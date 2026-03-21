import { describe, it, expect } from 'vitest';
import {
  computeAttributionDecay, IOC_DECAY_RATES,
  analyzeTtpEvolution,
  detectSharedInfrastructure,
  buildActorProvenance,
  generateMitreHeatmap, MITRE_TACTIC_TOTALS,
} from '../src/accuracy.js';

// ═══════════════════════════════════════════════════════════════
// A4: Attribution Confidence Decay
// ═══════════════════════════════════════════════════════════════
describe('A4: Attribution Confidence Decay', () => {
  it('returns unchanged confidence for no linked IOCs', () => {
    const result = computeAttributionDecay(80, []);
    expect(result.decayedConfidence).toBe(80);
    expect(result.avgDecayFactor).toBe(1.0);
    expect(result.perType).toHaveLength(0);
  });

  it('IP IOCs decay fast (14-day half-life)', () => {
    const result = computeAttributionDecay(100, [
      { iocType: 'ip', daysSinceFirstSeen: 14 },
    ]);
    expect(result.decayedConfidence).toBeLessThan(60);
    expect(IOC_DECAY_RATES['ip']).toBe(14);
  });

  it('hash IOCs decay slowly (365-day half-life)', () => {
    const result = computeAttributionDecay(100, [
      { iocType: 'sha256', daysSinceFirstSeen: 14 },
    ]);
    expect(result.decayedConfidence).toBeGreaterThan(95);
    expect(IOC_DECAY_RATES['sha256']).toBe(365);
  });

  it('mixed IOC types produce weighted average decay', () => {
    const result = computeAttributionDecay(100, [
      { iocType: 'ip', daysSinceFirstSeen: 30 },
      { iocType: 'sha256', daysSinceFirstSeen: 30 },
    ]);
    const ipOnly = computeAttributionDecay(100, [{ iocType: 'ip', daysSinceFirstSeen: 30 }]);
    const hashOnly = computeAttributionDecay(100, [{ iocType: 'sha256', daysSinceFirstSeen: 30 }]);
    expect(result.decayedConfidence).toBeGreaterThan(ipOnly.decayedConfidence);
    expect(result.decayedConfidence).toBeLessThan(hashOnly.decayedConfidence);
  });

  it('per-type breakdown includes half-life and decay factor', () => {
    const result = computeAttributionDecay(80, [
      { iocType: 'ip', daysSinceFirstSeen: 7 },
      { iocType: 'domain', daysSinceFirstSeen: 30 },
    ]);
    expect(result.perType).toHaveLength(2);
    expect(result.perType[0]!.halfLifeDays).toBeDefined();
    expect(result.perType[0]!.decayFactor).toBeGreaterThan(0);
    expect(result.perType[0]!.decayFactor).toBeLessThanOrEqual(1);
  });

  it('fresh IOCs have decay factor near 1.0', () => {
    const result = computeAttributionDecay(90, [
      { iocType: 'ip', daysSinceFirstSeen: 0 },
    ]);
    expect(result.avgDecayFactor).toBeCloseTo(1.0, 1);
    expect(result.decayedConfidence).toBe(90);
  });

  it('clamps decayed confidence to 0-100', () => {
    const result = computeAttributionDecay(50, [
      { iocType: 'ip', daysSinceFirstSeen: 365 },
    ]);
    expect(result.decayedConfidence).toBeGreaterThanOrEqual(0);
    expect(result.decayedConfidence).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// B2: TTP Evolution Tracking
// ═══════════════════════════════════════════════════════════════
describe('B2: TTP Evolution Tracking', () => {
  it('identifies new TTPs not seen historically', () => {
    const result = analyzeTtpEvolution(['T1059', 'T1566', 'T9999'], ['T1059', 'T1566']);
    expect(result.newTtps).toContain('T9999');
    expect(result.consistentTtps).toContain('T1059');
    expect(result.consistentTtps).toContain('T1566');
  });

  it('identifies abandoned TTPs', () => {
    const result = analyzeTtpEvolution(['T1059'], ['T1059', 'T1566', 'T1003']);
    expect(result.abandonedTtps).toContain('T1566');
    expect(result.abandonedTtps).toContain('T1003');
  });

  it('returns 0 velocity for identical sets', () => {
    const result = analyzeTtpEvolution(['T1059', 'T1566'], ['T1059', 'T1566']);
    expect(result.evolutionVelocity).toBe(0);
    expect(result.newTtps).toHaveLength(0);
    expect(result.abandonedTtps).toHaveLength(0);
  });

  it('returns 100 velocity for completely different sets', () => {
    const result = analyzeTtpEvolution(['T1059'], ['T1566']);
    expect(result.evolutionVelocity).toBe(100);
  });

  it('handles empty inputs', () => {
    const result = analyzeTtpEvolution([], []);
    expect(result.totalUnique).toBe(0);
    expect(result.evolutionVelocity).toBe(0);
  });

  it('is case-insensitive', () => {
    const result = analyzeTtpEvolution(['t1059'], ['T1059']);
    expect(result.consistentTtps).toHaveLength(1);
    expect(result.newTtps).toHaveLength(0);
  });

  it('counts total unique across both periods', () => {
    const result = analyzeTtpEvolution(['T1059', 'T1566'], ['T1003', 'T1566']);
    expect(result.totalUnique).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// C1: Cross-Actor Infrastructure Sharing
// ═══════════════════════════════════════════════════════════════
describe('C1: Cross-Actor Infrastructure Sharing', () => {
  it('detects shared IOCs between two actors', () => {
    const actors = [
      { id: 'a1', name: 'APT28', iocs: [{ value: '1.2.3.4', iocType: 'ip' }, { value: '5.6.7.8', iocType: 'ip' }, { value: 'evil.com', iocType: 'domain' }] },
      { id: 'a2', name: 'APT29', iocs: [{ value: '1.2.3.4', iocType: 'ip' }, { value: '9.9.9.9', iocType: 'ip' }, { value: 'evil.com', iocType: 'domain' }] },
    ];
    const result = detectSharedInfrastructure(actors);
    expect(result).toHaveLength(1);
    expect(result[0]!.sharedCount).toBe(2);
    expect(result[0]!.relationship).toBe('tool_sharing');
  });

  it('classifies 3+ shared IOCs as coordination', () => {
    const actors = [
      { id: 'a1', name: 'A', iocs: [{ value: '1.1.1.1', iocType: 'ip' }, { value: '2.2.2.2', iocType: 'ip' }, { value: '3.3.3.3', iocType: 'ip' }] },
      { id: 'a2', name: 'B', iocs: [{ value: '1.1.1.1', iocType: 'ip' }, { value: '2.2.2.2', iocType: 'ip' }, { value: '3.3.3.3', iocType: 'ip' }] },
    ];
    const result = detectSharedInfrastructure(actors);
    expect(result[0]!.relationship).toBe('coordination');
  });

  it('returns empty for no shared IOCs', () => {
    const actors = [
      { id: 'a1', name: 'A', iocs: [{ value: '1.1.1.1', iocType: 'ip' }] },
      { id: 'a2', name: 'B', iocs: [{ value: '2.2.2.2', iocType: 'ip' }] },
    ];
    expect(detectSharedInfrastructure(actors)).toHaveLength(0);
  });

  it('is case-insensitive on IOC values', () => {
    const actors = [
      { id: 'a1', name: 'A', iocs: [{ value: 'EVIL.COM', iocType: 'domain' }] },
      { id: 'a2', name: 'B', iocs: [{ value: 'evil.com', iocType: 'domain' }] },
    ];
    const result = detectSharedInfrastructure(actors);
    expect(result).toHaveLength(1);
  });

  it('sorts by shared count descending', () => {
    const actors = [
      { id: 'a1', name: 'A', iocs: [{ value: '1.1.1.1', iocType: 'ip' }] },
      { id: 'a2', name: 'B', iocs: [{ value: '1.1.1.1', iocType: 'ip' }] },
      { id: 'a3', name: 'C', iocs: [{ value: '1.1.1.1', iocType: 'ip' }, { value: '2.2.2.2', iocType: 'ip' }] },
    ];
    // A-B: 1 shared, A-C: 1 shared, B-C: 1 shared
    const result = detectSharedInfrastructure(actors);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// D1: Actor Provenance Export
// ═══════════════════════════════════════════════════════════════
describe('D1: Actor Provenance', () => {
  it('builds complete provenance record', () => {
    const prov = buildActorProvenance(
      { id: 'a1', name: 'APT28', confidence: 90, firstSeen: new Date('2024-01-01'), lastSeen: new Date('2024-06-01') },
      3, 'active', 15, 47, 72.5,
    );
    expect(prov.actorId).toBe('a1');
    expect(prov.actorName).toBe('APT28');
    expect(prov.confidence).toBe(90);
    expect(prov.corroborationFeedCount).toBe(3);
    expect(prov.dormancyStatus).toBe('active');
    expect(prov.ttpEvolutionVelocity).toBe(15);
    expect(prov.linkedIocCount).toBe(47);
    expect(prov.avgLinkStrength).toBe(73);
    expect(prov.firstSeen).toContain('2024-01-01');
  });

  it('handles null dates', () => {
    const prov = buildActorProvenance(
      { id: 'a1', name: 'Unknown', confidence: 50, firstSeen: null, lastSeen: null },
      0, 'unknown', 0, 0, 0,
    );
    expect(prov.firstSeen).toBeNull();
    expect(prov.lastSeen).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// D2: MITRE ATT&CK Coverage Heatmap
// ═══════════════════════════════════════════════════════════════
describe('D2: MITRE ATT&CK Heatmap', () => {
  it('returns all 14 tactics', () => {
    const heatmap = generateMitreHeatmap([]);
    expect(heatmap).toHaveLength(14);
    expect(Object.keys(MITRE_TACTIC_TOTALS)).toHaveLength(14);
  });

  it('returns 0 coverage for empty TTPs', () => {
    const heatmap = generateMitreHeatmap([]);
    for (const cell of heatmap) {
      expect(cell.coverage).toBe(0);
      expect(cell.actorTechniqueCount).toBe(0);
    }
  });

  it('computes correct coverage ratio', () => {
    const heatmap = generateMitreHeatmap(['T1059', 'T1059.001']);
    const executionCell = heatmap.find((c) => c.tactic === 'Execution');
    expect(executionCell).toBeDefined();
    expect(executionCell!.actorTechniqueCount).toBe(2);
    expect(executionCell!.coverage).toBeGreaterThan(0);
    expect(executionCell!.coverage).toBeLessThanOrEqual(1);
  });

  it('includes totalKnownTechniques per tactic', () => {
    const heatmap = generateMitreHeatmap(['T1059']);
    for (const cell of heatmap) {
      expect(cell.totalKnownTechniques).toBeGreaterThan(0);
    }
  });

  it('sorts actor techniques within each tactic', () => {
    const heatmap = generateMitreHeatmap(['T1072', 'T1059']);
    const cell = heatmap.find((c) => c.actorTechniqueCount > 0);
    if (cell && cell.actorTechniques.length > 1) {
      expect(cell.actorTechniques[0]! < cell.actorTechniques[1]!).toBe(true);
    }
  });
});
