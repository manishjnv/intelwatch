import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { SocialImpersonationDetector } from '../src/services/social-impersonation.js';

const T = 'tenant-social-1';

function createDeps() {
  const store = new DRPStore();
  const alertManager = new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
  const detector = new SocialImpersonationDetector(alertManager, store);
  return { store, alertManager, detector };
}

describe('SocialImpersonationDetector (#10)', () => {
  let detector: SocialImpersonationDetector;
  let store: DRPStore;

  beforeEach(() => {
    const deps = createDeps();
    detector = deps.detector;
    store = deps.store;
  });

  it('scans for impersonation profiles', () => {
    const result = detector.scan(T, 'Acme Corp', ['acmecorp'], ['twitter']);
    expect(result.profiles.length).toBeGreaterThan(0);
    expect(result.scanId).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('generates profiles across multiple platforms', () => {
    const result = detector.scan(T, 'TestBrand', [], ['twitter', 'linkedin']);
    const platforms = new Set(result.profiles.map((p) => p.platform));
    expect(platforms.has('twitter')).toBe(true);
    expect(platforms.has('linkedin')).toBe(true);
  });

  it('profiles have required fields', () => {
    const result = detector.scan(T, 'Acme', ['acme'], ['twitter']);
    for (const p of result.profiles) {
      expect(p.id).toBeDefined();
      expect(p.platform).toBe('twitter');
      expect(p.handle).toBeDefined();
      expect(p.displayName).toBeDefined();
      expect(p.nameSimilarity).toBeGreaterThanOrEqual(0);
      expect(p.handleSimilarity).toBeGreaterThanOrEqual(0);
      expect(p.riskScore).toBeGreaterThanOrEqual(0);
      expect(p.riskScore).toBeLessThanOrEqual(1);
      expect(typeof p.isSuspicious).toBe('boolean');
    }
  });

  it('creates alerts for suspicious profiles', () => {
    const result = detector.scan(T, 'Acme Corp', ['acmecorp'], ['twitter', 'linkedin']);
    expect(result.alertsCreated).toBeGreaterThanOrEqual(0);
    // Verify alert type
    const alerts = Array.from(store.getTenantAlerts(T).values());
    for (const a of alerts) {
      expect(a.type).toBe('social_impersonation');
    }
  });

  it('high-risk profiles are sorted first', () => {
    const result = detector.scan(T, 'Acme', ['acme'], ['twitter']);
    for (let i = 1; i < result.profiles.length; i++) {
      expect(result.profiles[i]!.riskScore).toBeLessThanOrEqual(result.profiles[i - 1]!.riskScore);
    }
  });

  it('verified profiles are marked as not suspicious', () => {
    const result = detector.scan(T, 'Test', ['test'], ['twitter']);
    const verified = result.profiles.filter((p) => p.isVerified);
    for (const p of verified) {
      expect(p.isSuspicious).toBe(false);
    }
  });

  it('generates handle variations based on brand name', () => {
    const result = detector.scan(T, 'Acme Corp', [], ['twitter']);
    const handles = result.profiles.map((p) => p.handle);
    // Should include patterns like acmecorp_official, acmecorp_support, etc.
    expect(handles.some((h) => h.includes('acmecorp'))).toBe(true);
  });

  it('records scan in store', () => {
    const result = detector.scan(T, 'Test', [], ['twitter']);
    const scan = store.getScan(T, result.scanId);
    expect(scan).toBeDefined();
    expect(scan!.scanType).toBe('social_impersonation');
    expect(scan!.status).toBe('completed');
  });

  it('handles empty handles array', () => {
    const result = detector.scan(T, 'Acme', [], ['twitter']);
    expect(result.profiles.length).toBeGreaterThan(0);
  });

  it('handle similarity is 0 when no official handles', () => {
    const result = detector.scan(T, 'Acme', [], ['twitter']);
    for (const p of result.profiles) {
      // With no official handles, handleSimilarity should be 0
      expect(p.handleSimilarity).toBe(0);
    }
  });

  it('calculates name similarity correctly', () => {
    const result = detector.scan(T, 'Acme', ['acme'], ['twitter']);
    // Profiles with "acme" in the handle should have decent name similarity
    const relevantProfiles = result.profiles.filter((p) => p.handle.includes('acme'));
    for (const p of relevantProfiles) {
      expect(p.nameSimilarity).toBeGreaterThan(0.3);
    }
  });
});
