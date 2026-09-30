import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession } from '../schemas/hunting.js';
import type { DocRepo } from '../doc-repo.js';
import { MemoryDocRepo } from '../doc-repo.js';

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

/** Comments carry tenantId in storage only — never in the response shape. */
export type CommentDoc = HuntComment & { tenantId: string };
/** Shares carry a synthetic id + tenantId in storage only, dedupe key is (huntId, sharedWith). */
export type ShareDoc = ShareEntry & { id: string; tenantId: string };

/** Strips the storage-only id/tenantId fields before returning a ShareDoc to a caller. */
function toShareEntry(doc: ShareDoc): ShareEntry {
  return {
    huntId: doc.huntId,
    sharedWith: doc.sharedWith,
    sharedBy: doc.sharedBy,
    permission: doc.permission,
    sharedAt: doc.sharedAt,
  };
}

/**
 * #10 Hunt Collaboration — share hunts, comment threads, assignment handoff.
 *
 * Supports threaded comments (parent/child), sharing with view/edit permissions,
 * and hunt assignment transfer between analysts.
 */
export class Collaboration {
  private readonly store: HuntingStore;
  private readonly commentsRepo: DocRepo<CommentDoc>;
  private readonly sharesRepo: DocRepo<ShareDoc>;

  constructor(
    store: HuntingStore,
    repos?: { comments?: DocRepo<CommentDoc>; shares?: DocRepo<ShareDoc> },
  ) {
    this.store = store;
    this.commentsRepo = repos?.comments ?? new MemoryDocRepo();
    this.sharesRepo = repos?.shares ?? new MemoryDocRepo();
    store.registerCascadeRepo({
      deleteByParent: async (tenantId, huntId) => {
        const a = await this.commentsRepo.deleteByParent(tenantId, huntId);
        const b = await this.sharesRepo.deleteByParent(tenantId, huntId);
        return a + b;
      },
    });
  }

  // ─── Comments ─────────────────────────────────────────────

  /** Add a comment to a hunt (supports threading via parentId). */
  async addComment(
    tenantId: string,
    huntId: string,
    userId: string,
    content: string,
    parentId?: string,
  ): Promise<HuntComment> {
    await this.requireHunt(tenantId, huntId);

    // Validate parent exists if specified
    if (parentId) {
      const parent = await this.commentsRepo.get(parentId, tenantId);
      if (!parent || parent.huntId !== huntId) {
        throw new AppError(404, `Parent comment ${parentId} not found`, 'COMMENT_NOT_FOUND');
      }
    }

    const now = new Date().toISOString();
    const comment: CommentDoc = {
      id: randomUUID(),
      huntId,
      userId,
      content,
      parentId,
      createdAt: now,
      updatedAt: now,
      edited: false,
      tenantId,
    };

    await this.commentsRepo.save(comment, huntId);
    return comment;
  }

  /** Edit a comment (only by author). */
  async editComment(
    tenantId: string,
    huntId: string,
    commentId: string,
    userId: string,
    newContent: string,
  ): Promise<HuntComment> {
    await this.requireHunt(tenantId, huntId);
    const comment = await this.commentsRepo.get(commentId, tenantId);
    if (!comment || comment.huntId !== huntId) {
      throw new AppError(404, `Comment ${commentId} not found`, 'COMMENT_NOT_FOUND');
    }
    if (comment.userId !== userId) {
      throw new AppError(403, 'Only the author can edit this comment', 'FORBIDDEN');
    }
    comment.content = newContent;
    comment.updatedAt = new Date().toISOString();
    comment.edited = true;
    await this.commentsRepo.save(comment, huntId);
    return comment;
  }

  /** Delete a comment (only by author). */
  async deleteComment(
    tenantId: string,
    huntId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    await this.requireHunt(tenantId, huntId);
    const comment = await this.commentsRepo.get(commentId, tenantId);
    if (!comment || comment.huntId !== huntId) {
      throw new AppError(404, `Comment ${commentId} not found`, 'COMMENT_NOT_FOUND');
    }
    if (comment.userId !== userId) {
      throw new AppError(403, 'Only the author can delete this comment', 'FORBIDDEN');
    }
    await this.commentsRepo.delete(commentId, tenantId);
  }

  /** List comments for a hunt (chronological, with thread structure). */
  async listComments(tenantId: string, huntId: string): Promise<HuntComment[]> {
    await this.requireHunt(tenantId, huntId);
    // repo.list() is newest-first (insertion order reversed); reverse it back to insertion
    // order before the stable sort so two comments created in the same millisecond keep
    // their creation order instead of being flipped.
    const all = [...(await this.commentsRepo.list(tenantId, huntId))].reverse();
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Get threaded comments (top-level with nested replies). */
  async getThreadedComments(tenantId: string, huntId: string): Promise<Array<{
    comment: HuntComment;
    replies: HuntComment[];
  }>> {
    const all = await this.listComments(tenantId, huntId);
    const topLevel = all.filter((c) => !c.parentId);
    return topLevel.map((comment) => ({
      comment,
      replies: all.filter((c) => c.parentId === comment.id),
    }));
  }

  // ─── Sharing ──────────────────────────────────────────────

  /** Share a hunt with another user. Re-sharing with the same user updates the existing entry. */
  async share(
    tenantId: string,
    huntId: string,
    sharedBy: string,
    sharedWith: string,
    permission: 'view' | 'edit' = 'view',
  ): Promise<ShareEntry> {
    await this.requireHunt(tenantId, huntId);

    if (sharedBy === sharedWith) {
      throw new AppError(400, 'Cannot share a hunt with yourself', 'INVALID_SHARE');
    }

    const existing = await this.findShare(tenantId, huntId, sharedWith);
    const entry: ShareDoc = {
      id: existing?.id ?? randomUUID(),
      huntId,
      sharedWith,
      sharedBy,
      permission,
      sharedAt: new Date().toISOString(),
      tenantId,
    };

    await this.sharesRepo.save(entry, huntId);
    return toShareEntry(entry);
  }

  /** Revoke sharing for a user. */
  async unshare(tenantId: string, huntId: string, userId: string): Promise<void> {
    await this.requireHunt(tenantId, huntId);
    const existing = await this.findShare(tenantId, huntId, userId);
    if (existing) {
      await this.sharesRepo.delete(existing.id, tenantId);
    }
  }

  /** List all share entries for a hunt. */
  async listShares(tenantId: string, huntId: string): Promise<ShareEntry[]> {
    await this.requireHunt(tenantId, huntId);
    const all = await this.sharesRepo.list(tenantId, huntId);
    return all.map(toShareEntry);
  }

  /** Check if a user has access to a hunt (owner or shared). */
  async hasAccess(tenantId: string, huntId: string, userId: string): Promise<boolean> {
    const session = await this.store.getSession(tenantId, huntId);
    if (!session) return false;
    if (session.assignedTo === userId || session.createdBy === userId) return true;
    return !!(await this.findShare(tenantId, huntId, userId));
  }

  // ─── Assignment ───────────────────────────────────────────

  /** Transfer hunt assignment to another user. */
  async reassign(
    tenantId: string,
    huntId: string,
    newAssignee: string,
  ): Promise<HuntSession> {
    const session = await this.requireHunt(tenantId, huntId);
    session.assignedTo = newAssignee;
    session.updatedAt = new Date().toISOString();
    await this.store.setSession(tenantId, session);
    return session;
  }

  // ─── Stats ────────────────────────────────────────────────

  /** Get collaboration statistics for a hunt. */
  async getStats(tenantId: string, huntId: string): Promise<CollaborationStats> {
    await this.requireHunt(tenantId, huntId);
    const comments = await this.commentsRepo.list(tenantId, huntId);
    const shares = await this.sharesRepo.list(tenantId, huntId);

    const uniqueCommenters = new Set(comments.map((c) => c.userId));
    const lastComment = [...comments].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];

    return {
      totalComments: comments.length,
      uniqueCommenters: uniqueCommenters.size,
      sharedWith: shares.length,
      lastActivity: lastComment?.createdAt,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async findShare(tenantId: string, huntId: string, sharedWith: string): Promise<ShareDoc | undefined> {
    const all = await this.sharesRepo.list(tenantId, huntId);
    return all.find((s) => s.sharedWith === sharedWith);
  }

  private async requireHunt(tenantId: string, huntId: string): Promise<HuntSession> {
    const session = await this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
