import { describe, it, expect } from 'vitest';
import { getTemplates, getTemplateById, getTemplatesByCategory, RULE_TEMPLATES } from '../src/services/rule-templates.js';

describe('Rule Templates', () => {
  it('has 6 built-in templates', () => {
    expect(RULE_TEMPLATES.length).toBe(6);
    expect(getTemplates().length).toBe(6);
  });

  it('each template has required fields', () => {
    for (const tpl of RULE_TEMPLATES) {
      expect(tpl.id).toBeDefined();
      expect(tpl.name).toBeDefined();
      expect(tpl.description).toBeDefined();
      expect(tpl.category).toBeDefined();
      expect(tpl.rule).toBeDefined();
      expect(tpl.rule.name).toBeDefined();
      expect(tpl.rule.severity).toBeDefined();
      expect(tpl.rule.condition).toBeDefined();
      expect(tpl.rule.condition.type).toBeDefined();
    }
  });

  it('gets template by ID', () => {
    const tpl = getTemplateById('tpl-high-ioc-rate');
    expect(tpl).toBeDefined();
    expect(tpl!.name).toBe('High Critical IOC Rate');
    expect(tpl!.rule.severity).toBe('critical');
    expect(tpl!.rule.condition.type).toBe('threshold');
  });

  it('returns undefined for non-existent template', () => {
    expect(getTemplateById('non-existent')).toBeUndefined();
  });

  it('gets templates by category', () => {
    const ingestion = getTemplatesByCategory('ingestion');
    expect(ingestion.length).toBe(2); // high-ioc-rate + feed-absence
    expect(ingestion.every((t) => t.category === 'ingestion')).toBe(true);
  });

  it('returns empty for non-existent category', () => {
    expect(getTemplatesByCategory('nonexistent').length).toBe(0);
  });

  it('has correct template IDs', () => {
    const ids = RULE_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('tpl-high-ioc-rate');
    expect(ids).toContain('tpl-feed-absence');
    expect(ids).toContain('tpl-apt-pattern');
    expect(ids).toContain('tpl-anomaly-spike');
    expect(ids).toContain('tpl-critical-cve');
    expect(ids).toContain('tpl-drp-alert');
  });

  it('covers all 4 rule types', () => {
    const types = new Set(RULE_TEMPLATES.map((t) => t.rule.condition.type));
    expect(types.has('threshold')).toBe(true);
    expect(types.has('pattern')).toBe(true);
    expect(types.has('anomaly')).toBe(true);
    expect(types.has('absence')).toBe(true);
  });

  it('templates do not include tenantId', () => {
    for (const tpl of RULE_TEMPLATES) {
      expect('tenantId' in tpl.rule).toBe(false);
    }
  });
});
