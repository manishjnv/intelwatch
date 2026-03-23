import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CorrelationIntegration } from '../src/services/correlation-integration.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession } from '../src/schemas/hunting.js';

// Mock shared-auth
vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn().mockReturnValue('mock-service-token'),
}));

// Mock logger
vi.mock('../src/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Hunting Service — #5 Correlation Integration', () => {
  let store: HuntingStore;
  let integration: CorrelationIntegration;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    vi.restoreAllMocks();
    store = new HuntingStore();
    integration = new CorrelationIntegration(store, {
      correlationServiceUrl: 'http://localhost:3013',
      enabled: true,
    });
  });

  function createHunt(): HuntSession {
    const now = new Date().toISOString();
    const session: HuntSession = {
      id: 'hunt-1',
      tenantId,
      title: 'Test Hunt',
      hypothesis: 'Testing',
      status: 'active',
      severity: 'high',
      assignedTo: 'user-1',
      createdBy: 'user-1',
      entities: [
        {
          id: 'e1', type: 'ip', value: '10.0.0.1',
          addedAt: now, addedBy: 'user-1', pivotDepth: 0,
        },
        {
          id: 'e2', type: 'domain', value: 'evil.com',
          addedAt: now, addedBy: 'user-1', pivotDepth: 0,
        },
      ],
      timeline: [],
      findings: '',
      tags: ['test'],
      queryHistory: [],
      correlationLeads: [],
      createdAt: now,
      updatedAt: now,
    };
    store.setSession(tenantId, session);
    return session;
  }

  function mockCorrelationResponse(correlations: unknown[], status = 200): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ data: correlations, total: correlations.length }),
    }));
  }

  function makeCorrelation(id: string, entities: Array<{ type: string; value: string }>, confidence = 0.8) {
    return {
      id,
      type: 'co-occurrence',
      confidence,
      entities,
      description: `Correlation ${id}`,
    };
  }

  // ─── Fetch correlations ───────────────────────────────────

  it('5.1. fetches correlations from service', async () => {
    mockCorrelationResponse([
      makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }]),
    ]);

    const results = await integration.fetchCorrelations(tenantId);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('corr-1');
  });

  it('5.2. returns empty array when disabled', async () => {
    const disabled = new CorrelationIntegration(store, {
      correlationServiceUrl: 'http://localhost:3013',
      enabled: false,
    });
    const results = await disabled.fetchCorrelations(tenantId);
    expect(results).toHaveLength(0);
  });

  it('5.3. returns empty array on service error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const results = await integration.fetchCorrelations(tenantId);
    expect(results).toHaveLength(0);
  });

  it('5.4. returns empty on non-OK response', async () => {
    mockCorrelationResponse([], 500);
    const results = await integration.fetchCorrelations(tenantId);
    expect(results).toHaveLength(0);
  });

  // ─── Link correlations ───────────────────────────────────

  it('5.5. links a correlation to a hunt', () => {
    createHunt();
    const correlation = makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }]);
    const lead = integration.linkCorrelationToHunt(tenantId, 'hunt-1', correlation);

    expect(lead.correlationId).toBe('corr-1');
    expect(lead.confidence).toBe(0.8);
    expect(lead.entities).toHaveLength(1);
  });

  it('5.6. deduplicates already-linked correlations', () => {
    createHunt();
    const correlation = makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }]);

    integration.linkCorrelationToHunt(tenantId, 'hunt-1', correlation);
    const lead2 = integration.linkCorrelationToHunt(tenantId, 'hunt-1', correlation);

    expect(lead2.correlationId).toBe('corr-1');
    const leads = integration.getHuntLeads(tenantId, 'hunt-1');
    expect(leads).toHaveLength(1);
  });

  it('5.7. throws 404 for non-existent hunt', () => {
    const correlation = makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }]);
    expect(() => integration.linkCorrelationToHunt(tenantId, 'nope', correlation))
      .toThrow('not found');
  });

  it('5.8. updates session correlationLeads array', () => {
    createHunt();
    const correlation = makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }]);
    integration.linkCorrelationToHunt(tenantId, 'hunt-1', correlation);

    const session = store.getSession(tenantId, 'hunt-1')!;
    expect(session.correlationLeads).toContain('corr-1');
  });

  // ─── Auto-link ────────────────────────────────────────────

  it('5.9. auto-links correlations with matching entities', async () => {
    createHunt();
    mockCorrelationResponse([
      makeCorrelation('corr-match', [{ type: 'ip', value: '10.0.0.1' }], 0.9),
      makeCorrelation('corr-no-match', [{ type: 'ip', value: '99.99.99.99' }], 0.5),
    ]);

    const linked = await integration.autoLinkCorrelations(tenantId, 'hunt-1');
    expect(linked).toHaveLength(1);
    expect(linked[0]!.correlationId).toBe('corr-match');
  });

  it('5.10. returns empty when hunt has no entities', async () => {
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: 'empty-hunt',
      tenantId,
      title: 'Empty',
      hypothesis: 'Empty',
      status: 'active',
      severity: 'low',
      assignedTo: 'user-1',
      createdBy: 'user-1',
      entities: [],
      timeline: [],
      findings: '',
      tags: [],
      queryHistory: [],
      correlationLeads: [],
      createdAt: now,
      updatedAt: now,
    });

    const linked = await integration.autoLinkCorrelations(tenantId, 'empty-hunt');
    expect(linked).toHaveLength(0);
  });

  it('5.11. throws 404 for non-existent hunt in auto-link', async () => {
    await expect(integration.autoLinkCorrelations(tenantId, 'nope'))
      .rejects.toThrow('not found');
  });

  // ─── Get leads ────────────────────────────────────────────

  it('5.12. returns all leads for a hunt', () => {
    createHunt();
    integration.linkCorrelationToHunt(tenantId, 'hunt-1',
      makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }]));
    integration.linkCorrelationToHunt(tenantId, 'hunt-1',
      makeCorrelation('corr-2', [{ type: 'domain', value: 'evil.com' }]));

    const leads = integration.getHuntLeads(tenantId, 'hunt-1');
    expect(leads).toHaveLength(2);
  });

  it('5.13. throws 404 for leads of non-existent hunt', () => {
    expect(() => integration.getHuntLeads(tenantId, 'nope')).toThrow('not found');
  });

  // ─── Stats ────────────────────────────────────────────────

  it('5.14. returns lead stats', () => {
    createHunt();
    integration.linkCorrelationToHunt(tenantId, 'hunt-1',
      makeCorrelation('corr-1', [{ type: 'ip', value: '10.0.0.1' }], 0.9));
    integration.linkCorrelationToHunt(tenantId, 'hunt-1',
      makeCorrelation('corr-2', [{ type: 'domain', value: 'evil.com' }], 0.3));

    const stats = integration.getLeadStats(tenantId, 'hunt-1');
    expect(stats.totalLeads).toBe(2);
    expect(stats.avgConfidence).toBeCloseTo(0.6);
    expect(stats.highConfidenceCount).toBe(1);
    expect(stats.byType['co-occurrence']).toBe(2);
  });

  it('5.15. returns zero stats for hunt with no leads', () => {
    createHunt();
    const stats = integration.getLeadStats(tenantId, 'hunt-1');
    expect(stats.totalLeads).toBe(0);
    expect(stats.avgConfidence).toBe(0);
  });

  // ─── Service token headers ────────────────────────────────

  it('5.16. sends x-tenant-id header and calls correlations endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await integration.fetchCorrelations(tenantId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain('/api/v1/correlations');
    expect(opts.headers['x-tenant-id']).toBe(tenantId);
    expect(opts.headers).toHaveProperty('x-service-token');
    expect(opts.method).toBe('GET');
  });
});
