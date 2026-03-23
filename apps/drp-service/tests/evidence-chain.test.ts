import { describe, it, expect, beforeEach } from 'vitest';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { DRPStore } from '../src/schemas/store.js';

describe('DRP Service — P0#3 Evidence Chain', () => {
  let store: DRPStore;
  let builder: EvidenceChainBuilder;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    store = new DRPStore();
    builder = new EvidenceChainBuilder(store);
  });

  function buildDefaultChain(alertId = 'alert-1') {
    return builder.buildChain(tenantId, alertId, {
      signals: [
        { signalType: 'domain_similarity', rawValue: 0.95, description: 'High similarity' },
        { signalType: 'registration_age', rawValue: 0.8, description: 'Recently registered' },
      ],
      confidence: 0.85,
      reasons: [
        { signal: 'domain_similarity', weight: 0.6, value: 0.95, description: 'High similarity' },
        { signal: 'registration_age', weight: 0.4, value: 0.8, description: 'Recently registered' },
      ],
      severity: 'high',
      deduped: false,
    });
  }

  // P3.1 buildChain creates a chain with correct alertId
  it('P3.1 buildChain creates a chain with correct alertId', () => {
    const chain = buildDefaultChain('alert-42');
    expect(chain.alertId).toBe('alert-42');
    expect(chain.tenantId).toBe(tenantId);
    expect(chain.createdAt).toBeDefined();
  });

  // P3.2 chain has detection steps for each signal
  it('P3.2 chain has detection steps for each signal', () => {
    const chain = buildDefaultChain();
    const detectionSteps = chain.steps.filter((s) => s.type === 'detection');
    expect(detectionSteps).toHaveLength(2);
    expect(detectionSteps[0]!.description).toContain('domain_similarity');
    expect(detectionSteps[0]!.description).toContain('0.950');
    expect(detectionSteps[1]!.description).toContain('registration_age');
    expect(detectionSteps[1]!.description).toContain('0.800');
  });

  // P3.3 chain has scoring step with confidence
  it('P3.3 chain has scoring step with confidence', () => {
    const chain = buildDefaultChain();
    const scoringStep = chain.steps.find((s) => s.type === 'scoring');
    expect(scoringStep).toBeDefined();
    expect(scoringStep!.description).toContain('85.0%');
    expect(scoringStep!.description).toContain('2 signals');
    expect(scoringStep!.data['confidence']).toBe(0.85);
  });

  // P3.4 chain has dedup step
  it('P3.4 chain has dedup step', () => {
    const chain = buildDefaultChain();
    const dedupStep = chain.steps.find((s) => s.type === 'dedup');
    expect(dedupStep).toBeDefined();
    expect(dedupStep!.description).toContain('No duplicate found');
    expect(dedupStep!.data['deduped']).toBe(false);

    // Also verify deduped = true case
    const dedupedChain = builder.buildChain(tenantId, 'alert-dup', {
      signals: [{ signalType: 'sim', rawValue: 0.9, description: 'd' }],
      confidence: 0.7,
      reasons: [],
      severity: 'medium',
      deduped: true,
    });
    const dedupStep2 = dedupedChain.steps.find((s) => s.type === 'dedup');
    expect(dedupStep2!.description).toContain('Duplicate detected');
  });

  // P3.5 chain has classification step with severity
  it('P3.5 chain has classification step with severity', () => {
    const chain = buildDefaultChain();
    const classStep = chain.steps.find((s) => s.type === 'classification');
    expect(classStep).toBeDefined();
    expect(classStep!.description).toContain('high');
    expect(classStep!.data['severity']).toBe('high');
    expect(classStep!.data['confidence']).toBe(0.85);
  });

  // P3.6 chain has alert_created step
  it('P3.6 chain has alert_created step', () => {
    const chain = buildDefaultChain('alert-99');
    const createdStep = chain.steps.find((s) => s.type === 'alert_created');
    expect(createdStep).toBeDefined();
    expect(createdStep!.description).toContain('high severity');
    expect(createdStep!.description).toContain('85.0% confidence');
    expect(createdStep!.data['alertId']).toBe('alert-99');
    expect(createdStep!.data['severity']).toBe('high');
    expect(createdStep!.data['confidence']).toBe(0.85);
  });

  // P3.7 steps are ordered sequentially
  it('P3.7 steps are ordered sequentially', () => {
    const chain = buildDefaultChain();
    // 2 detection + scoring + dedup + classification + alert_created = 6 steps
    expect(chain.steps).toHaveLength(6);
    for (let i = 0; i < chain.steps.length; i++) {
      expect(chain.steps[i]!.order).toBe(i + 1);
    }
    // Verify the order of step types
    expect(chain.steps[0]!.type).toBe('detection');
    expect(chain.steps[1]!.type).toBe('detection');
    expect(chain.steps[2]!.type).toBe('scoring');
    expect(chain.steps[3]!.type).toBe('dedup');
    expect(chain.steps[4]!.type).toBe('classification');
    expect(chain.steps[5]!.type).toBe('alert_created');
  });

  // P3.8 getChain returns stored chain
  it('P3.8 getChain returns stored chain', () => {
    buildDefaultChain('alert-stored');
    const retrieved = builder.getChain(tenantId, 'alert-stored');
    expect(retrieved).toBeDefined();
    expect(retrieved!.alertId).toBe('alert-stored');
    expect(retrieved!.steps).toHaveLength(6);
  });

  // P3.9 getChain returns undefined for non-existent alert
  it('P3.9 getChain returns undefined for non-existent alert', () => {
    const result = builder.getChain(tenantId, 'nonexistent-alert');
    expect(result).toBeUndefined();
  });

  // P3.10 addStep appends to existing chain
  it('P3.10 addStep appends to existing chain', () => {
    buildDefaultChain('alert-extend');
    const updated = builder.addStep(tenantId, 'alert-extend', {
      type: 'scoring',
      description: 'Re-scored after corroboration',
      data: { newConfidence: 0.92 },
    });
    expect(updated).toBeDefined();
    expect(updated!.steps).toHaveLength(7);
    const lastStep = updated!.steps[6]!;
    expect(lastStep.order).toBe(7);
    expect(lastStep.type).toBe('scoring');
    expect(lastStep.description).toBe('Re-scored after corroboration');
    expect(lastStep.data['newConfidence']).toBe(0.92);
    expect(lastStep.timestamp).toBeDefined();

    // addStep on non-existent chain returns undefined
    const missing = builder.addStep(tenantId, 'no-such-alert', {
      type: 'detection',
      description: 'nope',
      data: {},
    });
    expect(missing).toBeUndefined();
  });
});
