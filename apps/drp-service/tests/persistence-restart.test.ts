/**
 * Proves the DRP store keeps no state of its own (Step 3 S158): data created
 * through one DRPStore instance survives building a brand-new DRPStore over
 * the SAME MemoryDrpRepo (simulating a container restart with a real
 * Postgres — MemoryDrpRepo here stands in for Postgres), and that in-place
 * mutations made through the service/route layer are actually persisted
 * (not lost because the caller mutated a JS object that nothing re-saved).
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DRPStore } from '../src/schemas/store.js';
import { MemoryDrpRepo } from '../src/repository.js';
import { AssetManager } from '../src/services/asset-manager.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { TakedownGenerator } from '../src/services/takedown-generator.js';
import type { DetectionSignal } from '../src/schemas/drp.js';

function buildAlertManager(store: DRPStore): AlertManager {
  return new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
}

describe('DRP persistence survives a store rebuild over the same repo (Step 3 S158)', () => {
  it('asset written through store #1 is read back through a new store #2', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();
    const assetManager1 = new AssetManager(store1, { maxAssetsPerTenant: 100 });

    const asset = await assetManager1.create(tenantId, 'user-1', {
      type: 'domain', value: 'restart-example.com', displayName: 'Restart Example',
    });

    // ── "restart": brand-new store over the same repo ──────────────
    const store2 = new DRPStore(repo);
    const assetManager2 = new AssetManager(store2, { maxAssetsPerTenant: 100 });

    const readBack = await assetManager2.get(tenantId, asset.id);
    expect(readBack.value).toBe('restart-example.com');
    expect(readBack.displayName).toBe('Restart Example');
  });

  it('alert + AI enrichment + evidence chain written through store #1 are read back through store #2', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();
    const alertManager1 = buildAlertManager(store1);

    const alert = await alertManager1.create(tenantId, {
      assetId: 'restart-asset.com',
      type: 'typosquatting',
      title: 'Restart alert',
      description: 'desc',
      detectedValue: 'restart-evil.com',
      signals: [{ signalType: 'homoglyph_similarity', rawValue: 0.9, description: 'match' }],
    });
    expect(alert).not.toBeNull();

    const enrichment = {
      alertId: alert!.id, hostingProvider: 'Cloudflare', registrar: 'GoDaddy',
      takedownContacts: [], recommendedActions: ['x'], riskAssessment: 'high risk',
      enrichedAt: new Date().toISOString(), model: 'test-model', cached: false,
    };
    await store1.setAIEnrichment(tenantId, alert!.id, enrichment);

    // ── "restart": brand-new store over the same repo ──────────────
    const store2 = new DRPStore(repo);
    const alertManager2 = buildAlertManager(store2);

    const readAlert = await alertManager2.get(tenantId, alert!.id);
    expect(readAlert.title).toBe('Restart alert');
    expect(readAlert.detectedValue).toBe('restart-evil.com');

    const readEnrichment = await store2.getAIEnrichment(tenantId, alert!.id);
    expect(readEnrichment?.riskAssessment).toBe('high risk');

    const readChain = await store2.getEvidenceChain(tenantId, alert!.id);
    expect(readChain?.steps.length).toBeGreaterThan(0);
  });

  it('scan written through store #1 is read back through store #2', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();

    const scan = {
      id: randomUUID(), tenantId, assetId: 'scan-asset.com', scanType: 'typosquatting' as const,
      status: 'completed' as const, findingsCount: 3, alertsCreated: 1,
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 42,
    };
    await store1.setScan(tenantId, scan);

    const store2 = new DRPStore(repo);
    const readScan = await store2.getScan(tenantId, scan.id);
    expect(readScan?.findingsCount).toBe(3);
    expect((await store2.listAllScans(tenantId)).length).toBe(1);
  });

  it('takedown written through store #1 is read back through store #2', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();
    const alertManager1 = buildAlertManager(store1);
    const takedownGenerator1 = new TakedownGenerator(store1);

    const alert = await alertManager1.create(tenantId, {
      assetId: 'takedown-asset.com', type: 'typosquatting', title: 'T', description: 'd',
      detectedValue: 'takedown-evil.com',
    });
    const takedown = await takedownGenerator1.generate(tenantId, alert!, 'registrar');

    const store2 = new DRPStore(repo);
    const takedownGenerator2 = new TakedownGenerator(store2);
    const readByAlert = await takedownGenerator2.getByAlert(tenantId, alert!.id);
    expect(readByAlert.length).toBe(1);
    expect(readByAlert[0]!.id).toBe(takedown.id);

    // A status change made through the service layer is visible from store #2.
    const updated = await takedownGenerator2.updateStatus(tenantId, takedown.id, 'sent');
    expect(updated.status).toBe('sent');
    const store3 = new DRPStore(repo);
    const readAfterUpdate = await store3.getTakedown(tenantId, takedown.id);
    expect(readAfterUpdate?.status).toBe('sent');
  });

  it('feedback written through store #1 is read back through store #2', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();

    await store1.addFeedback(tenantId, {
      id: randomUUID(), tenantId, alertId: randomUUID(), verdict: 'true_positive',
      reason: 'confirmed', userId: 'user-1', createdAt: new Date().toISOString(),
    });

    const store2 = new DRPStore(repo);
    const feedback = await store2.listFeedback(tenantId);
    expect(feedback.length).toBe(1);
    expect(feedback[0]!.verdict).toBe('true_positive');
  });

  it('an in-place status change made through AlertManager (not a fresh object) survives a store rebuild', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();
    const alertManager1 = buildAlertManager(store1);

    const alert = await alertManager1.create(tenantId, {
      assetId: 'mutate-asset.com', type: 'typosquatting', title: 'T', description: 'd',
      detectedValue: 'mutate-evil.com',
    });
    // changeStatus mutates the fetched alert object in place, then re-saves it.
    await alertManager1.changeStatus(tenantId, alert!.id, 'investigating', 'looking into it');
    await alertManager1.triage(tenantId, alert!.id, { severity: 'critical', tags: ['escalated'] });

    const store2 = new DRPStore(repo);
    const alertManager2 = buildAlertManager(store2);
    const readBack = await alertManager2.get(tenantId, alert!.id);
    expect(readBack.status).toBe('investigating');
    expect(readBack.severity).toBe('critical');
    expect(readBack.tags).toEqual(['escalated']);
    expect(readBack.triageNotes).toContain('looking into it');
  });

  it('an in-place asset update (markScanned/incrementAlertCount) survives a store rebuild', async () => {
    const repo = new MemoryDrpRepo();
    const store1 = new DRPStore(repo);
    const tenantId = randomUUID();
    const assetManager1 = new AssetManager(store1, { maxAssetsPerTenant: 100 });

    const asset = await assetManager1.create(tenantId, 'user-1', {
      type: 'domain', value: 'mutate-asset-2.com', displayName: 'D',
    });
    await assetManager1.markScanned(tenantId, asset.id);
    await assetManager1.incrementAlertCount(tenantId, asset.id);
    await assetManager1.incrementAlertCount(tenantId, asset.id);

    const store2 = new DRPStore(repo);
    const assetManager2 = new AssetManager(store2, { maxAssetsPerTenant: 100 });
    const readBack = await assetManager2.get(tenantId, asset.id);
    expect(readBack.lastScannedAt).not.toBeNull();
    expect(readBack.alertCount).toBe(2);
  });

  it('cross-tenant: tenant B cannot read or update tenant A\'s asset or alert by id', async () => {
    const repo = new MemoryDrpRepo();
    const store = new DRPStore(repo);
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const assetManager = new AssetManager(store, { maxAssetsPerTenant: 100 });
    const alertManager = buildAlertManager(store);

    const asset = await assetManager.create(tenantA, 'user-1', { type: 'domain', value: 'isolated.com', displayName: 'D' });
    const alert = await alertManager.create(tenantA, {
      assetId: 'isolated.com', type: 'typosquatting', title: 'T', description: 'd', detectedValue: 'isolated-evil.com',
    });

    await expect(assetManager.get(tenantB, asset.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(alertManager.get(tenantB, alert!.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await store.getAsset(tenantB, asset.id)).toBeNull();
    expect(await store.getAlert(tenantB, alert!.id)).toBeNull();
  });

  it('signals are capped at the newest 5,000 per tenant', () => {
    const store = new DRPStore(new MemoryDrpRepo());
    const tenantId = randomUUID();

    for (let i = 0; i < 5010; i++) {
      const signal: DetectionSignal = {
        id: randomUUID(), tenantId, alertId: '', signalType: 'test_signal',
        rawValue: 0.5, considered: true, reason: `signal-${i}`, detectedAt: new Date().toISOString(),
      };
      store.addSignal(tenantId, signal);
    }

    const signals = store.getTenantSignals(tenantId);
    expect(signals.length).toBe(5000);
    // Oldest signals were dropped — the newest ones (highest index) remain.
    expect(signals[0]!.reason).toBe('signal-10');
    expect(signals[signals.length - 1]!.reason).toBe('signal-5009');
  });
});
