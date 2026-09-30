import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type {
  TicketTemplate,
  CreateTicketTemplateInput,
  UpdateTicketTemplateInput,
} from '../schemas/integration.js';
import type { DocRepo } from './doc-repo.js';
import { MemoryDocRepo } from './doc-repo.js';

/** Variables available for ticket template rendering. */
export interface TemplateVariables {
  severity?: string;
  iocValue?: string;
  iocType?: string;
  actorName?: string;
  malwareName?: string;
  description?: string;
  alertId?: string;
  alertTitle?: string;
  timestamp?: string;
  confidence?: number | string;
  source?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * P1 #8: Handlebars-style template engine for ticket creation.
 * Renders templates with {{variable}} placeholders and manages
 * default + custom templates per ticketing system type. Custom templates
 * persist as `ticket_template` documents (Step 3 S157); system defaults are
 * a code constant (tenantId 'system'), never written to a tenant's row.
 */
export class TemplateEngine {
  private readonly defaults: TicketTemplate[]; // ponytail: fixed constant, not a mutable store — no memory-ok tag needed

  constructor(private readonly repo: DocRepo<TicketTemplate> = new MemoryDocRepo<TicketTemplate>()) {
    this.defaults = this.buildDefaultTemplates();
  }

  /** Render a template string by replacing {{variable}} placeholders. */
  render(template: string, variables: TemplateVariables): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
      const value = this.resolveVariable(key, variables);
      if (value === undefined || value === null) return '';
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
    });
  }

  /** Render a full ticket from a template + variables. */
  async renderTicket(
    templateId: string,
    tenantId: string,
    variables: TemplateVariables,
  ): Promise<{ title: string; body: string; priority: string; additionalFields: Record<string, string> }> {
    const template = await this.getTemplate(templateId, tenantId);
    if (!template) {
      throw new AppError(404, 'Ticket template not found', 'TEMPLATE_NOT_FOUND');
    }

    const title = this.render(template.titleTemplate, variables);
    const body = this.render(template.bodyTemplate, variables);

    // Map severity to priority using template's priority mapping
    const severity = variables.severity ?? 'medium';
    const priority = template.priorityMapping[severity] ?? severity;

    // Render additional fields
    const additionalFields: Record<string, string> = {};
    for (const [key, val] of Object.entries(template.additionalFields)) {
      additionalFields[key] = this.render(val, variables);
    }

    return { title, body, priority, additionalFields };
  }

  /** Extract all variable names from a template string. */
  extractVariables(template: string): string[] {
    const vars = new Set<string>();
    const regex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    let match;
    while ((match = regex.exec(template)) !== null) {
      vars.add(match[1]!);
    }
    return Array.from(vars);
  }

  /** Validate a template string (check for unclosed/malformed placeholders). */
  validateTemplate(template: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    // Check for unclosed braces
    const openCount = (template.match(/\{\{/g) ?? []).length;
    const closeCount = (template.match(/\}\}/g) ?? []).length;
    if (openCount !== closeCount) {
      errors.push(`Mismatched braces: ${openCount} opening vs ${closeCount} closing`);
    }
    // Check for empty variables
    if (/\{\{\s*\}\}/.test(template)) {
      errors.push('Empty variable placeholder found: {{}}');
    }
    return { valid: errors.length === 0, errors };
  }

  // ─── Template CRUD ────────────────────────────────────────────

  /** Create a custom ticket template. */
  async createTemplate(tenantId: string, input: CreateTicketTemplateInput): Promise<TicketTemplate> {
    // Validate templates
    const titleValidation = this.validateTemplate(input.titleTemplate);
    if (!titleValidation.valid) {
      throw new AppError(400, `Invalid title template: ${titleValidation.errors.join('; ')}`, 'INVALID_TEMPLATE');
    }
    const bodyValidation = this.validateTemplate(input.bodyTemplate);
    if (!bodyValidation.valid) {
      throw new AppError(400, `Invalid body template: ${bodyValidation.errors.join('; ')}`, 'INVALID_TEMPLATE');
    }

    const now = new Date().toISOString();
    const template: TicketTemplate = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? '',
      targetType: input.targetType,
      titleTemplate: input.titleTemplate,
      bodyTemplate: input.bodyTemplate,
      priorityMapping: input.priorityMapping ?? {},
      additionalFields: input.additionalFields ?? {},
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.save(template);
  }

  /** Get a template by ID. System defaults have tenantId = 'system'. */
  async getTemplate(id: string, tenantId: string): Promise<TicketTemplate | undefined> {
    const builtin = this.defaults.find((t) => t.id === id);
    if (builtin) return builtin;
    return (await this.repo.get(id, tenantId)) ?? undefined;
  }

  /** List templates for a tenant (includes system defaults). */
  async listTemplates(
    tenantId: string,
    opts: { targetType?: 'servicenow' | 'jira'; page: number; limit: number },
  ): Promise<{ data: TicketTemplate[]; total: number }> {
    const custom = await this.repo.list(tenantId);
    let items = [...this.defaults, ...custom];
    if (opts.targetType) {
      items = items.filter((t) => t.targetType === opts.targetType);
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update a custom template (system defaults cannot be modified). */
  async updateTemplate(
    id: string,
    tenantId: string,
    input: UpdateTicketTemplateInput,
  ): Promise<TicketTemplate | undefined> {
    if (this.defaults.some((t) => t.id === id)) {
      throw new AppError(403, 'Cannot modify system default templates', 'SYSTEM_TEMPLATE');
    }
    const existing = await this.repo.get(id, tenantId);
    if (!existing) return undefined;

    if (input.titleTemplate) {
      const v = this.validateTemplate(input.titleTemplate);
      if (!v.valid) throw new AppError(400, `Invalid title template: ${v.errors.join('; ')}`, 'INVALID_TEMPLATE');
    }
    if (input.bodyTemplate) {
      const v = this.validateTemplate(input.bodyTemplate);
      if (!v.valid) throw new AppError(400, `Invalid body template: ${v.errors.join('; ')}`, 'INVALID_TEMPLATE');
    }

    const updated: TicketTemplate = {
      ...existing,
      ...input,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    return this.repo.save(updated);
  }

  /** Delete a custom template. */
  async deleteTemplate(id: string, tenantId: string): Promise<boolean> {
    if (this.defaults.some((t) => t.id === id)) return false;
    return this.repo.delete(id, tenantId);
  }

  // ─── Defaults ─────────────────────────────────────────────────

  /** Build system-level default templates (fixed constant — not persisted). */
  private buildDefaultTemplates(): TicketTemplate[] {
    const defaults: Array<Omit<TicketTemplate, 'id' | 'createdAt' | 'updatedAt'>> = [
      {
        tenantId: 'system',
        name: 'ServiceNow - Security Incident',
        description: 'Default template for ServiceNow security incidents',
        targetType: 'servicenow',
        titleTemplate: '[ETIP] {{severity}} - {{alertTitle}}',
        bodyTemplate: [
          'Security Alert: {{alertTitle}}',
          '',
          'Severity: {{severity}}',
          'IOC: {{iocType}} — {{iocValue}}',
          'Confidence: {{confidence}}%',
          'Source: {{source}}',
          '',
          'Description:',
          '{{description}}',
          '',
          'Threat Actor: {{actorName}}',
          'Malware: {{malwareName}}',
          'Tags: {{tags}}',
          '',
          'Alert ID: {{alertId}}',
          'Generated by ETIP at {{timestamp}}',
        ].join('\n'),
        priorityMapping: { critical: '1', high: '2', medium: '3', low: '4' },
        additionalFields: { category: 'Security', subcategory: 'Threat Intelligence' },
      },
      {
        tenantId: 'system',
        name: 'Jira - Security Task',
        description: 'Default template for Jira security tasks',
        targetType: 'jira',
        titleTemplate: '[{{severity}}] {{alertTitle}}',
        bodyTemplate: [
          'h2. Security Alert',
          '',
          '||Field||Value||',
          '|Severity|{{severity}}|',
          '|IOC Type|{{iocType}}|',
          '|IOC Value|{{iocValue}}|',
          '|Confidence|{{confidence}}%|',
          '|Source|{{source}}|',
          '',
          'h3. Description',
          '{{description}}',
          '',
          'h3. Threat Context',
          '* Actor: {{actorName}}',
          '* Malware: {{malwareName}}',
          '* Tags: {{tags}}',
          '',
          '_Alert ID: {{alertId}} | Generated by ETIP at {{timestamp}}_',
        ].join('\n'),
        priorityMapping: { critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low' },
        additionalFields: { labels: 'etip,threat-intel' },
      },
    ];

    const now = new Date().toISOString();
    return defaults.map((d) => ({ ...d, id: randomUUID(), createdAt: now, updatedAt: now }));
  }

  /** Resolve a possibly nested variable from the context. */
  private resolveVariable(path: string, variables: TemplateVariables): unknown {
    const parts = path.split('.');
    let current: unknown = variables;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
