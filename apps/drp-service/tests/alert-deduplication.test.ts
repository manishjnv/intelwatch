import { describe, it, expect, beforeEach } from 'vitest';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { DRPStore } from '../src/schemas/store.js';
import type { DRPAlert } from '../src/schemas/drp.js';

describe('DRP Service — P0#4 Alert Deduplication', () => {
  let store: DRPStore;
  let dedup: AlertDeduplication;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    store = new DRPStore();
    dedup = new AlertDeduplication(store);
  });

  function seedAlert(overrides?: Partial<DRPAlert>): DRPAlert {
    const now = new Date().toISOString();
    const alert: DRPAlert = {
      id: 'alert-1',
      tenantId,
      assetId: 'asset-1',
      type: 'typosquatting',
      severity: 'high',
      status: 'open',
      title: 'Test alert',
      description: 'Test',
      evidence: [],
      confidence: 0.75,
      confidenceReasons: [],
      signalIds: [],
      assignedTo: null,
      triageNotes: '',
      tags: [],
      detectedValue: 'evil-example.com',
      sourceUrl: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    store.setAlert(tenantId, alert);
    return alert;
  }

  // P4.1 findDuplicate returns null when no alerts exist
  it('P4.1 findDuplicate returns null when no alerts exist', () => {
    const result = dedup.findDuplicate(tenantId, 'asset-1', 'typosquatting', 'evil-example.com');
    expect(result).toBeNull();
  });

  // P4.2 findDuplicate returns matching alert for same detectedValue
  it('P4.2 findDuplicate returns matching alert for same detectedValue', () => {
    seedAlert();
    const result = dedup.findDuplicate(tenantId, 'asset-1', 'typosquatting', 'evil-example.com');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('alert-1');
    expect(result!.detectedValue).toBe('evil-example.com');
  });

  // P4.3 findDuplicate ignores resolved alerts
  it('P4.3 findDuplicate ignores resolved alerts', () => {
    seedAlert({ status: 'resolved' });
    const result = dedup.findDuplicate(tenantId, 'asset-1', 'typosquatting', 'evil-example.com');
    expect(result).toBeNull();
  });

  // P4.4 findDuplicate ignores false_positive alerts
  it('P4.4 findDuplicate ignores false_positive alerts', () => {
    seedAlert({ status: 'false_positive' });
    const result = dedup.findDuplicate(tenantId, 'asset-1', 'typosquatting', 'evil-example.com');
    expect(result).toBeNull();
  });

  // P4.5 findDuplicate ignores different alert types
  it('P4.5 findDuplicate ignores different alert types', () => {
    seedAlert({ type: 'credential_leak' });
    const result = dedup.findDuplicate(tenantId, 'asset-1', 'typosquatting', 'evil-example.com');
    expect(result).toBeNull();
  });

  // P4.6 mergeIntoExisting adds evidence to existing alert
  it('P4.6 mergeIntoExisting adds evidence to existing alert', () => {
    seedAlert();
    const newEvidence = [
      {
        id: 'ev-1',
        type: 'screenshot' as const,
        title: 'Phishing page screenshot',
        data: { url: 'https://evil-example.com' },
        collectedAt: new Date().toISOString(),
      },
      {
        id: 'ev-2',
        type: 'dns_record' as const,
        title: 'DNS A record',
        data: { ip: '1.2.3.4' },
        collectedAt: new Date().toISOString(),
      },
    ];

    const updated = dedup.mergeIntoExisting(tenantId, 'alert-1', newEvidence);
    expect(updated.evidence).toHaveLength(2);
    expect(updated.evidence[0]!.id).toBe('ev-1');
    expect(updated.evidence[1]!.id).toBe('ev-2');
  });

  // P4.7 mergeIntoExisting boosts confidence
  it('P4.7 mergeIntoExisting boosts confidence', () => {
    seedAlert({ confidence: 0.75 });
    const newEvidence = [
      {
        id: 'ev-1',
        type: 'screenshot' as const,
        title: 'Evidence',
        data: {},
        collectedAt: new Date().toISOString(),
      },
    ];

    const updated = dedup.mergeIntoExisting(tenantId, 'alert-1', newEvidence);
    // 1 evidence item * 0.05 = 0.05 boost → 0.75 + 0.05 = 0.80
    expect(updated.confidence).toBeCloseTo(0.80, 5);
  });

  // P4.8 confidence boost has diminishing returns (capped at 1)
  it('P4.8 confidence boost has diminishing returns (capped at 1)', () => {
    seedAlert({ confidence: 0.97 });
    const bigEvidence = Array.from({ length: 5 }, (_, i) => ({
      id: `ev-${i}`,
      type: 'scan_result' as const,
      title: `Result ${i}`,
      data: {},
      collectedAt: new Date().toISOString(),
    }));

    const updated = dedup.mergeIntoExisting(tenantId, 'alert-1', bigEvidence);
    // Max boost from 1 merge: min(5, 3) * 0.05 = 0.15 → 0.97 + 0.15 = 1.12, capped at 1
    expect(updated.confidence).toBe(1);
    expect(updated.confidence).toBeLessThanOrEqual(1);
  });

  // P4.9 mergeIntoExisting adds corroboration reason
  it('P4.9 mergeIntoExisting adds corroboration reason', () => {
    seedAlert({ confidenceReasons: [] });
    const newEvidence = [
      {
        id: 'ev-1',
        type: 'whois' as const,
        title: 'WHOIS data',
        data: {},
        collectedAt: new Date().toISOString(),
      },
      {
        id: 'ev-2',
        type: 'certificate' as const,
        title: 'SSL cert',
        data: {},
        collectedAt: new Date().toISOString(),
      },
    ];

    const updated = dedup.mergeIntoExisting(tenantId, 'alert-1', newEvidence);
    expect(updated.confidenceReasons).toHaveLength(1);
    const reason = updated.confidenceReasons[0]!;
    expect(reason.signal).toBe('corroboration');
    expect(reason.weight).toBe(0.15);
    expect(reason.description).toContain('2 additional evidence');
  });

  // P4.10 dark_web_mention uses fuzzy matching
  it('P4.10 dark_web_mention uses fuzzy matching', () => {
    seedAlert({
      id: 'alert-dw',
      type: 'dark_web_mention',
      detectedValue: 'company credentials leaked forum',
    });

    // Fuzzy overlap: 3 words out of 5 unique = "company credentials forum" overlap
    // Jaccard: intersection=3, union=5 → 0.6 which is < 0.8 threshold
    const noMatch = dedup.findDuplicate(
      tenantId,
      'asset-1',
      'dark_web_mention',
      'company credentials new sale',
    );
    // "company" and "credentials" overlap — intersection=2, union=6 → 0.333 < 0.8
    expect(noMatch).toBeNull();

    // High overlap: exact same words plus one extra
    // "company credentials leaked forum post" vs "company credentials leaked forum"
    // intersection=4, union=5 → 0.8 >= 0.8 threshold
    const match = dedup.findDuplicate(
      tenantId,
      'asset-1',
      'dark_web_mention',
      'company credentials leaked forum post',
    );
    expect(match).not.toBeNull();
    expect(match!.id).toBe('alert-dw');
  });
});
