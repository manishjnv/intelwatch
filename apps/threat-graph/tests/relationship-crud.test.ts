import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { GraphRepository } from '../src/repository.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

const TENANT = 'tenant-abc';
const FROM_ID = '11111111-1111-1111-1111-111111111111';
const TO_ID = '22222222-2222-2222-2222-222222222222';
const REL_TYPE = 'USES' as const;

/** Canonical mock record returned by getRelationship / updateRelationship queries. */
function makeEdgeRecord(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    relType: REL_TYPE,
    confidence: 0.85,
    source: 'analyst-confirmed',
    fromNodeId: FROM_ID,
    toNodeId: TO_ID,
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-03-22T00:00:00.000Z',
    props: { confidence: 0.85, source: 'analyst-confirmed', firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-03-22T00:00:00.000Z' },
  };
  return makeRecord({ ...defaults, ...overrides });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GraphRepository — Relationship CRUD', () => {
  let repo: GraphRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new GraphRepository();
  });

  // ── getRelationship ──────────────────────────────────────────────────────

  describe('getRelationship', () => {
    it('returns an edge with correct fields when it exists', async () => {
      mockRun.mockResolvedValue({ records: [makeEdgeRecord()] });

      const edge = await repo.getRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      expect(edge).not.toBeNull();
      expect(edge!.id).toBe(`${FROM_ID}-${REL_TYPE}-${TO_ID}`);
      expect(edge!.type).toBe(REL_TYPE);
      expect(edge!.fromNodeId).toBe(FROM_ID);
      expect(edge!.toNodeId).toBe(TO_ID);
      expect(edge!.confidence).toBe(0.85);
    });

    it('returns null when the edge does not exist', async () => {
      mockRun.mockResolvedValue({ records: [] });

      const edge = await repo.getRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      expect(edge).toBeNull();
    });

    it('includes source field in edge properties', async () => {
      mockRun.mockResolvedValue({ records: [makeEdgeRecord({ source: 'analyst-confirmed' })] });

      const edge = await repo.getRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      expect(edge).not.toBeNull();
      expect((edge!.properties as Record<string, unknown>)['source']).toBe('analyst-confirmed');
    });

    it('queries are tenant-scoped — tenantId is passed in parameters', async () => {
      mockRun.mockResolvedValue({ records: [makeEdgeRecord()] });

      await repo.getRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      expect(mockRun).toHaveBeenCalledOnce();
      const [, params] = mockRun.mock.calls[0]!;
      expect((params as Record<string, unknown>)['tenantId']).toBe(TENANT);
    });
  });

  // ── updateRelationship ───────────────────────────────────────────────────

  describe('updateRelationship', () => {
    it('updates the confidence and returns the updated edge', async () => {
      const updatedConfidence = 0.95;
      mockRun.mockResolvedValue({
        records: [makeEdgeRecord({ confidence: updatedConfidence })],
      });

      const edge = await repo.updateRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID, { confidence: updatedConfidence });

      expect(edge).not.toBeNull();
      expect(edge!.confidence).toBe(updatedConfidence);
    });

    it('updates the source field and returns the updated edge', async () => {
      mockRun.mockResolvedValue({
        records: [makeEdgeRecord({ source: 'analyst-confirmed' })],
      });

      const edge = await repo.updateRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID, { source: 'analyst-confirmed' });

      expect(edge).not.toBeNull();
      expect((edge!.properties as Record<string, unknown>)['source']).toBe('analyst-confirmed');
    });

    it('returns null when the edge to update does not exist', async () => {
      mockRun.mockResolvedValue({ records: [] });

      const edge = await repo.updateRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID, { confidence: 0.5 });

      expect(edge).toBeNull();
    });

    it('sets lastSeen to approximately now on update', async () => {
      const beforeUpdate = new Date().toISOString();
      mockRun.mockResolvedValue({ records: [makeEdgeRecord()] });

      await repo.updateRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID, { confidence: 0.7 });

      // Verify the `now` timestamp passed to the query is current
      const [, params] = mockRun.mock.calls[0]!;
      const nowParam = (params as Record<string, unknown>)['now'] as string;
      expect(nowParam).toBeDefined();
      expect(new Date(nowParam).getTime()).toBeGreaterThanOrEqual(new Date(beforeUpdate).getTime());
    });

    it('is tenant-scoped — tenantId is included in update parameters', async () => {
      mockRun.mockResolvedValue({ records: [makeEdgeRecord()] });

      await repo.updateRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID, { confidence: 0.6 });

      const [, params] = mockRun.mock.calls[0]!;
      expect((params as Record<string, unknown>)['tenantId']).toBe(TENANT);
    });
  });

  // ── deleteRelationship ───────────────────────────────────────────────────

  describe('deleteRelationship', () => {
    it('returns true when the edge exists and is deleted', async () => {
      mockRun.mockResolvedValue({ records: [makeRecord({ deleted: 1 })] });

      const deleted = await repo.deleteRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      expect(deleted).toBe(true);
    });

    it('returns false when the edge does not exist', async () => {
      mockRun.mockResolvedValue({ records: [makeRecord({ deleted: 0 })] });

      const deleted = await repo.deleteRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      expect(deleted).toBe(false);
    });

    it('is tenant-scoped — tenantId is included in delete parameters', async () => {
      mockRun.mockResolvedValue({ records: [makeRecord({ deleted: 1 })] });

      await repo.deleteRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID);

      const [, params] = mockRun.mock.calls[0]!;
      expect((params as Record<string, unknown>)['tenantId']).toBe(TENANT);
    });
  });

  // ── session management (shared concern) ─────────────────────────────────

  describe('session management', () => {
    it('closes the session after getRelationship even if the query throws', async () => {
      mockRun.mockRejectedValue(new Error('Neo4j unavailable'));

      await expect(repo.getRelationship(TENANT, FROM_ID, REL_TYPE, TO_ID)).rejects.toThrow('Neo4j unavailable');
      expect(mockClose).toHaveBeenCalledOnce();
    });
  });
});
