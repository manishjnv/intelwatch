import { describe, it, expect } from 'vitest';
import { classifySeverity } from '../src/service.js';

describe('classifySeverity (Improvement #6: Auto-severity classification)', () => {
  it('uses explicit severity when provided and non-default', () => {
    expect(classifySeverity({
      iocType: 'ip', threatActors: [], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0, explicitSeverity: 'critical',
    })).toBe('critical');
  });

  it('overrides explicit "medium" with context-based classification', () => {
    // Explicit "medium" is treated as "not set" — context takes over
    expect(classifySeverity({
      iocType: 'ip', threatActors: ['APT28'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0, explicitSeverity: 'medium',
    })).toBe('high');
  });

  it('classifies ransomware families as CRITICAL', () => {
    expect(classifySeverity({
      iocType: 'hash_sha256', threatActors: [], malwareFamilies: ['LockBit'], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('critical');

    expect(classifySeverity({
      iocType: 'domain', threatActors: [], malwareFamilies: ['BlackCat'], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('critical');

    expect(classifySeverity({
      iocType: 'ip', threatActors: [], malwareFamilies: ['Cl0p'], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('critical');
  });

  it('classifies APT groups as HIGH', () => {
    expect(classifySeverity({
      iocType: 'ip', threatActors: ['APT28'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('high');

    expect(classifySeverity({
      iocType: 'domain', threatActors: ['FIN7'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('high');

    expect(classifySeverity({
      iocType: 'ip', threatActors: ['UNC2452'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('high');
  });

  it('classifies nation-state actors as HIGH', () => {
    expect(classifySeverity({
      iocType: 'ip', threatActors: ['Lazarus'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('high');

    expect(classifySeverity({
      iocType: 'ip', threatActors: ['Volt Typhoon'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('high');

    expect(classifySeverity({
      iocType: 'ip', threatActors: ['Sandworm'], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('high');
  });

  it('classifies high-impact MITRE techniques as HIGH', () => {
    expect(classifySeverity({
      iocType: 'ip', threatActors: [], malwareFamilies: [], mitreAttack: ['T1486'],
      corroborationCount: 0,
    })).toBe('high');

    expect(classifySeverity({
      iocType: 'domain', threatActors: [], malwareFamilies: [], mitreAttack: ['T1059.001'],
      corroborationCount: 0,
    })).toBe('high');
  });

  it('boosts severity for high corroboration', () => {
    expect(classifySeverity({
      iocType: 'ip', threatActors: [], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 5,
    })).toBe('high');

    expect(classifySeverity({
      iocType: 'ip', threatActors: [], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 3,
    })).toBe('medium');
  });

  it('uses type-based defaults for uncorroborated IOCs', () => {
    expect(classifySeverity({
      iocType: 'cve', threatActors: [], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('medium');

    expect(classifySeverity({
      iocType: 'ip', threatActors: [], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('low');

    expect(classifySeverity({
      iocType: 'asn', threatActors: [], malwareFamilies: [], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('info');
  });

  it('ransomware takes priority over APT', () => {
    // Both ransomware and APT present — ransomware wins (CRITICAL > HIGH)
    expect(classifySeverity({
      iocType: 'ip', threatActors: ['APT28'], malwareFamilies: ['LockBit'], mitreAttack: [],
      corroborationCount: 0,
    })).toBe('critical');
  });
});

describe('classifySeverity — CISA KEV + EPSS auto-severity', () => {
  const base = {
    iocType: 'cve' as const,
    threatActors: [] as string[],
    malwareFamilies: [] as string[],
    mitreAttack: [] as string[],
    corroborationCount: 0,
  };

  it('KEV + EPSS > 0.5 → CRITICAL', () => {
    expect(classifySeverity({ ...base, isKEV: true, epssScore: 0.8 })).toBe('critical');
    expect(classifySeverity({ ...base, isKEV: true, epssScore: 0.51 })).toBe('critical');
  });

  it('KEV + EPSS = 0.5 does NOT trigger CRITICAL (must exceed 0.5)', () => {
    expect(classifySeverity({ ...base, isKEV: true, epssScore: 0.5 })).toBe('high');
  });

  it('KEV alone → HIGH', () => {
    expect(classifySeverity({ ...base, isKEV: true })).toBe('high');
    expect(classifySeverity({ ...base, isKEV: true, epssScore: 0.3 })).toBe('high');
  });

  it('EPSS without KEV → no escalation (uses type default)', () => {
    expect(classifySeverity({ ...base, epssScore: 0.95 })).toBe('medium'); // CVE default
    expect(classifySeverity({ ...base, isKEV: false, epssScore: 0.8 })).toBe('medium');
  });

  it('KEV + EPSS > 0.5 takes priority over ransomware (both CRITICAL)', () => {
    expect(classifySeverity({
      ...base, isKEV: true, epssScore: 0.9, malwareFamilies: ['LockBit'],
    })).toBe('critical');
  });

  it('explicit severity overrides KEV+EPSS', () => {
    expect(classifySeverity({
      ...base, isKEV: true, epssScore: 0.9, explicitSeverity: 'high',
    })).toBe('high');
  });

  it('KEV is falsy when not set (defaults to no escalation)', () => {
    expect(classifySeverity({ ...base })).toBe('medium'); // CVE type default
  });
});
