import { AppError } from '@etip/shared-utils';
import { randomUUID } from 'crypto';
import type { SessionRecord } from '../schemas/user-management.js';

/** Session creation input. */
export interface CreateSessionInput {
  userId: string;
  tenantId: string;
  ip: string;
  userAgent: string;
  ttlMinutes?: number;
  isBreakGlass?: boolean;
}

/**
 * In-memory session manager.
 * Tracks active sessions per user with device info, supports revocation.
 */
export class SessionManager {
  private sessions = new Map<string, SessionRecord>();
  private defaultTtlMinutes: number;

  constructor(defaultTtlMinutes: number = 15) {
    this.defaultTtlMinutes = defaultTtlMinutes;
  }

  /** Create a new session. */
  create(input: CreateSessionInput): SessionRecord {
    const now = new Date();
    const ttl = input.ttlMinutes ?? this.defaultTtlMinutes;
    const session: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      tenantId: input.tenantId,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 60 * 1000).toISOString(),
      isBreakGlass: input.isBreakGlass ?? false,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Get a session by ID. Returns null if expired or not found. */
  get(sessionId: string): SessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (new Date(session.expiresAt) <= new Date()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  /** Touch session — update lastSeenAt. */
  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && new Date(session.expiresAt) > new Date()) {
      this.sessions.set(sessionId, { ...session, lastSeenAt: new Date().toISOString() });
    }
  }

  /** List active sessions for a user. */
  listByUser(userId: string, tenantId: string, page: number = 1, limit: number = 20): { data: SessionRecord[]; total: number } {
    const now = new Date();
    const active = Array.from(this.sessions.values())
      .filter((s) => s.userId === userId && s.tenantId === tenantId && new Date(s.expiresAt) > now);

    active.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    const total = active.length;
    const start = (page - 1) * limit;
    return { data: active.slice(start, start + limit), total };
  }

  /** Revoke a specific session. */
  revoke(sessionId: string, userId: string, tenantId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.tenantId !== tenantId) {
      throw new AppError(404, 'Session not found', 'SESSION_NOT_FOUND');
    }
    this.sessions.delete(sessionId);
  }

  /** Revoke all sessions for a user. Returns count of revoked sessions. */
  revokeAll(userId: string, tenantId: string): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.tenantId === tenantId) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Revoke all sessions for a user EXCEPT a specific session. */
  revokeOthers(userId: string, tenantId: string, keepSessionId: string): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.tenantId === tenantId && id !== keepSessionId) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Count active sessions for a user. */
  countActive(userId: string, tenantId: string): number {
    const now = new Date();
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.tenantId === tenantId && new Date(session.expiresAt) > now) {
        count++;
      }
    }
    return count;
  }

  /** Cleanup expired sessions (call periodically). */
  cleanup(): number {
    const now = new Date();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (new Date(session.expiresAt) <= now) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
