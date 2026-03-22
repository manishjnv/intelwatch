import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { GraphSearchService } from '../src/services/graph-search.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FakeNode {
  id: string;
  name?: string;
  value?: string;
  cveId?: string;
  riskScore?: number;
  confidence?: number;
  tenantId?: string;
  [key: string]: unknown;
}

function makeCountRecord(total: number) {
  return { get: (key: string) => (key === 'total' ? total : null) };
}

function makeNodeRecord(props: FakeNode, label: string) {
  return {
    get: (key: string) => {
      if (key === 'props') return props;
      if (key === 'label') return label;
      return null;
    },
  };
}

/**
 * Sets up the two-query mock used by GraphSearchService.search:
 *   1st call → count query  (returns total)
 *   2nd call → paginated results (returns records array)
 */
function setupSearchMock(total: number, nodes: Array<{ props: FakeNode; label: string }>) {
  mockRun
    .mockResolvedValueOnce({ records: [makeCountRecord(total)] })
    .mockResolvedValueOnce({ records: nodes.map((n) => makeNodeRecord(n.props, n.label)) });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GraphSearchService — search', () => {
  let svc: GraphSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new GraphSearchService();
  });

  it('finds a node by name match (case-insensitive)', async () => {
    setupSearchMock(1, [
      { props: { id: 'actor-1', name: 'Lazarus Group', riskScore: 90, confidence: 0.9 }, label: 'ThreatActor' },
    ]);

    const result = await svc.search('t1', 'lazarus');

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe('actor-1');
    expect(result.results[0]!.nodeType).toBe('ThreatActor');
    expect(result.total).toBe(1);
  });

  it('finds a node by value match', async () => {
    setupSearchMock(1, [
      { props: { id: 'ioc-1', value: '192.168.1.100', riskScore: 70, confidence: 0.8 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', '192.168');

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe('ioc-1');
    expect((result.results[0]!.properties as Record<string, unknown>)['value']).toBe('192.168.1.100');
  });

  it('finds a node by cveId match', async () => {
    setupSearchMock(1, [
      { props: { id: 'vuln-1', cveId: 'CVE-2024-12345', riskScore: 85, confidence: 0.95 }, label: 'Vulnerability' },
    ]);

    const result = await svc.search('t1', 'CVE-2024-12345');

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe('vuln-1');
    expect(result.results[0]!.nodeType).toBe('Vulnerability');
  });

  it('nodeType filter restricts results to that label', async () => {
    setupSearchMock(2, [
      { props: { id: 'mal-1', name: 'Ryuk', riskScore: 95, confidence: 0.9 }, label: 'Malware' },
      { props: { id: 'mal-2', name: 'RyukV2', riskScore: 88, confidence: 0.85 }, label: 'Malware' },
    ]);

    const result = await svc.search('t1', 'ryuk', 'Malware');

    // Both results are Malware — verify the nodeType filter was passed to the query
    expect(result.results).toHaveLength(2);
    result.results.forEach((r) => expect(r.nodeType).toBe('Malware'));

    // Verify the query was called with the nodeType parameter
    const [, params] = mockRun.mock.calls[0]!;
    expect((params as Record<string, unknown>)['nodeType']).toBe('Malware');
  });

  it('minRisk filter excludes low-risk nodes', async () => {
    setupSearchMock(1, [
      { props: { id: 'ioc-high', value: 'evil.com', riskScore: 80, confidence: 0.9 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', 'evil', undefined, 70);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.riskScore).toBe(80);

    const [, params] = mockRun.mock.calls[0]!;
    expect((params as Record<string, unknown>)['minRisk']).toBe(70);
  });

  it('maxRisk filter excludes high-risk nodes', async () => {
    setupSearchMock(1, [
      { props: { id: 'ioc-low', value: 'info.example.com', riskScore: 20, confidence: 0.6 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', 'info', undefined, undefined, 40);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.riskScore).toBe(20);

    const [, params] = mockRun.mock.calls[0]!;
    expect((params as Record<string, unknown>)['maxRisk']).toBe(40);
  });

  it('combined filters (nodeType + risk range) pass all parameters to the query', async () => {
    setupSearchMock(1, [
      { props: { id: 'mal-3', name: 'Conti', riskScore: 75, confidence: 0.88 }, label: 'Malware' },
    ]);

    const result = await svc.search('t1', 'conti', 'Malware', 60, 90);

    expect(result.results).toHaveLength(1);

    const [, params] = mockRun.mock.calls[0]!;
    const p = params as Record<string, unknown>;
    expect(p['nodeType']).toBe('Malware');
    expect(p['minRisk']).toBe(60);
    expect(p['maxRisk']).toBe(90);
  });

  it('pagination: page 1 returns first batch with correct metadata', async () => {
    setupSearchMock(50, [
      { props: { id: 'n-1', name: 'Alpha', riskScore: 90, confidence: 0.9 }, label: 'IOC' },
      { props: { id: 'n-2', name: 'Beta', riskScore: 85, confidence: 0.8 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', 'a', undefined, undefined, undefined, 1, 2);

    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.total).toBe(50);

    // skip for page 1 should be 0
    const [, params] = mockRun.mock.calls[1]!;
    expect((params as Record<string, unknown>)['skip']).toBe(0);
  });

  it('pagination: page 2 skips the first page of results', async () => {
    setupSearchMock(50, [
      { props: { id: 'n-3', name: 'Gamma', riskScore: 80, confidence: 0.75 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', 'a', undefined, undefined, undefined, 2, 10);

    expect(result.page).toBe(2);
    // skip for page 2 with limit 10 should be 10
    const [, params] = mockRun.mock.calls[1]!;
    expect((params as Record<string, unknown>)['skip']).toBe(10);
  });

  it('total count is independent of the page/limit — comes from count query', async () => {
    // Set a total of 200, but only return 5 records
    setupSearchMock(200, [
      { props: { id: 'n-1', name: 'Node1', riskScore: 50, confidence: 0.5 }, label: 'IOC' },
      { props: { id: 'n-2', name: 'Node2', riskScore: 45, confidence: 0.5 }, label: 'IOC' },
      { props: { id: 'n-3', name: 'Node3', riskScore: 40, confidence: 0.5 }, label: 'IOC' },
      { props: { id: 'n-4', name: 'Node4', riskScore: 35, confidence: 0.5 }, label: 'IOC' },
      { props: { id: 'n-5', name: 'Node5', riskScore: 30, confidence: 0.5 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', 'node', undefined, undefined, undefined, 3, 5);

    expect(result.total).toBe(200);   // from count query
    expect(result.results).toHaveLength(5);  // from paginated query
    // Two queries must have been made: count then data
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('results are ordered by riskScore descending via the Cypher ORDER BY clause', async () => {
    // The service applies ORDER BY n.riskScore DESC in Cypher — we verify the
    // query string contains the expected ORDER BY fragment.
    setupSearchMock(3, [
      { props: { id: 'n-a', riskScore: 95, confidence: 0.9 }, label: 'IOC' },
      { props: { id: 'n-b', riskScore: 70, confidence: 0.8 }, label: 'IOC' },
      { props: { id: 'n-c', riskScore: 30, confidence: 0.6 }, label: 'IOC' },
    ]);

    const result = await svc.search('t1', 'n');

    // Results in the mock are already ordered; the real ordering is done by Neo4j.
    // Verify the ORDER BY clause was included in the paginated query string.
    const [query] = mockRun.mock.calls[1]!;
    expect(query as string).toContain('ORDER BY');
    expect(query as string).toContain('riskScore DESC');

    // IDs come back in the order the mock returned them (highest risk first)
    expect(result.results[0]!.id).toBe('n-a');
    expect(result.results[2]!.id).toBe('n-c');
  });

  it('returns empty results and total 0 when no nodes match', async () => {
    mockRun
      .mockResolvedValueOnce({ records: [makeCountRecord(0)] })
      .mockResolvedValueOnce({ records: [] });

    const result = await svc.search('t1', 'zzz-nonexistent-query');

    expect(result.results).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
  });
});
