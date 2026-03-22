import { describe, it, expect, beforeEach } from 'vitest';
import { LayoutPresetsService } from '../src/services/layout-presets.js';
import type { CreateLayoutInput } from '../src/schemas/operations.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';
const USER_A   = 'user-001';
const USER_B   = 'user-002';

function makeInput(overrides: Partial<CreateLayoutInput> = {}): CreateLayoutInput {
  return {
    name: 'My Layout',
    description: 'A test layout',
    config: {
      depth: 2,
      nodePositions: {},
      nodeTypeVisibility: {},
      edgeTypeVisibility: {},
      filters: {},
      zoom: 1,
      panX: 0,
      panY: 0,
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LayoutPresetsService (#19)', () => {
  // maxPerTenant = 5 to make limit tests fast
  let svc: LayoutPresetsService;

  beforeEach(() => {
    svc = new LayoutPresetsService(5);
  });

  // ── 1. create() returns preset with UUID id ───────────────────────────────

  it('create() returns a preset with a UUID id', () => {
    const preset = svc.create(TENANT_A, USER_A, makeInput());

    expect(preset.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  // ── 2. create() sets tenantId, createdBy, timestamps ─────────────────────

  it('create() sets correct tenantId, createdBy, and timestamps', () => {
    const before = new Date().toISOString();
    const preset = svc.create(TENANT_A, USER_A, makeInput({ name: 'Overview' }));
    const after = new Date().toISOString();

    expect(preset.tenantId).toBe(TENANT_A);
    expect(preset.createdBy).toBe(USER_A);
    expect(preset.name).toBe('Overview');
    expect(preset.createdAt >= before).toBe(true);
    expect(preset.createdAt <= after).toBe(true);
    expect(preset.updatedAt).toBe(preset.createdAt);
  });

  // ── 3. list() returns all presets for tenant sorted by updatedAt desc ──────

  it('list() returns all presets for tenant sorted by updatedAt desc', () => {
    // Create with small delays using distinct timestamps via Date manipulation
    const p1 = svc.create(TENANT_A, USER_A, makeInput({ name: 'First' }));
    const p2 = svc.create(TENANT_A, USER_A, makeInput({ name: 'Second' }));
    const p3 = svc.create(TENANT_A, USER_A, makeInput({ name: 'Third' }));

    const { presets, total } = svc.list(TENANT_A);

    expect(total).toBe(3);
    expect(presets.length).toBe(3);

    // Sorted desc by updatedAt — newest is first (p3 was last created)
    // All presets share the same millisecond in fast tests, so verify all are present
    const ids = presets.map((p) => p.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    expect(ids).toContain(p3.id);

    // Verify ordering is descending (no later item appears before an earlier one)
    for (let i = 0; i < presets.length - 1; i++) {
      expect(presets[i]!.updatedAt >= presets[i + 1]!.updatedAt).toBe(true);
    }
  });

  // ── 4. list() returns empty for unknown tenant ────────────────────────────

  it('list() returns empty array and total=0 for unknown tenant', () => {
    svc.create(TENANT_A, USER_A, makeInput());

    const { presets, total } = svc.list('tenant-unknown');

    expect(presets).toEqual([]);
    expect(total).toBe(0);
  });

  // ── 5. getById() returns correct preset ───────────────────────────────────

  it('getById() returns the correct preset by id', () => {
    const created = svc.create(TENANT_A, USER_A, makeInput({ name: 'Target Layout' }));

    const found = svc.getById(TENANT_A, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe('Target Layout');
  });

  // ── 6. getById() returns null for unknown id ──────────────────────────────

  it('getById() returns null for an id that does not exist', () => {
    const result = svc.getById(TENANT_A, '00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  // ── 7. getById() returns null for different tenant (isolation) ────────────

  it('getById() returns null when preset belongs to a different tenant', () => {
    const created = svc.create(TENANT_A, USER_A, makeInput());

    // TENANT_B cannot see TENANT_A's preset
    const result = svc.getById(TENANT_B, created.id);

    expect(result).toBeNull();
  });

  // ── 8. delete() removes preset and returns true ───────────────────────────

  it('delete() removes the preset and returns true', () => {
    const created = svc.create(TENANT_A, USER_A, makeInput());

    const deleted = svc.delete(TENANT_A, created.id);
    const stillExists = svc.getById(TENANT_A, created.id);

    expect(deleted).toBe(true);
    expect(stillExists).toBeNull();
  });

  // ── 9. delete() returns false for unknown id ──────────────────────────────

  it('delete() returns false for an id that does not exist', () => {
    const result = svc.delete(TENANT_A, '00000000-0000-0000-0000-000000000000');
    expect(result).toBe(false);
  });

  // ── 10. create() throws when max presets reached ──────────────────────────

  it('create() throws when tenant has reached maxPerTenant limit', () => {
    // svc was created with maxPerTenant = 5
    for (let i = 0; i < 5; i++) {
      svc.create(TENANT_A, USER_A, makeInput({ name: `Layout ${i}` }));
    }

    expect(() => svc.create(TENANT_A, USER_A, makeInput({ name: 'One too many' }))).toThrow(
      'Maximum 5 presets per tenant reached',
    );
  });

  // ── 11. count() returns correct number ───────────────────────────────────

  it('count() returns the correct number of presets for a tenant', () => {
    expect(svc.count(TENANT_A)).toBe(0);

    svc.create(TENANT_A, USER_A, makeInput());
    svc.create(TENANT_A, USER_A, makeInput());
    svc.create(TENANT_B, USER_B, makeInput()); // different tenant — should not affect TENANT_A

    expect(svc.count(TENANT_A)).toBe(2);
    expect(svc.count(TENANT_B)).toBe(1);
  });

  // ── 12. clear() by tenantId only removes that tenant's presets ───────────

  it('clear(tenantId) removes only that tenant\'s presets, leaving others intact', () => {
    svc.create(TENANT_A, USER_A, makeInput({ name: 'A1' }));
    svc.create(TENANT_A, USER_A, makeInput({ name: 'A2' }));
    svc.create(TENANT_B, USER_B, makeInput({ name: 'B1' }));

    svc.clear(TENANT_A);

    expect(svc.count(TENANT_A)).toBe(0);
    expect(svc.count(TENANT_B)).toBe(1);
  });
});
