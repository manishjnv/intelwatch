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

  function createTemplate(name = 'APT Hunt Template'): Promise<HuntTemplate> {
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

  it('4.1. creates a template with all fields', async () => {
    const tpl = await createTemplate();
    expect(tpl.name).toBe('APT Hunt Template');
    expect(tpl.category).toBe('apt');
    expect(tpl.usageCount).toBe(0);
    expect(tpl.mitreTechniques).toContain('T1566');
    expect(tpl.suggestedEntityTypes).toContain('ip');
  });

  it('4.2. rejects duplicate template names', async () => {
    await createTemplate('Unique Name');
    await expect(createTemplate('Unique Name')).rejects.toThrow('already exists');
  });

  it('4.3. generates unique IDs', async () => {
    const t1 = await createTemplate('Template A');
    const t2 = await createTemplate('Template B');
    expect(t1.id).not.toBe(t2.id);
  });

  // ─── Get ─────────────────────────────────────────────────

  it('4.4. gets template by ID', async () => {
    const tpl = await createTemplate();
    const fetched = await library.get(tenantId, tpl.id);
    expect(fetched.id).toBe(tpl.id);
  });

  it('4.5. throws 404 for non-existent template', async () => {
    await expect(library.get(tenantId, 'nonexistent')).rejects.toThrow('not found');
  });

  it('4.6. tenant isolation', async () => {
    const tpl = await createTemplate();
    await expect(library.get('other-tenant', tpl.id)).rejects.toThrow('not found');
  });

  // ─── Update ──────────────────────────────────────────────

  it('4.7. updates template fields', async () => {
    const tpl = await createTemplate();
    const updated = await library.update(tenantId, tpl.id, {
      name: 'Updated APT Template',
      description: 'Updated description',
      tags: ['updated'],
    });
    expect(updated.name).toBe('Updated APT Template');
    expect(updated.tags).toContain('updated');
  });

  it('4.8. rejects update to duplicate name', async () => {
    await createTemplate('Name A');
    const tpl = await createTemplate('Name B');
    await expect(library.update(tenantId, tpl.id, { name: 'Name A' }))
      .rejects.toThrow('already exists');
  });

  // ─── Delete ──────────────────────────────────────────────

  it('4.9. deletes a template', async () => {
    const tpl = await createTemplate();
    await library.delete(tenantId, tpl.id);
    await expect(library.get(tenantId, tpl.id)).rejects.toThrow('not found');
  });

  it('4.10. throws 404 on delete of non-existent', async () => {
    await expect(library.delete(tenantId, 'nonexistent')).rejects.toThrow('not found');
  });

  // ─── Clone ───────────────────────────────────────────────

  it('4.11. clones a template with new name', async () => {
    const original = await createTemplate();
    const clone = await library.clone(tenantId, original.id, userId, 'Cloned Template');
    expect(clone.name).toBe('Cloned Template');
    expect(clone.id).not.toBe(original.id);
    expect(clone.category).toBe(original.category);
    expect(clone.defaultQuery).toEqual(original.defaultQuery);
    expect(clone.usageCount).toBe(0);
  });

  it('4.12. rejects clone with duplicate name', async () => {
    const original = await createTemplate();
    await expect(library.clone(tenantId, original.id, userId, original.name))
      .rejects.toThrow('already exists');
  });

  // ─── Usage tracking ──────────────────────────────────────

  it('4.13. increments usage count', async () => {
    const tpl = await createTemplate();
    await library.incrementUsage(tenantId, tpl.id);
    await library.incrementUsage(tenantId, tpl.id);
    const fetched = await library.get(tenantId, tpl.id);
    expect(fetched.usageCount).toBe(2);
  });

  // ─── List & Search ────────────────────────────────────────

  it('4.14. lists templates with pagination', async () => {
    for (let i = 0; i < 5; i++) await createTemplate(`Template ${i}`);
    const result = await library.list(tenantId, 1, 3);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(5);
  });

  it('4.15. filters by category', async () => {
    await createTemplate('APT Template');
    await library.create(tenantId, userId, {
      name: 'Phishing Template',
      description: 'Hunt phishing',
      category: 'phishing',
      hypothesis: 'Phishing campaign',
      defaultQuery,
    });
    const result = await library.list(tenantId, 1, 50, 'phishing');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe('phishing');
  });

  it('4.16. searches by name', async () => {
    await createTemplate('Ransomware Response');
    await createTemplate('APT Investigation');
    const results = await library.search(tenantId, 'ransomware');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toContain('Ransomware');
  });

  it('4.17. searches by MITRE technique', async () => {
    await createTemplate();
    const results = await library.search(tenantId, 'T1566');
    expect(results).toHaveLength(1);
  });

  it('4.18. searches by tag', async () => {
    await createTemplate();
    const results = await library.search(tenantId, 'phishing');
    expect(results).toHaveLength(1);
  });

  it('4.19. sorts by usage count (most used first)', async () => {
    const t1 = await createTemplate('Template A');
    const t2 = await createTemplate('Template B');
    await library.incrementUsage(tenantId, t2.id);
    await library.incrementUsage(tenantId, t2.id);
    await library.incrementUsage(tenantId, t1.id);
    const result = await library.list(tenantId, 1, 50);
    expect(result.data[0]!.name).toBe('Template B');
  });
});
