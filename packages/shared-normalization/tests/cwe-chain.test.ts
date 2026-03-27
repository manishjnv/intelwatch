import { describe, it, expect } from 'vitest';
import {
  getCweEntry,
  getCweSeverity,
  getCwesByCategoryMap,
  buildCweChain,
} from '../src/index.js';

describe('getCweEntry', () => {
  it('CWE-89 → SQL Injection', () => {
    const entry = getCweEntry('CWE-89');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('SQL Injection');
    expect(entry!.category).toBe('injection');
    expect(entry!.severity).toBe(90);
  });

  it('unknown CWE → null', () => {
    expect(getCweEntry('CWE-99999')).toBeNull();
  });

  it('case-insensitive — "cwe-89" and "89" both work', () => {
    const e1 = getCweEntry('cwe-89');
    const e2 = getCweEntry('89');
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(e1!.id).toBe('CWE-89');
    expect(e2!.id).toBe('CWE-89');
  });
});

describe('buildCweChain', () => {
  it('[CWE-20, CWE-89] → root cause is CWE-20', () => {
    const result = buildCweChain(['CWE-20', 'CWE-89']);
    expect(result.rootCauses.map((r) => r.id)).toContain('CWE-20');
    expect(result.chain).toHaveLength(2);
  });

  it('narrative includes both CWE names', () => {
    const result = buildCweChain(['CWE-20', 'CWE-89']);
    expect(result.attackNarrative).toContain('Input Validation');
    expect(result.attackNarrative).toContain('SQL Injection');
  });

  it('maxSeverity from highest CWE', () => {
    const result = buildCweChain(['CWE-20', 'CWE-89']);
    expect(result.maxSeverity).toBe(90); // CWE-89 severity
  });

  it('empty input returns empty chain', () => {
    const result = buildCweChain([]);
    expect(result.chain).toHaveLength(0);
    expect(result.maxSeverity).toBe(0);
  });
});

describe('getCwesByCategoryMap', () => {
  it('injection category has CWE-79 and CWE-89', () => {
    const map = getCwesByCategoryMap();
    expect(map['injection']).toBeDefined();
    const ids = map['injection']!.map((e) => e.id);
    expect(ids).toContain('CWE-79');
    expect(ids).toContain('CWE-89');
  });

  it('has all expected categories', () => {
    const map = getCwesByCategoryMap();
    expect(Object.keys(map)).toEqual(
      expect.arrayContaining(['injection', 'memory', 'auth', 'crypto', 'config', 'info-disclosure']),
    );
  });
});

describe('getCweSeverity', () => {
  it('known CWE → correct severity', () => {
    expect(getCweSeverity('CWE-787')).toBe(95);
  });

  it('unknown CWE → 50', () => {
    expect(getCweSeverity('CWE-99999')).toBe(50);
  });
});
