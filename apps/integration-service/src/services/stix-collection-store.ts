import { randomUUID } from 'crypto';
import type {
  ManagedTaxiiCollection,
  CreateTaxiiCollectionInput,
  UpdateTaxiiCollectionInput,
  TaxiiManifestEntry,
  StixObject,
} from '../schemas/integration.js';
import type { DocRepo } from './doc-repo.js';
import { MemoryDocRepo } from './doc-repo.js';

/** One doc per collection holding its full object list (Step 3 S157, kind `taxii_objects`). */
interface CollectionObjectsDoc {
  id: string; // = collection id
  tenantId: string;
  objects: StixObject[];
}

/**
 * P1 #9: TAXII 2.1 collection management. Collections persist as
 * `taxii_collection` documents; each collection's objects persist as a single
 * `taxii_objects` document keyed by the collection id (parentId = collection id).
 */
export class StixCollectionStore {
  constructor(
    private readonly collections: DocRepo<ManagedTaxiiCollection> = new MemoryDocRepo<ManagedTaxiiCollection>(),
    private readonly objects: DocRepo<CollectionObjectsDoc> = new MemoryDocRepo<CollectionObjectsDoc>(),
  ) {}

  /** Create a new TAXII collection. */
  async createCollection(tenantId: string, input: CreateTaxiiCollectionInput): Promise<ManagedTaxiiCollection> {
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
    await this.collections.save(collection);
    await this.objects.save({ id: collection.id, tenantId, objects: [] }, collection.id);
    return collection;
  }

  /** Get a collection by ID, filtered by tenant. */
  async getCollection(id: string, tenantId: string): Promise<ManagedTaxiiCollection | undefined> {
    return (await this.collections.get(id, tenantId)) ?? undefined;
  }

  /** List collections for a tenant. */
  async listCollections(
    tenantId: string,
    opts: { page: number; limit: number },
  ): Promise<{ data: ManagedTaxiiCollection[]; total: number }> {
    const items = (await this.collections.list(tenantId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update a collection. */
  async updateCollection(
    id: string,
    tenantId: string,
    input: UpdateTaxiiCollectionInput,
  ): Promise<ManagedTaxiiCollection | undefined> {
    const existing = await this.getCollection(id, tenantId);
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
    return this.collections.save(updated);
  }

  /** Delete a collection and its objects. */
  async deleteCollection(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getCollection(id, tenantId);
    if (!existing) return false;
    await this.collections.delete(id, tenantId);
    await this.objects.delete(id, tenantId);
    return true;
  }

  /** Add STIX objects to a collection. */
  async addObjects(collectionId: string, tenantId: string, objects: StixObject[]): Promise<number> {
    const collection = await this.getCollection(collectionId, tenantId);
    if (!collection) return 0;

    const doc = (await this.objects.get(collectionId, tenantId)) ?? { id: collectionId, tenantId, objects: [] };
    const existingIds = new Set(doc.objects.map((o) => o.id));

    // Deduplicate by STIX object ID
    const newObjects = objects.filter((o) => !existingIds.has(o.id));
    doc.objects.push(...newObjects);
    await this.objects.save(doc, collectionId);

    collection.objectCount = doc.objects.length;
    collection.updatedAt = new Date().toISOString();
    await this.collections.save(collection);

    return newObjects.length;
  }

  /** Get STIX objects from a collection with pagination. */
  async getObjects(
    collectionId: string,
    tenantId: string,
    opts: { page: number; limit: number; addedAfter?: string },
  ): Promise<{ data: StixObject[]; total: number }> {
    const collection = await this.getCollection(collectionId, tenantId);
    if (!collection) return { data: [], total: 0 };

    const doc = await this.objects.get(collectionId, tenantId);
    let objects = doc?.objects ?? [];

    // Filter by addedAfter
    if (opts.addedAfter) {
      objects = objects.filter((o) => o.created > opts.addedAfter!);
    }

    const total = objects.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: objects.slice(start, start + opts.limit), total };
  }

  /** Generate a TAXII manifest for a collection. */
  async getManifest(
    collectionId: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): Promise<{ data: TaxiiManifestEntry[]; total: number }> {
    const collection = await this.getCollection(collectionId, tenantId);
    if (!collection) return { data: [], total: 0 };

    const doc = await this.objects.get(collectionId, tenantId);
    const entries: TaxiiManifestEntry[] = (doc?.objects ?? []).map((obj) => ({
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
  async markPolled(collectionId: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection(collectionId, tenantId);
    if (collection) {
      collection.lastPolledAt = new Date().toISOString();
      await this.collections.save(collection);
    }
  }

  /** Get collections due for polling based on their interval. */
  async getCollectionsDueForPolling(tenantId: string): Promise<ManagedTaxiiCollection[]> {
    const now = Date.now();
    return (await this.collections.list(tenantId)).filter((c) => {
      if (!c.lastPolledAt) return true;
      const lastPolled = new Date(c.lastPolledAt).getTime();
      const intervalMs = c.pollingIntervalMinutes * 60 * 1000;
      return now - lastPolled >= intervalMs;
    });
  }

  /** Check read access for a collection (stub for future RBAC). */
  async canRead(collectionId: string, tenantId: string): Promise<boolean> {
    const collection = await this.collections.get(collectionId, tenantId);
    return collection?.canRead ?? false;
  }

  /** Check write access for a collection (stub for future RBAC). */
  async canWrite(collectionId: string, tenantId: string): Promise<boolean> {
    const collection = await this.collections.get(collectionId, tenantId);
    return collection?.canWrite ?? false;
  }
}
