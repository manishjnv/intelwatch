import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateEngine } from '../src/services/template-engine.js';
import { TemplateStore } from '../src/services/template-store.js';
import { DataAggregator } from '../src/services/data-aggregator.js';
import { ReportStore } from '../src/services/report-store.js';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;
  let templateStore: TemplateStore;
  let aggregator: DataAggregator;
  let reportStore: ReportStore;

  beforeEach(() => {
    engine = new TemplateEngine();
    templateStore = new TemplateStore();
    aggregator = new DataAggregator();
    reportStore = new ReportStore();
  });

  async function createTestReport(type: 'daily' | 'weekly' | 'monthly' | 'custom' | 'executive') {
    const report = reportStore.create({ type, format: 'json', tenantId: 't1', configVersion: 1 });
    const template = templateStore.getByType(type)!;
    const data = await aggregator.aggregate(report);
    return { report, template, data };
  }

  describe('render JSON', () => {
    it('renders daily report as JSON', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      expect(result.metadata).toBeDefined();
      expect(result.sections).toBeDefined();
      expect(result.riskScore).toBeDefined();
    });

    it('renders weekly report as JSON', async () => {
      const { report, template, data } = await createTestReport('weekly');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      expect((result.sections as unknown[]).length).toBe(6);
    });

    it('renders monthly report as JSON', async () => {
      const { report, template, data } = await createTestReport('monthly');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      expect((result.sections as unknown[]).length).toBe(6);
    });

    it('renders executive report as JSON', async () => {
      const { report, template, data } = await createTestReport('executive');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      expect((result.sections as unknown[]).length).toBe(5);
    });

    it('renders custom report as JSON', async () => {
      const { report, template, data } = await createTestReport('custom');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      expect((result.sections as unknown[]).length).toBe(4);
    });

    it('includes metadata in JSON output', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.id).toBe(report.id);
      expect(meta.title).toBe(report.title);
      expect(meta.type).toBe('daily');
      expect(meta.format).toBe('json');
    });

    it('includes configVersion in metadata', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.configVersion).toBe(1);
    });

    it('sections are ordered', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      const sections = result.sections as Array<{ order: number }>;
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i]!.order).toBeGreaterThan(sections[i - 1]!.order);
      }
    });
  });

  describe('render HTML', () => {
    it('renders daily report as HTML string', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'html');
      expect(typeof result).toBe('string');
      expect(result as string).toContain('<!DOCTYPE html>');
    });

    it('includes report title in HTML', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'html') as string;
      expect(result).toContain(report.title);
    });

    it('includes risk score in HTML', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'html') as string;
      expect(result).toContain('Risk Score');
    });

    it('includes section titles in HTML', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'html') as string;
      expect(result).toContain('Executive Summary');
      expect(result).toContain('New IOCs');
    });

    it('uses cyber-themed styling', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'html') as string;
      expect(result).toContain('#0a0e1a'); // Dark background
      expect(result).toContain('#00e5ff'); // Cyan accent
    });
  });

  describe('render PDF placeholder', () => {
    it('returns PDF placeholder object', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'pdf') as Record<string, unknown>;
      expect(result.format).toBe('pdf');
      expect(result.status).toBe('placeholder');
    });

    it('includes report data in PDF placeholder', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'pdf') as Record<string, unknown>;
      expect(result.data).toBeDefined();
    });
  });

  describe('section content', () => {
    it('summary section contains IOC stats', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      const sections = result.sections as Array<{ title: string; content: Record<string, unknown> }>;
      const summary = sections.find((s) => s.title === 'Executive Summary');
      expect(summary).toBeDefined();
      expect(summary!.content.total).toBeDefined();
    });

    it('recommendations section returns array of strings', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      const sections = result.sections as Array<{ title: string; content: unknown }>;
      const recs = sections.find((s) => s.title === 'Recommendations');
      expect(recs).toBeDefined();
      expect(Array.isArray(recs!.content)).toBe(true);
      expect((recs!.content as string[]).length).toBeGreaterThan(0);
    });

    it('chart_data sections contain severity distribution', async () => {
      const { report, template, data } = await createTestReport('daily');
      const result = engine.render(report, template, data, 'json') as Record<string, unknown>;
      const sections = result.sections as Array<{ title: string; content: Record<string, unknown> }>;
      const chart = sections.find((s) => s.title === 'Severity Distribution');
      expect(chart).toBeDefined();
      expect(chart!.content).toBeDefined();
    });
  });

  describe('validateFormat', () => {
    it('accepts json format', () => {
      expect(() => engine.validateFormat('json')).not.toThrow();
    });

    it('accepts html format', () => {
      expect(() => engine.validateFormat('html')).not.toThrow();
    });

    it('accepts pdf format', () => {
      expect(() => engine.validateFormat('pdf')).not.toThrow();
    });
  });
});
