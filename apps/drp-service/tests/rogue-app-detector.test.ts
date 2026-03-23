import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { RogueAppDetector } from '../src/services/rogue-app-detector.js';

const T = 'tenant-rogue-1';

function createDeps() {
  const store = new DRPStore();
  const alertManager = new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
  const detector = new RogueAppDetector(alertManager, store);
  return { store, alertManager, detector };
}

describe('RogueAppDetector (#13)', () => {
  let detector: RogueAppDetector;
  let store: DRPStore;

  beforeEach(() => {
    const deps = createDeps();
    detector = deps.detector;
    store = deps.store;
  });

  it('scans for rogue apps on a single store', () => {
    const result = detector.scan(T, 'MyApp', undefined, ['google_play']);
    expect(result.apps.length).toBeGreaterThan(0);
    expect(result.scanId).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('scans across multiple stores', () => {
    const result = detector.scan(T, 'MyApp', undefined, ['google_play', 'apple_app_store']);
    const stores = new Set(result.apps.map((a) => a.storeName));
    expect(stores.has('google_play')).toBe(true);
    expect(stores.has('apple_app_store')).toBe(true);
  });

  it('apps have required fields', () => {
    const result = detector.scan(T, 'TestApp', undefined, ['google_play']);
    for (const app of result.apps) {
      expect(app.id).toBeDefined();
      expect(app.storeName).toBe('google_play');
      expect(app.appName).toBeDefined();
      expect(app.packageName).toBeDefined();
      expect(app.developer).toBeDefined();
      expect(app.nameSimilarity).toBeGreaterThanOrEqual(0);
      expect(app.riskScore).toBeGreaterThanOrEqual(0);
      expect(app.riskScore).toBeLessThanOrEqual(1);
      expect(typeof app.isSuspicious).toBe('boolean');
    }
  });

  it('creates alerts for suspicious apps', () => {
    const result = detector.scan(T, 'MyApp', undefined, ['google_play', 'apple_app_store', 'third_party']);
    expect(result.alertsCreated).toBeGreaterThanOrEqual(0);
    const alerts = Array.from(store.getTenantAlerts(T).values());
    for (const a of alerts) {
      expect(a.type).toBe('rogue_app');
    }
  });

  it('sorts apps by risk score descending', () => {
    const result = detector.scan(T, 'Test', undefined, ['google_play']);
    for (let i = 1; i < result.apps.length; i++) {
      expect(result.apps[i]!.riskScore).toBeLessThanOrEqual(result.apps[i - 1]!.riskScore);
    }
  });

  it('official apps have low risk score', () => {
    const result = detector.scan(T, 'Test', 'com.test.testpro', ['google_play']);
    // The exact match to packageName gets isOfficial=true
    const official = result.apps.filter((a) => a.isOfficial);
    for (const app of official) {
      expect(app.riskScore).toBeLessThan(0.2);
      expect(app.isSuspicious).toBe(false);
    }
  });

  it('generates name variations', () => {
    const result = detector.scan(T, 'Acme', undefined, ['google_play']);
    const names = result.apps.map((a) => a.appName.toLowerCase());
    expect(names.some((n) => n.includes('pro'))).toBe(true);
    expect(names.some((n) => n.includes('free'))).toBe(true);
  });

  it('records scan in store', () => {
    const result = detector.scan(T, 'MyApp', undefined, ['google_play']);
    const scan = store.getScan(T, result.scanId);
    expect(scan).toBeDefined();
    expect(scan!.scanType).toBe('rogue_app');
    expect(scan!.status).toBe('completed');
  });

  it('name similarity is high for variants containing the brand name', () => {
    const result = detector.scan(T, 'Acme', undefined, ['google_play']);
    for (const app of result.apps) {
      if (app.appName.toLowerCase().includes('acme')) {
        expect(app.nameSimilarity).toBeGreaterThan(0.5);
      }
    }
  });

  it('handles third_party store', () => {
    const result = detector.scan(T, 'MyApp', undefined, ['third_party']);
    expect(result.apps.every((a) => a.storeName === 'third_party')).toBe(true);
  });
});
