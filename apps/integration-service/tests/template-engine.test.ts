import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateEngine } from '../src/services/template-engine.js';
import type { TemplateVariables, } from '../src/services/template-engine.js';
import type { CreateTicketTemplateInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-tpl';

const makeTemplateInput = (overrides: Partial<CreateTicketTemplateInput> = {}): CreateTicketTemplateInput => ({
  name: 'Custom Alert Template',
  description: 'Custom template for alerts',
  targetType: 'servicenow',
  titleTemplate: '[{{severity}}] {{alertTitle}}',
  bodyTemplate: 'IOC: {{iocType}} — {{iocValue}}\nConfidence: {{confidence}}%\n{{description}}',
  priorityMapping: { critical: '1', high: '2', medium: '3', low: '4' },
  additionalFields: { category: 'Security' },
  ...overrides,
});

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  // ─── Rendering ──────────────────────────────────────────────

  it('renders simple variable placeholders', async () => {
    const result = engine.render('Hello {{name}}!', { name: 'World' } as unknown as TemplateVariables);
    expect(result).toBe('Hello World!');
  });

  it('renders multiple variables in a template', async () => {
    const vars: TemplateVariables = {
      severity: 'critical',
      iocValue: '185.220.101.34',
      iocType: 'ip',
      description: 'Malicious IP detected',
    };
    const result = engine.render('[{{severity}}] {{iocType}}: {{iocValue}} — {{description}}', vars);
    expect(result).toBe('[critical] ip: 185.220.101.34 — Malicious IP detected');
  });

  it('replaces unknown variables with empty string', async () => {
    const result = engine.render('{{known}} and {{unknown}}', { known: 'yes' } as unknown as TemplateVariables);
    expect(result).toBe('yes and ');
  });

  it('renders arrays as comma-separated values', async () => {
    const vars: TemplateVariables = { tags: ['apt28', 'ransomware', 'russia'] };
    const result = engine.render('Tags: {{tags}}', vars);
    expect(result).toBe('Tags: apt28, ransomware, russia');
  });

  it('renders numeric values', async () => {
    const vars: TemplateVariables = { confidence: 95 };
    const result = engine.render('Confidence: {{confidence}}%', vars);
    expect(result).toBe('Confidence: 95%');
  });

  it('handles null/undefined variables gracefully', async () => {
    const result = engine.render('Actor: {{actorName}}', {} as TemplateVariables);
    expect(result).toBe('Actor: ');
  });

  // ─── Variable Extraction ───────────────────────────────────

  it('extracts all variable names from a template', async () => {
    const vars = engine.extractVariables('{{severity}} alert for {{iocType}}: {{iocValue}} — {{severity}}');
    expect(vars).toContain('severity');
    expect(vars).toContain('iocType');
    expect(vars).toContain('iocValue');
    expect(vars).toHaveLength(3); // deduped
  });

  it('returns empty array for template without variables', async () => {
    expect(engine.extractVariables('No variables here')).toEqual([]);
  });

  // ─── Template Validation ───────────────────────────────────

  it('validates a correct template', async () => {
    const result = engine.validateTemplate('{{severity}} — {{iocValue}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects mismatched braces', async () => {
    const result = engine.validateTemplate('{{severity}} — {{iocValue}');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Mismatched');
  });

  it('detects empty variable placeholder', async () => {
    const result = engine.validateTemplate('{{}} empty');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Empty variable');
  });

  // ─── Full Ticket Rendering ─────────────────────────────────

  it('renders a full ticket from template + variables', async () => {
    const template = await engine.createTemplate(TENANT, makeTemplateInput());
    const vars: TemplateVariables = {
      severity: 'critical',
      alertTitle: 'Cobalt Strike Beacon Detected',
      iocType: 'ip',
      iocValue: '10.0.0.1',
      confidence: 95,
      description: 'Known C2 infrastructure',
    };
    const ticket = await engine.renderTicket(template.id, TENANT, vars);
    expect(ticket.title).toBe('[critical] Cobalt Strike Beacon Detected');
    expect(ticket.body).toContain('ip — 10.0.0.1');
    expect(ticket.body).toContain('95%');
    expect(ticket.priority).toBe('1'); // mapped from critical
    expect(ticket.additionalFields.category).toBe('Security');
  });

  it('throws for nonexistent template ID', async () => {
    await expect(
      engine.renderTicket('no-such', TENANT, {} as TemplateVariables),
    ).rejects.toThrow('not found');
  });

  // ─── Template CRUD ─────────────────────────────────────────

  it('creates a custom template', async () => {
    const template = await engine.createTemplate(TENANT, makeTemplateInput());
    expect(template.id).toBeDefined();
    expect(template.name).toBe('Custom Alert Template');
    expect(template.targetType).toBe('servicenow');
    expect(template.tenantId).toBe(TENANT);
  });

  it('rejects template with invalid title template', async () => {
    await expect(
      engine.createTemplate(TENANT, makeTemplateInput({ titleTemplate: '{{broken' })),
    ).rejects.toThrow('Invalid title template');
  });

  it('lists templates including system defaults', async () => {
    await engine.createTemplate(TENANT, makeTemplateInput());
    const result = await engine.listTemplates(TENANT, { page: 1, limit: 50 });
    // Should include 2 system defaults + 1 custom
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  it('lists templates filtered by targetType', async () => {
    await engine.createTemplate(TENANT, makeTemplateInput());
    const result = await engine.listTemplates(TENANT, { targetType: 'servicenow', page: 1, limit: 50 });
    expect(result.data.every((t) => t.targetType === 'servicenow')).toBe(true);
  });

  it('updates a custom template', async () => {
    const template = await engine.createTemplate(TENANT, makeTemplateInput());
    const updated = await engine.updateTemplate(template.id, TENANT, {
      name: 'Updated Template',
      titleTemplate: '{{severity}} — {{alertTitle}}',
    });
    expect(updated?.name).toBe('Updated Template');
    expect(updated?.titleTemplate).toBe('{{severity}} — {{alertTitle}}');
  });

  it('cannot update system default templates', async () => {
    // Get a system template
    const { data } = await engine.listTemplates(TENANT, { page: 1, limit: 50 });
    const systemTemplate = data.find((t) => t.tenantId === 'system');
    expect(systemTemplate).toBeDefined();
    await expect(
      engine.updateTemplate(systemTemplate!.id, 'system', { name: 'Hacked' }),
    ).rejects.toThrow('system default');
  });

  it('deletes a custom template', async () => {
    const template = await engine.createTemplate(TENANT, makeTemplateInput());
    expect(await engine.deleteTemplate(template.id, TENANT)).toBe(true);
    expect(await engine.getTemplate(template.id, TENANT)).toBeUndefined();
  });

  it('cannot delete system default templates', async () => {
    const { data } = await engine.listTemplates(TENANT, { page: 1, limit: 50 });
    const systemTemplate = data.find((t) => t.tenantId === 'system');
    expect(await engine.deleteTemplate(systemTemplate!.id, 'system')).toBe(false);
  });

  // ─── System Defaults ───────────────────────────────────────

  it('has ServiceNow default template', async () => {
    const { data } = await engine.listTemplates(TENANT, { targetType: 'servicenow', page: 1, limit: 50 });
    const systemSN = data.find((t) => t.tenantId === 'system' && t.targetType === 'servicenow');
    expect(systemSN).toBeDefined();
    expect(systemSN!.titleTemplate).toContain('{{severity}}');
    expect(systemSN!.bodyTemplate).toContain('{{alertTitle}}');
  });

  it('has Jira default template', async () => {
    const { data } = await engine.listTemplates(TENANT, { targetType: 'jira', page: 1, limit: 50 });
    const systemJira = data.find((t) => t.tenantId === 'system' && t.targetType === 'jira');
    expect(systemJira).toBeDefined();
    expect(systemJira!.titleTemplate).toContain('{{severity}}');
    expect(systemJira!.priorityMapping).toHaveProperty('critical', 'Highest');
  });
});
