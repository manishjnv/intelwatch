import { describe, it, expect, beforeEach } from 'vitest';
import { Collaboration } from '../src/services/collaboration.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #10 Collaboration', () => {
  let store: HuntingStore;
  let collab: Collaboration;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const huntId = 'hunt-1';

  beforeEach(() => {
    store = new HuntingStore();
    collab = new Collaboration(store);
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: userId, createdBy: userId,
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
  });

  // ─── Comments ─────────────────────────────────────────

  it('10.1. adds a comment to a hunt', () => {
    const comment = collab.addComment(tenantId, huntId, userId, 'Found suspicious activity');
    expect(comment.content).toBe('Found suspicious activity');
    expect(comment.userId).toBe(userId);
    expect(comment.edited).toBe(false);
  });

  it('10.2. adds threaded reply', () => {
    const parent = collab.addComment(tenantId, huntId, userId, 'Parent comment');
    const reply = collab.addComment(tenantId, huntId, 'user-2', 'Reply', parent.id);
    expect(reply.parentId).toBe(parent.id);
  });

  it('10.3. rejects reply to non-existent parent', () => {
    expect(() => collab.addComment(tenantId, huntId, userId, 'Reply', 'bad-parent'))
      .toThrow('not found');
  });

  it('10.4. edits comment by author', () => {
    const comment = collab.addComment(tenantId, huntId, userId, 'Original');
    const edited = collab.editComment(tenantId, huntId, comment.id, userId, 'Edited content');
    expect(edited.content).toBe('Edited content');
    expect(edited.edited).toBe(true);
  });

  it('10.5. rejects edit by non-author', () => {
    const comment = collab.addComment(tenantId, huntId, userId, 'Original');
    expect(() => collab.editComment(tenantId, huntId, comment.id, 'user-2', 'Hacked'))
      .toThrow('author');
  });

  it('10.6. deletes comment by author', () => {
    const comment = collab.addComment(tenantId, huntId, userId, 'Delete me');
    collab.deleteComment(tenantId, huntId, comment.id, userId);
    const comments = collab.listComments(tenantId, huntId);
    expect(comments).toHaveLength(0);
  });

  it('10.7. rejects delete by non-author', () => {
    const comment = collab.addComment(tenantId, huntId, userId, 'Keep me');
    expect(() => collab.deleteComment(tenantId, huntId, comment.id, 'user-2'))
      .toThrow('author');
  });

  it('10.8. lists comments chronologically', () => {
    collab.addComment(tenantId, huntId, userId, 'First');
    collab.addComment(tenantId, huntId, userId, 'Second');
    const comments = collab.listComments(tenantId, huntId);
    expect(comments).toHaveLength(2);
    expect(comments[0]!.content).toBe('First');
  });

  it('10.9. returns threaded comments structure', () => {
    const parent = collab.addComment(tenantId, huntId, userId, 'Question');
    collab.addComment(tenantId, huntId, 'user-2', 'Answer', parent.id);
    collab.addComment(tenantId, huntId, userId, 'Another top-level');

    const threaded = collab.getThreadedComments(tenantId, huntId);
    expect(threaded).toHaveLength(2); // 2 top-level
    const parentThread = threaded.find((t) => t.comment.id === parent.id);
    expect(parentThread!.replies).toHaveLength(1);
  });

  // ─── Sharing ──────────────────────────────────────────

  it('10.10. shares a hunt with another user', () => {
    const entry = collab.share(tenantId, huntId, userId, 'user-2', 'edit');
    expect(entry.sharedWith).toBe('user-2');
    expect(entry.permission).toBe('edit');
  });

  it('10.11. rejects sharing with self', () => {
    expect(() => collab.share(tenantId, huntId, userId, userId))
      .toThrow('yourself');
  });

  it('10.12. updates permission on re-share', () => {
    collab.share(tenantId, huntId, userId, 'user-2', 'view');
    collab.share(tenantId, huntId, userId, 'user-2', 'edit');
    const shares = collab.listShares(tenantId, huntId);
    expect(shares).toHaveLength(1);
    expect(shares[0]!.permission).toBe('edit');
  });

  it('10.13. revokes share', () => {
    collab.share(tenantId, huntId, userId, 'user-2');
    collab.unshare(tenantId, huntId, 'user-2');
    const shares = collab.listShares(tenantId, huntId);
    expect(shares).toHaveLength(0);
  });

  it('10.14. checks access for owner', () => {
    expect(collab.hasAccess(tenantId, huntId, userId)).toBe(true);
  });

  it('10.15. checks access for shared user', () => {
    collab.share(tenantId, huntId, userId, 'user-2');
    expect(collab.hasAccess(tenantId, huntId, 'user-2')).toBe(true);
  });

  it('10.16. denies access for unshared user', () => {
    expect(collab.hasAccess(tenantId, huntId, 'user-99')).toBe(false);
  });

  // ─── Assignment ───────────────────────────────────────

  it('10.17. reassigns hunt to new user', () => {
    const session = collab.reassign(tenantId, huntId, 'user-2');
    expect(session.assignedTo).toBe('user-2');
  });

  // ─── Stats ────────────────────────────────────────────

  it('10.18. returns collaboration stats', () => {
    collab.addComment(tenantId, huntId, userId, 'Comment 1');
    collab.addComment(tenantId, huntId, 'user-2', 'Comment 2');
    collab.share(tenantId, huntId, userId, 'user-3');

    const stats = collab.getStats(tenantId, huntId);
    expect(stats.totalComments).toBe(2);
    expect(stats.uniqueCommenters).toBe(2);
    expect(stats.sharedWith).toBe(1);
    expect(stats.lastActivity).toBeDefined();
  });

  it('10.19. throws 404 for comments on non-existent hunt', () => {
    expect(() => collab.addComment(tenantId, 'nope', userId, 'Test'))
      .toThrow('not found');
  });
});
