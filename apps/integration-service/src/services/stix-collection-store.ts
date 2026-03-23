import { randomUUID } from 'crypto';
import type {
  ManagedTaxiiCollection,
  CreateTaxiiCollectionInput,
  UpdateTaxiiCollectionInput,
  TaxiiManifestEntry,
  StixObject,
} from '../schemas/integration.js';

/**
 * P1 #9: In-memory TAXII 2.1 collection management.
 * Provides CRUD for collections, manifest generation,
 * configurable polling intervals, and access control stubs.
 */
export class StixCollectionStore {
  private collections = new Map<string, ManagedTaxiiCollection>();
  private collectionObjects = new Map<string, StixObject[]>();

  /** Create a new TAXII collection. */
  createCollection(tenantId: string, input: CreateTaxiiCollectionInput): ManagedTaxiiCollection {
    const now = new Date().toISOString();
    const collection: ManagedTaxiiCollection = {
      id: randomUUID(),
      tenantId,
      title: input.title,
      description: input.description ?? '',
      canRead: input.canRead ?? true,
      canWrite: input.canWrite ?? false,
      mediaTypes: input.mediaTypes ?? ['application/stix+json;version=2.1'],
      pollingIntervalMinutes: input.pollingIntervalMinutes ?? 60,
      entityFilter: input.entityFilter ?? { entityType: 'iocs' },
      objectCount: 0,
      lastPolledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.collections.set(collection.id, collection);
    this.collectionObjects.set(collection.id, []);
    return collection;
  }

  /** Get a collection by ID, filtered by tenant. */
  getCollection(id: string, tenantId: string): ManagedTaxiiCollection | undefined {
    const c = this.collections.get(id);
    if (!c || c.tenantId !== tenantId) return undefined;
    return c;
  }

  /** List collections for a tenant. */
  listCollections(
    tenantId: string,
    opts: { page: number; limit: number },
  ): { data: ManagedTaxiiCollection[]; total: number } {
    const items = Array.from(this.collections.values())
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update a collection. */
  updateCollection(
    id: string,
    tenantId: string,
    input: UpdateTaxiiCollectionInput,
  ): ManagedTaxiiCollection | undefined {
    const existing = this.getCollection(id, tenantId);
    if (!existing) return undefined;

    const updated: ManagedTaxiiCollection = {
      ...existing,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.canRead !== undefined && { canRead: input.canRead }),
      ...(input.canWrite !== undefined && { canWrite: input.canWrite }),
      ...(input.mediaTypes !== undefined && { mediaTypes: input.mediaTypes }),
      ...(input.pollingIntervalMinutes !== undefined && { pollingIntervalMinutes: input.pollingIntervalMinutes }),
      ...(input.entityFilter !== undefined && { entityFilter: input.entityFilter }),
      updatedAt: new Date().toISOString(),
    };
    this.collections.set(id, updated);
    return updated;
  }

  /** Delete a collection and its objects. */
  deleteCollection(id: string, tenantId: string): boolean {
    const existing = this.getCollection(id, tenantId);
    if (!existing) return false;
    this.collections.delete(id);
    this.collectionObjects.delete(id);
    return true;
  }

  /** Add STIX objects to a collection. */
  addObjects(collectionId: string, tenantId: string, objects: StixObject[]): number {
    const collection = this.getCollection(collectionId, tenantId);
    if (!collection) return 0;

    const existing = this.collectionObjects.get(collectionId) ?? [];
    const existingIds = new Set(existing.map((o) => o.id));

    // Deduplicate by STIX object ID
    const newObjects = objects.filter((o) => !existingIds.has(o.id));
    existing.push(...newObjects);
    this.collectionObjects.set(collectionId, existing);

    collection.objectCount = existing.length;
    collection.updatedAt = new Date().toISOString();

    return newObjects.length;
  }

  /** Get STIX objects from a collection with pagination. */
  getObjects(
    collectionId: string,
    tenantId: string,
    opts: { page: number; limit: number; addedAfter?: string },
  ): { data: StixObject[]; total: number } {
    const collection = this.getCollection(collectionId, tenantId);
    if (!collection) return { data: [], total: 0 };

    let objects = this.collectionObjects.get(collectionId) ?? [];

    // Filter by addedAfter
    if (opts.addedAfter) {
      objects = objects.filter((o) => o.created > opts.addedAfter!);
    }

    const total = objects.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: objects.slice(start, start + opts.limit), total };
  }

  /** Generate a TAXII manifest for a collection. */
  getManifest(
    collectionId: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): { data: TaxiiManifestEntry[]; total: number } {
    const collection = this.getCollection(collectionId, tenantId);
    if (!collection) return { data: [], total: 0 };

    const objects = this.collectionObjects.get(collectionId) ?? [];
    const entries: TaxiiManifestEntry[] = objects.map((obj) => ({
      id: obj.id,
      dateAdded: obj.created,
      version: obj.modified,
      mediaType: 'application/stix+json;version=2.1',
    }));

    const total = entries.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: entries.slice(start, start + opts.limit), total };
  }

  /** Mark a collection as polled (update lastPolledAt). */
  markPolled(collectionId: string, tenantId: string): void {
    const collection = this.getCollection(collectionId, tenantId);
    if (collection) {
      collection.lastPolledAt = new Date().toISOString();
    }
  }

  /** Get collections due for polling based on their interval. */
  getCollectionsDueForPolling(tenantId: string): ManagedTaxiiCollection[] {
    const now = Date.now();
    return Array.from(this.collections.values())
      .filter((c) => c.tenantId === tenantId)
      .filter((c) => {
        if (!c.lastPolledAt) return true;
        const lastPolled = new Date(c.lastPolledAt).getTime();
        const intervalMs = c.pollingIntervalMinutes * 60 * 1000;
        return now - lastPolled >= intervalMs;
      });
  }

  /** Check read access for a collection (stub for future RBAC). */
  canRead(collectionId: string, _tenantId: string): boolean {
    const collection = this.collections.get(collectionId);
    return collection?.canRead ?? false;
  }

  /** Check write access for a collection (stub for future RBAC). */
  canWrite(collectionId: string, _tenantId: string): boolean {
    const collection = this.collections.get(collectionId);
    return collection?.canWrite ?? false;
  }
}
