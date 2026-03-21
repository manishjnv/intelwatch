import { describe, it, expect } from 'vitest';
import {
  buildDiamondModel,
  detectFalseFlags, FALSE_FLAG_THRESHOLD,
  predictTargets,
  compareActors,
  computeFeedActorAccuracy,
} from '../src/accuracy-p2.js';

// ═══════════════════════════════════════════════════════════════
// A5: Diamond Model Integration
// ═══════════════════════════════════════════════════════════════
describe('A5: Diamond Model', () => {
  const fullActor = {
    name: 'APT28', aliases: ['Fancy Bear'], actorType: 'nation_state',
    motivation: 'espionage', country: 'Russia', ttps: ['T1059', 'T1566'],
    associatedMalware: ['X-Agent'], targetSectors: ['government'], targetRegions: ['NATO'],
  };

  it('returns 4 facets', () => {
    const model = buildDiamondModel(fullActor, 10);
    expect(model.facets).toHaveLength(4);
    expect(model.facets.map((f) => f.facet)).toEqual(['adversary', 'capability', 'infrastructure', 'victim']);
  });

  it('full actor has high completeness', () => {
    const model = buildDiamondModel(fullActor, 20);
    expect(model.completeness).toBeGreaterThan(50);
  });

  it('empty actor has low completeness', () => {
    const empty = { name: 'Unknown', aliases: [], actorType: 'unknown', motivation: 'unknown', country: null, ttps: [], associatedMalware: [], targetSectors: [], targetRegions: [] };
    const model = buildDiamondModel(empty, 0);
    expect(model.completeness).toBeLessThan(30);
  });

  it('infrastructure score scales with IOC count', () => {
    const low = buildDiamondModel(fullActor, 1);
    const high = buildDiamondModel(fullActor, 50);
    const infraLow = low.facets.find((f) => f.facet === 'infrastructure');
    const infraHigh = high.facets.find((f) => f.facet === 'infrastructure');
    expect(infraHigh!.score).toBeGreaterThan(infraLow!.score);
  });

  it('adversary facet includes type and motivation', () => {
    const model = buildDiamondModel(fullActor, 5);
    const adversary = model.facets.find((f) => f.facet === 'adversary');
    expect(adversary!.items).toContain('type:nation_state');
    expect(adversary!.items).toContain('motivation:espionage');
  });
});

// ═══════════════════════════════════════════════════════════════
// B3: False Flag Detection
// ═══════════════════════════════════════════════════════════════
describe('B3: False Flag Detection', () => {
  it('detects high TTP overlap', () => {
    const target = { id: 'a1', name: 'APT28', ttps: ['T1059', 'T1566', 'T1003', 'T1071'] };
    const others = [
      { id: 'a2', name: 'Suspicious', ttps: ['T1059', 'T1566', 'T1003', 'T1071'] },
    ];
    const alerts = detectFalseFlags(target, others);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ttpOverlap).toBe(1.0);
    expect(alerts[0]!.assessment).toBe('false_flag_likely');
  });

  it('no alerts for low overlap', () => {
    const target = { id: 'a1', name: 'A', ttps: ['T1059'] };
    const others = [{ id: 'a2', name: 'B', ttps: ['T9999'] }];
    expect(detectFalseFlags(target, others)).toHaveLength(0);
  });

  it('skips self-comparison', () => {
    const target = { id: 'a1', name: 'A', ttps: ['T1059'] };
    const others = [{ id: 'a1', name: 'A', ttps: ['T1059'] }];
    expect(detectFalseFlags(target, others)).toHaveLength(0);
  });

  it('classifies 90%+ as false_flag_likely, 70-89% as tool_sharing', () => {
    expect(FALSE_FLAG_THRESHOLD).toBe(0.70);
  });

  it('skips actors with empty TTPs', () => {
    const target = { id: 'a1', name: 'A', ttps: ['T1059'] };
    const others = [{ id: 'a2', name: 'B', ttps: [] }];
    expect(detectFalseFlags(target, others)).toHaveLength(0);
  });

  it('sorts by overlap descending', () => {
    const target = { id: 'a1', name: 'A', ttps: ['T1059', 'T1566', 'T1003', 'T1071', 'T1027'] };
    const others = [
      { id: 'a2', name: 'Moderate', ttps: ['T1059', 'T1566', 'T1003', 'T1071'] },
      { id: 'a3', name: 'High', ttps: ['T1059', 'T1566', 'T1003', 'T1071', 'T1027'] },
    ];
    const alerts = detectFalseFlags(target, others);
    if (alerts.length >= 2) {
      expect(alerts[0]!.ttpOverlap).toBeGreaterThanOrEqual(alerts[1]!.ttpOverlap);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// C3: Victimology Pattern Prediction
// ═══════════════════════════════════════════════════════════════
describe('C3: Victimology Prediction', () => {
  it('returns empty for no sectors', () => {
    expect(predictTargets([])).toHaveLength(0);
  });

  it('computes probability from frequency', () => {
    const predictions = predictTargets(['government', 'government', 'military', 'energy']);
    expect(predictions[0]!.sector).toBe('government');
    expect(predictions[0]!.probability).toBe(0.5);
    expect(predictions[0]!.frequency).toBe(2);
  });

  it('sorts by probability descending', () => {
    const predictions = predictTargets(['a', 'b', 'b', 'c', 'c', 'c']);
    expect(predictions[0]!.sector).toBe('c');
    expect(predictions[0]!.probability).toBeGreaterThan(predictions[1]!.probability);
  });

  it('is case-insensitive', () => {
    const predictions = predictTargets(['Government', 'GOVERNMENT', 'government']);
    expect(predictions).toHaveLength(1);
    expect(predictions[0]!.frequency).toBe(3);
  });

  it('probabilities sum to 1.0', () => {
    const predictions = predictTargets(['a', 'b', 'c']);
    const total = predictions.reduce((s, p) => s + p.probability, 0);
    expect(total).toBeCloseTo(1.0, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// D3: Actor Comparison Report
// ═══════════════════════════════════════════════════════════════
describe('D3: Actor Comparison', () => {
  const actorA = { id: 'a1', name: 'APT28', ttps: ['T1059', 'T1566'], associatedMalware: ['X-Agent'], targetSectors: ['government'], targetRegions: ['NATO'] };
  const actorB = { id: 'a2', name: 'APT29', ttps: ['T1059', 'T1003'], associatedMalware: ['Cobalt Strike'], targetSectors: ['government', 'tech'], targetRegions: ['NATO', 'EU'] };

  it('returns both actor identities', () => {
    const comp = compareActors(actorA, actorB);
    expect(comp.actorA.name).toBe('APT28');
    expect(comp.actorB.name).toBe('APT29');
  });

  it('computes similarity scores 0-1', () => {
    const comp = compareActors(actorA, actorB);
    expect(comp.ttpSimilarity).toBeGreaterThanOrEqual(0);
    expect(comp.ttpSimilarity).toBeLessThanOrEqual(1);
    expect(comp.overallSimilarity).toBeGreaterThanOrEqual(0);
  });

  it('identical actors have 1.0 similarity', () => {
    const comp = compareActors(actorA, actorA);
    expect(comp.ttpSimilarity).toBe(1);
    expect(comp.malwareSimilarity).toBe(1);
  });

  it('returns shared and unique items', () => {
    const comp = compareActors(actorA, actorB);
    expect(comp.sharedTtps).toContain('T1059');
    expect(comp.uniqueToA.ttps).toContain('T1566');
    expect(comp.uniqueToB.ttps).toContain('T1003');
  });

  it('overall similarity uses weighted formula', () => {
    const comp = compareActors(actorA, actorB);
    expect(comp.overallSimilarity).toBeGreaterThan(0);
    expect(comp.overallSimilarity).toBeLessThan(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// D4: Per-Feed Actor Accuracy
// ═══════════════════════════════════════════════════════════════
describe('D4: Feed Actor Accuracy', () => {
  it('aggregates by feed source', () => {
    const iocs = [
      { feedSourceId: 'f1', confidence: 80, threatActors: ['APT28'] },
      { feedSourceId: 'f1', confidence: 90, threatActors: ['APT28', 'APT29'] },
      { feedSourceId: 'f2', confidence: 60, threatActors: ['Lazarus'] },
    ];
    const result = computeFeedActorAccuracy(iocs);
    expect(result).toHaveLength(2);
    const f1 = result.find((r) => r.feedId === 'f1');
    expect(f1!.actorCount).toBe(2);
    expect(f1!.avgConfidence).toBe(85);
    expect(f1!.iocCount).toBe(2);
  });

  it('skips IOCs without feed source', () => {
    const iocs = [{ feedSourceId: null, confidence: 50, threatActors: ['A'] }];
    expect(computeFeedActorAccuracy(iocs)).toHaveLength(0);
  });

  it('skips IOCs without threat actors', () => {
    const iocs = [{ feedSourceId: 'f1', confidence: 50, threatActors: [] }];
    expect(computeFeedActorAccuracy(iocs)).toHaveLength(0);
  });

  it('sorts by actor count descending', () => {
    const iocs = [
      { feedSourceId: 'f1', confidence: 80, threatActors: ['A'] },
      { feedSourceId: 'f2', confidence: 70, threatActors: ['A', 'B', 'C'] },
    ];
    const result = computeFeedActorAccuracy(iocs);
    expect(result[0]!.feedId).toBe('f2');
  });

  it('deduplicates actor names within a feed', () => {
    const iocs = [
      { feedSourceId: 'f1', confidence: 80, threatActors: ['APT28'] },
      { feedSourceId: 'f1', confidence: 90, threatActors: ['APT28'] },
    ];
    const result = computeFeedActorAccuracy(iocs);
    expect(result[0]!.actorCount).toBe(1);
    expect(result[0]!.iocCount).toBe(2);
  });
});
