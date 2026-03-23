import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertExporter } from '../src/services/alert-exporter.js';
import type { DRPAlert } from '../src/schemas/drp.js';

const T = 'tenant-export-1';

function seedAlerts(store: DRPStore, count: number) {
  for (let i = 0; i < count; i++) {
    const alert: DRPAlert = {
      id: `alert-${i}`,
      tenantId: T,
      assetId: 'example.com',
      type: i % 2 === 0 ? 'typosquatting' : 'credential_leak',
      severity: i % 3 === 0 ? 'critical' : 'medium',
      status: 'open',
      title: `Alert ${i}`,
      description: `Description ${i}`,
      evidence: [{
        id: `ev-${i}`,
        type: 'dns_record',
        title: `Evidence ${i}`,
        data: {},
        collectedAt: new Date().toISOString(),
      }],
      confidence: 0.5 + i * 0.05,
      confidenceReasons: [],
      signalIds: [],
      assignedTo: null,
      triageNotes: '',
      tags: ['test'],
      detectedValue: `val-${i}`,
      sourceUrl: null,
      resolvedAt: null,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
    };
    store.setAlert(T, alert);
  }
}

describe('AlertExporter (#12)', () => {
  let store: DRPStore;
  let exporter: AlertExporter;

  beforeEach(() => {
    store = new DRPStore();
    exporter = new AlertExporter(store);
    seedAlerts(store, 5);
  });

  // CSV export
  it('exports alerts as CSV', () => {
    const result = exporter.export(T, 'csv');
    expect(result.contentType).toBe('text/csv');
    expect(result.filename).toContain('.csv');
    expect(result.recordCount).toBe(5);
    const lines = result.content.split('\n');
    expect(lines[0]).toContain('id,type,severity');
    expect(lines.length).toBe(6); // header + 5 rows
  });

  it('CSV escapes quotes in title', () => {
    const alert = store.getAlert(T, 'alert-0')!;
    alert.title = 'Title with "quotes"';
    store.setAlert(T, alert);
    const result = exporter.export(T, 'csv');
    expect(result.content).toContain('""quotes""');
  });

  // JSON export
  it('exports alerts as JSON', () => {
    const result = exporter.export(T, 'json');
    expect(result.contentType).toBe('application/json');
    expect(result.filename).toContain('.json');
    const parsed = JSON.parse(result.content);
    expect(parsed.recordCount).toBe(5);
    expect(parsed.alerts).toHaveLength(5);
    expect(parsed.exportedAt).toBeDefined();
  });

  it('JSON includes all required fields', () => {
    const result = exporter.export(T, 'json');
    const parsed = JSON.parse(result.content);
    const alert = parsed.alerts[0];
    expect(alert.id).toBeDefined();
    expect(alert.type).toBeDefined();
    expect(alert.severity).toBeDefined();
    expect(alert.evidence).toBeDefined();
    expect(alert.tags).toBeDefined();
  });

  // STIX export
  it('exports alerts as STIX bundle', () => {
    const result = exporter.export(T, 'stix');
    expect(result.contentType).toBe('application/stix+json');
    expect(result.filename).toContain('.stix.json');
    const bundle = JSON.parse(result.content);
    expect(bundle.type).toBe('bundle');
    expect(bundle.objects.length).toBeGreaterThan(5); // identity + indicators
  });

  it('STIX includes identity object', () => {
    const result = exporter.export(T, 'stix');
    const bundle = JSON.parse(result.content);
    const identities = bundle.objects.filter((o: Record<string, unknown>) => o.type === 'identity');
    expect(identities).toHaveLength(1);
    expect(identities[0].identity_class).toBe('organization');
  });

  it('STIX indicators have correct pattern', () => {
    const result = exporter.export(T, 'stix');
    const bundle = JSON.parse(result.content);
    const indicators = bundle.objects.filter((o: Record<string, unknown>) => o.type === 'indicator');
    expect(indicators.length).toBe(5);
    for (const ind of indicators) {
      expect(ind.pattern).toBeDefined();
      expect(ind.pattern_type).toBe('stix');
      expect(ind.spec_version).toBe('2.1');
    }
  });

  // Filters
  it('filters by type', () => {
    const result = exporter.export(T, 'json', { type: 'typosquatting' });
    const parsed = JSON.parse(result.content);
    expect(parsed.recordCount).toBe(3); // 0, 2, 4
  });

  it('filters by severity', () => {
    const result = exporter.export(T, 'json', { severity: 'critical' });
    const parsed = JSON.parse(result.content);
    expect(parsed.recordCount).toBe(2); // 0, 3
  });

  it('limits max records', () => {
    const result = exporter.export(T, 'json', undefined, 2);
    const parsed = JSON.parse(result.content);
    expect(parsed.recordCount).toBe(2);
  });

  it('filters by date range', () => {
    const result = exporter.export(T, 'json', {
      fromDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      toDate: new Date().toISOString(),
    });
    const parsed = JSON.parse(result.content);
    expect(parsed.recordCount).toBeLessThanOrEqual(5);
    expect(parsed.recordCount).toBeGreaterThan(0);
  });

  it('returns empty export for no matching alerts', () => {
    const result = exporter.export(T, 'json', { assetId: 'nonexistent.com' });
    const parsed = JSON.parse(result.content);
    expect(parsed.recordCount).toBe(0);
  });
});
