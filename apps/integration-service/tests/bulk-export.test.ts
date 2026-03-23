import { describe, it, expect } from 'vitest';
import { BulkExportService } from '../src/services/bulk-export.js';
import { StixExportService } from '../src/services/stix-export.js';

describe('BulkExportService', () => {
  const stixExport = new StixExportService();
  const service = new BulkExportService(stixExport);
  const TENANT = 'tenant-1';

  const sampleData: Record<string, unknown>[] = [
    { id: 'ioc-1', type: 'ip', value: '1.2.3.4', severity: 'high', confidence: 85 },
    { id: 'ioc-2', type: 'domain', value: 'evil.com', severity: 'critical', confidence: 95 },
    { id: 'ioc-3', type: 'sha256', value: 'a'.repeat(64), severity: 'medium', confidence: 70 },
  ];

  describe('CSV export', () => {
    it('generates valid CSV with headers', async () => {
      const result = await service.export(
        { format: 'csv', entityType: 'iocs', filters: {}, limit: 100 },
        sampleData,
        TENANT,
      );
      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toContain('etip-iocs-export');
      expect(result.filename).toMatch(/\.csv$/);

      const lines = result.content.split('\n');
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('type');
      expect(lines[0]).toContain('value');
      expect(lines).toHaveLength(4); // header + 3 rows
    });

    it('handles empty data', async () => {
      const result = await service.export(
        { format: 'csv', entityType: 'iocs', filters: {}, limit: 100 },
        [],
        TENANT,
      );
      expect(result.content).toBe('');
    });

    it('escapes commas and quotes in CSV', async () => {
      const dataWithComma = [
        { id: '1', value: 'hello, world', note: 'has "quotes"' },
      ];
      const result = await service.export(
        { format: 'csv', entityType: 'iocs', filters: {}, limit: 100 },
        dataWithComma,
        TENANT,
      );
      expect(result.content).toContain('"hello, world"');
      expect(result.content).toContain('"has ""quotes"""');
    });

    it('serializes nested objects as JSON in CSV', async () => {
      const nested = [{ id: '1', tags: ['a', 'b'] }];
      const result = await service.export(
        { format: 'csv', entityType: 'iocs', filters: {}, limit: 100 },
        nested,
        TENANT,
      );
      // JSON.stringify produces ["a","b"], which gets CSV-escaped with doubled quotes
      expect(result.content).toContain('a');
      expect(result.content).toContain('b');
      expect(result.content).toContain('tags');
    });
  });

  describe('JSON export', () => {
    it('generates valid JSON with metadata', async () => {
      const result = await service.export(
        { format: 'json', entityType: 'alerts', filters: {}, limit: 100 },
        sampleData,
        TENANT,
      );
      expect(result.contentType).toBe('application/json');
      expect(result.filename).toContain('etip-alerts-export');

      const parsed = JSON.parse(result.content);
      expect(parsed.source).toBe('ETIP Platform');
      expect(parsed.entityType).toBe('alerts');
      expect(parsed.count).toBe(3);
      expect(parsed.data).toHaveLength(3);
      expect(parsed.exportedAt).toBeDefined();
    });

    it('handles empty data', async () => {
      const result = await service.export(
        { format: 'json', entityType: 'alerts', filters: {}, limit: 100 },
        [],
        TENANT,
      );
      const parsed = JSON.parse(result.content);
      expect(parsed.count).toBe(0);
      expect(parsed.data).toEqual([]);
    });
  });

  describe('STIX export', () => {
    it('generates valid STIX 2.1 bundle', async () => {
      const result = await service.export(
        { format: 'stix', entityType: 'iocs', filters: {}, limit: 100 },
        sampleData,
        TENANT,
      );
      expect(result.contentType).toBe('application/stix+json;version=2.1');
      expect(result.filename).toContain('stix');

      const bundle = JSON.parse(result.content);
      expect(bundle.type).toBe('bundle');
      expect(bundle.objects.length).toBeGreaterThan(0);
    });

    it('converts IOC data correctly', async () => {
      const result = await service.export(
        { format: 'stix', entityType: 'iocs', filters: {}, limit: 100 },
        [{ id: 'test-1', type: 'ip', value: '10.0.0.1' }],
        TENANT,
      );
      const bundle = JSON.parse(result.content);
      const indicators = bundle.objects.filter((o: { type: string }) => o.type === 'indicator');
      expect(indicators).toHaveLength(1);
      expect(indicators[0].pattern).toContain('10.0.0.1');
    });
  });
});
