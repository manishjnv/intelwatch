import { describe, it, expect, beforeEach } from 'vitest';
import { KillChainService } from '../src/services/kill-chain.js';
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

describe('Correlation Engine — #8 KillChainService', () => {
  let svc: KillChainService;

  beforeEach(() => {
    svc = new KillChainService();
  });

  it('1. maps TA0043 (Reconnaissance) to reconnaissance phase', () => {
    expect(svc.techniqueToPhase('TA0043')).toBe('reconnaissance');
  });

  it('2. maps TA0001 (Initial Access) to delivery phase', () => {
    expect(svc.techniqueToPhase('TA0001')).toBe('delivery');
  });

  it('3. maps TA0011 (C2) to command_and_control phase', () => {
    expect(svc.techniqueToPhase('TA0011')).toBe('command_and_control');
  });

  it('4. maps technique T1566 (Phishing) to delivery phase', () => {
    expect(svc.techniqueToPhase('T1566')).toBe('delivery');
  });

  it('5. maps sub-technique T1566.001 to delivery phase', () => {
    expect(svc.techniqueToPhase('T1566.001')).toBe('delivery');
  });

  it('6. returns null for unknown technique', () => {
    expect(svc.techniqueToPhase('T9999')).toBeNull();
  });

  it('7. mapEntityPhases returns unique phases', () => {
    const phases = svc.mapEntityPhases(['TA0043', 'T1566', 'T1071', 'TA0040']);
    expect(phases).toContain('reconnaissance');
    expect(phases).toContain('delivery');
    expect(phases).toContain('command_and_control');
    expect(phases).toContain('actions_on_objectives');
  });

  it('8. computeCoverage counts multi-phase IOCs (3+ phases)', () => {
    const iocs = new Map<string, CorrelatedIOC>();
    iocs.set('multi', makeIOC({
      id: 'multi', tenantId: 't1',
      mitreAttack: ['TA0043', 'T1566', 'T1071', 'TA0040'], // 4 phases
    }));
    iocs.set('single', makeIOC({
      id: 'single', tenantId: 't1',
      mitreAttack: ['T1566'], // 1 phase
    }));

    const coverage = svc.computeCoverage('t1', iocs);
    expect(coverage.multiPhaseCampaigns).toBe(1); // Only 'multi'
    expect(coverage.phases['delivery']!.count).toBeGreaterThanOrEqual(1);
  });
});
