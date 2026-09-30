import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type {
  HuntTemplate,
  TemplateCategory,
  HuntQuery,
  EntityType,
} from '../schemas/hunting.js';

/**
 * #4 Saved Hunt Library — CRUD for reusable hunt templates.
 *
 * Templates include a default query, suggested entity types, MITRE techniques,
 * and a usage counter. Analysts can clone templates to start new hunts.
 */
export class SavedHuntLibrary {
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  /** Create a new hunt template. */
  async create(
    tenantId: string,
    userId: string,
    input: {
      name: string;
      description: string;
      category: TemplateCategory;
      hypothesis: string;
      defaultQuery: HuntQuery;
      suggestedEntityTypes?: EntityType[];
      mitreTechniques?: string[];
      tags?: string[];
    },
  ): Promise<HuntTemplate> {
    // Check for duplicate name
    const existing = await this.findByName(tenantId, input.name);
    if (existing) {
      throw new AppError(409, `Template "${input.name}" already exists`, 'TEMPLATE_EXISTS');
    }

    const now = new Date().toISOString();
    const template: HuntTemplate = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description,
      category: input.category,
      hypothesis: input.hypothesis,
      defaultQuery: input.defaultQuery,
      suggestedEntityTypes: input.suggestedEntityTypes ?? [],
      mitreTechniques: input.mitreTechniques ?? [],
      tags: input.tags ?? [],
      usageCount: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.setTemplate(tenantId, template);
    return template;
  }

  /** Get a template by ID. Throws 404 if not found. */
  async get(tenantId: string, templateId: string): Promise<HuntTemplate> {
    const template = await this.store.getTemplate(tenantId, templateId);
    if (!template) {
      throw new AppError(404, `Template ${templateId} not found`, 'TEMPLATE_NOT_FOUND');
    }
    return template;
  }

  /** Update a template. */
  async update(
    tenantId: string,
    templateId: string,
    updates: {
      name?: string;
      description?: string;
      category?: TemplateCategory;
      hypothesis?: string;
      defaultQuery?: HuntQuery;
      suggestedEntityTypes?: EntityType[];
      mitreTechniques?: string[];
      tags?: string[];
    },
  ): Promise<HuntTemplate> {
    const template = await this.get(tenantId, templateId);

    // Check for name uniqueness if name is being changed
    if (updates.name && updates.name !== template.name) {
      const existing = await this.findByName(tenantId, updates.name);
      if (existing) {
        throw new AppError(409, `Template "${updates.name}" already exists`, 'TEMPLATE_EXISTS');
      }
    }

    if (updates.name !== undefined) template.name = updates.name;
    if (updates.description !== undefined) template.description = updates.description;
    if (updates.category !== undefined) template.category = updates.category;
    if (updates.hypothesis !== undefined) template.hypothesis = updates.hypothesis;
    if (updates.defaultQuery !== undefined) template.defaultQuery = updates.defaultQuery;
    if (updates.suggestedEntityTypes !== undefined) template.suggestedEntityTypes = updates.suggestedEntityTypes;
    if (updates.mitreTechniques !== undefined) template.mitreTechniques = updates.mitreTechniques;
    if (updates.tags !== undefined) template.tags = updates.tags;
    template.updatedAt = new Date().toISOString();

    await this.store.setTemplate(tenantId, template);
    return template;
  }

  /** Delete a template. */
  async delete(tenantId: string, templateId: string): Promise<void> {
    const exists = await this.store.getTemplate(tenantId, templateId);
    if (!exists) {
      throw new AppError(404, `Template ${templateId} not found`, 'TEMPLATE_NOT_FOUND');
    }
    await this.store.deleteTemplate(tenantId, templateId);
  }

  /** Clone a template (create a copy with a new name). */
  async clone(tenantId: string, templateId: string, userId: string, newName: string): Promise<HuntTemplate> {
    const original = await this.get(tenantId, templateId);

    return this.create(tenantId, userId, {
      name: newName,
      description: original.description,
      category: original.category,
      hypothesis: original.hypothesis,
      defaultQuery: original.defaultQuery,
      suggestedEntityTypes: [...original.suggestedEntityTypes],
      mitreTechniques: [...original.mitreTechniques],
      tags: [...original.tags],
    });
  }

  /**
   * Increment usage count when a template is used to start a hunt.
   * Step 3 S159 fix: the pre-migration version mutated `template.usageCount++` without
   * calling `store.setTemplate` — it "worked" only because the in-memory Map returned
   * the same live object. The doc-repo now returns clones, so the increment must be
   * saved explicitly or it is silently lost.
   */
  async incrementUsage(tenantId: string, templateId: string): Promise<void> {
    const template = await this.store.getTemplate(tenantId, templateId);
    if (template) {
      template.usageCount++;
      template.updatedAt = new Date().toISOString();
      await this.store.setTemplate(tenantId, template);
    }
  }

  /** List templates with pagination and optional category filter. */
  async list(
    tenantId: string,
    page: number,
    limit: number,
    category?: TemplateCategory,
  ): Promise<{ data: HuntTemplate[]; total: number }> {
    return this.store.listTemplates(tenantId, page, limit, category);
  }

  /** Search templates by name or tag. */
  async search(tenantId: string, query: string): Promise<HuntTemplate[]> {
    const lowerQuery = query.toLowerCase();
    const all = await this.store.listAllTemplates(tenantId);
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery) ||
        t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
        t.mitreTechniques.some((tech) => tech.toLowerCase().includes(lowerQuery)),
    );
  }

  /** Find template by exact name. */
  private async findByName(tenantId: string, name: string): Promise<HuntTemplate | undefined> {
    const all = await this.store.listAllTemplates(tenantId);
    return all.find((t) => t.name === name);
  }
}
