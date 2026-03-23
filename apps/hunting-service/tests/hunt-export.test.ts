import { describe, it, expect, beforeEach } from 'vitest';
import { HuntExport } from '../src/services/hunt-export.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #15 Hunt Export', () => {
  let store: HuntingStore;
  let exporter: HuntExport;
  const tenantId = 'tenant-1';
  const huntId = 'hunt-1';

  beforeEach(() => {
    store = new HuntingStore();
    exporter = new HuntExport(store);

    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: huntId, tenantId, title: 'APT Investigation', hypothesis: 'Suspected APT28 activity',
      status: 'completed', severity: 'critical', assignedTo: 'user-1', createdBy: 'user-1',
      entities: [
        { id: 'e1', type: 'ip', value: '10.0.0.1', addedAt: now, addedBy: 'user-1', pivotDepth: 0, notes: 'C2 server' },
        { id: 'e2', type: 'domain', value: 'evil.com', addedAt: now, addedBy: 'user-1', pivotDepth: 1 },
        { id: 'e3', type: 'hash_sha256', value: 'abc123def456', addedAt: now, addedBy: 'user-1', pivotDepth: 0 },
      ],
      timeline: [
        { id: 't1', type: 'status_changed', description: 'Created', userId: 'user-1', timestamp: now },
        { id: 't2', type: 'entity_added', description: 'Added IP', userId: 'user-1', timestamp: now },
      ],
      findings: 'Confirmed APT28 C2 infrastructure',
      tags: ['apt28', 'c2'],
      queryHistory: [{ id: 'q1', query: { fields: [], limit: 100, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' }, name: 'Initial search', resultCount: 5, executedAt: now }],
      correlationLeads: ['corr-1'],
      createdAt: now, updatedAt: now, completedAt: now,
    });
  });

  // ─── JSON Export ──────────────────────────────────────

  it('15.1. exports as JSON', () => {
    const result = exporter.export(tenantId, huntId, 'json');
    expect(result.format).toBe('json');
    expect(result.mimeType).toBe('application/json');
    const parsed = JSON.parse(result.content);
    expect(parsed.report.title).toBe('APT Investigation');
    expect(parsed.entities).toHaveLength(3);
  });

  it('15.2. JSON includes timeline', () => {
    const result = exporter.export(tenantId, huntId, 'json');
    const parsed = JSON.parse(result.content);
    expect(parsed.timeline).toHaveLength(2);
  });

  it('15.3. JSON includes findings and tags', () => {
    const result = exporter.export(tenantId, huntId, 'json');
    const parsed = JSON.parse(result.content);
    expect(parsed.findings).toContain('APT28');
    expect(parsed.tags).toContain('apt28');
  });

  // ─── CSV Export ───────────────────────────────────────

  it('15.4. exports as CSV', () => {
    const result = exporter.export(tenantId, huntId, 'csv');
    expect(result.format).toBe('csv');
    expect(result.mimeType).toBe('text/csv');
    const lines = result.content.split('\n');
    expect(lines[0]).toBe('type,value,added_at,added_by,notes,pivot_depth');
    expect(lines.length).toBe(4); // header + 3 entities
  });

  it('15.5. CSV escapes commas in values', () => {
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: 'hunt-csv', tenantId, title: 'CSV', hypothesis: 'Test',
      status: 'active', severity: 'low', assignedTo: 'u', createdBy: 'u',
      entities: [
        { id: 'e1', type: 'url', value: 'http://evil.com/path,param=1', addedAt: now, addedBy: 'u', pivotDepth: 0 },
      ],
      timeline: [], findings: '', tags: [], queryHistory: [], correlationLeads: [],
      createdAt: now, updatedAt: now,
    });
    const result = exporter.export(tenantId, 'hunt-csv', 'csv');
    expect(result.content).toContain('"http://evil.com/path,param=1"');
  });

  // ─── STIX Export ──────────────────────────────────────

  it('15.6. exports as STIX 2.1 bundle', () => {
    const result = exporter.export(tenantId, huntId, 'stix');
    expect(result.format).toBe('stix');
    const bundle = JSON.parse(result.content);
    expect(bundle.type).toBe('bundle');
    expect(bundle.objects.length).toBeGreaterThan(0);
  });

  it('15.7. STIX includes report object', () => {
    const result = exporter.export(tenantId, huntId, 'stix');
    const bundle = JSON.parse(result.content);
    const report = bundle.objects.find((o: Record<string, unknown>) => o.type === 'report');
    expect(report).toBeDefined();
    expect(report.name).toBe('APT Investigation');
  });

  it('15.8. STIX includes indicator objects with patterns', () => {
    const result = exporter.export(tenantId, huntId, 'stix');
    const bundle = JSON.parse(result.content);
    const indicators = bundle.objects.filter((o: Record<string, unknown>) => o.type === 'indicator');
    expect(indicators.length).toBe(3);
    const ipIndicator = indicators.find((i: Record<string, unknown>) =>
      (i.pattern as string).includes('ipv4-addr'),
    );
    expect(ipIndicator).toBeDefined();
  });

  it('15.9. STIX patterns correct for each entity type', () => {
    const result = exporter.export(tenantId, huntId, 'stix');
    const bundle = JSON.parse(result.content);
    const indicators = bundle.objects.filter((o: Record<string, unknown>) => o.type === 'indicator');
    const patterns = indicators.map((i: Record<string, unknown>) => i.pattern as string);
    expect(patterns.some((p: string) => p.includes('ipv4-addr'))).toBe(true);
    expect(patterns.some((p: string) => p.includes('domain-name'))).toBe(true);
    expect(patterns.some((p: string) => p.includes('SHA-256'))).toBe(true);
  });

  // ─── Metadata ─────────────────────────────────────────

  it('15.10. includes entity count and generated timestamp', () => {
    const result = exporter.export(tenantId, huntId, 'json');
    expect(result.entityCount).toBe(3);
    expect(result.generatedAt).toBeDefined();
  });

  it('15.11. generates correct filename', () => {
    const json = exporter.export(tenantId, huntId, 'json');
    expect(json.filename).toContain(huntId);
    expect(json.filename).toMatch(/\.json$/);

    const csv = exporter.export(tenantId, huntId, 'csv');
    expect(csv.filename).toMatch(/\.csv$/);
  });

  it('15.12. throws on invalid format', () => {
    expect(() => exporter.export(tenantId, huntId, 'xml' as 'json')).toThrow('Unsupported format');
  });

  it('15.13. throws 404 for non-existent hunt', () => {
    expect(() => exporter.export(tenantId, 'nope', 'json')).toThrow('not found');
  });
});
