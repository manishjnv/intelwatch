import { describe, it, expect, beforeEach } from 'vitest';
import { TTPSimilarityService } from '../src/services/ttp-similarity.js';

describe('Correlation Engine — #4 TTPSimilarityService', () => {
  let svc: TTPSimilarityService;

  beforeEach(() => {
    svc = new TTPSimilarityService();
  });

  it('1. Dice coefficient is 1.0 for identical sets', () => {
    expect(svc.diceCoefficient(['T1566', 'T1059', 'T1071'], ['T1566', 'T1059', 'T1071'])).toBe(1);
  });

  it('2. Dice coefficient is 0 for disjoint sets', () => {
    expect(svc.diceCoefficient(['T1566', 'T1059'], ['T1071', 'T1105'])).toBe(0);
  });

  it('3. Dice coefficient is 0 for two empty sets', () => {
    expect(svc.diceCoefficient([], [])).toBe(0);
  });

  it('4. Dice coefficient is 0 when one set is empty', () => {
    expect(svc.diceCoefficient(['T1566'], [])).toBe(0);
  });

  it('5. Dice coefficient computes correct partial overlap', () => {
    // 2 * |{T1566}| / (2 + 3) = 2/5 = 0.4
    const score = svc.diceCoefficient(['T1566', 'T1059'], ['T1566', 'T1071', 'T1105']);
    expect(score).toBeCloseTo(0.4, 5);
  });

  it('6. sharedTechniques returns correct intersection', () => {
    const shared = svc.sharedTechniques(['T1566', 'T1059', 'T1071'], ['T1059', 'T1071', 'T1105']);
    expect(shared.sort()).toEqual(['T1059', 'T1071']);
  });

  it('7. compare returns full result with totalUniqueTechniques', () => {
    const result = svc.compare(
      { id: 'actor-1', mitreAttack: ['T1566', 'T1059'] },
      { id: 'actor-2', mitreAttack: ['T1059', 'T1071'] },
    );
    expect(result.entityA).toBe('actor-1');
    expect(result.entityB).toBe('actor-2');
    expect(result.totalUniqueTechniques).toBe(3);
    expect(result.sharedTechniques).toEqual(['T1059']);
  });

  it('8. compareAll filters by minScore and sorts descending', () => {
    const target = { id: 'target', mitreAttack: ['T1566', 'T1059', 'T1071'] };
    const others = [
      { id: 'high', mitreAttack: ['T1566', 'T1059', 'T1071'] },       // 1.0
      { id: 'medium', mitreAttack: ['T1566', 'T1203'] },              // 2*1/(3+2)=0.4
      { id: 'low', mitreAttack: ['T1105'] },                          // 0
    ];

    const results = svc.compareAll(target, others, 0.3);
    expect(results).toHaveLength(2); // 'low' excluded (score=0)
    expect(results[0]!.entityB).toBe('high');
    expect(results[0]!.diceCoefficient).toBe(1);
  });
});
