import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { DRPGraphIntegration } from '../src/services/graph-integration.js';
import { CrossAlertCorrelation } from '../src/services/cross-correlation.js';
import type { DRPAlert, AlertEvidence } from '../src/schemas/drp.js';

const T = 'tenant-corr-1';

function createDeps() {
  const store = new DRPStore();
  const alertManager = new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
  const graphIntegration = new DRPGraphIntegration({
    graphServiceUrl: 'http://localhost:3012',
    syncEnabled: false,
    maxRetries: 1,
    retryDelayMs: 10,
  });
  const correlation = new CrossAlertCorrelation(store, graphIntegration);
  return { store, alertManager, graphIntegration, correlation };
}

function createAlertDirect(store: DRPStore, overrides: Partial<DRPAlert>): DRPAlert {
  const id = overrides.id ?? `alert-${Math.random().toString(36).slice(2)}`;
  const alert: DRPAlert = {
    id,
    tenantId: T,
    assetId: 'example.com',
    type: 'typosquatting',
    severity: 'medium',
    status: 'open',
    title: 'Test alert',
    description: 'Test',
    evidence: [],
    confidence: 0.7,
    confidenceReasons: [],
    signalIds: [],
    assignedTo: null,
    triageNotes: '',
    tags: [],
    detectedValue: 'test.com',
    sourceUrl: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  store.setAlert(T, alert);
  return alert;
}

describe('CrossAlertCorrelation (#15)', () => {
  let correlation: CrossAlertCorrelation;
  let store: DRPStore;

  beforeEach(() => {
    const deps = createDeps();
    correlation = deps.correlation;
    store = deps.store;
  });

  it('detects shared hosting infrastructure', () => {
    const ev: AlertEvidence = { id: 'e1', type: 'dns_record', title: 'DNS', data: { hostingProvider: 'Cloudflare' }, collectedAt: new Date().toISOString() };
    createAlertDirect(store, { id: 'a1', evidence: [ev] });
    createAlertDirect(store, { id: 'a2', evidence: [ev] });
    createAlertDirect(store, { id: 'a3', evidence: [ev] });

    const result = correlation.correlate(T, undefined, true, 2, false);
    expect(result.clusters.length).toBeGreaterThan(0);
    const shared = result.clusters.find((c) => c.correlationType === 'shared_hosting');
    expect(shared).toBeDefined();
    expect(shared!.alertIds.length).toBeGreaterThanOrEqual(2);
    expect(shared!.sharedInfrastructure[0]!.value).toBe('Cloudflare');
  });

  it('detects temporal clusters', () => {
    const now = new Date().toISOString();
    createAlertDirect(store, { id: 'a1', createdAt: now });
    createAlertDirect(store, { id: 'a2', createdAt: now });
    createAlertDirect(store, { id: 'a3', createdAt: now });

    const result = correlation.correlate(T, undefined, true, 2, false);
    const temporal = result.clusters.find((c) => c.correlationType === 'temporal_cluster');
    expect(temporal).toBeDefined();
  });

  it('detects multi-vector attacks on same asset', () => {
    createAlertDirect(store, { id: 'a1', assetId: 'target.com', type: 'typosquatting' });
    createAlertDirect(store, { id: 'a2', assetId: 'target.com', type: 'credential_leak' });
    createAlertDirect(store, { id: 'a3', assetId: 'target.com', type: 'dark_web_mention' });

    const result = correlation.correlate(T, undefined, true, 2, false);
    const multiVector = result.clusters.find((c) => c.correlationType === 'multi_vector');
    expect(multiVector).toBeDefined();
    expect(multiVector!.alertIds.length).toBe(3);
  });

  it('creates manual correlation from explicit alert IDs', () => {
    createAlertDirect(store, { id: 'a1' });
    createAlertDirect(store, { id: 'a2' });

    const result = correlation.correlate(T, ['a1', 'a2'], false, 2, false);
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0]!.alertIds).toContain('a1');
    expect(result.clusters[0]!.alertIds).toContain('a2');
  });

  it('respects minClusterSize', () => {
    createAlertDirect(store, { id: 'a1', assetId: 'x', type: 'typosquatting' });
    createAlertDirect(store, { id: 'a2', assetId: 'x', type: 'credential_leak' });

    // Min 3 should not produce multi_vector cluster with 2 alerts
    const result = correlation.correlate(T, undefined, true, 3, false);
    const multiVector = result.clusters.find((c) => c.correlationType === 'multi_vector');
    expect(multiVector).toBeUndefined();
  });

  it('stores clusters in store', () => {
    createAlertDirect(store, { id: 'a1' });
    createAlertDirect(store, { id: 'a2' });

    correlation.correlate(T, ['a1', 'a2'], false, 2, false);
    const stored = correlation.getClusters(T);
    expect(stored.length).toBeGreaterThan(0);
  });

  it('returns totalCorrelated count', () => {
    const ev: AlertEvidence = { id: 'e1', type: 'dns_record', title: 'DNS', data: { hostingProvider: 'AWS' }, collectedAt: new Date().toISOString() };
    createAlertDirect(store, { id: 'a1', evidence: [ev] });
    createAlertDirect(store, { id: 'a2', evidence: [ev] });

    const result = correlation.correlate(T, undefined, true, 2, false);
    expect(result.totalCorrelated).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates overlapping clusters', () => {
    const now = new Date().toISOString();
    const ev: AlertEvidence = { id: 'e1', type: 'dns_record', title: 'DNS', data: { hostingProvider: 'OVH' }, collectedAt: now };
    // Same alerts would match both shared_hosting and temporal
    createAlertDirect(store, { id: 'a1', evidence: [ev], createdAt: now });
    createAlertDirect(store, { id: 'a2', evidence: [ev], createdAt: now });
    createAlertDirect(store, { id: 'a3', evidence: [ev], createdAt: now });

    const result = correlation.correlate(T, undefined, true, 2, false);
    // Should not have fully redundant clusters (>80% overlap removed)
    for (let i = 0; i < result.clusters.length; i++) {
      for (let j = i + 1; j < result.clusters.length; j++) {
        const setA = new Set(result.clusters[i]!.alertIds);
        const overlap = result.clusters[j]!.alertIds.filter((id) => setA.has(id)).length;
        const ratio = overlap / Math.min(result.clusters[i]!.alertIds.length, result.clusters[j]!.alertIds.length);
        expect(ratio).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('returns empty clusters for no alerts', () => {
    const result = correlation.correlate(T, undefined, true, 2, false);
    expect(result.clusters).toHaveLength(0);
    expect(result.totalCorrelated).toBe(0);
  });

  it('handles single alert gracefully', () => {
    createAlertDirect(store, { id: 'a1' });
    const result = correlation.correlate(T, ['a1'], false, 2, false);
    expect(result.clusters).toHaveLength(0);
  });

  it('clusters have confidence scores', () => {
    const ev: AlertEvidence = { id: 'e1', type: 'dns_record', title: 'DNS', data: { hostingProvider: 'GCP' }, collectedAt: new Date().toISOString() };
    createAlertDirect(store, { id: 'a1', evidence: [ev] });
    createAlertDirect(store, { id: 'a2', evidence: [ev] });

    const result = correlation.correlate(T, undefined, true, 2, false);
    for (const cluster of result.clusters) {
      expect(cluster.confidence).toBeGreaterThan(0);
      expect(cluster.confidence).toBeLessThanOrEqual(1);
      expect(cluster.description).toBeDefined();
    }
  });
});
