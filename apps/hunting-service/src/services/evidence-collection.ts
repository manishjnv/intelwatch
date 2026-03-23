import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession, EntityType } from '../schemas/hunting.js';

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

/**
 * #9 Evidence Collection — attach IOCs, articles, enrichment results,
 * graph snapshots, and notes as evidence items to active hunts.
 *
 * Evidence can be linked to hypotheses via the hypothesis engine.
 * Supports filtering, tagging, and summary statistics.
 */
export class EvidenceCollection {
  /** huntId → evidenceId → EvidenceItem */
  private readonly evidence = new Map<string, Map<string, EvidenceItem>>();
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  /** Add evidence to a hunt. */
  add(
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
  ): EvidenceItem {
    this.requireOpenHunt(tenantId, huntId);

    const item: EvidenceItem = {
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
    };

    this.getHuntEvidence(huntId).set(item.id, item);
    return item;
  }

  /** Get a single evidence item. */
  get(tenantId: string, huntId: string, evidenceId: string): EvidenceItem {
    this.requireHunt(tenantId, huntId);
    const item = this.getHuntEvidence(huntId).get(evidenceId);
    if (!item) {
      throw new AppError(404, `Evidence ${evidenceId} not found`, 'EVIDENCE_NOT_FOUND');
    }
    return item;
  }

  /** List all evidence for a hunt with optional type filter. */
  list(
    tenantId: string,
    huntId: string,
    typeFilter?: EvidenceType,
    page: number = 1,
    limit: number = 50,
  ): { data: EvidenceItem[]; total: number } {
    this.requireHunt(tenantId, huntId);
    let items = Array.from(this.getHuntEvidence(huntId).values());

    if (typeFilter) {
      items = items.filter((i) => i.type === typeFilter);
    }

    items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    const total = items.length;
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit), total };
  }

  /** Delete evidence from a hunt. */
  delete(tenantId: string, huntId: string, evidenceId: string): void {
    this.requireHunt(tenantId, huntId);
    const map = this.getHuntEvidence(huntId);
    if (!map.has(evidenceId)) {
      throw new AppError(404, `Evidence ${evidenceId} not found`, 'EVIDENCE_NOT_FOUND');
    }
    map.delete(evidenceId);
  }

  /** Get evidence summary for a hunt. */
  getSummary(tenantId: string, huntId: string): EvidenceSummary {
    this.requireHunt(tenantId, huntId);
    const items = Array.from(this.getHuntEvidence(huntId).values());

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
  search(tenantId: string, huntId: string, query: string): EvidenceItem[] {
    this.requireHunt(tenantId, huntId);
    const lowerQuery = query.toLowerCase();
    return Array.from(this.getHuntEvidence(huntId).values())
      .filter(
        (i) =>
          i.title.toLowerCase().includes(lowerQuery) ||
          i.description.toLowerCase().includes(lowerQuery) ||
          i.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
      );
  }

  private getHuntEvidence(huntId: string): Map<string, EvidenceItem> {
    let map = this.evidence.get(huntId);
    if (!map) {
      map = new Map();
      this.evidence.set(huntId, map);
    }
    return map;
  }

  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }

  private requireOpenHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.requireHunt(tenantId, huntId);
    if (session.status === 'archived' || session.status === 'completed') {
      throw new AppError(400, 'Cannot add evidence to a closed hunt', 'HUNT_CLOSED');
    }
    return session;
  }
}
