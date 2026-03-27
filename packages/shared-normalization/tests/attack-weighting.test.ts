import { describe, it, expect } from 'vitest';
import {
  getAttackWeight,
  calculateAttackSeverity,
  getAttackTacticSeverity,
  listAttackTechniques,
} from '../src/attack-weighting.js';

describe('getAttackWeight', () => {
  it('T1190 → severity 95, category high', () => {
    const w = getAttackWeight('T1190');
    expect(w).not.toBeNull();
    expect(w!.severity).toBe(95);
    expect(w!.category).toBe('high');
    expect(w!.tactic).toBe('initial-access');
  });

  it('T1083 → severity 35, category low', () => {
    const w = getAttackWeight('T1083');
    expect(w).not.toBeNull();
    expect(w!.severity).toBe(35);
    expect(w!.category).toBe('low');
  });

  it('unknown technique → null', () => {
    expect(getAttackWeight('T9999')).toBeNull();
  });

  it('sub-technique T1059.001 → falls back to T1059', () => {
    const w = getAttackWeight('T1059.001');
    expect(w).not.toBeNull();
    expect(w!.id).toBe('T1059');
    expect(w!.severity).toBe(85);
  });

  it('case-insensitive (t1190 → found)', () => {
    const w = getAttackWeight('t1190');
    expect(w).not.toBeNull();
    expect(w!.severity).toBe(95);
  });

  it('handles whitespace in ID', () => {
    const w = getAttackWeight('  T1190  ');
    expect(w).not.toBeNull();
  });
});

describe('calculateAttackSeverity', () => {
  it('single high technique → ~severity (60% max + 40% avg)', () => {
    const result = calculateAttackSeverity(['T1486']); // severity 95
    // max=95, avg=95 → 95*0.6 + 95*0.4 = 95
    expect(result).toBe(95);
  });

  it('mix of high+low → between max and avg', () => {
    const result = calculateAttackSeverity(['T1486', 'T1124']); // 95 + 20
    // max=95, avg=57.5 → 95*0.6 + 57.5*0.4 = 57 + 23 = 80
    expect(result).toBe(80);
  });

  it('unknown techniques → 50 default', () => {
    const result = calculateAttackSeverity(['TXXX']);
    // max=50, avg=50 → 50
    expect(result).toBe(50);
  });

  it('empty array → 0', () => {
    expect(calculateAttackSeverity([])).toBe(0);
  });

  it('multiple techniques returns reasonable severity', () => {
    const result = calculateAttackSeverity(['T1190', 'T1566', 'T1082']);
    // max=95, avg=(95+75+50)/3=73.3 → 95*0.6+73.3*0.4 = 57+29.3 = 86
    expect(result).toBeGreaterThan(80);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe('getAttackTacticSeverity', () => {
  it('initial-access → high avg', () => {
    const result = getAttackTacticSeverity('initial-access');
    // T1190=95, T1566=75 → avg=85
    expect(result).toBe(85);
  });

  it('unknown tactic → 0', () => {
    expect(getAttackTacticSeverity('nonexistent')).toBe(0);
  });

  it('discovery → lower avg (many low-severity techniques)', () => {
    const result = getAttackTacticSeverity('discovery');
    expect(result).toBeLessThan(50);
  });
});

describe('listAttackTechniques', () => {
  it('no filter returns all 30 techniques', () => {
    expect(listAttackTechniques()).toHaveLength(30);
  });

  it('filter by tactic returns correct subset', () => {
    const discovery = listAttackTechniques({ tactic: 'discovery' });
    expect(discovery.length).toBeGreaterThan(5);
    expect(discovery.every((w) => w.tactic === 'discovery')).toBe(true);
  });

  it('filter by category high returns 10 entries', () => {
    const high = listAttackTechniques({ category: 'high' });
    expect(high).toHaveLength(10);
    expect(high.every((w) => w.severity >= 80)).toBe(true);
  });

  it('filter by tactic + category', () => {
    const result = listAttackTechniques({ tactic: 'command-and-control', category: 'high' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((w) => w.tactic === 'command-and-control' && w.category === 'high')).toBe(true);
  });
});
