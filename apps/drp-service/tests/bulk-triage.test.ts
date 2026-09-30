import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { BulkTriageService } from '../src/services/bulk-triage.js';

const T = 'tenant-bulk-1';

function createDeps() {
  const store = new DRPStore();
  const alertManager = new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
  const bulkTriage = new BulkTriageService(alertManager, store);
  return { store, alertManager, bulkTriage };
}

async function seedAlerts(alertManager: AlertManager, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const alert = await alertManager.create(T, {
      assetId: 'example.com',
      type: i % 2 === 0 ? 'typosquatting' : 'credential_leak',
      title: `Alert ${i}`,
      description: `Test alert ${i}`,
      detectedValue: `val-${i}`,
      signals: [{ signalType: 'test', rawValue: 0.5 + i * 0.05, description: 'test' }],
    });
    if (alert) ids.push(alert.id);
  }
  return ids;
}

describe('BulkTriageService (#8)', () => {
  let bulkTriage: BulkTriageService;
  let alertManager: AlertManager;
  let alertIds: string[];

  beforeEach(async () => {
    const deps = createDeps();
    bulkTriage = deps.bulkTriage;
    alertManager = deps.alertManager;
    alertIds = await seedAlerts(alertManager, 6);
  });

  it('triages by explicit alert IDs', async () => {
    const result = await bulkTriage.triage(T, alertIds.slice(0, 3), undefined, {
      severity: 'critical',
      notes: 'Bulk escalation',
    });
    expect(result.processed).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);

    const updated = await alertManager.get(T, alertIds[0]!);
    expect(updated.severity).toBe('critical');
  });

  it('triages by filter — type', async () => {
    const result = await bulkTriage.triage(T, undefined, { type: 'typosquatting' }, {
      addTags: ['batch-reviewed'],
    });
    // 3 typosquatting alerts (indices 0, 2, 4)
    expect(result.processed).toBe(3);
    expect(result.succeeded).toBe(3);
  });

  it('triages by filter — severity', async () => {
    // First set some to high
    await bulkTriage.triage(T, alertIds.slice(0, 2), undefined, { severity: 'high' });
    const result = await bulkTriage.triage(T, undefined, { severity: 'high' }, {
      notes: 'Reviewed high severity',
    });
    expect(result.processed).toBe(2);
  });

  it('assigns alerts in bulk', async () => {
    const result = await bulkTriage.triage(T, alertIds, undefined, {
      assignTo: 'analyst-42',
    });
    expect(result.succeeded).toBe(6);
    for (const id of alertIds) {
      const alert = await alertManager.get(T, id);
      expect(alert.assignedTo).toBe('analyst-42');
    }
  });

  it('changes status in bulk', async () => {
    const result = await bulkTriage.triage(T, alertIds.slice(0, 2), undefined, {
      status: 'investigating',
    });
    expect(result.succeeded).toBe(2);
    const alert = await alertManager.get(T, alertIds[0]!);
    expect(alert.status).toBe('investigating');
  });

  it('reports errors for invalid transitions', async () => {
    // First resolve alerts
    for (const id of alertIds.slice(0, 2)) {
      await alertManager.changeStatus(T, id, 'resolved');
    }
    // Try to move resolved → investigating (invalid)
    const result = await bulkTriage.triage(T, alertIds.slice(0, 2), undefined, {
      status: 'investigating',
    });
    expect(result.failed).toBe(2);
    expect(result.errors.length).toBe(2);
  });

  it('handles nonexistent alert IDs gracefully', async () => {
    const result = await bulkTriage.triage(T, ['fake-id-1', 'fake-id-2'], undefined, {
      severity: 'critical',
    });
    expect(result.processed).toBe(0);
    expect(result.succeeded).toBe(0);
  });

  it('adds tags without replacing existing ones', async () => {
    // First add some tags
    await alertManager.triage(T, alertIds[0]!, { tags: ['existing'] });
    await bulkTriage.triage(T, [alertIds[0]!], undefined, { addTags: ['new-tag'] });
    const alert = await alertManager.get(T, alertIds[0]!);
    expect(alert.tags).toContain('existing');
    expect(alert.tags).toContain('new-tag');
  });

  it('filters by confidence range', async () => {
    const result = await bulkTriage.triage(T, undefined, { minConfidence: 0, maxConfidence: 1 }, {
      notes: 'Filtered by confidence',
    });
    expect(result.processed).toBe(6);
  });
});
