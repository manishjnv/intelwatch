import { describe, it, expect, beforeEach } from 'vitest';
import { SavedHuntLibrary } from '../src/services/saved-hunt-library.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntTemplate, HuntQuery } from '../src/schemas/hunting.js';

describe('Hunting Service — #4 Saved Hunt Library', () => {
  let store: HuntingStore;
  let library: SavedHuntLibrary;
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    store = new HuntingStore();
    library = new SavedHuntLibrary(store);
  });

  const defaultQuery: HuntQuery = {
    fields: [{ field: 'type', operator: 'eq', value: 'ip' }],
    limit: 100,
    offset: 0,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  };

  function createTemplate(name = 'APT Hunt Template'): HuntTemplate {
    return library.create(tenantId, userId, {
      name,
      description: 'Hunt for APT indicators',
      category: 'apt',
      hypothesis: 'Suspected APT activity from known threat actor',
      defaultQuery,
      suggestedEntityTypes: ['ip', 'domain', 'hash_sha256'],
      mitreTechniques: ['T1566', 'T1059'],
      tags: ['apt', 'phishing'],
    });
  }

  // ─── Create ──────────────────────────────────────────────

  it('4.1. creates a template with all fields', () => {
    const tpl = createTemplate();
    expect(tpl.name).toBe('APT Hunt Template');
    expect(tpl.category).toBe('apt');
    expect(tpl.usageCount).toBe(0);
    expect(tpl.mitreTechniques).toContain('T1566');
    expect(tpl.suggestedEntityTypes).toContain('ip');
  });

  it('4.2. rejects duplicate template names', () => {
    createTemplate('Unique Name');
    expect(() => createTemplate('Unique Name')).toThrow('already exists');
  });

  it('4.3. generates unique IDs', () => {
    const t1 = createTemplate('Template A');
    const t2 = createTemplate('Template B');
    expect(t1.id).not.toBe(t2.id);
  });

  // ─── Get ─────────────────────────────────────────────────

  it('4.4. gets template by ID', () => {
    const tpl = createTemplate();
    const fetched = library.get(tenantId, tpl.id);
    expect(fetched.id).toBe(tpl.id);
  });

  it('4.5. throws 404 for non-existent template', () => {
    expect(() => library.get(tenantId, 'nonexistent')).toThrow('not found');
  });

  it('4.6. tenant isolation', () => {
    const tpl = createTemplate();
    expect(() => library.get('other-tenant', tpl.id)).toThrow('not found');
  });

  // ─── Update ──────────────────────────────────────────────

  it('4.7. updates template fields', () => {
    const tpl = createTemplate();
    const updated = library.update(tenantId, tpl.id, {
      name: 'Updated APT Template',
      description: 'Updated description',
      tags: ['updated'],
    });
    expect(updated.name).toBe('Updated APT Template');
    expect(updated.tags).toContain('updated');
  });

  it('4.8. rejects update to duplicate name', () => {
    createTemplate('Name A');
    const tpl = createTemplate('Name B');
    expect(() => library.update(tenantId, tpl.id, { name: 'Name A' }))
      .toThrow('already exists');
  });

  // ─── Delete ──────────────────────────────────────────────

  it('4.9. deletes a template', () => {
    const tpl = createTemplate();
    library.delete(tenantId, tpl.id);
    expect(() => library.get(tenantId, tpl.id)).toThrow('not found');
  });

  it('4.10. throws 404 on delete of non-existent', () => {
    expect(() => library.delete(tenantId, 'nonexistent')).toThrow('not found');
  });

  // ─── Clone ───────────────────────────────────────────────

  it('4.11. clones a template with new name', () => {
    const original = createTemplate();
    const clone = library.clone(tenantId, original.id, userId, 'Cloned Template');
    expect(clone.name).toBe('Cloned Template');
    expect(clone.id).not.toBe(original.id);
    expect(clone.category).toBe(original.category);
    expect(clone.defaultQuery).toEqual(original.defaultQuery);
    expect(clone.usageCount).toBe(0);
  });

  it('4.12. rejects clone with duplicate name', () => {
    const original = createTemplate();
    expect(() => library.clone(tenantId, original.id, userId, original.name))
      .toThrow('already exists');
  });

  // ─── Usage tracking ──────────────────────────────────────

  it('4.13. increments usage count', () => {
    const tpl = createTemplate();
    library.incrementUsage(tenantId, tpl.id);
    library.incrementUsage(tenantId, tpl.id);
    const fetched = library.get(tenantId, tpl.id);
    expect(fetched.usageCount).toBe(2);
  });

  // ─── List & Search ────────────────────────────────────────

  it('4.14. lists templates with pagination', () => {
    for (let i = 0; i < 5; i++) createTemplate(`Template ${i}`);
    const result = library.list(tenantId, 1, 3);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(5);
  });

  it('4.15. filters by category', () => {
    createTemplate('APT Template');
    library.create(tenantId, userId, {
      name: 'Phishing Template',
      description: 'Hunt phishing',
      category: 'phishing',
      hypothesis: 'Phishing campaign',
      defaultQuery,
    });
    const result = library.list(tenantId, 1, 50, 'phishing');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe('phishing');
  });

  it('4.16. searches by name', () => {
    createTemplate('Ransomware Response');
    createTemplate('APT Investigation');
    const results = library.search(tenantId, 'ransomware');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toContain('Ransomware');
  });

  it('4.17. searches by MITRE technique', () => {
    createTemplate();
    const results = library.search(tenantId, 'T1566');
    expect(results).toHaveLength(1);
  });

  it('4.18. searches by tag', () => {
    createTemplate();
    const results = library.search(tenantId, 'phishing');
    expect(results).toHaveLength(1);
  });

  it('4.19. sorts by usage count (most used first)', () => {
    const t1 = createTemplate('Template A');
    const t2 = createTemplate('Template B');
    library.incrementUsage(tenantId, t2.id);
    library.incrementUsage(tenantId, t2.id);
    library.incrementUsage(tenantId, t1.id);
    const result = library.list(tenantId, 1, 50);
    expect(result.data[0]!.name).toBe('Template B');
  });
});
