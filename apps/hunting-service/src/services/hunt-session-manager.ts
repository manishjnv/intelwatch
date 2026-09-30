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
 *
 * Every timeline event is pushed onto the in-memory `session` object and saved
 * exactly once at the end of each method (Step 3 S159 fix) — pre-migration this
 * relied on `store.getSession` returning the same live Map object so a later,
 * separate fetch-and-push inside a private helper still landed on disk; the
 * doc-repo backing the store now returns clones, so a push that isn't part of
 * the final `setSession` call would silently be lost.
 */
export class HuntSessionManager {
  private readonly store: HuntingStore;
  private readonly config: HuntSessionManagerConfig;

  constructor(store: HuntingStore, config: HuntSessionManagerConfig) {
    this.store = store;
    this.config = config;
  }

  /** Create a new hunt session. Optionally initializes from a template. */
  async create(
    tenantId: string,
    userId: string,
    input: {
      title: string;
      hypothesis: string;
      severity?: HuntSeverity;
      tags?: string[];
    },
    template?: HuntTemplate,
  ): Promise<HuntSession> {
    const activeCount = await this.store.countActiveSessions(tenantId);
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

    this.pushTimelineEvent(session, userId, 'status_changed', 'Hunt created with status: draft');
    await this.store.setSession(tenantId, session);

    return session;
  }

  /** Get a session by ID. Throws 404 if not found. */
  async get(tenantId: string, huntId: string): Promise<HuntSession> {
    const session = await this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }

  /** Update mutable fields on a hunt session. */
  async update(
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
  ): Promise<HuntSession> {
    const session = await this.get(tenantId, huntId);

    if (session.status === 'archived') {
      throw new AppError(400, 'Cannot update an archived hunt', 'HUNT_ARCHIVED');
    }

    if (updates.title !== undefined) session.title = updates.title;
    if (updates.hypothesis !== undefined) session.hypothesis = updates.hypothesis;
    if (updates.severity !== undefined) session.severity = updates.severity;
    if (updates.tags !== undefined) session.tags = updates.tags;
    if (updates.findings !== undefined) {
      session.findings = updates.findings;
      this.pushTimelineEvent(session, userId, 'finding_added', 'Findings updated');
    }

    session.updatedAt = new Date().toISOString();
    await this.store.setSession(tenantId, session);
    return session;
  }

  /** Transition hunt to a new status. Enforces state machine. */
  async changeStatus(
    tenantId: string,
    huntId: string,
    userId: string,
    newStatus: HuntStatus,
  ): Promise<HuntSession> {
    const session = await this.get(tenantId, huntId);
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

    this.pushTimelineEvent(
      session, userId, 'status_changed',
      `Status changed: ${oldStatus} → ${newStatus}`,
    );
    await this.store.setSession(tenantId, session);

    return session;
  }

  /** Add an entity to a hunt session. */
  async addEntity(
    tenantId: string,
    huntId: string,
    userId: string,
    input: { type: EntityType; value: string; notes?: string },
    pivotDepth: number = 0,
    sourceEntityId?: string,
  ): Promise<HuntEntity> {
    const session = await this.get(tenantId, huntId);

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

    this.pushTimelineEvent(
      session, userId, 'entity_added',
      `Added ${input.type}: ${input.value}`,
      { entityId: entity.id, pivotDepth },
    );
    await this.store.setSession(tenantId, session);

    return entity;
  }

  /** Remove an entity from a hunt session. */
  async removeEntity(tenantId: string, huntId: string, userId: string, entityId: string): Promise<void> {
    const session = await this.get(tenantId, huntId);
    const idx = session.entities.findIndex((e) => e.id === entityId);
    if (idx === -1) {
      throw new AppError(404, 'Entity not found in hunt', 'ENTITY_NOT_FOUND');
    }

    const removed = session.entities.splice(idx, 1)[0]!;
    session.updatedAt = new Date().toISOString();

    this.pushTimelineEvent(
      session, userId, 'entity_removed',
      `Removed ${removed.type}: ${removed.value}`,
    );
    await this.store.setSession(tenantId, session);
  }

  /** List sessions with pagination and optional status filter. */
  async list(
    tenantId: string,
    page: number,
    limit: number,
    status?: string,
  ): Promise<{ data: HuntSession[]; total: number }> {
    return this.store.listSessions(tenantId, page, limit, status);
  }

  /** Record a query execution in the hunt's history. */
  async recordQuery(
    tenantId: string,
    huntId: string,
    query: HuntQuery,
    name: string,
    resultCount: number,
  ): Promise<SavedQuery> {
    const session = await this.get(tenantId, huntId);
    const savedQuery: SavedQuery = {
      id: randomUUID(),
      query,
      name,
      resultCount,
      executedAt: new Date().toISOString(),
    };

    session.queryHistory.push(savedQuery);
    session.updatedAt = new Date().toISOString();
    await this.store.setSession(tenantId, session);
    return savedQuery;
  }

  /** Push a timeline event onto an already-fetched session object. Caller saves once. */
  private pushTimelineEvent(
    session: HuntSession,
    userId: string,
    type: TimelineEvent['type'],
    description: string,
    metadata?: Record<string, unknown>,
  ): void {
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
  async getStats(tenantId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    avgEntitiesPerHunt: number;
  }> {
    const sessions = await this.store.listAllSessions(tenantId);
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
  async cleanupExpired(tenantId: string): Promise<number> {
    const cutoff = Date.now() - this.config.sessionTimeoutHours * 3600 * 1000;
    const sessions = await this.store.listAllSessions(tenantId);
    let archived = 0;

    for (const session of sessions) {
      if (
        (session.status === 'draft' || session.status === 'paused') &&
        new Date(session.updatedAt).getTime() < cutoff
      ) {
        session.status = 'archived';
        session.updatedAt = new Date().toISOString();
        await this.store.setSession(tenantId, session);
        archived++;
      }
    }

    return archived;
  }
}
