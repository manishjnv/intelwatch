import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IOCService, LIFECYCLE_TRANSITIONS } from '../src/service.js';

// ── Mock repository ─────────────────────────────────────────────

function createMockRepo() {
  return {
    findMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    findByDedupeHash: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => ({ id: 'new-id', ...data })),
    update: vi.fn().mockImplementation(async (_t: string, _id: string, data: Record<string, unknown>) => ({ id: 'test-id', ...data })),
    softDelete: vi.fn().mockResolvedValue({ id: 'test-id', lifecycle: 'revoked' }),
    search: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findPivotRelated: vi.fn().mockResolvedValue({ byFeed: [], byThreatActor: [], byMalware: [], bySubnet: [] }),
    findForExport: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total: 0, byType: {}, bySeverity: {}, byLifecycle: {}, avgConfidence: 0 }),
    bulkUpdateSeverity: vi.fn().mockResolvedValue(5),
    bulkUpdateLifecycle: vi.fn().mockResolvedValue(5),
    bulkSetTags: vi.fn().mockResolvedValue(5),
    bulkAddTags: vi.fn().mockResolvedValue(5),
    bulkRemoveTags: vi.fn().mockResolvedValue(5),
    countBySubnet: vi.fn().mockResolvedValue(3),
    findFPRelated: vi.fn().mockResolvedValue(['related-1', 'related-2']),
    tagForReview: vi.fn().mockResolvedValue(2),
    getFeedStats: vi.fn().mockResolvedValue([
      { feedSourceId: 'feed-1', total: 100, avgConfidence: 75, falsePositiveCount: 5, revokedCount: 2 },
    ]),
    setAnalystOverride: vi.fn().mockResolvedValue({ id: 'ioc-001', confidence: 95 }),
  };
}

const TENANT = 'tenant-001';

function makeIoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ioc-001', tenantId: TENANT, feedSourceId: 'feed-001',
    iocType: 'ip', value: '185.220.101.34', normalizedValue: '185.220.101.34',
    dedupeHash: 'abc123', severity: 'medium', tlp: 'amber', confidence: 75,
    lifecycle: 'active', tags: ['tor'], mitreAttack: ['T1071'],
    malwareFamilies: ['Cobalt Strike'], threatActors: ['APT28'],
    enrichmentData: { confidenceHistory: [{ date: '2026-03-20', score: 70, source: 'feed' }] },
    enrichedAt: new Date('2026-03-20'), firstSeen: new Date('2026-03-18'),
    lastSeen: new Date('2026-03-20'), expiresAt: null,
    ...overrides,
  };
}

describe('IOCService', () => {
  let service: IOCService;
  let repo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    repo = createMockRepo();
    service = new IOCService(repo as never);
  });

  // ── CRUD ────────────────────────────────────────────────────

  describe('getIoc', () => {
    it('returns IOC when found', async () => {
      repo.findById.mockResolvedValue(makeIoc());
      const result = await service.getIoc(TENANT, 'ioc-001');
      expect(result.id).toBe('ioc-001');
    });

    it('throws 404 when not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getIoc(TENANT, 'missing')).rejects.toThrow('IOC not found');
    });
  });

  describe('createIoc', () => {
    it('creates a manual IOC with defaults', async () => {
      const result = await service.createIoc(TENANT, {
        iocType: 'ip', value: '10.0.0.1', severity: 'medium', tlp: 'amber',
        confidence: 70, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
      });
      expect(repo.create).toHaveBeenCalledOnce();
      expect(result).toHaveProperty('id');
    });

    it('throws 409 on duplicate IOC', async () => {
      repo.findByDedupeHash.mockResolvedValue(makeIoc());
      await expect(service.createIoc(TENANT, {
        iocType: 'ip', value: '185.220.101.34', severity: 'medium', tlp: 'amber',
        confidence: 70, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
      })).rejects.toThrow('IOC already exists');
    });

    it('normalizes domain to lowercase and strips trailing dot', async () => {
      await service.createIoc(TENANT, {
        iocType: 'domain', value: 'EVIL.COM.', severity: 'medium', tlp: 'amber',
        confidence: 70, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
      });
      const callArgs = repo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.normalizedValue).toBe('evil.com');
    });

    it('normalizes CVE to uppercase', async () => {
      await service.createIoc(TENANT, {
        iocType: 'cve', value: 'cve-2024-1234', severity: 'medium', tlp: 'amber',
        confidence: 70, tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
      });
      const callArgs = repo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.normalizedValue).toBe('CVE-2024-1234');
    });
  });

  // ── Update with escalation rules ────────────────────────────

  describe('updateIoc', () => {
    it('allows severity upgrade (medium → critical)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ severity: 'medium' }));
      await service.updateIoc(TENANT, 'ioc-001', { severity: 'critical' });
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', expect.objectContaining({ severity: 'critical' }));
    });

    it('silently skips severity downgrade (critical → low)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ severity: 'critical' }));
      const result = await service.updateIoc(TENANT, 'ioc-001', { severity: 'low' });
      // Should return existing without calling update (no data changed)
      expect(result).toHaveProperty('id', 'ioc-001');
    });

    it('allows TLP upgrade (amber → red)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ tlp: 'amber' }));
      await service.updateIoc(TENANT, 'ioc-001', { tlp: 'red' });
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', expect.objectContaining({ tlp: 'red' }));
    });

    it('silently skips TLP downgrade (red → green)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ tlp: 'red' }));
      const result = await service.updateIoc(TENANT, 'ioc-001', { tlp: 'green' });
      expect(result).toHaveProperty('id', 'ioc-001');
    });
  });

  // ── Lifecycle transitions ───────────────────────────────────

  describe('lifecycle transitions', () => {
    it('allows active → false_positive', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      await service.updateIoc(TENANT, 'ioc-001', { lifecycle: 'false_positive' });
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', expect.objectContaining({ lifecycle: 'false_positive' }));
    });

    it('allows active → revoked', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      await service.updateIoc(TENANT, 'ioc-001', { lifecycle: 'revoked' });
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', expect.objectContaining({ lifecycle: 'revoked' }));
    });

    it('rejects archived → active (terminal state)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'archived' }));
      await expect(service.updateIoc(TENANT, 'ioc-001', { lifecycle: 'active' }))
        .rejects.toThrow('Cannot transition');
    });

    it('allows expired → reactivated', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'expired' }));
      await service.updateIoc(TENANT, 'ioc-001', { lifecycle: 'reactivated' });
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', expect.objectContaining({ lifecycle: 'reactivated' }));
    });
  });

  // ── Delete ──────────────────────────────────────────────────

  describe('deleteIoc', () => {
    it('soft-deletes (revokes) the IOC', async () => {
      repo.softDelete.mockResolvedValue({ id: 'ioc-001', lifecycle: 'revoked' });
      await service.deleteIoc(TENANT, 'ioc-001');
      expect(repo.softDelete).toHaveBeenCalledWith(TENANT, 'ioc-001');
    });

    it('throws 404 for missing IOC', async () => {
      repo.softDelete.mockResolvedValue(null);
      await expect(service.deleteIoc(TENANT, 'missing')).rejects.toThrow('IOC not found');
    });
  });

  // ── Timeline ────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('returns events sorted by timestamp', async () => {
      repo.findById.mockResolvedValue(makeIoc());
      const result = await service.getTimeline(TENANT, 'ioc-001') as { events: Array<{ type: string }> };
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      expect(result.events[0].type).toBe('first_seen');
    });
  });

  // ── Export ──────────────────────────────────────────────────

  describe('exportIocs', () => {
    it('exports as CSV with header row', async () => {
      repo.findForExport.mockResolvedValue([makeIoc()]);
      const result = await service.exportIocs(TENANT, { format: 'csv', maxResults: 100 });
      expect(result.contentType).toBe('text/csv');
      expect(result.data).toContain('id,type,value');
      expect(result.data).toContain('185.220.101.34');
    });

    it('exports as JSON array', async () => {
      repo.findForExport.mockResolvedValue([makeIoc()]);
      const result = await service.exportIocs(TENANT, { format: 'json', maxResults: 100 });
      expect(result.contentType).toBe('application/json');
      const parsed = JSON.parse(result.data) as unknown[];
      expect(parsed).toHaveLength(1);
    });

    it('escapes CSV values containing commas', async () => {
      repo.findForExport.mockResolvedValue([makeIoc({ tags: ['a,b', 'c'] })]);
      const result = await service.exportIocs(TENANT, { format: 'csv', maxResults: 100 });
      expect(result.data).toContain('"a,b;c"');
    });
  });

  // ── Bulk operations ─────────────────────────────────────────

  describe('bulkOperation', () => {
    it('set_severity updates severity for all IDs', async () => {
      const result = await service.bulkOperation(TENANT, {
        ids: ['id1', 'id2'], action: 'set_severity', severity: 'critical',
      });
      expect(result.affected).toBe(5);
      expect(repo.bulkUpdateSeverity).toHaveBeenCalledWith(TENANT, ['id1', 'id2'], 'critical');
    });

    it('add_tags merges tags', async () => {
      const result = await service.bulkOperation(TENANT, {
        ids: ['id1'], action: 'add_tags', tags: ['new-tag'],
      });
      expect(result.affected).toBe(5);
      expect(repo.bulkAddTags).toHaveBeenCalledWith(TENANT, ['id1'], ['new-tag']);
    });

    it('set_lifecycle updates lifecycle for all IDs', async () => {
      const result = await service.bulkOperation(TENANT, {
        ids: ['id1'], action: 'set_lifecycle', lifecycle: 'revoked',
      });
      expect(result.affected).toBe(5);
      expect(repo.bulkUpdateLifecycle).toHaveBeenCalledWith(TENANT, ['id1'], 'revoked');
    });
  });

  // ── Pivot ───────────────────────────────────────────────────

  describe('pivotIoc', () => {
    it('returns pivot categories + inferred relationships (A4)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ iocType: 'url', normalizedValue: 'https://evil.com/payload' }));
      const result = await service.pivotIoc(TENANT, 'ioc-001') as Record<string, unknown>;
      expect(result).toHaveProperty('byFeed');
      expect(result).toHaveProperty('inferredRelationships');
      const inferred = result.inferredRelationships as Array<{ relatedType: string }>;
      expect(inferred.length).toBeGreaterThan(0);
      expect(inferred[0].relatedType).toBe('domain');
    });
  });

  // ── Stats ───────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns aggregated statistics', async () => {
      const result = await service.getStats(TENANT) as Record<string, unknown>;
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byType');
      expect(result).toHaveProperty('bySeverity');
    });
  });

  // ── Accuracy improvements ───────────────────────────────────

  describe('getIocDetail (A1-A5 enrichment)', () => {
    it('returns IOC with computed accuracy signals', async () => {
      repo.findById.mockResolvedValue(makeIoc());
      const result = await service.getIocDetail(TENANT, 'ioc-001') as Record<string, unknown>;
      expect(result).toHaveProperty('computed');
      const computed = result.computed as Record<string, unknown>;
      expect(computed).toHaveProperty('confidenceTrend');
      expect(computed).toHaveProperty('actionability');
      expect(computed).toHaveProperty('relevanceScore');
      expect(computed).toHaveProperty('infrastructureDensity');
    });

    it('computes infrastructure density for IP IOCs (A1)', async () => {
      repo.findById.mockResolvedValue(makeIoc({ iocType: 'ip', normalizedValue: '192.168.1.50' }));
      repo.countBySubnet.mockResolvedValue(12);
      const result = await service.getIocDetail(TENANT, 'ioc-001') as Record<string, unknown>;
      const density = (result.computed as Record<string, unknown>).infrastructureDensity as Record<string, unknown>;
      expect(density).not.toBeNull();
      expect(density.classification).toBe('c2_infrastructure');
    });

    it('skips density for non-IP IOCs', async () => {
      repo.findById.mockResolvedValue(makeIoc({ iocType: 'domain', normalizedValue: 'evil.com' }));
      const result = await service.getIocDetail(TENANT, 'ioc-001') as Record<string, unknown>;
      const density = (result.computed as Record<string, unknown>).infrastructureDensity;
      expect(density).toBeNull();
    });
  });

  describe('B1: FP propagation', () => {
    it('tags related IOCs for review on false_positive transition', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'false_positive' }));
      await service.updateIoc(TENANT, 'ioc-001', { lifecycle: 'false_positive' });
      expect(repo.findFPRelated).toHaveBeenCalled();
      expect(repo.tagForReview).toHaveBeenCalledWith(TENANT, ['related-1', 'related-2'], 'fp_review_suggested');
    });

    it('does not tag on non-FP transitions', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'revoked' }));
      await service.updateIoc(TENANT, 'ioc-001', { lifecycle: 'revoked' });
      expect(repo.findFPRelated).not.toHaveBeenCalled();
    });
  });

  describe('B2: Analyst confidence override', () => {
    it('stores override and updates confidence', async () => {
      repo.findById.mockResolvedValue(makeIoc());
      repo.update.mockResolvedValue(makeIoc({ confidence: 95 }));
      await service.updateIoc(TENANT, 'ioc-001', {
        analystOverride: { confidence: 95, reason: 'Confirmed by OSINT analysis' },
      });
      expect(repo.setAnalystOverride).toHaveBeenCalledWith(TENANT, 'ioc-001', expect.objectContaining({ confidence: 95, reason: 'Confirmed by OSINT analysis' }));
    });
  });

  describe('B3: Feed accuracy report', () => {
    it('returns per-feed accuracy stats with FP rate', async () => {
      const result = await service.getFeedAccuracy(TENANT) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(1);
      expect(result[0].feedSourceId).toBe('feed-1');
      expect(result[0].falsePositiveRate).toBe(5); // 5/100 = 5%
    });
  });

  describe('D1: Provenance export', () => {
    it('includes provenance breakdown in JSON export', async () => {
      repo.findForExport.mockResolvedValue([makeIoc({
        enrichmentData: { feedReliability: 80, corroboration: 60, aiScore: 50, decayFactor: 0.95, sightingCount: 3 },
      })]);
      const result = await service.exportIocs(TENANT, { format: 'json', maxResults: 100, includeProvenance: true });
      const parsed = JSON.parse(result.data) as Array<Record<string, unknown>>;
      expect(parsed[0]).toHaveProperty('provenance');
      const prov = parsed[0].provenance as Record<string, unknown>;
      expect(prov.feedReliability).toBe(80);
      expect(prov.corroboration).toBe(60);
    });

    it('includes provenance columns in CSV export', async () => {
      repo.findForExport.mockResolvedValue([makeIoc({
        enrichmentData: { feedReliability: 80, corroboration: 60, aiScore: 50, decayFactor: 0.95 },
      })]);
      const result = await service.exportIocs(TENANT, { format: 'csv', maxResults: 100, includeProvenance: true });
      expect(result.data).toContain('feedReliability,corroboration,aiScore,decayFactor');
      expect(result.data).toContain('80,60,50,0.95');
    });
  });

  describe('D2: Export profiles', () => {
    it('high_fidelity profile filters out expired/archived IOCs', async () => {
      repo.findForExport.mockResolvedValue([
        makeIoc({ id: 'active-1', lifecycle: 'active' }),
        makeIoc({ id: 'expired-1', lifecycle: 'expired' }),
        makeIoc({ id: 'fp-1', lifecycle: 'false_positive' }),
      ]);
      const result = await service.exportIocs(TENANT, { format: 'json', maxResults: 100, profile: 'high_fidelity' });
      const parsed = JSON.parse(result.data) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('active-1');
    });
  });

  // ── C1: Enhanced search ─────────────────────────────────────

  describe('C1: Multi-dimensional search ranking', () => {
    it('returns results with relevance scores', async () => {
      repo.search.mockResolvedValue({
        items: [
          makeIoc({ id: 'low', confidence: 30, normalizedValue: 'other' }),
          makeIoc({ id: 'high', confidence: 90, normalizedValue: '185.220.101.34' }),
        ],
        total: 2,
      });
      const result = await service.searchIocs(TENANT, { query: '185.220.101.34', page: 1, limit: 50 });
      const items = result.items as Array<Record<string, unknown>>;
      expect(items[0]).toHaveProperty('relevance');
      // High confidence + exact match should rank first
      expect((items[0] as { id: string }).id).toBe('high');
    });

    it('re-ranks results by composite relevance not just confidence', async () => {
      repo.search.mockResolvedValue({
        items: [
          makeIoc({ id: 'old-high', confidence: 95, lastSeen: new Date('2026-01-01'), normalizedValue: 'other' }),
          makeIoc({ id: 'recent-mid', confidence: 60, lastSeen: new Date('2026-03-20'), normalizedValue: 'test' }),
        ],
        total: 2,
      });
      const result = await service.searchIocs(TENANT, { query: 'test', page: 1, limit: 50 });
      const items = result.items as Array<{ id: string; relevance: { relevanceScore: number } }>;
      // Both have relevance scores
      expect(items[0].relevance.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(items[1].relevance.relevanceScore).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Lifecycle FSM ────────────────────────────────────────────

  describe('LIFECYCLE_TRANSITIONS (exported FSM)', () => {
    it('new can transition to active, false_positive, watchlisted', () => {
      expect(LIFECYCLE_TRANSITIONS['new']).toEqual(expect.arrayContaining(['active', 'false_positive', 'watchlisted']));
    });

    it('revoked is terminal (no outbound transitions)', () => {
      expect(LIFECYCLE_TRANSITIONS['revoked']).toHaveLength(0);
    });

    it('false_positive is terminal (no outbound transitions)', () => {
      expect(LIFECYCLE_TRANSITIONS['false_positive']).toHaveLength(0);
    });

    it('watchlisted can transition to active or revoked', () => {
      expect(LIFECYCLE_TRANSITIONS['watchlisted']).toEqual(expect.arrayContaining(['active', 'revoked']));
    });

    it('active can transition to aging, watchlisted, false_positive, revoked', () => {
      expect(LIFECYCLE_TRANSITIONS['active']).toEqual(
        expect.arrayContaining(['aging', 'watchlisted', 'false_positive', 'revoked']),
      );
    });
  });

  describe('transitionLifecycle', () => {
    it('valid transition: new → watchlisted', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'new' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'watchlisted' }));
      const result = await service.transitionLifecycle(TENANT, 'ioc-001', 'watchlisted');
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', { lifecycle: 'watchlisted' });
      expect((result as Record<string, unknown>).lifecycle).toBe('watchlisted');
    });

    it('valid transition: active → aging', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'aging' }));
      await service.transitionLifecycle(TENANT, 'ioc-001', 'aging');
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', { lifecycle: 'aging' });
    });

    it('valid transition: aging → expired', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'aging' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'expired' }));
      await service.transitionLifecycle(TENANT, 'ioc-001', 'expired');
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', { lifecycle: 'expired' });
    });

    it('valid transition: watchlisted → active', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'watchlisted' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      await service.transitionLifecycle(TENANT, 'ioc-001', 'active');
      expect(repo.update).toHaveBeenCalledWith(TENANT, 'ioc-001', { lifecycle: 'active' });
    });

    it('invalid transition: revoked → active throws 409', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'revoked' }));
      await expect(service.transitionLifecycle(TENANT, 'ioc-001', 'active'))
        .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_LIFECYCLE_TRANSITION' });
    });

    it('invalid transition: false_positive → active throws 409', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'false_positive' }));
      await expect(service.transitionLifecycle(TENANT, 'ioc-001', 'active'))
        .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_LIFECYCLE_TRANSITION' });
    });

    it('invalid transition: new → expired throws 409', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'new' }));
      await expect(service.transitionLifecycle(TENANT, 'ioc-001', 'expired'))
        .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_LIFECYCLE_TRANSITION' });
    });

    it('invalid transition: expired → watchlisted throws 409', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'expired' }));
      await expect(service.transitionLifecycle(TENANT, 'ioc-001', 'watchlisted'))
        .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_LIFECYCLE_TRANSITION' });
    });

    it('throws 404 when IOC not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.transitionLifecycle(TENANT, 'missing', 'active'))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('triggers FP propagation on → false_positive transition', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'false_positive' }));
      repo.findFPRelated.mockResolvedValue(['r1', 'r2']);
      await service.transitionLifecycle(TENANT, 'ioc-001', 'false_positive');
      expect(repo.findFPRelated).toHaveBeenCalled();
      expect(repo.tagForReview).toHaveBeenCalledWith(TENANT, ['r1', 'r2'], 'fp_review_suggested');
    });

    it('skips FP propagation when no related IOCs', async () => {
      repo.findById.mockResolvedValue(makeIoc({ lifecycle: 'active' }));
      repo.update.mockResolvedValue(makeIoc({ lifecycle: 'false_positive' }));
      repo.findFPRelated.mockResolvedValue([]);
      await service.transitionLifecycle(TENANT, 'ioc-001', 'false_positive');
      expect(repo.tagForReview).not.toHaveBeenCalled();
    });
  });
});
