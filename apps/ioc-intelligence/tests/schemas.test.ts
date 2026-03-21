import { describe, it, expect } from 'vitest';
import {
  ListIocsQuerySchema, CreateIocBodySchema, UpdateIocBodySchema,
  BulkOperationSchema, SearchIocsBodySchema, ExportIocsBodySchema,
  IocIdParamSchema,
} from '../src/schemas/ioc.js';

describe('IOC Intelligence — Schemas', () => {
  describe('ListIocsQuerySchema', () => {
    it('applies defaults for empty query', () => {
      const result = ListIocsQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.sort).toBe('lastSeen');
      expect(result.order).toBe('desc');
    });

    it('coerces string page/limit to numbers', () => {
      const result = ListIocsQuerySchema.parse({ page: '3', limit: '25' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('wraps single iocType string into array', () => {
      const result = ListIocsQuerySchema.parse({ iocType: 'ip' });
      expect(result.iocType).toEqual(['ip']);
    });

    it('rejects limit > 500', () => {
      expect(() => ListIocsQuerySchema.parse({ limit: 501 })).toThrow();
    });

    it('accepts date range filters', () => {
      const result = ListIocsQuerySchema.parse({ dateFrom: '2026-01-01', dateTo: '2026-03-01' });
      expect(result.dateFrom).toBeInstanceOf(Date);
      expect(result.dateTo).toBeInstanceOf(Date);
    });
  });

  describe('CreateIocBodySchema', () => {
    it('validates a complete IOC creation body', () => {
      const result = CreateIocBodySchema.parse({
        iocType: 'ip', value: '192.168.1.1', severity: 'high', tlp: 'amber',
        tags: ['malware'], mitreAttack: ['T1059'],
      });
      expect(result.iocType).toBe('ip');
      expect(result.confidence).toBe(70); // default
    });

    it('rejects missing iocType', () => {
      expect(() => CreateIocBodySchema.parse({ value: '1.2.3.4' })).toThrow();
    });

    it('rejects empty value', () => {
      expect(() => CreateIocBodySchema.parse({ iocType: 'ip', value: '' })).toThrow();
    });

    it('rejects invalid MITRE ATT&CK format', () => {
      expect(() => CreateIocBodySchema.parse({
        iocType: 'ip', value: '1.2.3.4', mitreAttack: ['INVALID'],
      })).toThrow();
    });

    it('accepts valid MITRE sub-technique', () => {
      const result = CreateIocBodySchema.parse({
        iocType: 'ip', value: '1.2.3.4', mitreAttack: ['T1059.001'],
      });
      expect(result.mitreAttack).toEqual(['T1059.001']);
    });
  });

  describe('UpdateIocBodySchema', () => {
    it('accepts partial update with severity only', () => {
      const result = UpdateIocBodySchema.parse({ severity: 'critical' });
      expect(result.severity).toBe('critical');
    });

    it('rejects empty update body', () => {
      expect(() => UpdateIocBodySchema.parse({})).toThrow('At least one field');
    });

    it('accepts lifecycle transition', () => {
      const result = UpdateIocBodySchema.parse({ lifecycle: 'false_positive' });
      expect(result.lifecycle).toBe('false_positive');
    });
  });

  describe('BulkOperationSchema', () => {
    it('validates set_severity with severity field', () => {
      const result = BulkOperationSchema.parse({
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'set_severity', severity: 'critical',
      });
      expect(result.action).toBe('set_severity');
    });

    it('rejects set_severity without severity field', () => {
      expect(() => BulkOperationSchema.parse({
        ids: ['550e8400-e29b-41d4-a716-446655440000'], action: 'set_severity',
      })).toThrow('severity is required');
    });

    it('rejects add_tags without tags', () => {
      expect(() => BulkOperationSchema.parse({
        ids: ['550e8400-e29b-41d4-a716-446655440000'], action: 'add_tags',
      })).toThrow('tags are required');
    });

    it('rejects empty ids array', () => {
      expect(() => BulkOperationSchema.parse({
        ids: [], action: 'set_severity', severity: 'high',
      })).toThrow();
    });
  });

  describe('SearchIocsBodySchema', () => {
    it('validates search with query', () => {
      const result = SearchIocsBodySchema.parse({ query: 'APT28' });
      expect(result.query).toBe('APT28');
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('rejects empty query', () => {
      expect(() => SearchIocsBodySchema.parse({ query: '' })).toThrow();
    });
  });

  describe('ExportIocsBodySchema', () => {
    it('defaults to json format', () => {
      const result = ExportIocsBodySchema.parse({});
      expect(result.format).toBe('json');
      expect(result.maxResults).toBe(10000);
    });

    it('accepts csv format with filters', () => {
      const result = ExportIocsBodySchema.parse({
        format: 'csv', severity: ['high', 'critical'], minConfidence: 80,
      });
      expect(result.format).toBe('csv');
      expect(result.severity).toEqual(['high', 'critical']);
    });
  });

  describe('IocIdParamSchema', () => {
    it('accepts valid UUID', () => {
      const result = IocIdParamSchema.parse({ id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('rejects non-UUID string', () => {
      expect(() => IocIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });
});
