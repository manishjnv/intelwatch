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

  it('creates a collection', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(c.id).toBeDefined();
    expect(c.title).toBe('IOC Feed');
    expect(c.tenantId).toBe(TENANT);
    expect(c.canRead).toBe(true);
    expect(c.canWrite).toBe(false);
    expect(c.pollingIntervalMinutes).toBe(30);
    expect(c.objectCount).toBe(0);
    expect(c.lastPolledAt).toBeNull();
  });

  it('gets a collection by ID and tenant', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(await store.getCollection(c.id, TENANT)).toEqual(c);
  });

  it('returns undefined for wrong tenant', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(await store.getCollection(c.id, TENANT_B)).toBeUndefined();
  });

  it('lists collections for a tenant', async () => {
    await store.createCollection(TENANT, makeCollectionInput());
    await store.createCollection(TENANT, makeCollectionInput({ title: 'Alert Feed' }));
    await store.createCollection(TENANT_B, makeCollectionInput({ title: 'Other' }));
    const result = await store.listCollections(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
  });

  it('updates a collection', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    const updated = await store.updateCollection(c.id, TENANT, {
      title: 'Updated Feed',
      pollingIntervalMinutes: 120,
    });
    expect(updated?.title).toBe('Updated Feed');
    expect(updated?.pollingIntervalMinutes).toBe(120);
    expect(updated?.description).toBe('Test IOC collection'); // preserved
  });

  it('returns undefined when updating wrong tenant', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(await store.updateCollection(c.id, TENANT_B, { title: 'X' })).toBeUndefined();
  });

  it('deletes a collection', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(await store.deleteCollection(c.id, TENANT)).toBe(true);
    expect(await store.getCollection(c.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting wrong tenant', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(await store.deleteCollection(c.id, TENANT_B)).toBe(false);
  });

  // ─── Objects ────────────────────────────────────────────────

  it('adds STIX objects to a collection', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    const count = await store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2')]);
    expect(count).toBe(2);

    const refreshed = await store.getCollection(c.id, TENANT);
    expect(refreshed?.objectCount).toBe(2);
  });

  it('deduplicates STIX objects by ID', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    await store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2')]);
    const count = await store.addObjects(c.id, TENANT, [makeStixObject('2'), makeStixObject('3')]);
    expect(count).toBe(1); // only '3' is new

    const refreshed = await store.getCollection(c.id, TENANT);
    expect(refreshed?.objectCount).toBe(3);
  });

  it('returns 0 when adding to nonexistent collection', async () => {
    expect(await store.addObjects('no-such', TENANT, [makeStixObject('1')])).toBe(0);
  });

  it('gets objects with pagination', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    await store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2'), makeStixObject('3')]);

    const page1 = await store.getObjects(c.id, TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = await store.getObjects(c.id, TENANT, { page: 2, limit: 2 });
    expect(page2.data).toHaveLength(1);
  });

  // ─── Manifest ───────────────────────────────────────────────

  it('generates a manifest for collection objects', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    await store.addObjects(c.id, TENANT, [makeStixObject('1'), makeStixObject('2')]);

    const manifest = await store.getManifest(c.id, TENANT, { page: 1, limit: 50 });
    expect(manifest.total).toBe(2);
    expect(manifest.data[0]!.id).toContain('indicator--');
    expect(manifest.data[0]!.mediaType).toBe('application/stix+json;version=2.1');
    expect(manifest.data[0]!.dateAdded).toBeDefined();
    expect(manifest.data[0]!.version).toBeDefined();
  });

  it('returns empty manifest for nonexistent collection', async () => {
    const result = await store.getManifest('no-such', TENANT, { page: 1, limit: 50 });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  // ─── Polling ────────────────────────────────────────────────

  it('marks a collection as polled', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput());
    expect(c.lastPolledAt).toBeNull();

    await store.markPolled(c.id, TENANT);
    const refreshed = await store.getCollection(c.id, TENANT);
    expect(refreshed?.lastPolledAt).toBeDefined();
  });

  it('identifies collections due for polling', async () => {
    const c1 = await store.createCollection(TENANT, makeCollectionInput({ pollingIntervalMinutes: 1 }));
    const c2 = await store.createCollection(TENANT, makeCollectionInput({ title: 'Recent', pollingIntervalMinutes: 1440 }));

    // c1 never polled → due
    // c2 never polled → due
    const due = await store.getCollectionsDueForPolling(TENANT);
    expect(due).toHaveLength(2);

    // Poll c2 → no longer due (1440 min interval)
    await store.markPolled(c2.id, TENANT);
    const due2 = await store.getCollectionsDueForPolling(TENANT);
    expect(due2).toHaveLength(1);
    expect(due2[0]!.id).toBe(c1.id);
  });

  // ─── Access Control ────────────────────────────────────────

  it('canRead returns true for readable collection', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput({ canRead: true }));
    expect(await store.canRead(c.id, TENANT)).toBe(true);
  });

  it('canWrite returns false for read-only collection', async () => {
    const c = await store.createCollection(TENANT, makeCollectionInput({ canWrite: false }));
    expect(await store.canWrite(c.id, TENANT)).toBe(false);
  });

  it('canRead returns false for nonexistent collection', async () => {
    expect(await store.canRead('no-such', TENANT)).toBe(false);
  });
});
