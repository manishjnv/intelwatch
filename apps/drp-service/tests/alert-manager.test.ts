import { describe, it, expect, beforeEach } from 'vitest';
import { AlertManager } from '../src/services/alert-manager.js';
import { DRPStore } from '../src/schemas/store.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';

describe('DRP Service — #2 Alert Manager', () => {
  let store: DRPStore;
  let manager: AlertManager;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    store = new DRPStore();
    manager = new AlertManager(store, {
      confidenceScorer: new ConfidenceScorer(),
      signalAggregator: new SignalAggregator(store),
      evidenceChain: new EvidenceChainBuilder(store),
      deduplication: new AlertDeduplication(store),
      severityClassifier: new SeverityClassifier(store),
    });
  });

  function createAlert(detectedValue = 'evil-example.com') {
    return manager.create(tenantId, {
      assetId: 'asset-1',
      type: 'typosquatting',
      title: 'Test alert',
      description: 'Test description',
      detectedValue,
      signals: [
        { signalType: 'homoglyph_similarity', rawValue: 0.85, description: 'Homoglyph match' },
        { signalType: 'domain_registered', rawValue: 0.9, description: 'Domain registered' },
      ],
      assetCriticality: 0.7,
    });
  }

  // 2.1 creates alert with computed confidence
  it('2.1 creates alert with computed confidence', () => {
    const alert = createAlert()!;
    expect(alert).not.toBeNull();
    expect(alert.confidence).toBeGreaterThan(0);
    expect(alert.confidence).toBeLessThanOrEqual(1);
  });

  // 2.2 creates alert with correct severity
  it('2.2 creates alert with correct severity', () => {
    const alert = createAlert()!;
    expect(['critical', 'high', 'medium', 'low', 'info']).toContain(alert.severity);
  });

  // 2.3 new alert has status 'open'
  it('2.3 new alert has status open', () => {
    const alert = createAlert()!;
    expect(alert.status).toBe('open');
  });

  // 2.4 confidence reasons are populated
  it('2.4 confidence reasons are populated', () => {
    const alert = createAlert()!;
    expect(alert.confidenceReasons.length).toBeGreaterThan(0);
    for (const reason of alert.confidenceReasons) {
      expect(reason.signal).toBeDefined();
      expect(reason.weight).toBeGreaterThan(0);
      expect(reason.value).toBeGreaterThanOrEqual(0);
      expect(reason.description).toBeDefined();
    }
  });

  // 2.5 signal IDs are recorded
  it('2.5 signal IDs are recorded', () => {
    const alert = createAlert()!;
    expect(alert.signalIds.length).toBe(2);
    for (const id of alert.signalIds) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  // 2.6 dedup returns merged alert for same detected value
  it('2.6 dedup returns merged alert for same detected value', () => {
    const first = createAlert('dup-domain.com')!;
    const second = manager.create(tenantId, {
      assetId: 'asset-1',
      type: 'typosquatting',
      title: 'Duplicate alert',
      description: 'Same domain detected again',
      detectedValue: 'dup-domain.com',
      signals: [
        { signalType: 'homoglyph_similarity', rawValue: 0.9, description: 'Homoglyph match again' },
      ],
      assetCriticality: 0.7,
    });
    // Second call returns the merged existing alert, not a new one
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first.id);
    // Confidence may be boosted via corroboration
    expect(second!.confidence).toBeGreaterThanOrEqual(first.confidence);
  });

  // 2.7 gets alert by ID
  it('2.7 gets alert by ID', () => {
    const created = createAlert()!;
    const fetched = manager.get(tenantId, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe('Test alert');
  });

  // 2.8 throws 404 for non-existent alert
  it('2.8 throws 404 for non-existent alert', () => {
    expect(() => manager.get(tenantId, 'nonexistent-id')).toThrow('Alert not found');
  });

  // 2.9 tenant isolation
  it('2.9 tenant isolation', () => {
    const alert = createAlert()!;
    expect(() => manager.get('tenant-other', alert.id)).toThrow('Alert not found');
  });

  // 2.10 changes status open→investigating
  it('2.10 changes status open to investigating', () => {
    const alert = createAlert()!;
    const updated = manager.changeStatus(tenantId, alert.id, 'investigating', 'Starting investigation');
    expect(updated.status).toBe('investigating');
    expect(updated.triageNotes).toContain('Starting investigation');
  });

  // 2.11 changes status investigating→resolved
  it('2.11 changes status investigating to resolved', () => {
    const alert = createAlert()!;
    manager.changeStatus(tenantId, alert.id, 'investigating');
    const resolved = manager.changeStatus(tenantId, alert.id, 'resolved', 'Issue resolved');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeDefined();
    expect(resolved.resolvedAt).not.toBeNull();
  });

  // 2.12 rejects invalid transition resolved→investigating
  it('2.12 rejects invalid transition resolved to investigating', () => {
    const alert = createAlert()!;
    manager.changeStatus(tenantId, alert.id, 'investigating');
    manager.changeStatus(tenantId, alert.id, 'resolved');
    // resolved can only go to 'open', not 'investigating'
    expect(() => manager.changeStatus(tenantId, alert.id, 'investigating')).toThrow(
      'Cannot transition from resolved to investigating',
    );
  });

  // 2.13 assigns alert to user
  it('2.13 assigns alert to user', () => {
    const alert = createAlert()!;
    const assigned = manager.assign(tenantId, alert.id, 'analyst-1');
    expect(assigned.assignedTo).toBe('analyst-1');
  });

  // 2.14 triages alert (set severity, notes)
  it('2.14 triages alert with severity and notes', () => {
    const alert = createAlert()!;
    const triaged = manager.triage(tenantId, alert.id, {
      severity: 'critical',
      notes: 'Escalated to critical after manual review',
      tags: ['escalated', 'manual-review'],
    });
    expect(triaged.severity).toBe('critical');
    expect(triaged.triageNotes).toContain('Escalated to critical');
    expect(triaged.tags).toEqual(['escalated', 'manual-review']);
  });

  // 2.15 list returns paginated results
  it('2.15 list returns paginated results', () => {
    createAlert('evil1.com');
    createAlert('evil2.com');
    createAlert('evil3.com');

    const page1 = manager.list(tenantId, 1, 2);
    expect(page1.data.length).toBe(2);
    expect(page1.total).toBe(3);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);

    const page2 = manager.list(tenantId, 2, 2);
    expect(page2.data.length).toBe(1);
  });

  // 2.16 list filters by type
  it('2.16 list filters by type', () => {
    createAlert('evil1.com');
    // Create a different-type alert directly in store to test filter
    manager.create(tenantId, {
      assetId: 'asset-1',
      type: 'credential_leak',
      title: 'Credential leak',
      description: 'Leaked creds',
      detectedValue: 'leak@example.com',
      signals: [{ signalType: 'breach_severity', rawValue: 0.8, description: 'Breach detected' }],
    });

    const typoOnly = manager.list(tenantId, 1, 50, { type: 'typosquatting' });
    expect(typoOnly.data.every((a) => a.type === 'typosquatting')).toBe(true);
    expect(typoOnly.total).toBe(1);

    const credOnly = manager.list(tenantId, 1, 50, { type: 'credential_leak' });
    expect(credOnly.data.every((a) => a.type === 'credential_leak')).toBe(true);
    expect(credOnly.total).toBe(1);
  });

  // 2.17 list filters by status
  it('2.17 list filters by status', () => {
    const a1 = createAlert('evil1.com')!;
    createAlert('evil2.com');
    manager.changeStatus(tenantId, a1.id, 'investigating');

    const openOnly = manager.list(tenantId, 1, 50, { status: 'open' });
    expect(openOnly.data.every((a) => a.status === 'open')).toBe(true);
    expect(openOnly.total).toBe(1);

    const investOnly = manager.list(tenantId, 1, 50, { status: 'investigating' });
    expect(investOnly.data.every((a) => a.status === 'investigating')).toBe(true);
    expect(investOnly.total).toBe(1);
  });

  // 2.18 getStats returns correct aggregation
  it('2.18 getStats returns correct aggregation', () => {
    const a1 = createAlert('evil1.com')!;
    createAlert('evil2.com');
    createAlert('evil3.com');
    manager.changeStatus(tenantId, a1.id, 'resolved');

    const stats = manager.getStats(tenantId);
    expect(stats.total).toBe(3);
    expect(stats.byType['typosquatting']).toBe(3);
    expect(stats.byStatus['open']).toBe(2);
    expect(stats.byStatus['resolved']).toBe(1);
    expect(stats.avgConfidence).toBeGreaterThan(0);
    expect(stats.resolutionRate).toBeCloseTo(1 / 3, 2);
  });
});
