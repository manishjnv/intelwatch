import { describe, it, expect, beforeEach } from 'vitest';
import { FieldMappingStore } from '../src/services/field-mapping-store.js';
import type { CreateFieldMappingPresetInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-fm';
const TENANT_B = 'tenant-fm-2';

const makePresetInput = (overrides: Partial<CreateFieldMappingPresetInput> = {}): CreateFieldMappingPresetInput => ({
  name: 'Splunk Default Mapping',
  description: 'Standard field mappings for Splunk HEC',
  targetType: 'splunk_hec',
  mappings: [
    { sourceField: 'type', targetField: 'event.ioc_type', transform: 'none' },
    { sourceField: 'severity', targetField: 'event.severity', transform: 'uppercase' },
  ],
  ...overrides,
});

describe('FieldMappingStore', () => {
  let store: FieldMappingStore;

  beforeEach(() => {
    store = new FieldMappingStore();
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates a field mapping preset', async () => {
    const preset = await store.createPreset(TENANT, makePresetInput());
    expect(preset.id).toBeDefined();
    expect(preset.name).toBe('Splunk Default Mapping');
    expect(preset.targetType).toBe('splunk_hec');
    expect(preset.mappings).toHaveLength(2);
    expect(preset.tenantId).toBe(TENANT);
  });

  it('gets a preset by ID and tenant', async () => {
    const preset = await store.createPreset(TENANT, makePresetInput());
    const found = await store.getPreset(preset.id, TENANT);
    expect(found).toEqual(preset);
  });

  it('returns undefined for wrong tenant', async () => {
    const preset = await store.createPreset(TENANT, makePresetInput());
    expect(await store.getPreset(preset.id, TENANT_B)).toBeUndefined();
  });

  it('returns undefined for nonexistent ID', async () => {
    expect(await store.getPreset('no-such', TENANT)).toBeUndefined();
  });

  it('lists presets filtered by tenant', async () => {
    await store.createPreset(TENANT, makePresetInput());
    await store.createPreset(TENANT, makePresetInput({ name: 'Another', targetType: 'sentinel' }));
    await store.createPreset(TENANT_B, makePresetInput({ name: 'Other Tenant' }));

    const result = await store.listPresets(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('lists presets filtered by targetType', async () => {
    await store.createPreset(TENANT, makePresetInput());
    await store.createPreset(TENANT, makePresetInput({ name: 'Sentinel Map', targetType: 'sentinel' }));

    const result = await store.listPresets(TENANT, { targetType: 'splunk_hec', page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0]!.targetType).toBe('splunk_hec');
  });

  it('updates a preset', async () => {
    const preset = await store.createPreset(TENANT, makePresetInput());
    const updated = await store.updatePreset(preset.id, TENANT, {
      name: 'Updated Name',
      description: 'Updated description',
    });
    expect(updated?.name).toBe('Updated Name');
    expect(updated?.description).toBe('Updated description');
    expect(updated?.mappings).toHaveLength(2); // preserved
  });

  it('returns undefined when updating nonexistent preset', async () => {
    expect(await store.updatePreset('no-such', TENANT, { name: 'X' })).toBeUndefined();
  });

  it('deletes a preset', async () => {
    const preset = await store.createPreset(TENANT, makePresetInput());
    expect(await store.deletePreset(preset.id, TENANT)).toBe(true);
    expect(await store.getPreset(preset.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting nonexistent preset', async () => {
    expect(await store.deletePreset('no-such', TENANT)).toBe(false);
  });

  it('returns false when deleting wrong tenant preset', async () => {
    const preset = await store.createPreset(TENANT, makePresetInput());
    expect(await store.deletePreset(preset.id, TENANT_B)).toBe(false);
  });

  // ─── Uniqueness ─────────────────────────────────────────────

  it('rejects duplicate name + targetType within tenant', async () => {
    await store.createPreset(TENANT, makePresetInput());
    await expect(
      store.createPreset(TENANT, makePresetInput()),
    ).rejects.toThrow('already exists');
  });

  it('allows same name for different targetType', async () => {
    await store.createPreset(TENANT, makePresetInput());
    const p2 = await store.createPreset(TENANT, makePresetInput({ targetType: 'sentinel' }));
    expect(p2.targetType).toBe('sentinel');
  });

  it('allows same name for different tenant', async () => {
    await store.createPreset(TENANT, makePresetInput());
    const p2 = await store.createPreset(TENANT_B, makePresetInput());
    expect(p2.tenantId).toBe(TENANT_B);
  });

  // ─── Pagination ─────────────────────────────────────────────

  it('paginates results correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await store.createPreset(TENANT, makePresetInput({ name: `Preset ${i}`, targetType: 'splunk_hec' }));
    }
    const page1 = await store.listPresets(TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = await store.listPresets(TENANT, { page: 3, limit: 2 });
    expect(page3.data).toHaveLength(1);
  });
});
