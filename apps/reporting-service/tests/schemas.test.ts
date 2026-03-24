import { describe, it, expect } from 'vitest';
import {
  CreateReportSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  ListReportsQuerySchema,
  ReportTypeEnum,
  ReportFormatEnum,
  ReportStatusEnum,
} from '../src/schemas/report.js';

describe('Report Schemas', () => {
  describe('ReportTypeEnum', () => {
    it('accepts daily', () => expect(ReportTypeEnum.parse('daily')).toBe('daily'));
    it('accepts weekly', () => expect(ReportTypeEnum.parse('weekly')).toBe('weekly'));
    it('accepts monthly', () => expect(ReportTypeEnum.parse('monthly')).toBe('monthly'));
    it('accepts custom', () => expect(ReportTypeEnum.parse('custom')).toBe('custom'));
    it('accepts executive', () => expect(ReportTypeEnum.parse('executive')).toBe('executive'));
    it('rejects invalid type', () => expect(() => ReportTypeEnum.parse('invalid')).toThrow());
  });

  describe('ReportFormatEnum', () => {
    it('accepts json', () => expect(ReportFormatEnum.parse('json')).toBe('json'));
    it('accepts html', () => expect(ReportFormatEnum.parse('html')).toBe('html'));
    it('accepts pdf', () => expect(ReportFormatEnum.parse('pdf')).toBe('pdf'));
    it('rejects invalid format', () => expect(() => ReportFormatEnum.parse('csv')).toThrow());
  });

  describe('ReportStatusEnum', () => {
    it('accepts pending', () => expect(ReportStatusEnum.parse('pending')).toBe('pending'));
    it('accepts generating', () => expect(ReportStatusEnum.parse('generating')).toBe('generating'));
    it('accepts completed', () => expect(ReportStatusEnum.parse('completed')).toBe('completed'));
    it('accepts failed', () => expect(ReportStatusEnum.parse('failed')).toBe('failed'));
    it('rejects invalid status', () => expect(() => ReportStatusEnum.parse('cancelled')).toThrow());
  });

  describe('CreateReportSchema', () => {
    it('validates minimal input', () => {
      const result = CreateReportSchema.parse({ type: 'daily' });
      expect(result.type).toBe('daily');
      expect(result.format).toBe('json');
      expect(result.tenantId).toBe('default');
      expect(result.configVersion).toBe(1);
    });

    it('validates full input', () => {
      const result = CreateReportSchema.parse({
        type: 'custom',
        format: 'html',
        title: 'My Report',
        tenantId: 'tenant-1',
        dateRange: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' },
        filters: { severities: ['critical', 'high'], iocTypes: ['ipv4-addr'] },
        configVersion: 2,
      });
      expect(result.type).toBe('custom');
      expect(result.format).toBe('html');
      expect(result.title).toBe('My Report');
    });

    it('rejects empty title', () => {
      expect(() => CreateReportSchema.parse({ type: 'daily', title: '' })).toThrow();
    });

    it('rejects title over 200 chars', () => {
      expect(() => CreateReportSchema.parse({ type: 'daily', title: 'x'.repeat(201) })).toThrow();
    });

    it('rejects invalid severity in filters', () => {
      expect(() =>
        CreateReportSchema.parse({ type: 'daily', filters: { severities: ['extreme'] } }),
      ).toThrow();
    });
  });

  describe('CreateScheduleSchema', () => {
    it('validates minimal input', () => {
      const result = CreateScheduleSchema.parse({
        name: 'Daily Report',
        reportType: 'daily',
        cronExpression: '0 8 * * *',
      });
      expect(result.name).toBe('Daily Report');
      expect(result.format).toBe('json');
      expect(result.enabled).toBe(true);
    });

    it('rejects missing name', () => {
      expect(() => CreateScheduleSchema.parse({ reportType: 'daily', cronExpression: '0 8 * * *' })).toThrow();
    });

    it('rejects empty name', () => {
      expect(() => CreateScheduleSchema.parse({ name: '', reportType: 'daily', cronExpression: '0 8 * * *' })).toThrow();
    });

    it('rejects missing cronExpression', () => {
      expect(() => CreateScheduleSchema.parse({ name: 'Test', reportType: 'daily' })).toThrow();
    });

    it('allows disabled schedule', () => {
      const result = CreateScheduleSchema.parse({
        name: 'Test',
        reportType: 'daily',
        cronExpression: '0 8 * * *',
        enabled: false,
      });
      expect(result.enabled).toBe(false);
    });
  });

  describe('UpdateScheduleSchema', () => {
    it('accepts empty update', () => {
      const result = UpdateScheduleSchema.parse({});
      expect(result).toBeDefined();
    });

    it('accepts partial update', () => {
      const result = UpdateScheduleSchema.parse({ name: 'New Name', enabled: false });
      expect(result.name).toBe('New Name');
      expect(result.enabled).toBe(false);
    });

    it('rejects invalid report type', () => {
      expect(() => UpdateScheduleSchema.parse({ reportType: 'invalid' })).toThrow();
    });
  });

  describe('ListReportsQuerySchema', () => {
    it('defaults page and limit', () => {
      const result = ListReportsQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.tenantId).toBe('default');
    });

    it('coerces string page/limit to number', () => {
      const result = ListReportsQuerySchema.parse({ page: '3', limit: '10' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
    });

    it('rejects page < 1', () => {
      expect(() => ListReportsQuerySchema.parse({ page: 0 })).toThrow();
    });

    it('rejects limit > 100', () => {
      expect(() => ListReportsQuerySchema.parse({ limit: 101 })).toThrow();
    });

    it('accepts type filter', () => {
      const result = ListReportsQuerySchema.parse({ type: 'weekly' });
      expect(result.type).toBe('weekly');
    });

    it('accepts status filter', () => {
      const result = ListReportsQuerySchema.parse({ status: 'completed' });
      expect(result.status).toBe('completed');
    });
  });
});
