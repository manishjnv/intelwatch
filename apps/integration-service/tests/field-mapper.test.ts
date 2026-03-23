import { describe, it, expect } from 'vitest';
import { FieldMapper } from '../src/services/field-mapper.js';
import type { FieldMapping } from '../src/schemas/integration.js';

describe('FieldMapper', () => {
  const mapper = new FieldMapper();

  describe('applyMappings', () => {
    it('maps flat fields', () => {
      const source = { type: 'ip', value: '1.2.3.4', severity: 'high' };
      const mappings: FieldMapping[] = [
        { sourceField: 'type', targetField: 'ioc_type', transform: 'none' },
        { sourceField: 'value', targetField: 'indicator', transform: 'none' },
        { sourceField: 'severity', targetField: 'sev', transform: 'uppercase' },
      ];
      const result = mapper.applyMappings(source, mappings);
      expect(result).toEqual({ ioc_type: 'ip', indicator: '1.2.3.4', sev: 'HIGH' });
    });

    it('maps to nested target fields', () => {
      const source = { type: 'ip', value: '1.2.3.4' };
      const mappings: FieldMapping[] = [
        { sourceField: 'type', targetField: 'event.ioc_type', transform: 'none' },
        { sourceField: 'value', targetField: 'event.indicator', transform: 'none' },
      ];
      const result = mapper.applyMappings(source, mappings);
      expect(result).toEqual({
        event: { ioc_type: 'ip', indicator: '1.2.3.4' },
      });
    });

    it('reads from nested source fields', () => {
      const source = { event: { type: 'ip' } };
      const mappings: FieldMapping[] = [
        { sourceField: 'event.type', targetField: 'ioc_type', transform: 'none' },
      ];
      const result = mapper.applyMappings(source, mappings);
      expect(result).toEqual({ ioc_type: 'ip' });
    });

    it('skips unmapped source fields', () => {
      const source = { type: 'ip', value: '1.2.3.4', extra: 'ignored' };
      const mappings: FieldMapping[] = [
        { sourceField: 'type', targetField: 'ioc_type', transform: 'none' },
      ];
      const result = mapper.applyMappings(source, mappings);
      expect(result).toEqual({ ioc_type: 'ip' });
      expect(result).not.toHaveProperty('extra');
    });

    it('skips missing source fields', () => {
      const source = { type: 'ip' };
      const mappings: FieldMapping[] = [
        { sourceField: 'type', targetField: 'ioc_type', transform: 'none' },
        { sourceField: 'nonexistent', targetField: 'missing', transform: 'none' },
      ];
      const result = mapper.applyMappings(source, mappings);
      expect(result).toEqual({ ioc_type: 'ip' });
    });

    it('returns copy of source when no mappings', () => {
      const source = { type: 'ip', value: '1.2.3.4' };
      const result = mapper.applyMappings(source, []);
      expect(result).toEqual(source);
      expect(result).not.toBe(source);
    });

    it('applies uppercase transform', () => {
      const mappings: FieldMapping[] = [
        { sourceField: 'severity', targetField: 'sev', transform: 'uppercase' },
      ];
      expect(mapper.applyMappings({ severity: 'high' }, mappings)).toEqual({ sev: 'HIGH' });
    });

    it('applies lowercase transform', () => {
      const mappings: FieldMapping[] = [
        { sourceField: 'name', targetField: 'lower', transform: 'lowercase' },
      ];
      expect(mapper.applyMappings({ name: 'APT28' }, mappings)).toEqual({ lower: 'apt28' });
    });

    it('applies severity_map transform', () => {
      const mappings: FieldMapping[] = [
        { sourceField: 'priority', targetField: 'num', transform: 'severity_map' },
      ];
      expect(mapper.applyMappings({ priority: 'critical' }, mappings)).toEqual({ num: 1 });
      expect(mapper.applyMappings({ priority: 'high' }, mappings)).toEqual({ num: 2 });
      expect(mapper.applyMappings({ priority: 'low' }, mappings)).toEqual({ num: 4 });
    });

    it('applies json_stringify transform', () => {
      const mappings: FieldMapping[] = [
        { sourceField: 'tags', targetField: 'tagsStr', transform: 'json_stringify' },
      ];
      const result = mapper.applyMappings({ tags: ['a', 'b'] }, mappings);
      expect(result.tagsStr).toBe('["a","b"]');
    });

    it('applies iso_date transform', () => {
      const mappings: FieldMapping[] = [
        { sourceField: 'date', targetField: 'iso', transform: 'iso_date' },
      ];
      const result = mapper.applyMappings({ date: '2026-01-01' }, mappings);
      expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getDefaultMappings', () => {
    it('returns splunk default mappings', () => {
      const mappings = mapper.getDefaultMappings('splunk_hec');
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings.some((m) => m.targetField.includes('event.'))).toBe(true);
    });

    it('returns sentinel default mappings', () => {
      const mappings = mapper.getDefaultMappings('sentinel');
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings.some((m) => m.targetField === 'IndicatorType')).toBe(true);
    });

    it('returns elastic default mappings', () => {
      const mappings = mapper.getDefaultMappings('elastic_siem');
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings.some((m) => m.targetField.includes('threat.indicator'))).toBe(true);
    });

    it('returns servicenow default mappings', () => {
      const mappings = mapper.getDefaultMappings('servicenow');
      expect(mappings.some((m) => m.targetField === 'short_description')).toBe(true);
    });

    it('returns jira default mappings', () => {
      const mappings = mapper.getDefaultMappings('jira');
      expect(mappings.some((m) => m.targetField === 'summary')).toBe(true);
    });

    it('returns empty array for unknown type', () => {
      expect(mapper.getDefaultMappings('unknown')).toEqual([]);
    });
  });
});
