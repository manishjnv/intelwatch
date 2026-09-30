import { describe, it, expect, beforeEach } from 'vitest';
import { Collaboration } from '../src/services/collaboration.js';
import { HuntingStore } from '../src/schemas/store.js';

describe('Hunting Service — #10 Collaboration', () => {
  let store: HuntingStore;
  let collab: Collaboration;
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const huntId = 'hunt-1';

  beforeEach(async () => {
    store = new HuntingStore();
    collab = new Collaboration(store);
    const now = new Date().toISOString();
    await store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: userId, createdBy: userId,
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
  });

  // ─── Comments ─────────────────────────────────────────

  it('10.1. adds a comment to a hunt', async () => {
    const comment = await collab.addComment(tenantId, huntId, userId, 'Found suspicious activity');
    expect(comment.content).toBe('Found suspicious activity');
    expect(comment.userId).toBe(userId);
    expect(comment.edited).toBe(false);
  });

  it('10.2. adds threaded reply', async () => {
    const parent = await collab.addComment(tenantId, huntId, userId, 'Parent comment');
    const reply = await collab.addComment(tenantId, huntId, 'user-2', 'Reply', parent.id);
    expect(reply.parentId).toBe(parent.id);
  });

  it('10.3. rejects reply to non-existent parent', async () => {
    await expect(collab.addComment(tenantId, huntId, userId, 'Reply', 'bad-parent'))
      .rejects.toThrow('not found');
  });

  it('10.4. edits comment by author', async () => {
    const comment = await collab.addComment(tenantId, huntId, userId, 'Original');
    const edited = await collab.editComment(tenantId, huntId, comment.id, userId, 'Edited content');
    expect(edited.content).toBe('Edited content');
    expect(edited.edited).toBe(true);
  });

  it('10.5. rejects edit by non-author', async () => {
    const comment = await collab.addComment(tenantId, huntId, userId, 'Original');
    await expect(collab.editComment(tenantId, huntId, comment.id, 'user-2', 'Hacked'))
      .rejects.toThrow('author');
  });

  it('10.6. deletes comment by author', async () => {
    const comment = await collab.addComment(tenantId, huntId, userId, 'Delete me');
    await collab.deleteComment(tenantId, huntId, comment.id, userId);
    const comments = await collab.listComments(tenantId, huntId);
    expect(comments).toHaveLength(0);
  });

  it('10.7. rejects delete by non-author', async () => {
    const comment = await collab.addComment(tenantId, huntId, userId, 'Keep me');
    await expect(collab.deleteComment(tenantId, huntId, comment.id, 'user-2'))
      .rejects.toThrow('author');
  });

  it('10.8. lists comments chronologically', async () => {
    await collab.addComment(tenantId, huntId, userId, 'First');
    await collab.addComment(tenantId, huntId, userId, 'Second');
    const comments = await collab.listComments(tenantId, huntId);
    expect(comments).toHaveLength(2);
    expect(comments[0]!.content).toBe('First');
  });

  it('10.9. returns threaded comments structure', async () => {
    const parent = await collab.addComment(tenantId, huntId, userId, 'Question');
    await collab.addComment(tenantId, huntId, 'user-2', 'Answer', parent.id);
    await collab.addComment(tenantId, huntId, userId, 'Another top-level');

    const threaded = await collab.getThreadedComments(tenantId, huntId);
    expect(threaded).toHaveLength(2); // 2 top-level
    const parentThread = threaded.find((t) => t.comment.id === parent.id);
    expect(parentThread!.replies).toHaveLength(1);
  });

  // ─── Sharing ──────────────────────────────────────────

  it('10.10. shares a hunt with another user', async () => {
    const entry = await collab.share(tenantId, huntId, userId, 'user-2', 'edit');
    expect(entry.sharedWith).toBe('user-2');
    expect(entry.permission).toBe('edit');
  });

  it('10.11. rejects sharing with self', async () => {
    await expect(collab.share(tenantId, huntId, userId, userId))
      .rejects.toThrow('yourself');
  });

  it('10.12. updates permission on re-share', async () => {
    await collab.share(tenantId, huntId, userId, 'user-2', 'view');
    await collab.share(tenantId, huntId, userId, 'user-2', 'edit');
    const shares = await collab.listShares(tenantId, huntId);
    expect(shares).toHaveLength(1);
    expect(shares[0]!.permission).toBe('edit');
  });

  it('10.13. revokes share', async () => {
    await collab.share(tenantId, huntId, userId, 'user-2');
    await collab.unshare(tenantId, huntId, 'user-2');
    const shares = await collab.listShares(tenantId, huntId);
    expect(shares).toHaveLength(0);
  });

  it('10.14. checks access for owner', async () => {
    expect(await collab.hasAccess(tenantId, huntId, userId)).toBe(true);
  });

  it('10.15. checks access for shared user', async () => {
    await collab.share(tenantId, huntId, userId, 'user-2');
    expect(await collab.hasAccess(tenantId, huntId, 'user-2')).toBe(true);
  });

  it('10.16. denies access for unshared user', async () => {
    expect(await collab.hasAccess(tenantId, huntId, 'user-99')).toBe(false);
  });

  // ─── Assignment ───────────────────────────────────────

  it('10.17. reassigns hunt to new user', async () => {
    const session = await collab.reassign(tenantId, huntId, 'user-2');
    expect(session.assignedTo).toBe('user-2');
  });

  // ─── Stats ────────────────────────────────────────────

  it('10.18. returns collaboration stats', async () => {
    await collab.addComment(tenantId, huntId, userId, 'Comment 1');
    await collab.addComment(tenantId, huntId, 'user-2', 'Comment 2');
    await collab.share(tenantId, huntId, userId, 'user-3');

    const stats = await collab.getStats(tenantId, huntId);
    expect(stats.totalComments).toBe(2);
    expect(stats.uniqueCommenters).toBe(2);
    expect(stats.sharedWith).toBe(1);
    expect(stats.lastActivity).toBeDefined();
  });

  it('10.19. throws 404 for comments on non-existent hunt', async () => {
    await expect(collab.addComment(tenantId, 'nope', userId, 'Test'))
      .rejects.toThrow('not found');
  });
});
