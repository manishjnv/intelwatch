import { describe, it, expect, beforeEach } from 'vitest';
import { StixCollectionStore } from '../src/services/stix-collection-store.js';
import type { CreateTaxiiCollectionInput, StixObject } from '../src/schemas/integration.js';

const TENANT = 'tenant-stix';
const TENANT_B = 'tenant-stix-2';

const makeCollectionInput = (overrides: Partial<CreateTaxiiCollectionInput> = {}): CreateTaxiiCollectionInput => ({
  title: 'IOC Feed',
  description: 'Test IOC collection',
  canRead: true,
  canWrite: false,
  pollingIntervalMinutes: 30,
  entityFilter: { entityType: 'iocs' },
  ...overrides,
});

const makeStixObject = (id: string): StixObject => ({
  type: 'indicator',
  spec_version: '2.1',
  id: `indicator--${id}`,
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  name: `Test indicator ${id}`,
  pattern: `[ipv4-addr:value = '10.0.0.${id}']`,
  pattern_type: 'stix',
});

describe('StixCollectionStore', () => {
  let store: StixCollectionStore;

  beforeEach(() => {
    store = new StixCollectionStore();
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates a collection', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(c.id).toBeDefined();
    expect(c.title).toBe('IOC Feed');
    expect(c.tenantId).toBe(TENANT);
    expect(c.canRead).toBe(true);
    expect(c.canWrite).toBe(false);
    expect(c.pollingIntervalMinutes).toBe(30);
    expect(c.objectCount).toBe(0);
    expect(c.lastPolledAt).toBeNull();
  });

  it('gets a collection by ID and tenant', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(store.getCollection(c.id, TENANT)).toEqual(c);
  });

  it('returns undefined for wrong tenant', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(store.getCollection(c.id, TENANT_B)).toBeUndefined();
  });

  it('lists collections for a tenant', () => {
    store.createCollection(TENANT, makeCollectionInput());
    store.createCollection(TENANT, makeCollectionInput({ title: 'Alert Feed' }));
    store.createCollection(TENANT_B, makeCollectionInput({ title: 'Other' }));
    const result = store.listCollections(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
  });

  it('updates a collection', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    const updated = store.updateCollection(c.id, TENANT, {
      title: 'Updated Feed',
      pollingIntervalMinutes: 120,
    });
    expect(updated?.title).toBe('Updated Feed');
    expect(updated?.pollingIntervalMinutes).toBe(120);
    expect(updated?.description).toBe('Test IOC collection'); // preserved
  });

  it('returns undefined when updating wrong tenant', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(store.updateCollection(c.id, TENANT_B, { title: 'X' })).toBeUndefined();
  });

  it('deletes a collection', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(store.deleteCollection(c.id, TENANT)).toBe(true);
    expect(store.getCollection(c.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting wrong tenant', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(store.deleteCollection(c.id, TENANT_B)).toBe(false);
  });

  // ─── Objects ────────────────────────────────────────────────

  it('adds STIX objects to a collection', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    const count = store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2')]);
    expect(count).toBe(2);

    const refreshed = store.getCollection(c.id, TENANT);
    expect(refreshed?.objectCount).toBe(2);
  });

  it('deduplicates STIX objects by ID', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2')]);
    const count = store.addObjects(c.id, TENANT, [makeStixObject('2'), makeStixObject('3')]);
    expect(count).toBe(1); // only '3' is new

    const refreshed = store.getCollection(c.id, TENANT);
    expect(refreshed?.objectCount).toBe(3);
  });

  it('returns 0 when adding to nonexistent collection', () => {
    expect(store.addObjects('no-such', TENANT, [makeStixObject('1')])).toBe(0);
  });

  it('gets objects with pagination', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2'), makeStixObject('3')]);

    const page1 = store.getObjects(c.id, TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = store.getObjects(c.id, TENANT, { page: 2, limit: 2 });
    expect(page2.data).toHaveLength(1);
  });

  // ─── Manifest ───────────────────────────────────────────────

  it('generates a manifest for collection objects', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2')]);

    const manifest = store.getManifest(c.id, TENANT, { page: 1, limit: 50 });
    expect(manifest.total).toBe(2);
    expect(manifest.data[0]!.id).toContain('indicator--');
    expect(manifest.data[0]!.mediaType).toBe('application/stix+json;version=2.1');
    expect(manifest.data[0]!.dateAdded).toBeDefined();
    expect(manifest.data[0]!.version).toBeDefined();
  });

  it('returns empty manifest for nonexistent collection', () => {
    const result = store.getManifest('no-such', TENANT, { page: 1, limit: 50 });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  // ─── Polling ────────────────────────────────────────────────

  it('marks a collection as polled', () => {
    const c = store.createCollection(TENANT, makeCollectionInput());
    expect(c.lastPolledAt).toBeNull();

    store.markPolled(c.id, TENANT);
    const refreshed = store.getCollection(c.id, TENANT);
    expect(refreshed?.lastPolledAt).toBeDefined();
  });

  it('identifies collections due for polling', () => {
    const c1 = store.createCollection(TENANT, makeCollectionInput({ pollingIntervalMinutes: 1 }));
    const c2 = store.createCollection(TENANT, makeCollectionInput({ title: 'Recent', pollingIntervalMinutes: 1440 }));

    // c1 never polled → due
    // c2 never polled → due
    const due = store.getCollectionsDueForPolling(TENANT);
    expect(due).toHaveLength(2);

    // Poll c2 → no longer due (1440 min interval)
    store.markPolled(c2.id, TENANT);
    const due2 = store.getCollectionsDueForPolling(TENANT);
    expect(due2).toHaveLength(1);
    expect(due2[0]!.id).toBe(c1.id);
  });

  // ─── Access Control ────────────────────────────────────────

  it('canRead returns true for readable collection', () => {
    const c = store.createCollection(TENANT, makeCollectionInput({ canRead: true }));
    expect(store.canRead(c.id, TENANT)).toBe(true);
  });

  it('canWrite returns false for read-only collection', () => {
    const c = store.createCollection(TENANT, makeCollectionInput({ canWrite: false }));
    expect(store.canWrite(c.id, TENANT)).toBe(false);
  });

  it('canRead returns false for nonexistent collection', () => {
    expect(store.canRead('no-such', TENANT)).toBe(false);
  });
});
