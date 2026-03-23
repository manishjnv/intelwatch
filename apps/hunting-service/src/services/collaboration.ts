import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession } from '../schemas/hunting.js';

export interface HuntComment {
  id: string;
  huntId: string;
  userId: string;
  content: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
}

export interface ShareEntry {
  huntId: string;
  sharedWith: string;
  sharedBy: string;
  permission: 'view' | 'edit';
  sharedAt: string;
}

export interface CollaborationStats {
  totalComments: number;
  uniqueCommenters: number;
  sharedWith: number;
  lastActivity?: string;
}

/**
 * #10 Hunt Collaboration — share hunts, comment threads, assignment handoff.
 *
 * Supports threaded comments (parent/child), sharing with view/edit permissions,
 * and hunt assignment transfer between analysts.
 */
export class Collaboration {
  /** huntId → commentId → HuntComment */
  private readonly comments = new Map<string, Map<string, HuntComment>>();
  /** huntId → userId → ShareEntry */
  private readonly shares = new Map<string, Map<string, ShareEntry>>();
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  // ─── Comments ─────────────────────────────────────────────

  /** Add a comment to a hunt (supports threading via parentId). */
  addComment(
    tenantId: string,
    huntId: string,
    userId: string,
    content: string,
    parentId?: string,
  ): HuntComment {
    this.requireHunt(tenantId, huntId);

    // Validate parent exists if specified
    if (parentId) {
      const parent = this.getHuntComments(huntId).get(parentId);
      if (!parent) {
        throw new AppError(404, `Parent comment ${parentId} not found`, 'COMMENT_NOT_FOUND');
      }
    }

    const now = new Date().toISOString();
    const comment: HuntComment = {
      id: randomUUID(),
      huntId,
      userId,
      content,
      parentId,
      createdAt: now,
      updatedAt: now,
      edited: false,
    };

    this.getHuntComments(huntId).set(comment.id, comment);
    return comment;
  }

  /** Edit a comment (only by author). */
  editComment(
    tenantId: string,
    huntId: string,
    commentId: string,
    userId: string,
    newContent: string,
  ): HuntComment {
    this.requireHunt(tenantId, huntId);
    const comment = this.getHuntComments(huntId).get(commentId);
    if (!comment) {
      throw new AppError(404, `Comment ${commentId} not found`, 'COMMENT_NOT_FOUND');
    }
    if (comment.userId !== userId) {
      throw new AppError(403, 'Only the author can edit this comment', 'FORBIDDEN');
    }
    comment.content = newContent;
    comment.updatedAt = new Date().toISOString();
    comment.edited = true;
    return comment;
  }

  /** Delete a comment (only by author). */
  deleteComment(
    tenantId: string,
    huntId: string,
    commentId: string,
    userId: string,
  ): void {
    this.requireHunt(tenantId, huntId);
    const map = this.getHuntComments(huntId);
    const comment = map.get(commentId);
    if (!comment) {
      throw new AppError(404, `Comment ${commentId} not found`, 'COMMENT_NOT_FOUND');
    }
    if (comment.userId !== userId) {
      throw new AppError(403, 'Only the author can delete this comment', 'FORBIDDEN');
    }
    map.delete(commentId);
  }

  /** List comments for a hunt (chronological, with thread structure). */
  listComments(tenantId: string, huntId: string): HuntComment[] {
    this.requireHunt(tenantId, huntId);
    return Array.from(this.getHuntComments(huntId).values())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Get threaded comments (top-level with nested replies). */
  getThreadedComments(tenantId: string, huntId: string): Array<{
    comment: HuntComment;
    replies: HuntComment[];
  }> {
    const all = this.listComments(tenantId, huntId);
    const topLevel = all.filter((c) => !c.parentId);
    return topLevel.map((comment) => ({
      comment,
      replies: all.filter((c) => c.parentId === comment.id),
    }));
  }

  // ─── Sharing ──────────────────────────────────────────────

  /** Share a hunt with another user. */
  share(
    tenantId: string,
    huntId: string,
    sharedBy: string,
    sharedWith: string,
    permission: 'view' | 'edit' = 'view',
  ): ShareEntry {
    this.requireHunt(tenantId, huntId);

    if (sharedBy === sharedWith) {
      throw new AppError(400, 'Cannot share a hunt with yourself', 'INVALID_SHARE');
    }

    const entry: ShareEntry = {
      huntId,
      sharedWith,
      sharedBy,
      permission,
      sharedAt: new Date().toISOString(),
    };

    this.getHuntShares(huntId).set(sharedWith, entry);
    return entry;
  }

  /** Revoke sharing for a user. */
  unshare(tenantId: string, huntId: string, userId: string): void {
    this.requireHunt(tenantId, huntId);
    this.getHuntShares(huntId).delete(userId);
  }

  /** List all share entries for a hunt. */
  listShares(tenantId: string, huntId: string): ShareEntry[] {
    this.requireHunt(tenantId, huntId);
    return Array.from(this.getHuntShares(huntId).values());
  }

  /** Check if a user has access to a hunt (owner or shared). */
  hasAccess(tenantId: string, huntId: string, userId: string): boolean {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) return false;
    if (session.assignedTo === userId || session.createdBy === userId) return true;
    return this.getHuntShares(huntId).has(userId);
  }

  // ─── Assignment ───────────────────────────────────────────

  /** Transfer hunt assignment to another user. */
  reassign(
    tenantId: string,
    huntId: string,
    newAssignee: string,
  ): HuntSession {
    const session = this.requireHunt(tenantId, huntId);
    session.assignedTo = newAssignee;
    session.updatedAt = new Date().toISOString();
    this.store.setSession(tenantId, session);
    return session;
  }

  // ─── Stats ────────────────────────────────────────────────

  /** Get collaboration statistics for a hunt. */
  getStats(tenantId: string, huntId: string): CollaborationStats {
    this.requireHunt(tenantId, huntId);
    const comments = Array.from(this.getHuntComments(huntId).values());
    const shares = this.getHuntShares(huntId);

    const uniqueCommenters = new Set(comments.map((c) => c.userId));
    const lastComment = comments.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];

    return {
      totalComments: comments.length,
      uniqueCommenters: uniqueCommenters.size,
      sharedWith: shares.size,
      lastActivity: lastComment?.createdAt,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────

  private getHuntComments(huntId: string): Map<string, HuntComment> {
    let map = this.comments.get(huntId);
    if (!map) {
      map = new Map();
      this.comments.set(huntId, map);
    }
    return map;
  }

  private getHuntShares(huntId: string): Map<string, ShareEntry> {
    let map = this.shares.get(huntId);
    if (!map) {
      map = new Map();
      this.shares.set(huntId, map);
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
}
