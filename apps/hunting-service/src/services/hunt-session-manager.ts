import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type {
  HuntSession,
  HuntStatus,
  HuntSeverity,
  HuntEntity,
  TimelineEvent,
  SavedQuery,
  HuntQuery,
  EntityType,
  HuntTemplate,
} from '../schemas/hunting.js';

export interface HuntSessionManagerConfig {
  sessionTimeoutHours: number;
  maxActiveSessions: number;
}

/** Valid status transitions for the hunt lifecycle state machine. */
const VALID_TRANSITIONS: Record<HuntStatus, HuntStatus[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/**
 * #2 Hunt Session Manager — manages the full lifecycle of threat hunts.
 *
 * Operations: create, update, transition status, add/remove entities,
 * record timeline events, execute queries, and cleanup expired sessions.
 */
export class HuntSessionManager {
  private readonly store: HuntingStore;
  private readonly config: HuntSessionManagerConfig;

  constructor(store: HuntingStore, config: HuntSessionManagerConfig) {
    this.store = store;
    this.config = config;
  }

  /** Create a new hunt session. Optionally initializes from a template. */
  create(
    tenantId: string,
    userId: string,
    input: {
      title: string;
      hypothesis: string;
      severity?: HuntSeverity;
      tags?: string[];
    },
    template?: HuntTemplate,
  ): HuntSession {
    const activeCount = this.store.countActiveSessions(tenantId);
    if (activeCount >= this.config.maxActiveSessions) {
      throw new AppError(
        429,
        `Maximum active sessions (${this.config.maxActiveSessions}) reached`,
        'MAX_SESSIONS_REACHED',
      );
    }

    const now = new Date().toISOString();
    const session: HuntSession = {
      id: randomUUID(),
      tenantId,
      title: input.title,
      hypothesis: input.hypothesis,
      status: 'draft',
      severity: input.severity ?? 'medium',
      assignedTo: userId,
      createdBy: userId,
      entities: [],
      timeline: [],
      findings: '',
      tags: input.tags ?? [],
      queryHistory: [],
      correlationLeads: [],
      createdAt: now,
      updatedAt: now,
    };

    // Apply template defaults
    if (template) {
      session.tags = [...new Set([...session.tags, ...template.tags])];
    }

    this.store.setSession(tenantId, session);
    this.addTimelineEvent(tenantId, session.id, userId, 'status_changed', 'Hunt created with status: draft');

    return session;
  }

  /** Get a session by ID. Throws 404 if not found. */
  get(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }

  /** Update mutable fields on a hunt session. */
  update(
    tenantId: string,
    huntId: string,
    userId: string,
    updates: {
      title?: string;
      hypothesis?: string;
      severity?: HuntSeverity;
      findings?: string;
      tags?: string[];
    },
  ): HuntSession {
    const session = this.get(tenantId, huntId);

    if (session.status === 'archived') {
      throw new AppError(400, 'Cannot update an archived hunt', 'HUNT_ARCHIVED');
    }

    if (updates.title !== undefined) session.title = updates.title;
    if (updates.hypothesis !== undefined) session.hypothesis = updates.hypothesis;
    if (updates.severity !== undefined) session.severity = updates.severity;
    if (updates.tags !== undefined) session.tags = updates.tags;
    if (updates.findings !== undefined) {
      session.findings = updates.findings;
      this.addTimelineEvent(tenantId, huntId, userId, 'finding_added', 'Findings updated');
    }

    session.updatedAt = new Date().toISOString();
    this.store.setSession(tenantId, session);
    return session;
  }

  /** Transition hunt to a new status. Enforces state machine. */
  changeStatus(
    tenantId: string,
    huntId: string,
    userId: string,
    newStatus: HuntStatus,
  ): HuntSession {
    const session = this.get(tenantId, huntId);
    const allowed = VALID_TRANSITIONS[session.status];

    if (!allowed || !allowed.includes(newStatus)) {
      throw new AppError(
        400,
        `Cannot transition from ${session.status} to ${newStatus}`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const oldStatus = session.status;
    session.status = newStatus;
    session.updatedAt = new Date().toISOString();

    if (newStatus === 'completed') {
      session.completedAt = session.updatedAt;
    }

    this.store.setSession(tenantId, session);
    this.addTimelineEvent(
      tenantId, huntId, userId, 'status_changed',
      `Status changed: ${oldStatus} → ${newStatus}`,
    );

    return session;
  }

  /** Add an entity to a hunt session. */
  addEntity(
    tenantId: string,
    huntId: string,
    userId: string,
    input: { type: EntityType; value: string; notes?: string },
    pivotDepth: number = 0,
    sourceEntityId?: string,
  ): HuntEntity {
    const session = this.get(tenantId, huntId);

    if (session.status === 'archived' || session.status === 'completed') {
      throw new AppError(400, 'Cannot add entities to a completed/archived hunt', 'HUNT_CLOSED');
    }

    // Deduplicate
    const existing = session.entities.find(
      (e) => e.type === input.type && e.value === input.value,
    );
    if (existing) {
      return existing;
    }

    const entity: HuntEntity = {
      id: randomUUID(),
      type: input.type,
      value: input.value,
      addedAt: new Date().toISOString(),
      addedBy: userId,
      notes: input.notes,
      pivotDepth,
      sourceEntityId,
    };

    session.entities.push(entity);
    session.updatedAt = new Date().toISOString();
    this.store.setSession(tenantId, session);

    this.addTimelineEvent(
      tenantId, huntId, userId, 'entity_added',
      `Added ${input.type}: ${input.value}`,
      { entityId: entity.id, pivotDepth },
    );

    return entity;
  }

  /** Remove an entity from a hunt session. */
  removeEntity(tenantId: string, huntId: string, userId: string, entityId: string): void {
    const session = this.get(tenantId, huntId);
    const idx = session.entities.findIndex((e) => e.id === entityId);
    if (idx === -1) {
      throw new AppError(404, 'Entity not found in hunt', 'ENTITY_NOT_FOUND');
    }

    const removed = session.entities.splice(idx, 1)[0]!;
    session.updatedAt = new Date().toISOString();
    this.store.setSession(tenantId, session);

    this.addTimelineEvent(
      tenantId, huntId, userId, 'entity_removed',
      `Removed ${removed.type}: ${removed.value}`,
    );
  }

  /** List sessions with pagination and optional status filter. */
  list(
    tenantId: string,
    page: number,
    limit: number,
    status?: string,
  ): { data: HuntSession[]; total: number } {
    return this.store.listSessions(tenantId, page, limit, status);
  }

  /** Record a query execution in the hunt's history. */
  recordQuery(
    tenantId: string,
    huntId: string,
    query: HuntQuery,
    name: string,
    resultCount: number,
  ): SavedQuery {
    const session = this.get(tenantId, huntId);
    const savedQuery: SavedQuery = {
      id: randomUUID(),
      query,
      name,
      resultCount,
      executedAt: new Date().toISOString(),
    };

    session.queryHistory.push(savedQuery);
    session.updatedAt = new Date().toISOString();
    this.store.setSession(tenantId, session);
    return savedQuery;
  }

  /** Add a timeline event to a hunt. */
  private addTimelineEvent(
    tenantId: string,
    huntId: string,
    userId: string,
    type: TimelineEvent['type'],
    description: string,
    metadata?: Record<string, unknown>,
  ): void {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) return;

    session.timeline.push({
      id: randomUUID(),
      type,
      description,
      userId,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /** Get hunt statistics for a tenant. */
  getStats(tenantId: string): {
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    avgEntitiesPerHunt: number;
  } {
    const sessions = Array.from(this.store.getTenantSessions(tenantId).values());
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let totalEntities = 0;

    for (const s of sessions) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      bySeverity[s.severity] = (bySeverity[s.severity] ?? 0) + 1;
      totalEntities += s.entities.length;
    }

    return {
      total: sessions.length,
      byStatus,
      bySeverity,
      avgEntitiesPerHunt: sessions.length > 0 ? totalEntities / sessions.length : 0,
    };
  }

  /** Archive expired sessions (past timeout). */
  cleanupExpired(tenantId: string): number {
    const cutoff = Date.now() - this.config.sessionTimeoutHours * 3600 * 1000;
    const sessions = this.store.getTenantSessions(tenantId);
    let archived = 0;

    for (const session of sessions.values()) {
      if (
        (session.status === 'draft' || session.status === 'paused') &&
        new Date(session.updatedAt).getTime() < cutoff
      ) {
        session.status = 'archived';
        session.updatedAt = new Date().toISOString();
        archived++;
      }
    }

    return archived;
  }
}
