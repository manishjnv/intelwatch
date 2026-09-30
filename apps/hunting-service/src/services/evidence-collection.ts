import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession, EntityType } from '../schemas/hunting.js';
import type { DocRepo } from '../doc-repo.js';
import { MemoryDocRepo } from '../doc-repo.js';

export const EVIDENCE_TYPES = [
  'ioc', 'article', 'enrichment', 'graph_snapshot', 'correlation',
  'screenshot', 'log_entry', 'note', 'external_link',
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface EvidenceItem {
  id: string;
  huntId: string;
  type: EvidenceType;
  title: string;
  description: string;
  sourceUrl?: string;
  entityType?: EntityType;
  entityValue?: string;
  data: Record<string, unknown>;
  tags: string[];
  addedBy: string;
  addedAt: string;
}

export interface EvidenceSummary {
  totalItems: number;
  byType: Record<string, number>;
  uniqueEntities: number;
  recentItems: EvidenceItem[];
}

export type EvidenceDoc = EvidenceItem & { tenantId: string };

/**
 * #9 Evidence Collection — attach IOCs, articles, enrichment results,
 * graph snapshots, and notes as evidence items to active hunts.
 *
 * Evidence can be linked to hypotheses via the hypothesis engine.
 * Supports filtering, tagging, and summary statistics.
 */
export class EvidenceCollection {
  private readonly store: HuntingStore;
  private readonly repo: DocRepo<EvidenceDoc>;

  constructor(store: HuntingStore, repo: DocRepo<EvidenceDoc> = new MemoryDocRepo()) {
    this.store = store;
    this.repo = repo;
    store.registerCascadeRepo({ deleteByParent: (t, h) => this.repo.deleteByParent(t, h) });
  }

  /** Add evidence to a hunt. */
  async add(
    tenantId: string,
    huntId: string,
    userId: string,
    input: {
      type: EvidenceType;
      title: string;
      description: string;
      sourceUrl?: string;
      entityType?: EntityType;
      entityValue?: string;
      data?: Record<string, unknown>;
      tags?: string[];
    },
  ): Promise<EvidenceItem> {
    await this.requireOpenHunt(tenantId, huntId);

    const item: EvidenceDoc = {
      id: randomUUID(),
      huntId,
      type: input.type,
      title: input.title,
      description: input.description,
      sourceUrl: input.sourceUrl,
      entityType: input.entityType,
      entityValue: input.entityValue,
      data: input.data ?? {},
      tags: input.tags ?? [],
      addedBy: userId,
      addedAt: new Date().toISOString(),
      tenantId,
    };

    await this.repo.save(item, huntId);
    return item;
  }

  /** Get a single evidence item. */
  async get(tenantId: string, huntId: string, evidenceId: string): Promise<EvidenceItem> {
    await this.requireHunt(tenantId, huntId);
    const item = await this.repo.get(evidenceId, tenantId);
    if (!item || item.huntId !== huntId) {
      throw new AppError(404, `Evidence ${evidenceId} not found`, 'EVIDENCE_NOT_FOUND');
    }
    return item;
  }

  /** List all evidence for a hunt with optional type filter. */
  async list(
    tenantId: string,
    huntId: string,
    typeFilter?: EvidenceType,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: EvidenceItem[]; total: number }> {
    await this.requireHunt(tenantId, huntId);
    let items = await this.repo.list(tenantId, huntId);

    if (typeFilter) {
      items = items.filter((i) => i.type === typeFilter);
    }

    items = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    const total = items.length;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total };
  }

  /** Delete evidence from a hunt. */
  async delete(tenantId: string, huntId: string, evidenceId: string): Promise<void> {
    await this.requireHunt(tenantId, huntId);
    const item = await this.repo.get(evidenceId, tenantId);
    if (!item || item.huntId !== huntId) {
      throw new AppError(404, `Evidence ${evidenceId} not found`, 'EVIDENCE_NOT_FOUND');
    }
    await this.repo.delete(evidenceId, tenantId);
  }

  /** Get evidence summary for a hunt. */
  async getSummary(tenantId: string, huntId: string): Promise<EvidenceSummary> {
    await this.requireHunt(tenantId, huntId);
    const items = await this.repo.list(tenantId, huntId);

    const byType: Record<string, number> = {};
    const entities = new Set<string>();

    for (const item of items) {
      byType[item.type] = (byType[item.type] ?? 0) + 1;
      if (item.entityValue) {
        entities.add(`${item.entityType}:${item.entityValue}`);
      }
    }

    const recentItems = [...items]
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .slice(0, 5);

    return {
      totalItems: items.length,
      byType,
      uniqueEntities: entities.size,
      recentItems,
    };
  }

  /** Search evidence by title or description. */
  async search(tenantId: string, huntId: string, query: string): Promise<EvidenceItem[]> {
    await this.requireHunt(tenantId, huntId);
    const lowerQuery = query.toLowerCase();
    const items = await this.repo.list(tenantId, huntId);
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(lowerQuery) ||
        i.description.toLowerCase().includes(lowerQuery) ||
        i.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
    );
  }

  private async requireHunt(tenantId: string, huntId: string): Promise<HuntSession> {
    const session = await this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }

  private async requireOpenHunt(tenantId: string, huntId: string): Promise<HuntSession> {
    const session = await this.requireHunt(tenantId, huntId);
    if (session.status === 'archived' || session.status === 'completed') {
      throw new AppError(400, 'Cannot add evidence to a closed hunt', 'HUNT_CLOSED');
    }
    return session;
  }
}
