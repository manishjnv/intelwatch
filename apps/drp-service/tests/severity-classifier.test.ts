import { describe, it, expect, beforeEach } from 'vitest';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { DRPStore } from '../src/schemas/store.js';
import type { DRPAlert } from '../src/schemas/drp.js';

describe('DRP Service — P0#5 Severity Classifier', () => {
  let store: DRPStore;
  let classifier: SeverityClassifier;

  beforeEach(() => {
    store = new DRPStore();
    classifier = new SeverityClassifier(store);
  });

  // P5.1 high confidence + critical asset = critical severity
  it('P5.1 high confidence + critical asset = critical severity', () => {
    const result = classifier.classify({
      confidence: 0.95,
      assetCriticality: 1.0,
      signalCount: 5,
      alertType: 'credential_leak',
      isRepeatDetection: true,
    });
    // 0.95*0.35 + 1.0*0.25 + 0.9*0.20 + 1.0*0.10 + 1.0*0.10 = 0.3325 + 0.25 + 0.18 + 0.10 + 0.10 = 0.9625
    expect(result).toBe('critical');
  });

  // P5.2 low confidence + low criticality = info severity
  it('P5.2 low confidence + low criticality = info severity', () => {
    const result = classifier.classify({
      confidence: 0.1,
      assetCriticality: 0.1,
      signalCount: 1,
      alertType: 'rogue_app',
      isRepeatDetection: false,
    });
    // 0.1*0.35 + 0.1*0.25 + 0.5*0.20 + 0.2*0.10 + 0*0.10 = 0.035 + 0.025 + 0.10 + 0.02 + 0 = 0.18
    expect(result).toBe('info');
  });

  // P5.3 medium values produce medium severity
  it('P5.3 medium values produce medium severity', () => {
    const result = classifier.classify({
      confidence: 0.5,
      assetCriticality: 0.5,
      signalCount: 2,
      alertType: 'dark_web_mention',
      isRepeatDetection: false,
    });
    // 0.5*0.35 + 0.5*0.25 + 0.6*0.20 + 0.4*0.10 + 0*0.10 = 0.175 + 0.125 + 0.12 + 0.04 + 0 = 0.46
    expect(result).toBe('medium');
  });

  // P5.4 credential_leak type increases severity
  it('P5.4 credential_leak type increases severity', () => {
    const baseInput = {
      confidence: 0.6,
      assetCriticality: 0.5,
      signalCount: 2,
      isRepeatDetection: false,
    };

    // credential_leak has type_risk 0.9, rogue_app has 0.5
    const credResult = classifier.classify({ ...baseInput, alertType: 'credential_leak' });
    const rogueResult = classifier.classify({ ...baseInput, alertType: 'rogue_app' });

    const credScore = classifier.computeCompositeScore({ ...baseInput, alertType: 'credential_leak' });
    const rogueScore = classifier.computeCompositeScore({ ...baseInput, alertType: 'rogue_app' });

    // credential_leak risk (0.9) > rogue_app risk (0.5) → higher score
    expect(credScore).toBeGreaterThan(rogueScore);
    // The difference should be exactly (0.9 - 0.5) * 0.20 = 0.08
    expect(credScore - rogueScore).toBeCloseTo(0.08, 5);
  });

  // P5.5 high signal count increases severity
  it('P5.5 high signal count increases severity', () => {
    const base = {
      confidence: 0.6,
      assetCriticality: 0.5,
      alertType: 'typosquatting' as const,
      isRepeatDetection: false,
    };

    const lowSignal = classifier.computeCompositeScore({ ...base, signalCount: 1 });
    const highSignal = classifier.computeCompositeScore({ ...base, signalCount: 5 });

    // signalCount 1 → density 0.2, signalCount 5 → density 1.0
    expect(highSignal).toBeGreaterThan(lowSignal);
    // Difference: (1.0 - 0.2) * 0.10 = 0.08
    expect(highSignal - lowSignal).toBeCloseTo(0.08, 5);
  });

  // P5.6 repeat detection boosts severity
  it('P5.6 repeat detection boosts severity', () => {
    const base = {
      confidence: 0.7,
      assetCriticality: 0.6,
      signalCount: 3,
      alertType: 'typosquatting' as const,
    };

    const noRepeat = classifier.computeCompositeScore({ ...base, isRepeatDetection: false });
    const withRepeat = classifier.computeCompositeScore({ ...base, isRepeatDetection: true });

    expect(withRepeat).toBeGreaterThan(noRepeat);
    // Repeat adds exactly 1.0 * 0.10 = 0.10
    expect(withRepeat - noRepeat).toBeCloseTo(0.10, 5);
  });

  // P5.7 computeCompositeScore returns 0-1
  it('P5.7 computeCompositeScore returns 0-1', () => {
    // Minimum possible inputs
    const minScore = classifier.computeCompositeScore({
      confidence: 0,
      assetCriticality: 0,
      signalCount: 0,
      alertType: 'typosquatting',
      isRepeatDetection: false,
    });
    expect(minScore).toBeGreaterThanOrEqual(0);

    // Maximum possible inputs
    const maxScore = classifier.computeCompositeScore({
      confidence: 1,
      assetCriticality: 1,
      signalCount: 10,
      alertType: 'credential_leak',
      isRepeatDetection: true,
    });
    expect(maxScore).toBeLessThanOrEqual(1);
    expect(maxScore).toBeGreaterThan(0);
  });

  // P5.8 getClassificationReasons returns all 5 factors
  it('P5.8 getClassificationReasons returns all 5 factors', () => {
    const reasons = classifier.getClassificationReasons({
      confidence: 0.8,
      assetCriticality: 0.6,
      signalCount: 3,
      alertType: 'exposed_service',
      isRepeatDetection: true,
    });

    expect(reasons).toHaveLength(5);

    const factorNames = reasons.map((r) => r.factor);
    expect(factorNames).toContain('confidence');
    expect(factorNames).toContain('asset_criticality');
    expect(factorNames).toContain('type_risk');
    expect(factorNames).toContain('signal_density');
    expect(factorNames).toContain('repeat_detection');

    // Verify each reason has weight, value, and contribution
    for (const reason of reasons) {
      expect(reason.weight).toBeGreaterThan(0);
      expect(reason.value).toBeGreaterThanOrEqual(0);
      expect(reason.value).toBeLessThanOrEqual(1);
      expect(reason.contribution).toBeGreaterThanOrEqual(0);
    }
  });

  // P5.9 classification reasons sum to score
  it('P5.9 classification reasons sum to score', () => {
    const input = {
      confidence: 0.7,
      assetCriticality: 0.5,
      signalCount: 4,
      alertType: 'typosquatting' as const,
      isRepeatDetection: false,
    };

    const reasons = classifier.getClassificationReasons(input);
    const sumOfContributions = reasons.reduce((sum, r) => sum + r.contribution, 0);
    const compositeScore = classifier.computeCompositeScore(input);

    expect(sumOfContributions).toBeCloseTo(compositeScore, 5);
  });

  // P5.10 isRepeat detects existing open alerts
  it('P5.10 isRepeat detects existing open alerts', () => {
    // No alerts → not a repeat
    expect(classifier.isRepeat('tenant-1', 'asset-1', 'typosquatting')).toBe(false);

    // Add an open alert for this asset and type
    const now = new Date().toISOString();
    const alert: DRPAlert = {
      id: 'alert-existing',
      tenantId: 'tenant-1',
      assetId: 'asset-1',
      type: 'typosquatting',
      severity: 'high',
      status: 'open',
      title: 'Existing',
      description: 'Existing alert',
      evidence: [],
      confidence: 0.8,
      confidenceReasons: [],
      signalIds: [],
      assignedTo: null,
      triageNotes: '',
      tags: [],
      detectedValue: 'evil.com',
      sourceUrl: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.setAlert('tenant-1', alert);

    // Now it should detect as repeat
    expect(classifier.isRepeat('tenant-1', 'asset-1', 'typosquatting')).toBe(true);

    // Different type should not match
    expect(classifier.isRepeat('tenant-1', 'asset-1', 'credential_leak')).toBe(false);

    // Investigating status should also count
    alert.status = 'investigating';
    store.setAlert('tenant-1', alert);
    expect(classifier.isRepeat('tenant-1', 'asset-1', 'typosquatting')).toBe(true);

    // Resolved status should not count
    alert.status = 'resolved';
    store.setAlert('tenant-1', alert);
    expect(classifier.isRepeat('tenant-1', 'asset-1', 'typosquatting')).toBe(false);
  });
});
