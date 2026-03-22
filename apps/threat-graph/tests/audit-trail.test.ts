import { describe, it, expect, beforeEach } from 'vitest';
import { AuditTrailService } from '../src/services/audit-trail.js';
import type { PropagationAuditEntry } from '../src/schemas/search.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeEntry(overrides: Partial<PropagationAuditEntry> & { id: string; tenantId: string }): PropagationAuditEntry {
  return {
    timestamp: new Date().toISOString(),
    triggerNodeId: 'node-trigger-default',
    triggerScore: 75,
    maxDepth: 3,
    nodesUpdated: 2,
    nodesVisited: 5,
    updates: [
      {
        nodeId: 'node-updated-default',
        oldScore: 10,
        newScore: 52,
        distance: 1,
        relType: 'RELATED_TO',
        decayWeight: 0.98,
        confidenceWeight: 0.9,
        temporalWeight: 0.95,
        relTypeWeight: 1.0,
      },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Threat Graph — AuditTrailService', () => {
  let svc: AuditTrailService;

  beforeEach(() => {
    // Default instance; specific tests override maxEntries as needed
    svc = new AuditTrailService();
  });

  // ── record ──────────────────────────────────────────────────────

  describe('record()', () => {
    it('stores an entry and count increases to 1', () => {
      const entry = makeEntry({ id: 'e1', tenantId: 'tenant-A' });
      svc.record(entry);
      expect(svc.count('tenant-A')).toBe(1);
    });

    it('stored entry is retrievable by getById', () => {
      const entry = makeEntry({ id: 'e1', tenantId: 'tenant-A', triggerNodeId: 'node-x', triggerScore: 88 });
      svc.record(entry);
      const found = svc.getById('tenant-A', 'e1');
      expect(found).not.toBeNull();
      expect(found?.triggerNodeId).toBe('node-x');
      expect(found?.triggerScore).toBe(88);
    });

    it('stores multiple entries for the same tenant', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e3', tenantId: 'tenant-A' }));
      expect(svc.count('tenant-A')).toBe(3);
    });

    it('stores entries independently across tenants', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-B' }));
      expect(svc.count('tenant-A')).toBe(1);
      expect(svc.count('tenant-B')).toBe(1);
    });
  });

  // ── list — reverse chronological order ──────────────────────────

  describe('list() — reverse chronological order', () => {
    it('returns entries newest-first', () => {
      const base = Date.now();
      const e1 = makeEntry({ id: 'e1', tenantId: 'tenant-A', timestamp: new Date(base).toISOString() });
      const e2 = makeEntry({ id: 'e2', tenantId: 'tenant-A', timestamp: new Date(base + 1000).toISOString() });
      const e3 = makeEntry({ id: 'e3', tenantId: 'tenant-A', timestamp: new Date(base + 2000).toISOString() });

      // Insert in chronological order
      svc.record(e1);
      svc.record(e2);
      svc.record(e3);

      const { entries } = svc.list('tenant-A', 10);
      expect(entries[0].id).toBe('e3');
      expect(entries[1].id).toBe('e2');
      expect(entries[2].id).toBe('e1');
    });

    it('total reflects full unfiltered count even when limit is smaller', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e3', tenantId: 'tenant-A' }));

      const { entries, total } = svc.list('tenant-A', 2);
      expect(entries).toHaveLength(2);
      expect(total).toBe(3);
    });
  });

  // ── list — limit ─────────────────────────────────────────────────

  describe('list() — limit parameter', () => {
    it('returns at most limit entries', () => {
      for (let i = 0; i < 10; i++) {
        svc.record(makeEntry({ id: `e${i}`, tenantId: 'tenant-A' }));
      }
      const { entries } = svc.list('tenant-A', 3);
      expect(entries).toHaveLength(3);
    });

    it('returns all entries when limit exceeds stored count', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-A' }));
      const { entries } = svc.list('tenant-A', 50);
      expect(entries).toHaveLength(2);
    });

    it('returns empty array when tenant has no entries', () => {
      const { entries, total } = svc.list('tenant-nobody', 10);
      expect(entries).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  // ── list — filterNodeId ──────────────────────────────────────────

  describe('list() — filterNodeId', () => {
    it('matches entries where filterNodeId is the triggerNodeId', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A', triggerNodeId: 'node-target' }));
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-A', triggerNodeId: 'node-other' }));

      const { entries, total } = svc.list('tenant-A', 10, 'node-target');
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('e1');
      expect(total).toBe(1);
    });

    it('matches entries where filterNodeId appears in updates array', () => {
      const entryWithMatch = makeEntry({
        id: 'e1',
        tenantId: 'tenant-A',
        triggerNodeId: 'node-trigger',
        updates: [
          {
            nodeId: 'node-in-updates',
            oldScore: 5,
            newScore: 40,
            distance: 1,
            relType: 'RELATED_TO',
            decayWeight: 1.0,
            confidenceWeight: 0.8,
            temporalWeight: 1.0,
            relTypeWeight: 1.0,
          },
        ],
      });
      const entryNoMatch = makeEntry({ id: 'e2', tenantId: 'tenant-A', triggerNodeId: 'node-unrelated' });

      svc.record(entryWithMatch);
      svc.record(entryNoMatch);

      const { entries, total } = svc.list('tenant-A', 10, 'node-in-updates');
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('e1');
      expect(total).toBe(1);
    });

    it('matches entries where filterNodeId matches both trigger and updated node in different entries', () => {
      const e1 = makeEntry({ id: 'e1', tenantId: 'tenant-A', triggerNodeId: 'node-X' });
      const e2 = makeEntry({
        id: 'e2',
        tenantId: 'tenant-A',
        triggerNodeId: 'node-other',
        updates: [
          {
            nodeId: 'node-X',
            oldScore: 0,
            newScore: 30,
            distance: 2,
            relType: 'RELATED_TO',
            decayWeight: 0.9,
            confidenceWeight: 0.7,
            temporalWeight: 0.8,
            relTypeWeight: 1.0,
          },
        ],
      });
      const e3 = makeEntry({ id: 'e3', tenantId: 'tenant-A', triggerNodeId: 'node-unrelated' });

      svc.record(e1);
      svc.record(e2);
      svc.record(e3);

      const { entries, total } = svc.list('tenant-A', 10, 'node-X');
      expect(total).toBe(2);
      const ids = entries.map((e) => e.id);
      expect(ids).toContain('e1');
      expect(ids).toContain('e2');
      expect(ids).not.toContain('e3');
    });

    it('returns empty result when filterNodeId matches nothing', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A', triggerNodeId: 'node-A' }));
      const { entries, total } = svc.list('tenant-A', 10, 'node-nonexistent');
      expect(entries).toHaveLength(0);
      expect(total).toBe(0);
    });

    it('filtered total is independent of limit', () => {
      for (let i = 0; i < 5; i++) {
        svc.record(makeEntry({ id: `e${i}`, tenantId: 'tenant-A', triggerNodeId: 'node-target' }));
      }
      svc.record(makeEntry({ id: 'e5', tenantId: 'tenant-A', triggerNodeId: 'node-other' }));

      const { entries, total } = svc.list('tenant-A', 2, 'node-target');
      expect(entries).toHaveLength(2);
      expect(total).toBe(5);
    });
  });

  // ── getById ──────────────────────────────────────────────────────

  describe('getById()', () => {
    it('returns the exact entry for a known id', () => {
      const entry = makeEntry({
        id: 'entry-known',
        tenantId: 'tenant-A',
        triggerNodeId: 'node-abc',
        triggerScore: 99,
        nodesUpdated: 7,
      });
      svc.record(entry);

      const found = svc.getById('tenant-A', 'entry-known');
      expect(found).not.toBeNull();
      expect(found?.id).toBe('entry-known');
      expect(found?.triggerScore).toBe(99);
      expect(found?.nodesUpdated).toBe(7);
    });

    it('returns null for an unknown id within the correct tenant', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      const result = svc.getById('tenant-A', 'does-not-exist');
      expect(result).toBeNull();
    });

    it('returns null when tenant has no entries', () => {
      const result = svc.getById('tenant-empty', 'any-id');
      expect(result).toBeNull();
    });

    it('returns null when id exists under a different tenant', () => {
      svc.record(makeEntry({ id: 'e-shared-id', tenantId: 'tenant-A' }));
      const result = svc.getById('tenant-B', 'e-shared-id');
      expect(result).toBeNull();
    });
  });

  // ── circular buffer ──────────────────────────────────────────────

  describe('circular buffer — maxEntries cap', () => {
    it('drops the oldest entry when maxEntries is exceeded', () => {
      const smallSvc = new AuditTrailService(5);
      for (let i = 1; i <= 5; i++) {
        smallSvc.record(makeEntry({ id: `e${i}`, tenantId: 'tenant-A' }));
      }
      // e1 is oldest; adding e6 should evict e1
      smallSvc.record(makeEntry({ id: 'e6', tenantId: 'tenant-A' }));

      expect(smallSvc.count('tenant-A')).toBe(5);
      expect(smallSvc.getById('tenant-A', 'e1')).toBeNull();
      expect(smallSvc.getById('tenant-A', 'e6')).not.toBeNull();
    });

    it('retains the N newest entries after overflow', () => {
      const smallSvc = new AuditTrailService(5);
      for (let i = 1; i <= 8; i++) {
        smallSvc.record(makeEntry({ id: `e${i}`, tenantId: 'tenant-A' }));
      }

      expect(smallSvc.count('tenant-A')).toBe(5);
      // e1, e2, e3 should be gone
      for (const id of ['e1', 'e2', 'e3']) {
        expect(smallSvc.getById('tenant-A', id)).toBeNull();
      }
      // e4–e8 should be present
      for (const id of ['e4', 'e5', 'e6', 'e7', 'e8']) {
        expect(smallSvc.getById('tenant-A', id)).not.toBeNull();
      }
    });

    it('never stores more than maxEntries regardless of how many are recorded', () => {
      const smallSvc = new AuditTrailService(5);
      for (let i = 0; i < 100; i++) {
        smallSvc.record(makeEntry({ id: `e${i}`, tenantId: 'tenant-A' }));
      }
      expect(smallSvc.count('tenant-A')).toBe(5);
    });

    it('circular buffer is per-tenant: overflow in one tenant does not affect another', () => {
      const smallSvc = new AuditTrailService(5);
      for (let i = 1; i <= 8; i++) {
        smallSvc.record(makeEntry({ id: `a${i}`, tenantId: 'tenant-A' }));
      }
      smallSvc.record(makeEntry({ id: 'b1', tenantId: 'tenant-B' }));

      // tenant-A should be capped at 5
      expect(smallSvc.count('tenant-A')).toBe(5);
      // tenant-B should have exactly 1
      expect(smallSvc.count('tenant-B')).toBe(1);
      expect(smallSvc.getById('tenant-B', 'b1')).not.toBeNull();
    });
  });

  // ── tenant isolation ─────────────────────────────────────────────

  describe('per-tenant isolation', () => {
    it('list() for tenant A does not include entries from tenant B', () => {
      svc.record(makeEntry({ id: 'a1', tenantId: 'tenant-A', triggerNodeId: 'node-for-A' }));
      svc.record(makeEntry({ id: 'b1', tenantId: 'tenant-B', triggerNodeId: 'node-for-B' }));

      const { entries: aEntries } = svc.list('tenant-A', 10);
      const { entries: bEntries } = svc.list('tenant-B', 10);

      expect(aEntries.every((e) => e.tenantId === 'tenant-A')).toBe(true);
      expect(bEntries.every((e) => e.tenantId === 'tenant-B')).toBe(true);
      expect(aEntries.find((e) => e.id === 'b1')).toBeUndefined();
      expect(bEntries.find((e) => e.id === 'a1')).toBeUndefined();
    });

    it('count() is scoped to the requested tenant', () => {
      svc.record(makeEntry({ id: 'a1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'a2', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'b1', tenantId: 'tenant-B' }));

      expect(svc.count('tenant-A')).toBe(2);
      expect(svc.count('tenant-B')).toBe(1);
    });

    it('getById() cannot cross tenant boundaries', () => {
      svc.record(makeEntry({ id: 'shared-id', tenantId: 'tenant-A' }));

      // Correct tenant — found
      expect(svc.getById('tenant-A', 'shared-id')).not.toBeNull();
      // Wrong tenant — not found
      expect(svc.getById('tenant-B', 'shared-id')).toBeNull();
    });
  });

  // ── clear ────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('clear(tenantId) removes only that tenants entries', () => {
      svc.record(makeEntry({ id: 'a1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'a2', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'b1', tenantId: 'tenant-B' }));

      svc.clear('tenant-A');

      expect(svc.count('tenant-A')).toBe(0);
      expect(svc.count('tenant-B')).toBe(1);
    });

    it('clear(tenantId) leaves other tenants fully intact', () => {
      svc.record(makeEntry({ id: 'a1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'b1', tenantId: 'tenant-B' }));
      svc.record(makeEntry({ id: 'c1', tenantId: 'tenant-C' }));

      svc.clear('tenant-A');

      expect(svc.getById('tenant-B', 'b1')).not.toBeNull();
      expect(svc.getById('tenant-C', 'c1')).not.toBeNull();
    });

    it('clear() without args removes all entries for all tenants', () => {
      svc.record(makeEntry({ id: 'a1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'b1', tenantId: 'tenant-B' }));
      svc.record(makeEntry({ id: 'c1', tenantId: 'tenant-C' }));

      svc.clear();

      expect(svc.count('tenant-A')).toBe(0);
      expect(svc.count('tenant-B')).toBe(0);
      expect(svc.count('tenant-C')).toBe(0);
    });

    it('clear() on an already-empty tenant is a no-op', () => {
      expect(() => svc.clear('tenant-nonexistent')).not.toThrow();
      expect(svc.count('tenant-nonexistent')).toBe(0);
    });

    it('list() returns empty after clear()', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      svc.clear('tenant-A');

      const { entries, total } = svc.list('tenant-A', 10);
      expect(entries).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  // ── count ────────────────────────────────────────────────────────

  describe('count()', () => {
    it('returns 0 for a tenant with no entries', () => {
      expect(svc.count('tenant-unknown')).toBe(0);
    });

    it('increments with each recorded entry', () => {
      expect(svc.count('tenant-A')).toBe(0);
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      expect(svc.count('tenant-A')).toBe(1);
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-A' }));
      expect(svc.count('tenant-A')).toBe(2);
    });

    it('decrements back to 0 after clear', () => {
      svc.record(makeEntry({ id: 'e1', tenantId: 'tenant-A' }));
      svc.record(makeEntry({ id: 'e2', tenantId: 'tenant-A' }));
      svc.clear('tenant-A');
      expect(svc.count('tenant-A')).toBe(0);
    });

    it('is capped at maxEntries once circular buffer is full', () => {
      const smallSvc = new AuditTrailService(5);
      for (let i = 0; i < 20; i++) {
        smallSvc.record(makeEntry({ id: `e${i}`, tenantId: 'tenant-A' }));
      }
      expect(smallSvc.count('tenant-A')).toBe(5);
    });
  });
});
