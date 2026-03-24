import { describe, it, expect } from 'vitest';
import { TemplateStore } from '../src/services/template-store.js';

describe('TemplateStore', () => {
  const store = new TemplateStore();

  describe('list', () => {
    it('returns all 5 default templates', () => {
      const templates = store.list();
      expect(templates.length).toBe(5);
    });

    it('includes daily template', () => {
      const templates = store.list();
      expect(templates.find((t) => t.reportType === 'daily')).toBeDefined();
    });

    it('includes weekly template', () => {
      const templates = store.list();
      expect(templates.find((t) => t.reportType === 'weekly')).toBeDefined();
    });

    it('includes monthly template', () => {
      const templates = store.list();
      expect(templates.find((t) => t.reportType === 'monthly')).toBeDefined();
    });

    it('includes custom template', () => {
      const templates = store.list();
      expect(templates.find((t) => t.reportType === 'custom')).toBeDefined();
    });

    it('includes executive template', () => {
      const templates = store.list();
      expect(templates.find((t) => t.reportType === 'executive')).toBeDefined();
    });

    it('all templates have sections', () => {
      const templates = store.list();
      for (const tpl of templates) {
        expect(tpl.sections.length).toBeGreaterThan(0);
      }
    });

    it('all templates have unique ids', () => {
      const templates = store.list();
      const ids = templates.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getById', () => {
    it('returns template by id', () => {
      const tpl = store.getById('tpl-daily');
      expect(tpl).toBeDefined();
      expect(tpl!.reportType).toBe('daily');
    });

    it('returns undefined for non-existent id', () => {
      expect(store.getById('nope')).toBeUndefined();
    });
  });

  describe('getByType', () => {
    it('returns daily template', () => {
      const tpl = store.getByType('daily');
      expect(tpl).toBeDefined();
      expect(tpl!.reportType).toBe('daily');
    });

    it('returns weekly template', () => {
      const tpl = store.getByType('weekly');
      expect(tpl).toBeDefined();
    });

    it('returns monthly template', () => {
      const tpl = store.getByType('monthly');
      expect(tpl).toBeDefined();
    });

    it('returns executive template', () => {
      const tpl = store.getByType('executive');
      expect(tpl).toBeDefined();
    });

    it('returns custom template', () => {
      const tpl = store.getByType('custom');
      expect(tpl).toBeDefined();
    });
  });

  describe('section structure', () => {
    it('daily template has 5 sections', () => {
      const tpl = store.getByType('daily')!;
      expect(tpl.sections.length).toBe(5);
    });

    it('weekly template has 6 sections', () => {
      const tpl = store.getByType('weekly')!;
      expect(tpl.sections.length).toBe(6);
    });

    it('monthly template has 6 sections', () => {
      const tpl = store.getByType('monthly')!;
      expect(tpl.sections.length).toBe(6);
    });

    it('custom template has 4 sections', () => {
      const tpl = store.getByType('custom')!;
      expect(tpl.sections.length).toBe(4);
    });

    it('executive template has 5 sections', () => {
      const tpl = store.getByType('executive')!;
      expect(tpl.sections.length).toBe(5);
    });

    it('sections have ordered fields', () => {
      const tpl = store.getByType('daily')!;
      for (const section of tpl.sections) {
        expect(section.id).toBeTruthy();
        expect(section.title).toBeTruthy();
        expect(section.type).toBeTruthy();
        expect(section.dataSource).toBeTruthy();
        expect(section.order).toBeGreaterThan(0);
      }
    });

    it('sections are ordered sequentially', () => {
      const tpl = store.getByType('daily')!;
      const orders = tpl.sections.map((s) => s.order);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBeGreaterThan(orders[i - 1]!);
      }
    });
  });
});
