/**
 * Generic JSON-document storage abstraction for integration-service config/audit
 * records (Step 3 S157, DECISION-051): one Postgres table (`integration_docs`)
 * shared across many "kinds" instead of a table per store. No repo injected
 * means dev/test (MemoryDocRepo); production passes the Prisma repo.
 */
export interface DocRepo<T extends { id: string; tenantId: string }> {
  /** Newest first. `parentId` filters to docs saved under that parent (e.g. export runs under a schedule). */
  list(tenantId: string, parentId?: string): Promise<T[]>;
  /** null if not found or owned by another tenant. */
  get(id: string, tenantId: string): Promise<T | null>;
  /** Upsert by id. */
  save(row: T, parentId?: string | null): Promise<T>;
  delete(id: string, tenantId: string): Promise<boolean>;
  /** Deletes every doc of this kind under `parentId` for the tenant. Returns rows deleted. */
  deleteByParent(tenantId: string, parentId: string): Promise<number>;
}

interface StoredDoc<T> {
  row: T;
  parentId: string | null;
  seq: number;
}

/**
 * In-memory repo — dev/test backend only. Production passes the Prisma repo (Step 3 D3).
 * Keyed by id alone here because each repo instance is one kind; production keys rows by
 * (kind, id) since the table is shared across kinds.
 */
export class MemoryDocRepo<T extends { id: string; tenantId: string }> implements DocRepo<T> {
  private docs = new Map<string, StoredDoc<T>>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private seq = 0;

  async list(tenantId: string, parentId?: string): Promise<T[]> {
    const items = Array.from(this.docs.values())
      .filter((d) => d.row.tenantId === tenantId && (parentId === undefined || d.parentId === parentId))
      .sort((a, b) => b.seq - a.seq);
    return items.map((d) => structuredClone(d.row));
  }

  async get(id: string, tenantId: string): Promise<T | null> {
    const d = this.docs.get(id);
    if (!d || d.row.tenantId !== tenantId) return null;
    return structuredClone(d.row);
  }

  async save(row: T, parentId: string | null = null): Promise<T> {
    this.docs.set(row.id, { row: structuredClone(row), parentId, seq: this.seq++ });
    return structuredClone(row);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const d = this.docs.get(id);
    if (!d || d.row.tenantId !== tenantId) return false;
    this.docs.delete(id);
    return true;
  }

  async deleteByParent(tenantId: string, parentId: string): Promise<number> {
    let count = 0;
    for (const [id, d] of this.docs) {
      if (d.row.tenantId === tenantId && d.parentId === parentId) {
        this.docs.delete(id);
        count++;
      }
    }
    return count;
  }
}
