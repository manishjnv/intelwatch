import { describe, it, expect, beforeEach } from 'vitest';
import { HuntSessionManager } from '../src/services/hunt-session-manager.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession } from '../src/schemas/hunting.js';

describe('Hunting Service — #2 Hunt Session Manager', () => {
  let store: HuntingStore;
  let manager: HuntSessionManager;
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    store = new HuntingStore();
    manager = new HuntSessionManager(store, {
      sessionTimeoutHours: 72,
      maxActiveSessions: 5,
    });
  });

  function createHunt(title = 'Test Hunt'): Promise<HuntSession> {
    return manager.create(tenantId, userId, {
      title,
      hypothesis: 'Test hypothesis for investigation',
      severity: 'high',
      tags: ['apt', 'test'],
    });
  }

  // ─── Create ──────────────────────────────────────────────

  it('2.1. creates a hunt session with draft status', async () => {
    const hunt = await createHunt();
    expect(hunt.status).toBe('draft');
    expect(hunt.title).toBe('Test Hunt');
    expect(hunt.tenantId).toBe(tenantId);
    expect(hunt.createdBy).toBe(userId);
    expect(hunt.entities).toHaveLength(0);
  });

  it('2.2. generates unique IDs', async () => {
    const h1 = await createHunt('Hunt A');
    const h2 = await createHunt('Hunt B');
    expect(h1.id).not.toBe(h2.id);
  });

  it('2.3. records creation in timeline', async () => {
    const hunt = await createHunt();
    expect(hunt.timeline).toHaveLength(1);
    expect(hunt.timeline[0]!.type).toBe('status_changed');
    expect(hunt.timeline[0]!.description).toContain('draft');
  });

  it('2.4. enforces max active sessions', async () => {
    for (let i = 0; i < 5; i++) {
      await createHunt(`Hunt ${i}`);
    }
    await expect(createHunt('Hunt 6')).rejects.toThrow('Maximum active sessions');
  });

  // ─── Get ─────────────────────────────────────────────────

  it('2.5. gets a session by ID', async () => {
    const hunt = await createHunt();
    const fetched = await manager.get(tenantId, hunt.id);
    expect(fetched.id).toBe(hunt.id);
  });

  it('2.6. throws 404 for non-existent hunt', async () => {
    await expect(manager.get(tenantId, 'nonexistent')).rejects.toThrow('not found');
  });

  it('2.7. tenant isolation — different tenant cannot access', async () => {
    const hunt = await createHunt();
    await expect(manager.get('other-tenant', hunt.id)).rejects.toThrow('not found');
  });

  // ─── Update ──────────────────────────────────────────────

  it('2.8. updates title and hypothesis', async () => {
    const hunt = await createHunt();
    const updated = await manager.update(tenantId, hunt.id, userId, {
      title: 'Updated Title',
      hypothesis: 'Updated hypothesis',
    });
    expect(updated.title).toBe('Updated Title');
    expect(updated.hypothesis).toBe('Updated hypothesis');
  });

  it('2.9. records finding_added timeline event', async () => {
    const hunt = await createHunt();
    await manager.update(tenantId, hunt.id, userId, {
      findings: 'Found malicious activity',
    });
    const fetched = await manager.get(tenantId, hunt.id);
    const findingEvent = fetched.timeline.find((e) => e.type === 'finding_added');
    expect(findingEvent).toBeDefined();
  });

  it('2.10. rejects update on archived hunt', async () => {
    const hunt = await createHunt();
    await manager.changeStatus(tenantId, hunt.id, userId, 'active');
    await manager.changeStatus(tenantId, hunt.id, userId, 'archived');
    await expect(manager.update(tenantId, hunt.id, userId, { title: 'Nope' }))
      .rejects.toThrow('archived');
  });

  // ─── Status transitions ──────────────────────────────────

  it('2.11. transitions draft → active', async () => {
    const hunt = await createHunt();
    const updated = await manager.changeStatus(tenantId, hunt.id, userId, 'active');
    expect(updated.status).toBe('active');
  });

  it('2.12. transitions active → paused → active', async () => {
    const hunt = await createHunt();
    await manager.changeStatus(tenantId, hunt.id, userId, 'active');
    await manager.changeStatus(tenantId, hunt.id, userId, 'paused');
    const resumed = await manager.changeStatus(tenantId, hunt.id, userId, 'active');
    expect(resumed.status).toBe('active');
  });

  it('2.13. transitions active → completed sets completedAt', async () => {
    const hunt = await createHunt();
    await manager.changeStatus(tenantId, hunt.id, userId, 'active');
    const completed = await manager.changeStatus(tenantId, hunt.id, userId, 'completed');
    expect(completed.completedAt).toBeDefined();
  });

  it('2.14. rejects invalid transition (draft → completed)', async () => {
    const hunt = await createHunt();
    await expect(manager.changeStatus(tenantId, hunt.id, userId, 'completed'))
      .rejects.toThrow('Cannot transition');
  });

  it('2.15. rejects transition from archived', async () => {
    const hunt = await createHunt();
    await manager.changeStatus(tenantId, hunt.id, userId, 'archived');
    await expect(manager.changeStatus(tenantId, hunt.id, userId, 'active'))
      .rejects.toThrow('Cannot transition');
  });

  // ─── Entities ─────────────────────────────────────────────

  it('2.16. adds entity to hunt', async () => {
    const hunt = await createHunt();
    const entity = await manager.addEntity(tenantId, hunt.id, userId, {
      type: 'ip', value: '10.0.0.1',
    });
    expect(entity.type).toBe('ip');
    expect(entity.value).toBe('10.0.0.1');
    const fetched = await manager.get(tenantId, hunt.id);
    expect(fetched.entities).toHaveLength(1);
  });

  it('2.17. deduplicates entities by type+value', async () => {
    const hunt = await createHunt();
    await manager.addEntity(tenantId, hunt.id, userId, { type: 'ip', value: '10.0.0.1' });
    await manager.addEntity(tenantId, hunt.id, userId, { type: 'ip', value: '10.0.0.1' });
    const fetched = await manager.get(tenantId, hunt.id);
    expect(fetched.entities).toHaveLength(1);
  });

  it('2.18. rejects entity add on completed hunt', async () => {
    const hunt = await createHunt();
    await manager.changeStatus(tenantId, hunt.id, userId, 'active');
    await manager.changeStatus(tenantId, hunt.id, userId, 'completed');
    await expect(manager.addEntity(tenantId, hunt.id, userId, { type: 'ip', value: '10.0.0.1' }))
      .rejects.toThrow('completed/archived');
  });

  it('2.19. removes entity from hunt', async () => {
    const hunt = await createHunt();
    const entity = await manager.addEntity(tenantId, hunt.id, userId, {
      type: 'domain', value: 'evil.com',
    });
    await manager.removeEntity(tenantId, hunt.id, userId, entity.id);
    const fetched = await manager.get(tenantId, hunt.id);
    expect(fetched.entities).toHaveLength(0);
  });

  it('2.20. throws when removing non-existent entity', async () => {
    const hunt = await createHunt();
    await expect(manager.removeEntity(tenantId, hunt.id, userId, 'nope'))
      .rejects.toThrow('Entity not found');
  });

  // ─── Stats & Cleanup ─────────────────────────────────────

  it('2.21. returns hunt stats by status and severity', async () => {
    await createHunt();
    await createHunt('Hunt 2');
    const stats = await manager.getStats(tenantId);
    expect(stats.total).toBe(2);
    expect(stats.byStatus.draft).toBe(2);
    expect(stats.bySeverity.high).toBe(2);
  });

  it('2.22. cleans up expired sessions', async () => {
    const hunt = await createHunt();
    // Manually backdate
    const session = (await store.getSession(tenantId, hunt.id))!;
    session.updatedAt = new Date(Date.now() - 73 * 3600 * 1000).toISOString();
    await store.setSession(tenantId, session);
    const archived = await manager.cleanupExpired(tenantId);
    expect(archived).toBe(1);
    expect((await store.getSession(tenantId, hunt.id))!.status).toBe('archived');
  });

  it('2.23. records query in hunt history', async () => {
    const hunt = await createHunt();
    const query = {
      fields: [{ field: 'value', operator: 'eq' as const, value: '1.2.3.4' }],
      limit: 100,
      offset: 0,
      sortBy: 'updatedAt',
      sortOrder: 'desc' as const,
    };
    const saved = await manager.recordQuery(tenantId, hunt.id, query, 'Test query', 42);
    expect(saved.name).toBe('Test query');
    expect(saved.resultCount).toBe(42);
    const fetched = await manager.get(tenantId, hunt.id);
    expect(fetched.queryHistory).toHaveLength(1);
  });

  // ─── List ─────────────────────────────────────────────────

  it('2.24. lists sessions with pagination', async () => {
    for (let i = 0; i < 3; i++) await createHunt(`Hunt ${i}`);
    const result = await manager.list(tenantId, 1, 2);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('2.25. lists sessions filtered by status', async () => {
    await createHunt('Draft hunt');
    const active = await createHunt('Active hunt');
    await manager.changeStatus(tenantId, active.id, userId, 'active');
    const result = await manager.list(tenantId, 1, 50, 'active');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.status).toBe('active');
  });
});
