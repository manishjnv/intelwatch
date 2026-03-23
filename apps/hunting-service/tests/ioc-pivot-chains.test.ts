import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IOCPivotChains } from '../src/services/ioc-pivot-chains.js';

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

describe('Hunting Service — #3 IOC Pivot Chains', () => {
  let pivotChains: IOCPivotChains;

  beforeEach(() => {
    vi.restoreAllMocks();
    pivotChains = new IOCPivotChains({
      graphServiceUrl: 'http://localhost:3012',
      maxHops: 3,
      maxResults: 100,
    });
  });

  function mockFetchResponse(data: unknown[], status = 200): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ data, total: data.length }),
    }));
  }

  function makeNeighbor(type: string, value: string, riskScore = 0.5, relType = 'RELATED_TO') {
    return {
      id: `${type}-${value}`,
      type,
      value,
      riskScore,
      relationship: { type: relType, weight: 0.8 },
    };
  }

  // ─── Basic pivot ─────────────────────────────────────────

  it('3.1. returns root node when graph returns empty', async () => {
    mockFetchResponse([]);
    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 2,
      maxResults: 50,
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.rootEntity.value).toBe('10.0.0.1');
    expect(result.maxDepthReached).toBe(0);
  });

  it('3.2. performs 1-hop pivot', async () => {
    const neighbors = [
      makeNeighbor('domain', 'evil.com', 0.8),
      makeNeighbor('ip', '10.0.0.2', 0.3),
    ];
    mockFetchResponse(neighbors);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 1,
      maxResults: 50,
    });

    expect(result.nodes).toHaveLength(3); // root + 2 neighbors
    expect(result.maxDepthReached).toBe(1);
    expect(result.rootEntity.value).toBe('10.0.0.1');
  });

  it('3.3. performs multi-hop pivot (BFS)', async () => {
    const fetchMock = vi.fn();
    // First call: root's neighbors
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [makeNeighbor('domain', 'evil.com', 0.8)],
        total: 1,
      }),
    });
    // Second call: evil.com's neighbors
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [makeNeighbor('ip', '192.168.1.1', 0.9, 'RESOLVES_TO')],
        total: 1,
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 2,
      maxResults: 50,
    });

    expect(result.nodes).toHaveLength(3); // root + evil.com + 192.168.1.1
    expect(result.maxDepthReached).toBe(2);
  });

  it('3.4. deduplicates already-visited nodes', async () => {
    const fetchMock = vi.fn();
    // Hop 1: A → B, A → C
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        data: [
          makeNeighbor('domain', 'b.com'),
          makeNeighbor('domain', 'c.com'),
        ],
        total: 2,
      }),
    });
    // Hop 2: B → C (already visited)
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        data: [makeNeighbor('domain', 'c.com')],
        total: 1,
      }),
    });
    // Hop 2: C → B (already visited)
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        data: [makeNeighbor('domain', 'b.com')],
        total: 1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 2,
      maxResults: 50,
    });

    // root + b.com + c.com = 3 unique nodes
    expect(result.nodes).toHaveLength(3);
  });

  it('3.5. respects maxResults limit', async () => {
    const neighbors = Array.from({ length: 20 }, (_, i) =>
      makeNeighbor('ip', `10.0.0.${i + 10}`, 0.5),
    );
    mockFetchResponse(neighbors);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 3,
      maxResults: 5,
    });

    expect(result.nodes.length).toBeLessThanOrEqual(5);
    expect(result.truncated).toBe(true);
  });

  it('3.6. caps maxHops to config limit', async () => {
    mockFetchResponse([]);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 10, // exceeds config max of 3
      maxResults: 50,
    });

    // Should not error; hops are capped
    expect(result.nodes).toHaveLength(1);
  });

  // ─── Error handling ──────────────────────────────────────

  it('3.7. handles graph service 404 gracefully', async () => {
    mockFetchResponse([], 404);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 1,
      maxResults: 50,
    });

    expect(result.nodes).toHaveLength(1); // Just root
  });

  it('3.8. handles graph service error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 1,
      maxResults: 50,
    });

    expect(result.nodes).toHaveLength(1); // Just root
  });

  // ─── High-risk path extraction ────────────────────────────

  it('3.9. extracts highest-risk path', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        data: [
          makeNeighbor('domain', 'low-risk.com', 0.1),
          makeNeighbor('domain', 'high-risk.com', 0.95),
        ],
        total: 2,
      }),
    });
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 2,
      maxResults: 50,
    });

    const path = pivotChains.extractHighRiskPath(result);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[path.length - 1]!.riskScore).toBe(0.95);
  });

  it('3.10. returns single node for empty pivot result', () => {
    const result = {
      rootEntity: { type: 'ip' as const, value: '10.0.0.1' },
      nodes: [{
        id: 'root-10.0.0.1',
        type: 'ip' as const,
        value: '10.0.0.1',
        riskScore: 0,
        depth: 0,
        relationships: [],
      }],
      totalRelationships: 0,
      maxDepthReached: 0,
      truncated: false,
    };
    const path = pivotChains.extractHighRiskPath(result);
    expect(path).toHaveLength(1);
  });

  // ─── Service token ────────────────────────────────────────

  it('3.11. sends x-tenant-id header and calls graph neighbors endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await pivotChains.executePivot('tenant-1', {
      entityType: 'ip',
      entityValue: '10.0.0.1',
      maxHops: 1,
      maxResults: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain('/api/v1/graph/neighbors');
    expect(url).toContain('type=ip');
    expect(url).toContain('value=10.0.0.1');
    expect(opts.headers['x-tenant-id']).toBe('tenant-1');
    expect(opts.headers).toHaveProperty('x-service-token');
    expect(opts.method).toBe('GET');
  });
});
