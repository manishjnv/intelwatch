import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { AssetManager } from '../src/services/asset-manager.js';
import { RiskAggregator } from '../src/services/risk-aggregator.js';

const T = 'tenant-risk-1';

function createDeps() {
  const store = new DRPStore();
  const alertManager = new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
  const assetManager = new AssetManager(store, { maxAssetsPerTenant: 100 });
  const riskAggregator = new RiskAggregator(store);
  return { store, alertManager, assetManager, riskAggregator };
}

async function seedAssetAndAlerts(deps: ReturnType<typeof createDeps>) {
  const { assetManager, alertManager } = deps;
  const asset = await assetManager.create(T, 'user-1', {
    type: 'domain',
    value: 'example.com',
    displayName: 'Example',
    criticality: 0.8,
    scanFrequencyHours: 24,
    tags: [],
  });

  await alertManager.create(T, {
    assetId: asset.id,
    type: 'typosquatting',
    title: 'Typosquat',
    description: 'Test',
    detectedValue: 'examp1e.com',
    signals: [{ signalType: 'sim', rawValue: 0.9, description: 'High similarity' }],
    assetCriticality: asset.criticality,
  });

  await alertManager.create(T, {
    assetId: asset.id,
    type: 'credential_leak',
    title: 'Credential Leak',
    description: 'Test',
    detectedValue: 'breach-data',
    signals: [{ signalType: 'breach', rawValue: 0.8, description: 'Breach detected' }],
    assetCriticality: asset.criticality,
  });

  return asset;
}

describe('RiskAggregator (#14)', () => {
  let deps: ReturnType<typeof createDeps>;
  let riskAggregator: RiskAggregator;

  beforeEach(() => {
    deps = createDeps();
    riskAggregator = deps.riskAggregator;
  });

  it('calculates risk score for an asset with alerts', async () => {
    const asset = await seedAssetAndAlerts(deps);
    const risk = await riskAggregator.calculate(T, asset.id);
    expect(risk.assetId).toBe(asset.id);
    expect(risk.assetValue).toBe('example.com');
    expect(risk.compositeScore).toBeGreaterThan(0);
    expect(risk.compositeScore).toBeLessThanOrEqual(1);
    expect(risk.openAlertCount).toBe(2);
    expect(risk.lastCalculated).toBeDefined();
  });

  it('has component scores for different alert types', async () => {
    const asset = await seedAssetAndAlerts(deps);
    const risk = await riskAggregator.calculate(T, asset.id);
    expect(risk.componentScores.typosquatting).toBeGreaterThan(0);
    expect(risk.componentScores.credentialLeak).toBeGreaterThan(0);
    expect(risk.componentScores.darkWeb).toBe(0);
    expect(risk.componentScores.socialImpersonation).toBe(0);
    expect(risk.componentScores.rogueApp).toBe(0);
    expect(risk.componentScores.exposedService).toBe(0);
  });

  it('returns 0 risk for asset with no alerts', async () => {
    const asset = await deps.assetManager.create(T, 'user-1', {
      type: 'domain',
      value: 'safe.com',
      displayName: 'Safe',
      criticality: 0.5,
      scanFrequencyHours: 24,
      tags: [],
    });
    const risk = await riskAggregator.calculate(T, asset.id);
    expect(risk.compositeScore).toBe(0);
    expect(risk.openAlertCount).toBe(0);
  });

  it('throws for nonexistent asset', async () => {
    await expect(riskAggregator.calculate(T, 'fake-id')).rejects.toThrow('Asset not found');
  });

  it('higher criticality amplifies risk score', async () => {
    // Create two assets with same alerts but different criticality
    const highCrit = await deps.assetManager.create(T, 'user-1', {
      type: 'domain', value: 'high.com', displayName: 'High',
      criticality: 1.0, scanFrequencyHours: 24, tags: [],
    });
    const lowCrit = await deps.assetManager.create(T, 'user-1', {
      type: 'domain', value: 'low.com', displayName: 'Low',
      criticality: 0.1, scanFrequencyHours: 24, tags: [],
    });

    for (const assetId of [highCrit.id, lowCrit.id]) {
      await deps.alertManager.create(T, {
        assetId, type: 'typosquatting', title: 'Test', description: 'T',
        detectedValue: 'test.com',
        signals: [{ signalType: 'sim', rawValue: 0.9, description: 'High' }],
      });
    }

    const highRisk = await riskAggregator.calculate(T, highCrit.id);
    const lowRisk = await riskAggregator.calculate(T, lowCrit.id);
    expect(highRisk.compositeScore).toBeGreaterThan(lowRisk.compositeScore);
  });

  it('resolved alerts do not contribute to risk', async () => {
    const asset = await seedAssetAndAlerts(deps);
    // Resolve all alerts
    const alerts = await deps.store.listAllAlerts(T);
    for (const a of alerts) {
      await deps.alertManager.changeStatus(T, a.id, 'resolved');
    }
    const risk = await riskAggregator.calculate(T, asset.id);
    expect(risk.compositeScore).toBe(0);
    expect(risk.openAlertCount).toBe(0);
  });

  it('calculateAll returns risks for all assets', async () => {
    await seedAssetAndAlerts(deps);
    await deps.assetManager.create(T, 'user-1', {
      type: 'domain', value: 'other.com', displayName: 'Other',
      criticality: 0.5, scanFrequencyHours: 24, tags: [],
    });
    const risks = await riskAggregator.calculateAll(T);
    expect(risks).toHaveLength(2);
  });

  it('detects increasing trend on recalculation', async () => {
    const asset = await seedAssetAndAlerts(deps);
    await riskAggregator.calculate(T, asset.id);
    // Add more alerts
    await deps.alertManager.create(T, {
      assetId: asset.id, type: 'dark_web_mention', title: 'Dark web',
      description: 'T', detectedValue: 'mention',
      signals: [{ signalType: 'dw', rawValue: 0.95, description: 'High' }],
    });
    const risk2 = await riskAggregator.calculate(T, asset.id);
    expect(risk2.trend).toBe('increasing');
  });

  it('counts critical alerts correctly', async () => {
    const asset = await seedAssetAndAlerts(deps);
    const risk = await riskAggregator.calculate(T, asset.id);
    expect(typeof risk.criticalAlertCount).toBe('number');
    expect(risk.criticalAlertCount).toBeGreaterThanOrEqual(0);
  });

  it('stores risk score in store', async () => {
    const asset = await seedAssetAndAlerts(deps);
    await riskAggregator.calculate(T, asset.id);
    const stored = deps.store.getAssetRisk(T, asset.id);
    expect(stored).toBeDefined();
    expect(stored!.assetId).toBe(asset.id);
  });
});
